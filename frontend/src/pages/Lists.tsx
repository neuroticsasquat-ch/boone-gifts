import { useEffect, useMemo } from "react";
import { Link } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getLists } from "../api/lists";
import { getFolder, getFolders } from "../api/folders";
import { useTitle } from "../hooks/useTitle";
import { useEnumSearchParam, useSearchParamState } from "../hooks/useSearchParamState";
import { Spinner } from "../components/Spinner";
import { ClipboardIcon, HandshakeIcon } from "../components/Icons";
import type { GiftList } from "../types";
import { groupLists, type FolderMembership, type GroupBy } from "../lib/list-grouping";
import { RecipientLine } from "../components/ListAttribution";
import { SharedRows } from "../components/SharedListRows";
import { ActionableBanner } from "../components/ActionableBanner";
import { OccasionStrip } from "./lists/OccasionStrip";

const SORTS = ["updated", "name", "created"] as const;
type SortBy = (typeof SORTS)[number];

const GROUPINGS = ["none", "occasion", "person", "folder"] as const;

/** The filter's "no folder chosen" value. `<select>` values are strings, so the
 *  folder ids alongside it are stringified too. */
const ALL_LISTS = "all";

/** `?folder=` read as an id, or null when it is not one syntactically.
 *
 *  A folder id is a positive integer or it is not an id at all — the same rule
 *  `NumericId` applies to a route id (ADR 0006), applied to a param. `abc`,
 *  `-1`, `0` and `1.5` are all treated as absent. Whether a well-formed id names
 *  a folder the *viewer owns* cannot be known until `getFolders()` resolves, and
 *  is the second stage, below. */
function parseFolderParam(raw: string | null): number | null {
  if (raw === null || !/^[1-9][0-9]*$/.test(raw)) return null;
  return Number(raw);
}

function sortLists(lists: GiftList[], sortBy: SortBy) {
  return [...lists].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "created") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

/** A section's rows: narrowed to the selected folder, then sorted. `folderIds`
 *  is null while the folder's membership is still loading, which shows nothing
 *  rather than briefly showing everything. */
function visibleLists(
  lists: GiftList[],
  { filtering, folderIds, sortBy }: { filtering: boolean; folderIds: Set<number> | null; sortBy: SortBy },
) {
  if (!filtering) return sortLists(lists, sortBy);
  return sortLists(folderIds ? lists.filter((list) => folderIds.has(list.id)) : [], sortBy);
}

export function Lists() {
  useTitle("Lists");
  // Every one of these three is a **preference about a page you are already
  // on**, so all three replace: setting a sort and then pressing Back leaves
  // /lists rather than undoing the dropdown (project spec §6.3).
  const [sortBy, setSortBy] = useEnumSearchParam<SortBy>("sort", {
    mode: "replace",
    values: SORTS,
    fallback: "updated",
  });
  // Off by default, so the shipped flat page is what a viewer who asks for
  // nothing still gets (project spec §9.1).
  const [groupBy, setGroupBy] = useEnumSearchParam<GroupBy>("group", {
    mode: "replace",
    values: GROUPINGS,
    fallback: "none",
  });
  // `folder` is the odd one out — a number, whose valid values are not known
  // until the folder list resolves — so it carries its own two-stage check
  // rather than going through `useEnumSearchParam`.
  const [folderParam, setFolderParam] = useSearchParamState("folder", { mode: "replace" });
  const parsedFolderId = parseFolderParam(folderParam);

  // Active only, always. Nothing archived appears in a default view — the
  // archive is `/lists/archive` and nothing else (NEU-1278, project spec §9.5).
  const ownedLists = useQuery({
    queryKey: ["lists", "owned", { archived: false }],
    queryFn: () => getLists("owned"),
  });
  const sharedLists = useQuery({
    queryKey: ["lists", "shared", { archived: false }],
    queryFn: () => getLists("shared"),
  });

  // The folders pages lost their route (NEU-1231), so this filter is now the
  // primary place a user meets the concept — hence the explanatory caption below.
  const folders = useQuery({
    queryKey: ["folders", { archived: false }],
    queryFn: () => getFolders(),
  });
  // Stage two: an id the viewer does not own is not a filter. It falls back to
  // All lists rather than being fetched — `GET /folders/999` would 404, and
  // `selectedFolder` has no error arm, so the page would sit with `filtering`
  // true and `folderListIds` null forever: both sections empty, no explanation
  // (CONTEXT.md rule 3). False while the folders are still loading, which keeps
  // the id and leaves the page in its existing `sectionsPending` arm rather
  // than briefly showing everything.
  const folderDisowned =
    parsedFolderId !== null
    && folders.data !== undefined
    && !folders.data.some((folder) => folder.id === parsedFolderId);
  const folderId = folderDisowned ? null : parsedFolderId;

  // A key the page is ignoring does not stay in the address: a viewer who
  // bookmarked or re-shared `?folder=999` would otherwise propagate it onward,
  // and the next reader could not tell it was already being ignored.
  useEffect(() => {
    if (folderParam === null) return;
    if (parsedFolderId === null || folderDisowned) setFolderParam(null);
  }, [folderParam, parsedFolderId, folderDisowned, setFolderParam]);

  const selectedFolder = useQuery({
    queryKey: ["folder", folderId],
    queryFn: () => getFolder(folderId as number),
    // Held until the folder list has settled, so a `?folder=` the viewer does
    // not own is never fetched at all — stage two disowns it in the same render
    // the list arrives in. Gated on the folder list *settling* rather than on
    // its data: if that read fails there is nothing to judge the id against,
    // and asking the server directly beats spinning forever.
    enabled: folderId !== null && !folders.isPending,
  });

  // Grouping by folder needs every folder's membership, not just the selected
  // one's, so it fans out over the same per-folder read the filter already uses
  // — same cache entries, no grouped endpoint (NEU-1277). A user's folders are
  // few, and nothing is fetched until the viewer asks for this grouping.
  const groupingByFolder = groupBy === "folder";
  const folderQueries = useQueries({
    queries: (folders.data ?? []).map((folder) => ({
      queryKey: ["folder", folder.id],
      queryFn: () => getFolder(folder.id),
      enabled: groupingByFolder,
    })),
  });

  // Membership is the folder's own list of lists, so a list in several
  // folders is matched by each of them.
  const folderListIds = useMemo(() => {
    if (!selectedFolder.data) return null;
    return new Set(selectedFolder.data.lists.map((list) => list.id));
  }, [selectedFolder.data]);

  // A select whose only option is "All lists" would name a concept it cannot
  // explain, so the filter itself waits until there is something to filter by.
  const hasFolders = (folders.data?.length ?? 0) > 0;
  const filtering = folderId !== null;
  const folderName = selectedFolder.data?.name
    ?? folders.data?.find((folder) => folder.id === folderId)?.name
    ?? "this folder";

  const visibleOwned = useMemo(
    () => visibleLists(ownedLists.data ?? [], { filtering, folderIds: folderListIds, sortBy }),
    [ownedLists.data, filtering, folderListIds, sortBy],
  );
  // "Most recent" is the order the server already returns, so the section renders
  // the server's merge of the direct and family grants until the viewer says
  // otherwise. Sorting reorders that; grouping subdivides it, and only when the
  // viewer switches it on (ADR 0005).
  const visibleShared = useMemo(
    () => visibleLists(sharedLists.data ?? [], { filtering, folderIds: folderListIds, sortBy }),
    [sharedLists.data, filtering, folderListIds, sortBy],
  );

  // `useQueries` hands back a fresh array on every render, so there is nothing
  // stable to memoize these on — and bucketing a page of lists is cheap.
  const folderMemberships: FolderMembership[] = folderQueries.flatMap((query) =>
    query.data ? [{ id: query.data.id, name: query.data.name, listIds: new Set(query.data.lists.map((list) => list.id)) }] : []
  );
  // A membership read that *failed* is not an empty one: filing its lists under
  // "Not in a folder" would answer a question this page cannot currently answer,
  // so the grouping is abandoned and said so instead. The rows stay — the one
  // thing that must never happen is a list going missing.
  const folderGroupingFailed = groupingByFolder
    && (folders.isError || folderQueries.some((query) => query.isError));
  const sharedGroups = groupBy === "none" || folderGroupingFailed
    ? null
    : groupLists(visibleShared, groupBy, folderMemberships);
  // Grouping by folder against half-loaded membership would file lists under
  // "Not in a folder" and then move them, so the section waits instead.
  const groupsPending = groupingByFolder
    && !folderGroupingFailed
    && (folders.isPending || folderQueries.some((query) => query.isPending));

  if (ownedLists.isPending || sharedLists.isPending) return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Lists</h1>
      <Spinner />
    </div>
  );

  const sectionsPending = filtering && selectedFolder.isPending;

  return (
    <div className="space-y-8">
      {/* Anything awaiting a decision, above the lists. */}
      <ActionableBanner />

      {/* The way in to the occasions the viewer is shopping for. Renders
          nothing when they have none, and never delays the lists below
          (ADR 0007). */}
      <OccasionStrip />

      <header>
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <ClipboardIcon className="h-6 w-6" /> Lists
          </h1>
          <Link
            to="/lists/new"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New List
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {hasFolders && (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Folder
              <select
                value={folderId === null ? ALL_LISTS : String(folderId)}
                onChange={(e) =>
                  setFolderParam(e.target.value === ALL_LISTS ? null : e.target.value)
                }
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
              >
                <option value={ALL_LISTS}>All lists</option>
                {folders.data?.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-600">
            Sort
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
            >
              <option value="updated">Most recent</option>
              <option value="name">Name A–Z</option>
              <option value="created">Oldest first</option>
            </select>
          </label>

          {/* Subdivides Shared with me alone: My Lists is the viewer's own and
              has no source to group by. Never gated — every viewer gets it. */}
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Group by
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
            >
              <option value="none">None</option>
              <option value="occasion">Occasion</option>
              <option value="person">Person</option>
              <option value="folder">Folder</option>
            </select>
          </label>
        </div>

        {/* Always shown, filter or no filter: with the folders pages unrouted
            this is the only introduction to the concept, and a viewer with no
            folders yet is exactly the one who needs it. */}
        <p className="mt-2 text-xs text-gray-500">
          Folders group lists together — for example, all the lists for Christmas 2026.
          {!hasFolders && " Open a list to file it under one."}
        </p>
      </header>

      {sectionsPending ? <Spinner /> : (
        <>
          {/* My Lists */}
          <section>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <ClipboardIcon className="h-5 w-5" /> My Lists
            </h2>

            {visibleOwned.length === 0 && (
              <p className="mt-3 text-gray-500">
                {filtering ? (
                  `None of your lists are in ${folderName}.`
                ) : (
                  <>
                    You haven't created any lists yet.{" "}
                    <Link to="/lists/new" className="text-blue-600 hover:underline">Create your first list</Link>.
                  </>
                )}
              </p>
            )}

            {visibleOwned.length > 0 && (
              <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
                {visibleOwned.map((list) => (
                  <li key={list.id}>
                    <Link to={`/lists/${list.id}`} className="block px-4 py-3 hover:bg-gray-50">
                      <p className="font-medium text-gray-900">{list.name}</p>
                      <RecipientLine list={list} />
                      {list.description && (
                        <p className="mt-0.5 text-sm text-gray-500 truncate">{list.description}</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Shared with Me — one section for every list shared with the viewer,
              whatever path it took. The backend has already merged the direct and
              family grants and ordered them (NEU-1227). The source shows as a label
              on the row; it becomes a heading only when the viewer asks for one
              through Group by, and that heading links only where the page behind
              it carries more than the grouping does (ADR 0007). */}
          <section>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <HandshakeIcon className="h-5 w-5" /> Shared with Me
            </h2>

            {visibleShared.length === 0 && (
              <p className="mt-3 text-gray-500">
                {filtering ? (
                  `No lists shared with you are in ${folderName}.`
                ) : (
                  <>
                    No one has shared a list with you yet.{" "}
                    <Link to="/people" className="text-blue-600 hover:underline">Add a connection</Link> to get started.
                  </>
                )}
              </p>
            )}

            {visibleShared.length > 0 && groupsPending && <Spinner />}

            {visibleShared.length > 0 && !groupsPending && (
              sharedGroups ? (
                <div className="mt-3 space-y-6">
                  {sharedGroups.map((group) => (
                    <section key={group.key}>
                      {/* The qualifier stays plain text: an occasion heading
                          reads "Boone Family · Christmas 2026", and only the
                          occasion name leads to the occasion (ADR 0007). */}
                      <h3 className="text-sm font-semibold text-gray-700">
                        {group.qualifier && `${group.qualifier} · `}
                        {group.href ? (
                          <Link to={group.href} className="text-blue-600 hover:underline">{group.heading}</Link>
                        ) : group.heading}
                      </h3>
                      <SharedRows lists={group.lists} />
                    </section>
                  ))}
                </div>
              ) : (
                <>
                  {folderGroupingFailed && (
                    <p className="mt-3 text-sm text-red-600">
                      Your folders couldn't be loaded, so these lists aren't grouped by folder.
                    </p>
                  )}
                  <SharedRows lists={visibleShared} />
                </>
              )
            )}
          </section>
        </>
      )}

      {/* The one way in to archived lists and folders, where project spec §9.1
          draws it — at the foot of the page, apart from the header row, because
          it is a destination rather than a control that reshapes what is above
          it. It replaces the "View archived lists" toggle: nothing archived is
          reachable from the dashboard itself any more (NEU-1278). */}
      <p className="text-right">
        <Link to="/lists/archive" className="text-sm text-blue-600 hover:underline">
          View archive
        </Link>
      </p>
    </div>
  );
}
