import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getOccasions, createOccasion, addOccasionItem, removeOccasionItem, getOccasionIdsForList } from "../../api/occasions";
import toast from "react-hot-toast";

interface OccasionsTabProps {
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}

export function OccasionsTab({ listId, queryClient }: OccasionsTabProps) {
  const [selectedId, setSelectedId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const occasions = useQuery({ queryKey: ["occasions"], queryFn: () => getOccasions() });
  const containingIds = useQuery({
    queryKey: ["occasions-for-list", listId],
    queryFn: () => getOccasionIdsForList(listId),
  });

  const addMutation = useMutation({
    mutationFn: (occasionId: number) => addOccasionItem(occasionId, listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["occasions"] });
      queryClient.invalidateQueries({ queryKey: ["occasions-for-list", listId] });
      setSelectedId("");
      toast.success("Added to occasion.");
    },
    onError: () => toast.error("Failed to add to occasion."),
  });

  const removeMutation = useMutation({
    mutationFn: (occasionId: number) => removeOccasionItem(occasionId, listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["occasions"] });
      queryClient.invalidateQueries({ queryKey: ["occasions-for-list", listId] });
      toast.success("Removed from occasion.");
    },
    onError: () => toast.error("Failed to remove from occasion."),
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const occ = await createOccasion({ name });
      await addOccasionItem(occ.id, listId);
      return occ;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["occasions"] });
      queryClient.invalidateQueries({ queryKey: ["occasions-for-list", listId] });
      setNewName("");
      setShowCreate(false);
      toast.success("Occasion created and list added.");
    },
    onError: () => toast.error("Failed to create occasion."),
  });

  const containingSet = new Set(containingIds.data ?? []);
  const allOccasions = occasions.data ?? [];
  const containingOccasions = allOccasions.filter((c) => containingSet.has(c.id));
  const available = allOccasions.filter((c) => !containingSet.has(c.id));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Your personal occasions that include this list. Occasions are private — only you can see them.
      </p>

      {/* Current occasions containing this list */}
      {containingOccasions.length > 0 && (
        <>
        <h3 className="text-sm font-semibold text-gray-700">In your occasions</h3>
        <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
          {containingOccasions.map((occ) => (
            <li key={occ.id} className="flex items-center justify-between px-4 py-3">
              <Link to={`/occasions/${occ.id}`} className="font-medium text-blue-600 hover:underline">
                {occ.name}
              </Link>
              <button
                onClick={() => removeMutation.mutate(occ.id)}
                disabled={removeMutation.isPending}
                className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        </>
      )}

      {containingOccasions.length === 0 && (
        <p className="text-sm text-gray-400 italic">Not in any of your occasions yet.</p>
      )}

      {/* Add to occasion dropdown */}
      {available.length > 0 && (
        <div className="flex gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Add to occasion…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={() => selectedId && addMutation.mutate(Number(selectedId))}
            disabled={!selectedId || addMutation.isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {addMutation.isPending ? "Adding…" : "Add"}
          </button>
        </div>
      )}

      {/* Create new occasion */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="text-sm text-blue-600 hover:underline"
        >
          Create a new occasion
        </button>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Occasion name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            required
          />
          <button
            onClick={() => newName && createMutation.mutate(newName)}
            disabled={!newName || createMutation.isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {createMutation.isPending ? "Creating…" : "Create & add"}
          </button>
          <button
            onClick={() => { setShowCreate(false); setNewName(""); }}
            className="rounded bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
