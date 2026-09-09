import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFolders, createFolder, deleteFolder } from "../api/folders";
import { useTitle } from "../hooks/useTitle";
import toast from "react-hot-toast";
import { Spinner } from "../components/Spinner";
import { FolderOpenIcon } from "../components/Icons";

export function Folders() {
  useTitle("Folders");
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);

  const folders = useQuery({
    queryKey: ["folders", { archived: showArchived }],
    queryFn: () => getFolders(showArchived || undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
    onError: () => toast.error("Failed to delete folder."),
  });

  function handleDelete(id: number) {
    if (window.confirm("Delete this folder?")) {
      deleteMutation.mutate(id);
    }
  }

  if (folders.isPending) return (
    <div className="space-y-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><FolderOpenIcon className="h-6 w-6" /> Folders</h1>
      <Spinner />
    </div>
  );

  return (
    <div className="space-y-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><FolderOpenIcon className="h-6 w-6" /> Folders</h1>

      <p className="text-sm text-gray-500">
        Folders let you group gift lists together for easy access — for example, all the lists for Christmas 2026.
      </p>

      {!showArchived && <CreateFolderForm queryClient={queryClient} />}

      <section>
        <div className="mb-3">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="text-sm text-blue-600 hover:underline"
          >
            {showArchived ? "View active folders" : "View archived folders"}
          </button>
        </div>

        {folders.data && folders.data.length === 0 && !showArchived && (
          <p className="text-gray-500">No folders yet.</p>
        )}
        {folders.data && folders.data.length === 0 && showArchived && (
          <p className="text-gray-500">No archived folders.</p>
        )}
        {folders.data && folders.data.length > 0 && (
          <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
            {folders.data.map((folder) => (
              <li key={folder.id} className={`flex items-center justify-between px-4 py-3${showArchived ? " opacity-60" : ""}`}>
                <Link to={`/folders/${folder.id}`} className="min-w-0 flex-1 hover:opacity-75">
                  <p className="font-medium text-gray-900">{folder.name}</p>
                  {folder.description && (
                    <p className="text-sm text-gray-500 truncate">{folder.description}</p>
                  )}
                </Link>
                {!showArchived && (
                  <button
                    onClick={() => handleDelete(folder.id)}
                    disabled={deleteMutation.isPending}
                    className="ml-4 shrink-0 rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CreateFolderForm({
  queryClient,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => createFolder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      setName("");
      setDescription("");
    },
    onError: () => toast.error("Failed to create folder."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({ name, description: description || undefined });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Create a Folder</h2>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          placeholder="Folder name"
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
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 shrink-0"
        >
          {mutation.isPending ? "Creating\u2026" : "Create"}
        </button>
      </div>
    </form>
  );
}
