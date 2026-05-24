import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCollections, createCollection, addCollectionItem, removeCollectionItem, getCollectionIdsForList } from "../../api/collections";
import toast from "react-hot-toast";

interface CollectionsTabProps {
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}

export function CollectionsTab({ listId, queryClient }: CollectionsTabProps) {
  const [selectedId, setSelectedId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const collections = useQuery({ queryKey: ["collections"], queryFn: () => getCollections() });
  const containingIds = useQuery({
    queryKey: ["collections-for-list", listId],
    queryFn: () => getCollectionIdsForList(listId),
  });

  const addMutation = useMutation({
    mutationFn: (collectionId: number) => addCollectionItem(collectionId, listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["collections-for-list", listId] });
      setSelectedId("");
      toast.success("Added to collection.");
    },
    onError: () => toast.error("Failed to add to collection."),
  });

  const removeMutation = useMutation({
    mutationFn: (collectionId: number) => removeCollectionItem(collectionId, listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["collections-for-list", listId] });
      toast.success("Removed from collection.");
    },
    onError: () => toast.error("Failed to remove from collection."),
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const coll = await createCollection({ name });
      await addCollectionItem(coll.id, listId);
      return coll;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["collections-for-list", listId] });
      setNewName("");
      setShowCreate(false);
      toast.success("Collection created and list added.");
    },
    onError: () => toast.error("Failed to create collection."),
  });

  const containingSet = new Set(containingIds.data ?? []);
  const allCollections = collections.data ?? [];
  const containingCollections = allCollections.filter((c) => containingSet.has(c.id));
  const available = allCollections.filter((c) => !containingSet.has(c.id));

  return (
    <div className="space-y-4">
      {/* Current collections containing this list */}
      {containingCollections.length > 0 && (
        <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
          {containingCollections.map((coll) => (
            <li key={coll.id} className="flex items-center justify-between px-4 py-3">
              <Link to={`/collections/${coll.id}`} className="font-medium text-blue-600 hover:underline">
                {coll.name}
              </Link>
              <button
                onClick={() => removeMutation.mutate(coll.id)}
                disabled={removeMutation.isPending}
                className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add to collection dropdown */}
      {available.length > 0 && (
        <div className="flex gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Add to collection…</option>
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

      {/* Create new collection */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="text-sm text-blue-600 hover:underline"
        >
          Create a new collection
        </button>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Collection name"
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
