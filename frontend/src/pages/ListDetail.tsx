import { useState, useEffect, type FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getList, updateList, deleteList } from "../api/lists";
import { getConnections } from "../api/connections";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import type { GiftListDetailOwner, GiftListDetailViewer } from "../types";
import toast from "react-hot-toast";
import { Spinner } from "../components/Spinner";
import { GiftsTab } from "./list-detail/GiftsTab";
import { CollectionsTab } from "./list-detail/CollectionsTab";
import { SharedWithTab } from "./list-detail/SharedWithTab";

function isOwnerView(list: GiftListDetailOwner | GiftListDetailViewer, userId: number): list is GiftListDetailOwner {
  return list.owner_id === userId;
}

type Tab = "gifts" | "collections" | "shared";

const TABS: { key: Tab; label: string }[] = [
  { key: "gifts", label: "Gifts" },
  { key: "collections", label: "Collections" },
  { key: "shared", label: "Shared with" },
];

export function ListDetail() {
  const { id } = useParams();
  const listId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("gifts");
  const [editing, setEditing] = useState(false);

  const { data: list, isLoading, error, refetch } = useQuery({
    queryKey: ["list", listId],
    queryFn: () => getList(listId),
    enabled: !!id,
  });

  useTitle(list?.name ?? "List");

  useEffect(() => {
    if (list && user && list.owner_id !== user.id) {
      queryClient.invalidateQueries({ queryKey: ["unseen-shares"] });
    }
  }, [list, user, queryClient]);

  if (isLoading) return <Spinner />;
  if (error || !list) return (
    <div className="text-center py-12">
      <p className="text-red-600">Failed to load list.</p>
      <button onClick={() => refetch()} className="mt-2 text-sm text-blue-600 hover:underline">Try again</button>
    </div>
  );

  const isOwner = user !== null && isOwnerView(list, user.id);

  return (
    <div className="space-y-6">
      <Link to="/lists" className="text-sm text-blue-600 hover:underline">&larr; Back to lists</Link>

      {/* Header */}
      {isOwner ? (
        editing ? (
          <EditListHeader list={list} listId={listId} queryClient={queryClient} onDone={() => setEditing(false)} />
        ) : (
          <OwnerHeader list={list} listId={listId} queryClient={queryClient} navigate={navigate} onEdit={() => setEditing(true)} />
        )
      ) : (
        <ViewerHeader list={list as GiftListDetailViewer} />
      )}

      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 py-2.5 text-center text-sm font-medium ${
              activeTab === key
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "gifts" && <GiftsTab list={list} listId={listId} isOwner={isOwner} userId={user!.id} queryClient={queryClient} />}
      {activeTab === "collections" && <CollectionsTab listId={listId} queryClient={queryClient} />}
      {activeTab === "shared" && <SharedWithTab listId={listId} isOwner={isOwner} ownerName={list.owner_name} queryClient={queryClient} />}
    </div>
  );
}

// --- Header Components ---

function OwnerHeader({
  list,
  listId,
  queryClient,
  navigate,
  onEdit,
}: {
  list: GiftListDetailOwner;
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  navigate: ReturnType<typeof useNavigate>;
  onEdit: () => void;
}) {
  const archiveMutation = useMutation({
    mutationFn: () => updateList(listId, { is_archived: !list.is_archived }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
    onError: () => toast.error("Failed to update list."),
  });

  function handleArchiveToggle() {
    if (list.is_archived) {
      archiveMutation.mutate();
    } else if (window.confirm("Archive this list?")) {
      archiveMutation.mutate();
    }
  }

  return (
    <ListHeader
      name={list.name}
      description={list.description}
      isArchived={list.is_archived}
      onEdit={onEdit}
      onDelete={
        <DeleteListButton listId={listId} queryClient={queryClient} navigate={navigate} />
      }
      onArchive={
        <button
          onClick={handleArchiveToggle}
          disabled={archiveMutation.isPending}
          className={`rounded px-3 py-1 text-sm font-medium text-white disabled:opacity-50 ${list.is_archived ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
        >
          {archiveMutation.isPending ? "…" : list.is_archived ? "Unarchive" : "Archive"}
        </button>
      }
    />
  );
}

function ViewerHeader({ list }: { list: GiftListDetailViewer }) {
  const connections = useQuery({ queryKey: ["connections"], queryFn: getConnections });
  const connectionId = connections.data?.find((c) => c.user.id === list.owner_id)?.id;

  const ownerLink = connectionId ? (
    <Link to={`/connections/${connectionId}`} className="text-blue-600 hover:underline">{list.owner_name}</Link>
  ) : (
    list.owner_name
  );

  return (
    <ListHeader
      name={list.name}
      description={list.description}
      subtitle={<>from {ownerLink}</>}
      isArchived={list.is_archived}
    />
  );
}

function ListHeader({
  name,
  description,
  subtitle,
  isArchived,
  onEdit,
  onDelete,
  onArchive,
}: {
  name: string;
  description: string | null;
  subtitle?: React.ReactNode;
  isArchived?: boolean;
  onEdit?: () => void;
  onDelete?: React.ReactNode;
  onArchive?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
            {isArchived && (
              <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">Archived</span>
            )}
          </div>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
          {description && <p className="mt-2 text-gray-600">{description}</p>}
        </div>
        {(onEdit || onDelete || onArchive) && (
          <div className="flex gap-2 shrink-0">
            {onArchive}
            {onEdit && (
              <button
                onClick={onEdit}
                className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
              >
                Edit
              </button>
            )}
            {onDelete}
          </div>
        )}
      </div>
    </div>
  );
}

function EditListHeader({
  list,
  listId,
  queryClient,
  onDone,
}: {
  list: GiftListDetailOwner;
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  onDone: () => void;
}) {
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");

  const mutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => updateList(listId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      onDone();
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({ name, description: description || undefined });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-white p-6 shadow space-y-4">
      {mutation.isError && <p className="text-sm text-red-600">Failed to update list.</p>}
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          required
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteListButton({
  listId,
  queryClient,
  navigate,
}: {
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const mutation = useMutation({
    mutationFn: () => deleteList(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      navigate("/lists", { replace: true });
    },
    onError: () => toast.error("Failed to delete list."),
  });

  function handleDelete() {
    if (window.confirm("Delete this list? This cannot be undone.")) {
      mutation.mutate();
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={mutation.isPending}
      className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
    >
      {mutation.isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
