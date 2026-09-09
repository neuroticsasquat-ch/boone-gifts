import { Link } from "react-router";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getLists } from "../api/lists";
import { getFolders } from "../api/folders";
import { useTitle } from "../hooks/useTitle";
import { Spinner } from "../components/Spinner";
import { ArchiveIcon } from "../components/Icons";
import { ListAttributionLine, RecipientLine } from "../components/ListAttribution";

/**
 * The Lists dashboard's archive (`/lists/archive`, project spec §9.5).
 *
 * One deliberate way in to everything the viewer has archived — their own
 * lists, the archived lists other people shared with them, and their folders.
 * It replaces the in-page "View archived lists" toggle `Lists.tsx` used to
 * carry: archived rows are no longer a state the dashboard can be put into, so
 * nothing archived can reach a default view (NEU-1278).
 *
 * Nothing is unarchived from here. List detail's `⋯` menu and the folder page's
 * header already own that mutation, and a second implementation of it is a
 * second thing to keep honest — so the rows are links to those pages and this
 * stays a way of finding them.
 */
export function ListsArchive() {
  useTitle("Archive");

  // The same keys the dashboard uses, with `archived: true` — so archiving from
  // a detail page, which invalidates the `["lists"]` / `["folders"]` prefixes,
  // refreshes this page as well as the one the row left.
  const ownedLists = useQuery({
    queryKey: ["lists", "owned", { archived: true }],
    queryFn: () => getLists("owned", true),
  });
  const sharedLists = useQuery({
    queryKey: ["lists", "shared", { archived: true }],
    queryFn: () => getLists("shared", true),
  });
  const folders = useQuery({
    queryKey: ["folders", { archived: true }],
    queryFn: () => getFolders(true),
  });

  // Only once all three have actually answered: a failed read is not an empty
  // one, and "nothing is archived" is a claim this page cannot make on its
  // behalf. Any error and the sections render, each saying its own piece.
  const nothingArchived =
    ownedLists.isSuccess && sharedLists.isSuccess && folders.isSuccess
    && ownedLists.data.length === 0
    && sharedLists.data.length === 0
    && folders.data.length === 0;

  return (
    <div className="space-y-8">
      <header>
        <Link to="/lists" className="text-sm text-blue-600 hover:underline">
          ← Lists
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900">
          <ArchiveIcon className="h-6 w-6" /> Archive
        </h1>
        <p className="mt-2 text-xs text-gray-500">
          Archived lists and folders stay here, out of every other view. Open one to see
          it — unarchiving happens on the list or folder itself.
        </p>
      </header>

      {nothingArchived ? (
        <p className="text-gray-500">You haven&apos;t archived anything yet.</p>
      ) : (
        <>
          <ArchiveSection
            heading="Archived Lists"
            query={ownedLists}
            empty="No archived lists."
            failed="Your archived lists couldn't be loaded."
            renderRows={(lists) => (
              <ArchiveRows>
                {lists.map((list) => (
                  <ArchiveRow key={list.id} to={`/lists/${list.id}`} name={list.name}>
                    <RecipientLine list={list} />
                  </ArchiveRow>
                ))}
              </ArchiveRows>
            )}
          />

          <ArchiveSection
            heading="Archived Lists Shared with Me"
            query={sharedLists}
            empty="No archived lists shared with you."
            failed="The archived lists shared with you couldn't be loaded."
            renderRows={(lists) => (
              <ArchiveRows>
                {lists.map((list) => (
                  <ArchiveRow key={list.id} to={`/lists/${list.id}`} name={list.name}>
                    <ListAttributionLine list={list} />
                  </ArchiveRow>
                ))}
              </ArchiveRows>
            )}
          />

          <ArchiveSection
            heading="Archived Folders"
            query={folders}
            empty="No archived folders."
            failed="Your archived folders couldn't be loaded."
            renderRows={(archivedFolders) => (
              <ArchiveRows>
                {archivedFolders.map((folder) => (
                  <ArchiveRow key={folder.id} to={`/folders/${folder.id}`} name={folder.name}>
                    {folder.description && (
                      <p className="mt-0.5 text-sm text-gray-500 truncate">{folder.description}</p>
                    )}
                  </ArchiveRow>
                ))}
              </ArchiveRows>
            )}
          />
        </>
      )}
    </div>
  );
}

/**
 * One section of the archive: its heading, then whichever of pending, failed,
 * empty or rows applies. The three sections read three different resources and
 * say four different things about each, so the ladder is stated once here
 * rather than three times inline — in particular the failed arm, which must
 * never be collapsed into the empty one.
 */
function ArchiveSection<T>({
  heading,
  query,
  empty,
  failed,
  renderRows,
}: {
  heading: string;
  query: UseQueryResult<T[]>;
  empty: string;
  failed: string;
  renderRows: (items: T[]) => ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900">{heading}</h2>
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <p className="mt-3 text-sm text-red-600">{failed}</p>
      ) : query.data.length === 0 ? (
        <p className="mt-3 text-gray-500">{empty}</p>
      ) : (
        renderRows(query.data)
      )}
    </section>
  );
}

function ArchiveRows({ children }: { children: ReactNode }) {
  return <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">{children}</ul>;
}

/** One archived thing: its name, whatever line belongs under it, and a link to
 *  the page that can bring it back. */
function ArchiveRow({ to, name, children }: { to: string; name: string; children?: ReactNode }) {
  return (
    <li>
      <Link to={to} className="block px-4 py-3 hover:bg-gray-50">
        <p className="font-medium text-gray-900">{name}</p>
        {children}
      </Link>
    </li>
  );
}
