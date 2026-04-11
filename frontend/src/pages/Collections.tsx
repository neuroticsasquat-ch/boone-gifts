import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCollections, createCollection, deleteCollection } from "../api/collections";
import { useTitle } from "../hooks/useTitle";

export function Collections() {
  useTitle("Collections");
  const queryClient = useQueryClient();

  const collections = useQuery({ queryKey: ["collections"], queryFn: getCollections });

  const deleteMutation = useMutation({
    mutationFn: deleteCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  function handleDelete(id: number) {
    if (window.confirm("Delete this collection?")) {
      deleteMutation.mutate(id);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Collections</h1>

      <CreateCollectionForm queryClient={queryClient} />

      <section>
        {collections.data && collections.data.length === 0 && (
          <p className="text-gray-500">No collections yet.</p>
        )}
        {collections.data && collections.data.length > 0 && (
          <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
            {collections.data.map((coll) => (
              <li key={coll.id} className="flex items-center justify-between px-4 py-3">
                <Link to={`/collections/${coll.id}`} className="min-w-0 flex-1 hover:opacity-75">
                  <p className="font-medium text-gray-900">{coll.name}</p>
                  {coll.description && (
                    <p className="text-sm text-gray-500 truncate">{coll.description}</p>
                  )}
                </Link>
                <button
                  onClick={() => handleDelete(coll.id)}
                  disabled={deleteMutation.isPending}
                  className="ml-4 shrink-0 rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CreateCollectionForm({
  queryClient,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => createCollection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setName("");
      setDescription("");
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({ name, description: description || undefined });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Create a Collection</h2>
      {mutation.isError && <p className="text-sm text-red-600 mb-2">Failed to create collection.</p>}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Collection name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          required
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Creating\u2026" : "Create"}
        </button>
      </div>
    </form>
  );
}
