import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getList, updateList, deleteList } from "../api/lists";
import { getConnections } from "../api/connections";
import { getAccount } from "../api/account";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import { useEnumSearchParam } from "../hooks/useSearchParamState";
import { useNavigationDepth } from "../contexts/NavigationDepthContext";
import type { GiftListDetailOwner, GiftListDetailViewer } from "../types";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { Spinner } from "../components/Spinner";
import { useNumericId } from "../components/NumericId";
import { BackControl, BACK_TO_LISTS } from "../components/BackControl";
import { HeaderMenu } from "../components/HeaderMenu";
import { ConfirmDialog, type ConfirmAction } from "../components/ConfirmDialog";
import { ListSharingModal } from "../components/ListSharingModal";
import { GiftsTab } from "./list-detail/GiftsTab";
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

/** An open modal is a place you can be, so `?share=open` is the whole state and
 *  a shut one leaves no trace: setting the fallback writes `null`. */
const SHARE_VALUES = ["open", "closed"] as const;

export function ListDetail() {
  const listId = useNumericId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  // Sharing and folders no longer know about each other. "One header panel at a
  // time" existed because both opened in the same slot under the header; once
  // sharing is a modal it is not in that slot, and opening it over an open
  // folder panel is harmless — the modal covers it, and closing returns the
  // viewer exactly where they were.
  const [foldersOpen, setFoldersOpen] = useState(false);
  // An open modal is a *place*, so it pushes: it is linkable, and the mobile
  // back gesture closes it rather than navigating away (CONTEXT.md rule 8).
  // Read as an enum so `?share=banana` heals away through the wrapper's
  // mount-time scrub instead of sitting in the address with the modal shut.
  const [share, setShare] = useEnumSearchParam("share", {
    mode: "push",
    values: SHARE_VALUES,
    fallback: "closed",
  });
  const depth = useNavigationDepth();
  const [, setSearchParams] = useSearchParams();

  // Strip `?share` without navigating: the address and the page must agree
  // (CONTEXT.md rule 8), and this is a correction to the entry the viewer is
  // already standing on rather than a place of its own.
  const stripShare = useCallback(() => {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.delete("share");
        return params;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  // One close path, depth-aware, mirroring `BackControl` (CONTEXT.md rule 9).
  // The app pushed the open entry, so popping lands exactly where the viewer
  // was — writing `closed` through the push-mode hook would add *another*
  // entry, and Back after Done would reopen the modal rather than leave the
  // page. At depth 0 — a deep link straight to `/lists/1?share=open` — there is
  // nothing of ours behind us, so strip instead. Always replace-stripping is
  // the other wrong answer: it duplicates the pre-open entry, so the first Back
  // after closing visibly does nothing.
  function closeSharing() {
    if (depth > 0) navigate(-1);
    else stripShare();
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

  // The modal is owner-only, but `/lists/1?share=open` can be pasted by anyone,
  // and ownership is not known until the list query resolves. Once it does and
  // the viewer is not the owner, strip the param so the address and the page
  // agree. A non-owner never mounts the modal — only this.
  const notOwner = list !== undefined && user !== null && list.owner_id !== user.id;
  useEffect(() => {
    if (share === "open" && notOwner) stripShare();
  }, [share, notOwner, stripShare]);

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
      <BackControl fallback={BACK_TO_LISTS} />

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
            onChangeSharing={() => setShare("open")}
            onAddToFolder={() => setFoldersOpen(true)}
          />
        )
      ) : (
        <ViewerHeader
          list={list as GiftListDetailViewer}
          onAddToFolder={() => setFoldersOpen(true)}
        />
      )}

      {/* Folders — the only way in, for owner and viewer alike. Deliberately
          still inline: it is reached by viewers too, and would want its own
          `?folder=open` decision and its own filter question. No ticket asks. */}
      {foldersOpen && (
        <FolderPicker
          listId={listId}
          queryClient={queryClient}
          onClose={() => setFoldersOpen(false)}
        />
      )}

      {/* The gifts are the page. */}
      <GiftsTab list={list} listId={listId} isOwner={isOwner} userId={user!.id} queryClient={queryClient} />

      {/* Sharing is over the page, not above the gifts: as an inline region it
          pushed the list's own content down, and at M3's ~50 connections and
          ~8 families that is unusable. */}
      {isOwner && share === "open" && (
        <ListSharingModal listId={listId} queryClient={queryClient} onClose={closeSharing} />
      )}
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
              { label: list.is_archived ? "Unarchive" : "Archive", onClick: () => archiveMutation.mutate() },
              { label: "Delete", onClick: () => setConfirmingDelete(true), danger: true, separatorBefore: true },
            ]}
          />
        }
      />
      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this list?"
        body="This cannot be undone."
        actions={DELETE_ACTIONS}
        onResolve={(id) => {
          if (id === "delete") deleteMutation.mutate();
          setConfirmingDelete(false);
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
