import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { createOccasion, getFamilyOccasions, updateOccasion } from "../../api/occasions";
import { Spinner } from "../../components/Spinner";
import type { Occasion } from "../../types";

interface OccasionsSectionProps {
  familyId: number;
  familyName: string;
  isOrganizer: boolean;
}

/**
 * Warn, never block: a family may hold several active occasions (project spec
 * §5.3), so this only names the ones it already has and asks again.
 *
 * The active list is already on the page, so the *pre*-create warning is built
 * from it rather than from the create response's `has_other_active` — that
 * field cannot be read before the write it rides on. It back-stops this instead,
 * in `createMutation`, for the case where the list was stale.
 */
function alreadyActiveWarning(familyName: string, active: Occasion[]): string {
  const names = active.map((o) => o.name).join(", ");
  return active.length === 1
    ? `${familyName} already has an active occasion, ${names}. Create another?`
    : `${familyName} already has active occasions: ${names}. Create another?`;
}

/**
 * The family's occasions, on the family page (project spec §9.6).
 *
 * Creating is open to **any member** — nobody should be blocked waiting on an
 * absent organizer, because a family with no active occasion cannot be shared
 * to at all. Renaming and archiving — and unarchiving, so Archive is not a
 * one-way door — are organizer-only, gated the same way the member controls
 * above are. The backend enforces both regardless.
 */
export function OccasionsSection({ familyId, familyName, isOrganizer }: OccasionsSectionProps) {
  const queryClient = useQueryClient();

  const [showArchived, setShowArchived] = useState(false);
  const [newName, setNewName] = useState("");
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const occasions = useQuery({
    queryKey: ["occasions", familyId, { archived: showArchived }],
    queryFn: () => getFamilyOccasions(familyId, showArchived),
    enabled: Number.isFinite(familyId),
  });

  // Prefix match, so both the active and the archived lists are refetched.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["occasions", familyId] });
  };

  const createMutation = useMutation({
    mutationFn: ({ name }: { name: string; warned: boolean }) =>
      createOccasion(familyId, { name }),
    onSuccess: (created, { warned }) => {
      invalidate();
      setNewName("");
      setPendingName(null);
      setCreateError(null);
      // The pre-check reads the list on the page, which another member can have
      // moved on since it loaded. `has_other_active` is the server's answer at
      // the moment of the write, so it back-stops a warning that arrived too
      // late to ask with — after the fact, because a second one is allowed.
      if (!warned && created.has_other_active) {
        toast(`${familyName} already had an active occasion. It now has more than one.`);
      }
    },
    onError: () => {
      setPendingName(null);
      setCreateError("Failed to create the occasion.");
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => updateOccasion(id, { name }),
    onSuccess: () => {
      invalidate();
      setRenamingId(null);
      setActionError(null);
    },
    onError: (err: unknown) => {
      if (isAxiosError(err) && err.response?.status === 403) {
        setActionError("Only an organizer can rename or archive an occasion.");
      } else {
        toast.error("Failed to rename the occasion.");
      }
    },
  });

  const setArchivedMutation = useMutation({
    mutationFn: ({ id, isArchived }: { id: number; isArchived: boolean }) =>
      updateOccasion(id, { is_archived: isArchived }),
    onSuccess: (_data, { isArchived }) => {
      invalidate();
      setActionError(null);
      toast.success(isArchived ? "Occasion archived." : "Occasion unarchived.");
    },
    onError: (err: unknown) => {
      if (isAxiosError(err) && err.response?.status === 403) {
        setActionError("Only an organizer can rename or archive an occasion.");
      } else {
        toast.error("Failed to archive the occasion.");
      }
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreateError(null);
    if (occasions.data && occasions.data.length > 0) {
      setPendingName(name);
      return;
    }
    createMutation.mutate({ name, warned: false });
  }

  function handleRename(e: FormEvent, id: number) {
    e.preventDefault();
    const name = renameValue.trim();
    if (!name) return;
    renameMutation.mutate({ id, name });
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          {showArchived ? "Archived Occasions" : "Occasions"}
        </h2>
        <button
          onClick={() => {
            setShowArchived(!showArchived);
            setPendingName(null);
            setRenamingId(null);
          }}
          className="text-sm text-blue-600 hover:underline"
        >
          {showArchived ? "View active occasions" : "View archived occasions"}
        </button>
      </div>

      {actionError && <p className="mb-3 text-sm text-red-600">{actionError}</p>}

      {occasions.isPending ? (
        <Spinner />
      ) : occasions.isError ? (
        <p className="text-sm text-red-600">Couldn&apos;t load occasions.</p>
      ) : occasions.data.length === 0 ? (
        <p className="text-sm text-gray-600">
          {showArchived
            ? "No archived occasions."
            : `${familyName} has no active occasion, so no list can be shared with it.`}
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
          {occasions.data.map((occasion) => (
            <li key={occasion.id} className="flex items-center justify-between gap-2 px-4 py-3">
              {renamingId === occasion.id ? (
                <form
                  onSubmit={(e) => handleRename(e, occasion.id)}
                  className="flex flex-1 items-center gap-2"
                >
                  <label className="sr-only" htmlFor={`occasion-name-${occasion.id}`}>
                    Occasion name
                  </label>
                  <input
                    id={`occasion-name-${occasion.id}`}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="flex-1 rounded border border-gray-300 px-3 py-1 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={renameMutation.isPending}
                    className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingId(null)}
                    className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <Link
                    to={`/occasions/${occasion.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {occasion.name}
                  </Link>
                  {isOrganizer && (
                    <div className="flex items-center gap-2">
                      {showArchived ? (
                        <button
                          onClick={() =>
                            setArchivedMutation.mutate({ id: occasion.id, isArchived: false })
                          }
                          disabled={setArchivedMutation.isPending}
                          className="rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                        >
                          Unarchive
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setRenamingId(occasion.id);
                              setRenameValue(occasion.name);
                            }}
                            className="rounded bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-200"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() =>
                              setArchivedMutation.mutate({ id: occasion.id, isArchived: true })
                            }
                            disabled={setArchivedMutation.isPending}
                            className="rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                          >
                            Archive
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {!showArchived && (
        <>
          <form onSubmit={handleCreate} className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor="new-occasion-name">
              New occasion name
            </label>
            <input
              id="new-occasion-name"
              type="text"
              placeholder="Occasion name, e.g. Christmas 2026"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={createMutation.isPending || occasions.isPending}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Create Occasion
            </button>
          </form>

          {pendingName !== null && (
            <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2">
              <p className="text-sm text-amber-900">
                {alreadyActiveWarning(familyName, occasions.data ?? [])}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => createMutation.mutate({ name: pendingName, warned: true })}
                  disabled={createMutation.isPending}
                  className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Create Anyway
                </button>
                <button
                  onClick={() => setPendingName(null)}
                  className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}
        </>
      )}
    </section>
  );
}
