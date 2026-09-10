import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getList, updateList, deleteList } from "../api/lists";
import { getConnections } from "../api/connections";
import { getAccount } from "../api/account";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import type { GiftListDetailOwner, GiftListDetailViewer } from "../types";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { Spinner } from "../components/Spinner";
import { useNumericId } from "../components/NumericId";
import { HeaderMenu } from "../components/HeaderMenu";
import { ConfirmDialog, type ConfirmAction } from "../components/ConfirmDialog";
import { GiftsTab } from "./list-detail/GiftsTab";
import { SharingPanel } from "./list-detail/SharingPanel";
import { SharingSummary } from "./list-detail/SharingSummary";
import { FolderPicker } from "./list-detail/FolderPicker";
import { attributionFor, isKeptForAbsentPerson, recipientLabel, recipientNameOf } from "../lib/attribution";
import { ListForFields } from "../components/ListForFields";
import {
  listForIncomplete,
  listForPayload,
  listForValueFrom,
  type ListForValue,
} from "../lib/list-for";

function isOwnerView(list: GiftListDetailOwner | GiftListDetailViewer, userId: number): list is GiftListDetailOwner {
  return list.owner_id === userId;
}

export function ListDetail() {
  const listId = useNumericId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  // One header panel at a time — both open in the same slot under the header,
  // and two of them stacked there would bury the gifts.
  const [panel, setPanel] = useState<"sharing" | "folders" | null>(null);

  function togglePanel(next: "sharing" | "folders") {
    setPanel((open) => (open === next ? null : next));
  }

  const { data: list, isLoading, error, refetch } = useQuery({
    queryKey: ["list", listId],
    queryFn: () => getList(listId),
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
            onChangeSharing={() => togglePanel("sharing")}
            onAddToFolder={() => togglePanel("folders")}
          />
        )
      ) : (
        <ViewerHeader
          list={list as GiftListDetailViewer}
          onAddToFolder={() => togglePanel("folders")}
        />
      )}

      {/* Sharing panel — the only way to reach the people and family controls now
          that the tab bar is gone. */}
      {isOwner && panel === "sharing" && (
        <SharingPanel
          listId={listId}
          queryClient={queryClient}
          onClose={() => setPanel(null)}
        />
      )}

      {/* Folders — likewise the only way in, for owner and viewer alike. */}
      {panel === "folders" && (
        <FolderPicker
          listId={listId}
          queryClient={queryClient}
          onClose={() => setPanel(null)}
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
  onChangeSharing,
  onAddToFolder,
}: {
  list: GiftListDetailOwner;
  listId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  navigate: ReturnType<typeof useNavigate>;
  onEdit: () => void;
  onChangeSharing: () => void;
  onAddToFolder: () => void;
}) {
  const [confirming, setConfirming] = useState<"archive" | "delete" | null>(null);

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

  // Only the archive direction asks; unarchiving is not destructive.
  function handleArchiveToggle() {
    if (list.is_archived) {
      archiveMutation.mutate();
    } else {
      setConfirming("archive");
    }
  }

  return (
    <>
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
          <SharingSummary listId={listId} onChange={onChangeSharing} />
        }
        actions={
          <HeaderMenu
            ariaLabel="List actions"
            pending={archiveMutation.isPending || deleteMutation.isPending}
            items={[
              { label: ADD_TO_FOLDER, onClick: onAddToFolder },
              { label: "Edit", onClick: onEdit },
              { label: list.is_archived ? "Unarchive" : "Archive", onClick: handleArchiveToggle },
              { label: "Delete", onClick: () => setConfirming("delete"), danger: true, separatorBefore: true },
            ]}
          />
        }
      />
      <ConfirmDialog
        open={confirming !== null}
        title={confirming === "delete" ? "Delete this list?" : "Archive this list?"}
        body={confirming === "delete" ? "This cannot be undone." : undefined}
        actions={confirming === "delete" ? DELETE_ACTIONS : ARCHIVE_ACTIONS}
        onResolve={(id) => {
          if (id === "delete") deleteMutation.mutate();
          else if (id === "archive") archiveMutation.mutate();
          setConfirming(null);
        }}
      />
    </>
  );
}

/**
 * The folder action reads the same for an owner and a viewer, so it is written
 * once — the two headers must not drift apart on the wording of the only entry
 * point a viewer has.
 */
const ADD_TO_FOLDER = "Add to a folder…";

const ARCHIVE_ACTIONS: ConfirmAction[] = [{ id: "archive", label: "Archive", tone: "danger" }];
const DELETE_ACTIONS: ConfirmAction[] = [{ id: "delete", label: "Delete", tone: "danger" }];

function ViewerHeader({
  list,
  onAddToFolder,
}: {
  list: GiftListDetailViewer;
  onAddToFolder: () => void;
}) {
  const connections = useQuery({ queryKey: ["connections"], queryFn: getConnections });
  const connectionId = connections.data?.find((c) => c.user.id === list.owner_id)?.id;
  const attribution = attributionFor(list);

  // The link always points at the owner's profile — the account behind the list.
  // On an "absent" list the link moves to the keeper rather than the recipient:
  // linking "Beth" to Tom's profile would simply be wrong.
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
      // No owner controls, but the menu itself stays: filing someone else's list
      // under a folder of your own is the main use of the feature, and this
      // is a viewer's only way to reach it.
      actions={
        <HeaderMenu ariaLabel="List actions" items={[{ label: ADD_TO_FOLDER, onClick: onAddToFolder }]} />
      }
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
  // Every transition is permitted — all three fields are display-only, so nothing
  // cascades: no access path shifts and no claim is invalidated.
  const [listFor, setListFor] = useState<ListForValue>(listForValueFrom(list));
  const account = useQuery({ queryKey: ["account"], queryFn: getAccount });

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
      ...listForPayload(listFor),
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
      <ListForFields account={account.data} value={listFor} onChange={setListFor} />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={
            mutation.isPending ||
            listForIncomplete(listFor, account.data?.is_shared_account ?? false)
          }
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
