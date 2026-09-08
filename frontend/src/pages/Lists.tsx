import { useState, useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getLists } from "../api/lists";
import { getFolder, getFolders } from "../api/folders";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import { Spinner } from "../components/Spinner";
import { ClipboardIcon, HandshakeIcon } from "../components/Icons";
import type { GiftList } from "../types";
import { ListAttributionLine, RecipientLine } from "../components/ListAttribution";
import { ActionableBanner } from "../components/ActionableBanner";

type SortBy = "updated" | "name" | "created";

/** The filter's "no folder chosen" value. `<select>` values are strings, so the
 *  folder ids alongside it are stringified too. */
const ALL_LISTS = "all";

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
  const { user, isLoading: authLoading } = useAuth();
  // Simple mode is purely subtractive: it hides the folder filter, sort and
  // archive, and nothing else on this page (project spec §6.1). Withheld until
  // the session resolves, so a simple-mode viewer never sees them flash by while
  // the silent refresh is still in flight.
  const showControls = !authLoading && !user?.simple_mode;

  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("updated");
  const [folderId, setFolderId] = useState<number | null>(null);

  const ownedLists = useQuery({
    queryKey: ["lists", "owned", { archived: showArchived }],
    queryFn: () => getLists("owned", showArchived || undefined),
  });
  const sharedLists = useQuery({
    queryKey: ["lists", "shared", { archived: showArchived }],
    queryFn: () => getLists("shared", showArchived || undefined),
  });

  // The folders pages lost their route (NEU-1231), so this filter is now the
  // primary place a user meets the concept — hence the explanatory caption below.
  const folders = useQuery({
    queryKey: ["folders", { archived: false }],
    queryFn: () => getFolders(),
    enabled: showControls,
  });
  const selectedFolder = useQuery({
    queryKey: ["folder", folderId],
    queryFn: () => getFolder(folderId as number),
    enabled: folderId !== null,
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
  // otherwise. Sorting is a viewer's choice; grouping is not on offer (ADR 0001).
  const visibleShared = useMemo(
    () => visibleLists(sharedLists.data ?? [], { filtering, folderIds: folderListIds, sortBy }),
    [sharedLists.data, filtering, folderListIds, sortBy],
  );

  if (ownedLists.isPending || sharedLists.isPending) return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Lists</h1>
      <Spinner />
    </div>
  );

  const sectionsPending = filtering && selectedFolder.isPending;

  return (
    <div className="space-y-8">
      {/* Anything awaiting a decision, above the lists. Rendered in both modes:
          in simple mode this is the only route to these items. */}
      <ActionableBanner />

      <header>
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <ClipboardIcon className="h-6 w-6" /> Lists
          </h1>
          {!showArchived && (
            <Link
              to="/lists/new"
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              New List
            </Link>
          )}
        </div>

        {showControls && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {hasFolders && (
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  Folder
                  <select
                    value={folderId === null ? ALL_LISTS : String(folderId)}
                    onChange={(e) =>
                      setFolderId(e.target.value === ALL_LISTS ? null : Number(e.target.value))
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

              <button
                onClick={() => setShowArchived(!showArchived)}
                className="text-sm text-blue-600 hover:underline"
              >
                {showArchived ? "View active lists" : "View archived lists"}
              </button>
            </div>

            {/* Always shown in full mode, filter or no filter: with the folders
                pages unrouted this is the only introduction to the concept, and a
                viewer with no folders yet is exactly the one who needs it. */}
            <p className="mt-2 text-xs text-gray-500">
              Folders group lists together — for example, all the lists for Christmas 2026.
              {!hasFolders && " Open a list to file it under one."}
            </p>
          </>
        )}
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
                ) : showArchived ? (
                  "No archived lists."
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
                  <li key={list.id} className={showArchived ? "opacity-60" : undefined}>
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

          {/* Shared with Me — one flat section for every list shared with the viewer,
              whatever path it took. The backend has already merged the direct and
              family grants and ordered them (NEU-1227). The source shows as a label
              on the row and nothing more: no per-family heading, no grouping, no
              link to the family. */}
          <section>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <HandshakeIcon className="h-5 w-5" /> Shared with Me
            </h2>

            {visibleShared.length === 0 && (
              <p className="mt-3 text-gray-500">
                {filtering ? (
                  `No lists shared with you are in ${folderName}.`
                ) : showArchived ? (
                  "No archived lists shared with you."
                ) : showControls ? (
                  <>
                    No one has shared a list with you yet.{" "}
                    <Link to="/people" className="text-blue-600 hover:underline">Add a connection</Link> to get started.
                  </>
                ) : (
                  // Simple mode hides People, so there is nothing to point at.
                  "No one has shared a list with you yet."
                )}
              </p>
            )}

            {visibleShared.length > 0 && (
              <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
                {visibleShared.map((list) => (
                  <li key={list.id} className={showArchived ? "opacity-60" : undefined}>
                    <Link to={`/lists/${list.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                      <div>
                        <p className="font-medium text-gray-900">{list.name}</p>
                        <ListAttributionLine list={list} />
                        <p className="text-xs text-gray-400">
                          {list.claimed_count} of {list.gift_count} claimed
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
