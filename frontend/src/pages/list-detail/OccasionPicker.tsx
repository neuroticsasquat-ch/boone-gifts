import { useState, type FormEvent } from "react";
import { useQuery, useMutation, type useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  getOccasions,
  getOccasionIdsForList,
  addOccasionItem,
  removeOccasionItem,
  createOccasion,
} from "../../api/occasions";

type QueryClient = ReturnType<typeof useQueryClient>;

/**
 * "Add to an occasion…" — the one entry point to occasions from a list, opened
 * from the header's `⋯` menu and replacing the retired Occasions tab.
 *
 * Deliberately **not** owner-gated: filing someone else's list under "Christmas
 * 2026" is the main use of the feature, and this is a viewer's only way in
 * (project spec §4.4). An occasion is private to whoever owns it, so what is on
 * show here is the *viewer's* own occasions either way — nothing about the list
 * or its owner leaks through it.
 */
export function OccasionPicker({
  listId,
  queryClient,
  onClose,
}: {
  listId: number;
  queryClient: QueryClient;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");

  const occasions = useQuery({ queryKey: ["occasions"], queryFn: () => getOccasions() });
  const memberOf = useQuery({
    queryKey: ["occasions-for-list", listId],
    queryFn: () => getOccasionIdsForList(listId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["occasions"] });
    queryClient.invalidateQueries({ queryKey: ["occasions-for-list", listId] });
    // The Lists page's occasion filter reads membership from the occasion
    // itself, so it goes stale the moment this list joins or leaves one.
    queryClient.invalidateQueries({ queryKey: ["occasion"] });
  }

  const addMutation = useMutation({
    mutationFn: (occasionId: number) => addOccasionItem(occasionId, listId),
    onSuccess: () => {
      invalidate();
      toast.success("Added to occasion.");
    },
    onError: () => toast.error("Failed to add to occasion."),
  });

  const removeMutation = useMutation({
    mutationFn: (occasionId: number) => removeOccasionItem(occasionId, listId),
    onSuccess: () => {
      invalidate();
      toast.success("Removed from occasion.");
    },
    onError: () => toast.error("Failed to remove from occasion."),
  });

  const createMutation = useMutation({
    // Two calls, and the occasion is real the moment the first one returns. So
    // a failed add is reported as its own outcome rather than as "failed to
    // create": the row still has to appear, unticked, for the user to retry
    // against — telling them nothing was created would leave it stranded.
    mutationFn: async (name: string) => {
      const occasion = await createOccasion({ name });
      const added = await addOccasionItem(occasion.id, listId).then(
        () => true,
        () => false,
      );
      return { added };
    },
    onSuccess: ({ added }) => {
      invalidate();
      setNewName("");
      if (added) {
        toast.success("Occasion created and list added.");
      } else {
        toast.error("Occasion created, but the list wasn't added to it.");
      }
    },
    onError: () => toast.error("Failed to create occasion."),
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (name) createMutation.mutate(name);
  }

  const isLoading = occasions.isLoading || memberOf.isLoading;
  const failed = occasions.error || memberOf.error;
  const rows = occasions.data ?? [];
  const memberIds = new Set(memberOf.data ?? []);
  // One in-flight toggle at a time: a second click while the first is still
  // resolving would be answered from membership the server has already changed.
  const pending = addMutation.isPending || removeMutation.isPending;

  return (
    <section aria-label="Add to an occasion" className="space-y-4 rounded-lg bg-gray-50 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Add to an occasion</h2>
        <button onClick={onClose} className="text-sm font-medium text-gray-500 hover:text-gray-700">
          Done
        </button>
      </div>

      <p className="text-sm text-gray-500">
        Occasions are your own grouping of lists — yours alone, whoever owns the list.
      </p>

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {!isLoading && failed && <p className="text-sm text-red-600">Failed to load your occasions.</p>}

      {!isLoading && !failed && (
        rows.length === 0 ? (
          <p className="text-sm text-gray-500">You don't have any occasions yet — name one below.</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
            {rows.map((occasion) => {
              const checked = memberIds.has(occasion.id);
              return (
                <li key={occasion.id} className="flex items-center justify-between px-4 py-3">
                  <p className="min-w-0 font-medium text-gray-900">{occasion.name}</p>
                  <label className="flex items-center gap-2">
                    <span className="sr-only">Add to {occasion.name}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={pending}
                      onChange={() =>
                        checked
                          ? removeMutation.mutate(occasion.id)
                          : addMutation.mutate(occasion.id)
                      }
                      className="h-4 w-4 rounded border-gray-300 disabled:opacity-50"
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        )
      )}

      {/* Creating one inline: without it a viewer with no occasions meets a dead
          end, and occasions have no page of their own to send them to. */}
      <form onSubmit={handleCreate} className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">New occasion name</span>
          <input
            type="text"
            placeholder="New occasion name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="block w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={!newName.trim() || createMutation.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {createMutation.isPending ? "Creating…" : "Create & add"}
        </button>
      </form>
    </section>
  );
}
