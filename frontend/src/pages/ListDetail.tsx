import { useState, useEffect, useRef, type FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getList, updateList, deleteList } from "../api/lists";
import { getConnections } from "../api/connections";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import type { GiftListDetailOwner, GiftListDetailViewer } from "../types";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { Spinner } from "../components/Spinner";
import { GiftsTab } from "./list-detail/GiftsTab";
import { SharingPanel } from "./list-detail/SharingPanel";
import { SharingSummary } from "./list-detail/SharingSummary";
import { attributionFor, isKeptForAbsentPerson, recipientLabel, recipientNameOf } from "../lib/attribution";
import { RecipientFields } from "../components/RecipientFields";
import {
  recipientIncomplete,
  recipientPayload,
  recipientValueFrom,
  type RecipientValue,
} from "../lib/recipient";

function isOwnerView(list: GiftListDetailOwner | GiftListDetailViewer, userId: number): list is GiftListDetailOwner {
  return list.owner_id === userId;
}

export function ListDetail() {
  const { id } = useParams();
  const listId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);

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
          <OwnerHeader
            list={list}
            listId={listId}
            queryClient={queryClient}
            navigate={navigate}
            onEdit={() => setEditing(true)}
            simpleMode={!!user?.simple_mode}
            onChangeSharing={() => setSharingOpen((open) => !open)}
          />
        )
      ) : (
        <ViewerHeader list={list as GiftListDetailViewer} />
      )}

      {/* Sharing panel — the only way to reach the people and family controls now
          that the tab bar is gone. */}
      {isOwner && sharingOpen && (
        <SharingPanel
          listId={listId}
          queryClient={queryClient}
          onClose={() => setSharingOpen(false)}
        />
      )}

      {/* The gifts are the page. */}
      <GiftsTab list={list} listId={listId} isOwner={isOwner} userId={user!.id} queryClient={queryClient} />
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
  simpleMode,
  onChangeSharing,
}: {
  list: GiftListDetailOwner;
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  navigate: ReturnType<typeof useNavigate>;
  onEdit: () => void;
  simpleMode: boolean;
  onChangeSharing: () => void;
}) {
  const archiveMutation = useMutation({
    mutationFn: () => updateList(listId, { is_archived: !list.is_archived }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
    onError: () => toast.error("Failed to update list."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteList(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      navigate("/lists", { replace: true });
    },
    onError: (err) => {
      const detail = isAxiosError(err) && err.response?.status === 409
        ? err.response.data?.detail
        : null;
      toast.error(detail || "Failed to delete list.");
    },
  });

  function handleArchiveToggle() {
    if (list.is_archived) {
      archiveMutation.mutate();
    } else if (window.confirm("Archive this list?")) {
      archiveMutation.mutate();
    }
  }

  function handleDelete() {
    if (window.confirm("Delete this list? This cannot be undone.")) {
      deleteMutation.mutate();
    }
  }

  return (
    <ListHeader
      name={list.name}
      description={list.description}
      subtitle={recipientLabel(list)}
      // Creation is when the keeper has the fewest gifts in mind; the temptation
      // arrives over the following weeks, so this line stays put rather than
      // being a dismissible alert. Owner-only — a viewer never sees it.
      footnote={
        isKeptForAbsentPerson(list)
          ? `You can't see or make claims on ${recipientNameOf(list)}'s list. ` +
            "Leave off anything you're buying them yourself."
          : undefined
      }
      isArchived={list.is_archived}
      sharing={
        <SharingSummary listId={listId} simpleMode={simpleMode} onChange={onChangeSharing} />
      }
      actions={
        <HeaderMenu
          isArchived={list.is_archived}
          pending={archiveMutation.isPending || deleteMutation.isPending}
          onEdit={onEdit}
          onArchive={handleArchiveToggle}
          onDelete={handleDelete}
        />
      }
    />
  );
}

/**
 * Edit, archive and delete, collapsed into one `⋯` menu so the header can lead
 * with the list itself and its sharing line.
 */
function HeaderMenu({
  isArchived,
  pending,
  onEdit,
  onArchive,
  onDelete,
}: {
  isArchived: boolean;
  pending: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={pending}
        aria-label="List actions"
        aria-expanded={open}
        className="rounded px-3 py-1 text-lg font-medium leading-none text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
      >
        &#8943;
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-48 rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5">
          <button
            onClick={() => run(onEdit)}
            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            onClick={() => run(onArchive)}
            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            {isArchived ? "Unarchive" : "Archive"}
          </button>
          <hr className="my-1 border-gray-100" />
          <button
            onClick={() => run(onDelete)}
            className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-50"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function ViewerHeader({ list }: { list: GiftListDetailViewer }) {
  const connections = useQuery({ queryKey: ["connections"], queryFn: getConnections });
  const connectionId = connections.data?.find((c) => c.user.id === list.owner_id)?.id;
  const attribution = attributionFor(list);

  // The link always points at the owner's profile — the account behind the list —
  // whichever name is showing. On a shared-account list that name is the
  // recipient's, which is still the right profile to reach. On an "absent" list
  // the link moves to the keeper: linking "Beth" to Tom's profile would simply
  // be wrong.
  const linkToOwner = (label: string) =>
    connectionId ? (
      <Link to={`/people/${connectionId}`} className="text-blue-600 hover:underline">{label}</Link>
    ) : (
      label
    );
  const ownerLink = linkToOwner(list.owner_name);

  return (
    <ListHeader
      name={list.name}
      description={list.description}
      subtitle={
        attribution.kind === "absent" ? (
          <>for {attribution.subject} &middot; kept by {ownerLink}</>
        ) : (
          <>from {linkToOwner(attribution.subject)}</>
        )
      }
      isArchived={list.is_archived}
    />
  );
}

function ListHeader({
  name,
  description,
  subtitle,
  footnote,
  isArchived,
  sharing,
  actions,
}: {
  name: string;
  description: string | null;
  subtitle?: React.ReactNode;
  footnote?: string;
  isArchived?: boolean;
  sharing?: React.ReactNode;
  actions?: React.ReactNode;
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
          {footnote && <p className="mt-2 text-sm text-gray-500">{footnote}</p>}
          {sharing}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
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
  // Every transition is permitted — both fields are display-only, so nothing
  // cascades: no access path shifts and no claim is invalidated.
  const [recipient, setRecipient] = useState<RecipientValue>(recipientValueFrom(list));

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof updateList>[1]) => updateList(listId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      onDone();
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({
      name,
      description: description || undefined,
      ...recipientPayload(recipient),
    });
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
      <RecipientFields value={recipient} onChange={setRecipient} />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mutation.isPending || recipientIncomplete(recipient)}
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
