import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router";
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  getFolder,
  updateFolder,
  deleteFolder,
  addFolderItem,
  removeFolderItem,
} from "../api/folders";
import { getLists } from "../api/lists";
import type { FolderDetail as FolderDetailType, GiftList } from "../types";
import { useTitle } from "../hooks/useTitle";
import toast from "react-hot-toast";
import { Spinner } from "../components/Spinner";
import { ConfirmDialog, type ConfirmAction } from "../components/ConfirmDialog";
import { useNumericId } from "../components/NumericId";
import { BackControl, BACK_TO_LISTS } from "../components/BackControl";
import { ListAttributionLine, RecipientLine } from "../components/ListAttribution";
import { MyShopping } from "../components/MyShopping";
import { TabBar } from "../components/TabBar";
import { useEnumSearchParam } from "../hooks/useSearchParamState";
import { useAuth } from "../hooks/useAuth";

/**
 * The folder page's tabs — the same two the occasion page carries
 * (project spec §9.3). A folder is one user's own curation rather than a
 * family's occasion, and it is the **only** route to a claim on a directly
 * shared list, which belongs to no occasion and so appears on no occasion's
 * shopping tab (project spec §9.4).
 */
const TABS = [
  { key: "lists", label: "Lists" },
  { key: "shopping", label: "My shopping" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const TAB_KEYS = TABS.map((tab) => tab.key);

export function FolderDetail() {
  const folderId = useNumericId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Pushed, like the occasion page's: the same two tabs mean the same thing on
  // both, and a tab is a place (spec §6.3).
  const [tab, setTab] = useEnumSearchParam<TabKey>("tab", {
    mode: "push",
    values: TAB_KEYS,
    fallback: TABS[0].key,
  });

  const { data: folder, isLoading, error, refetch } = useQuery({
    queryKey: ["folder", folderId],
    queryFn: () => getFolder(folderId),
  });

  useTitle(folder?.name ?? "Folder");

  if (isLoading) return <Spinner />;
  if (error || !folder) return (
    <div className="text-center py-12">
      <p className="text-red-600">Failed to load folder.</p>
      <button onClick={() => refetch()} className="mt-2 text-sm text-blue-600 hover:underline">Try again</button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Folders have no index page — the folder filter on /lists is where a
          user meets the concept — so back means the lists, not a folder list. */}
      <BackControl fallback={BACK_TO_LISTS} />
      <FolderHeader
        folder={folder}
        folderId={folderId}
        queryClient={queryClient}
        navigate={navigate}
      />
      <TabBar tabs={TABS} active={tab} onSelect={setTab} label="Folder sections" />
      {tab === "lists" ? (
        <>
          <FolderLists
            folder={folder}
            folderId={folderId}
            queryClient={queryClient}
          />
          <AddListForm folderId={folderId} folder={folder} queryClient={queryClient} />
        </>
      ) : (
        <MyShopping scope={{ kind: "folder", id: folderId }} />
      )}
    </div>
  );
}

const ARCHIVE_ACTIONS: ConfirmAction[] = [{ id: "archive", label: "Archive", tone: "danger" }];
const DELETE_ACTIONS: ConfirmAction[] = [{ id: "delete", label: "Delete", tone: "danger" }];

function FolderHeader({
  folder,
  folderId,
  queryClient,
  navigate,
}: {
  folder: FolderDetailType;
  folderId: number;
  queryClient: ReturnType<typeof useQueryClient>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<"archive" | "delete" | null>(null);
  const [name, setName] = useState(folder.name);
  const [description, setDescription] = useState(folder.description ?? "");

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string }) => updateFolder(folderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folder", folderId] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      setEditing(false);
    },
    onError: () => toast.error("Failed to update folder."),
  });

  const archiveMutation = useMutation({
    mutationFn: () => updateFolder(folderId, { is_archived: !folder.is_archived }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folder", folderId] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
    onError: () => toast.error("Failed to update folder."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteFolder(folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      navigate("/lists", { replace: true });
    },
    onError: () => toast.error("Failed to delete folder."),
  });

  function handleSave(e: FormEvent) {
    e.preventDefault();
    updateMutation.mutate({ name, description: description || undefined });
  }

  // Only the archive direction asks; unarchiving is not destructive.
  function handleArchiveToggle() {
    if (folder.is_archived) {
      archiveMutation.mutate();
    } else {
      setConfirming("archive");
    }
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} className="rounded-lg bg-white p-6 shadow space-y-4">

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
            disabled={updateMutation.isPending}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{folder.name}</h1>
            {folder.is_archived && (
              <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">Archived</span>
            )}
          </div>
          {folder.description && <p className="mt-2 text-gray-600">{folder.description}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleArchiveToggle}
            disabled={archiveMutation.isPending}
            className={`rounded px-3 py-1 text-sm font-medium text-white disabled:opacity-50 ${folder.is_archived ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
          >
            {archiveMutation.isPending ? "…" : folder.is_archived ? "Unarchive" : "Archive"}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Edit
          </button>
          <button
            onClick={() => setConfirming("delete")}
            disabled={deleteMutation.isPending}
            className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirming !== null}
        title={confirming === "delete" ? "Delete this folder?" : "Archive this folder?"}
        body={confirming === "delete" ? "This cannot be undone." : undefined}
        actions={confirming === "delete" ? DELETE_ACTIONS : ARCHIVE_ACTIONS}
        onResolve={(id) => {
          if (id === "delete") deleteMutation.mutate();
          else if (id === "archive") archiveMutation.mutate();
          setConfirming(null);
        }}
      />
    </div>
  );
}

function FolderLists({
  folder,
  folderId,
  queryClient,
}: {
  folder: FolderDetailType;
  folderId: number;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { user } = useAuth();

  const removeMutation = useMutation({
    mutationFn: (listId: number) => removeFolderItem(folderId, listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folder", folderId] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
    onError: () => toast.error("Failed to remove list."),
  });

  if (folder.lists.length === 0) {
    return <p className="text-gray-500">No lists in this folder.</p>;
  }

  return (
    <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
      {folder.lists.map((list) => (
        <li key={list.id} className="flex items-center justify-between px-4 py-3">
          <Link to={`/lists/${list.id}`} className="min-w-0 flex-1 hover:opacity-75">
            <p className="font-medium text-gray-900">{list.name}</p>
            {/* The same pairing every mixed-population row list makes
                (`OccasionDetail`'s occasion lists, `/lists`' two sections):
                `attributionFor` falls through to the owner's name on a list
                carrying no route, so `ListAttributionLine` on a list the viewer
                owns reads "from Tom Boone" to Tom. A folder holds both
                populations, so the choice is per row rather than per section. */}
            {list.owner_id === user?.id ? (
              <RecipientLine list={list} />
            ) : (
              <ListAttributionLine list={list} />
            )}
          </Link>
          <button
            onClick={() => removeMutation.mutate(list.id)}
            disabled={removeMutation.isPending}
            className="ml-4 shrink-0 rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

const ADD_A_LIST_HEADING = "add-a-list-heading";

/**
 * The folder's picker: every list the viewer can see that is not already here.
 *
 * It was a `<select>` rendering a bare name. The ticket asks for the app's one
 * attribution component on these rows, and an `<option>` holds text while
 * `ListAttributionLine` renders a `<p>` — so the picker becomes rows rather than
 * growing a second, drifting way of turning a share route into words, which is
 * the precise drift M1's one-component contract exists to prevent (NEU-1286).
 */
function AddListForm({
  folderId,
  folder,
  queryClient,
}: {
  folderId: number;
  folder: FolderDetailType;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  // The pair `/lists` already warms, in place of one unfiltered `getLists()`
  // under the under-specified `["lists"]` key. Three things fall out of it:
  // arriving from `/lists` costs no request (the argument
  // `OccasionSharingModal` already makes for these keys), ownership is *which
  // query a row came from* rather than a second answer to a settled question,
  // and the key that encoded neither filter nor archived retires.
  const owned = useQuery({
    queryKey: ["lists", "owned", { archived: false }],
    queryFn: () => getLists("owned", false),
  });
  const shared = useQuery({
    queryKey: ["lists", "shared", { archived: false }],
    queryFn: () => getLists("shared", false),
  });

  const addMutation = useMutation({
    mutationFn: (listId: number) => addFolderItem(folderId, listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folder", folderId] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
    onError: () => toast.error("Failed to add list."),
  });

  const existingListIds = new Set(folder.lists.map((l) => l.id));
  // Owned first, then shared, each keeping the backend's `updated_at desc`.
  // That is `/lists`' own section order and it is what the `<select>` showed;
  // re-sorting is a second change, unrelated to the defect.
  const offered = [
    ...(owned.data ?? []).map((list) => ({ list, isOwn: true })),
    ...(shared.data ?? []).map((list) => ({ list, isOwn: false })),
  ].filter(({ list }) => !existingListIds.has(list.id));

  return (
    // Named by its own heading, so the picker is one addressable region rather
    // than loose rows below the folder's: the two sections hold rows of the same
    // shape, and only the region tells a screen reader — or a test — which.
    <section aria-labelledby={ADD_A_LIST_HEADING} className="rounded-lg bg-white p-4 shadow">
      {/* The heading survives every state below. `if (empty) return null` deleted
          the control and its heading together, so a complete folder and a broken
          page looked identical. */}
      <h2 id={ADD_A_LIST_HEADING} className="text-sm font-semibold text-gray-700 mb-3">
        Add a List
      </h2>
      <PickerBody
        owned={owned}
        shared={shared}
        offered={offered}
        pendingId={addMutation.isPending ? addMutation.variables : undefined}
        onAdd={(listId) => addMutation.mutate(listId)}
      />
    </section>
  );
}

/** One offered list, and which of the two queries it arrived in. */
type OfferedList = { list: GiftList; isOwn: boolean };

function PickerBody({
  owned,
  shared,
  offered,
  pendingId,
  onAdd,
}: {
  owned: UseQueryResult<GiftList[]>;
  shared: UseQueryResult<GiftList[]>;
  offered: OfferedList[];
  pendingId: number | undefined;
  onAdd: (listId: number) => void;
}) {
  if (owned.isLoading || shared.isLoading) {
    return <Spinner />;
  }

  // Either half failing fails the whole control. A failed *shared* query with a
  // healthy owned one would otherwise offer owned lists only — the exact defect
  // this ticket exists to fix, produced by a network error instead of a query
  // param. `OccasionSharingModal` draws the same line for the same reason.
  if (owned.isError || shared.isError) {
    return <p className="text-sm text-red-600">Failed to load your lists.</p>;
  }

  if (offered.length === 0) {
    // Two different absences, two sentences. Someone who can see nothing needs a
    // way to make a list; someone whose folder already holds everything does not.
    const seesNothing = (owned.data?.length ?? 0) + (shared.data?.length ?? 0) === 0;
    return seesNothing ? (
      <p className="text-sm text-gray-500">
        You can&apos;t see any lists yet.{" "}
        <Link to="/lists/new" className="text-blue-600 hover:underline">
          Create a list
        </Link>
        .
      </p>
    ) : (
      <p className="text-sm text-gray-500">Every list you can see is already in this folder.</p>
    );
  }

  return (
    <ul className="divide-y divide-gray-200">
      {offered.map(({ list, isOwn }) => (
        <li key={list.id} className="flex items-center justify-between gap-3 py-3">
          {/* `min-w-0` against the button's `shrink-0`: on a narrow viewport the
              attribution line wraps within what is left rather than squeezing
              the control. */}
          <div className="min-w-0">
            <p className="font-medium text-gray-900">{list.name}</p>
            {/* Ownership is which query the row came from — the same fact
                `/lists` pairs these two components on. */}
            {isOwn ? <RecipientLine list={list} /> : <ListAttributionLine list={list} />}
          </div>
          <button
            type="button"
            onClick={() => onAdd(list.id)}
            disabled={pendingId !== undefined}
            aria-label={`Add ${list.name}`}
            className="shrink-0 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pendingId === list.id ? "Adding…" : "Add"}
          </button>
        </li>
      ))}
    </ul>
  );
}
