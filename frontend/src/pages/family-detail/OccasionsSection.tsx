import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { createOccasion, getFamilyOccasions, updateOccasion } from "../../api/occasions";
import { useAuth } from "../../hooks/useAuth";
import { Spinner } from "../../components/Spinner";
import { ConfirmDialog, type ConfirmAction } from "../../components/ConfirmDialog";
import { ARCHIVE_OCCASION_BODY } from "../OccasionDetail";
import type { Occasion } from "../../types";

// The same pair `OccasionDetail` carries, because the backend gates the two
// fields separately (NEU-1294 decision 4). One rule with two answers in the
// codebase is one answer that will be wrong to whoever finds it second.
const RENAME_ONLY = "Only an organizer can rename an occasion.";
const ARCHIVE_ONLY =
  "Only an organizer or the person who created this occasion can archive it.";

const ARCHIVE_ACTIONS: ConfirmAction[] = [{ id: "archive", label: "Archive", tone: "danger" }];

interface OccasionsSectionProps {
  familyId: number;
  familyName: string;
  isOrganizer: boolean;
}

/**
 * Warn, never block: a family may hold several active occasions
 * (shopping-lists project spec §5.3), so this only names the ones it already
 * has and asks again.
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
 * The family's occasions, on the family page — management only
 * (occasions-and-navigation project spec §5.6, §9.5).
 *
 * This is no longer the way *in* to an occasion; the strip on /lists is
 * (NEU-1298). The name still links, because an occasion is a destination
 * (ADR 0007) — but nobody has to come here to find one. What stays here is
 * what only belongs here: create, rename, archive, view archive.
 *
 * The family's **active** occasions and nothing else. Archived ones live behind
 * the "View archive" link, on their own page (NEU-1278) — this section has no
 * archived state to be put into, so nothing archived reaches the family page.
 *
 * Creating is open to **any member** — nobody should be blocked waiting on an
 * absent organizer, because a family with no active occasion cannot be shared
 * to at all. Renaming is the **organizer's**; archiving is the organizer's *or*
 * the occasion creator's, matching the per-field backend gate. The `isOrganizer`
 * prop stays the family's answer, and the creator check is the occasion's — so
 * the two are derived per row rather than for the section.
 *
 * Archive is still not a one-way door: **unarchiving** is on the occasion's own
 * page, which the archive links to and which gates it the same way.
 * A second copy of that mutation here would be a second thing to keep honest.
 */
export function OccasionsSection({ familyId, familyName, isOrganizer }: OccasionsSectionProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [newName, setNewName] = useState("");
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // The occasion being archived, not a boolean: this is a per-row action on a
  // section listing every active occasion, so the dialog has to name which.
  const [archiving, setArchiving] = useState<Occasion | null>(null);

  // The family's *active* occasions and nothing else. The archived ones have
  // their own page now, so this section no longer has a state that can show
  // them (NEU-1278, shopping-lists project spec §9.5).
  const occasions = useQuery({
    queryKey: ["occasions", familyId, { archived: false }],
    queryFn: () => getFamilyOccasions(familyId, false),
  });

  // The bare ["occasions"] prefix, so this sweeps both the active and archived
  // lists for this family *and* the /lists occasion strip's index entry
  // (["occasions", "index", …]) — creating, renaming or archiving an occasion
  // changes which cards the landing page draws.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["occasions"] });
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
        setActionError(RENAME_ONLY);
      } else {
        toast.error("Failed to rename the occasion.");
      }
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => updateOccasion(id, { is_archived: true }),
    onSuccess: () => {
      invalidate();
      setActionError(null);
      setArchiving(null);
      // Kept, unlike the list and folder cases: the row leaves the section on
      // success, so nothing left on the page says what happened.
      toast.success("Occasion archived.");
    },
    onError: (err: unknown) => {
      setArchiving(null);
      if (isAxiosError(err) && err.response?.status === 403) {
        setActionError(ARCHIVE_ONLY);
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
        <h2 className="text-lg font-semibold text-gray-900">Occasions</h2>
        {/* The entry point to what has been archived — a destination, not a
            state this section can be put into. */}
        <Link
          to={`/people/families/${familyId}/archive`}
          className="text-sm text-blue-600 hover:underline"
        >
          View archive
        </Link>
      </div>

      {actionError && <p className="mb-3 text-sm text-red-600">{actionError}</p>}

      {occasions.isPending ? (
        <Spinner />
      ) : occasions.isError ? (
        <p className="text-sm text-red-600">Couldn&apos;t load occasions.</p>
      ) : occasions.data.length === 0 ? (
        <p className="text-sm text-gray-600">
          {familyName} has no active occasion, so no list can be shared with it.
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
                  {/* Two gates, not one: the family's answer covers renaming,
                      and archiving also belongs to whoever created the
                      occasion. A member who created one is now routinely asked
                      to archive it by the banner (NEU-1315), so the control has
                      to be here for them too. */}
                  {(isOrganizer || occasion.created_by_id === user?.id) && (
                    <div className="flex items-center gap-2">
                      {isOrganizer && (
                        <button
                          onClick={() => {
                            setRenamingId(occasion.id);
                            setRenameValue(occasion.name);
                          }}
                          className="rounded bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-200"
                        >
                          Rename
                        </button>
                      )}
                      <button
                        onClick={() => setArchiving(occasion)}
                        disabled={archiveMutation.isPending}
                        className="rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                      >
                        Archive
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

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

      {/* Archiving an occasion lands on the whole family, not just the viewer,
          so it asks (`CONTEXT.md` rule 11) — the one archive site the earlier
          tickets did not reach. The title names the occasion because a bare
          "this occasion?" says nothing in a list of them; the body is the same
          sentence the occasion's own page uses, shared rather than retyped. */}
      <ConfirmDialog
        open={archiving !== null}
        title={`Archive ${archiving?.name}?`}
        body={ARCHIVE_OCCASION_BODY}
        actions={ARCHIVE_ACTIONS}
        pending={archiveMutation.isPending}
        onResolve={(id) => {
          if (id === "archive" && archiving) archiveMutation.mutate(archiving.id);
          else setArchiving(null);
        }}
      />
    </section>
  );
}
