import { useState, useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getLists } from "../api/lists";
import { useTitle } from "../hooks/useTitle";
import { Spinner } from "../components/Spinner";
import { ClipboardIcon, HandshakeIcon } from "../components/Icons";
import type { GiftList } from "../types";

function sortLists(lists: GiftList[], sortBy: "updated" | "name" | "created") {
  return [...lists].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "created") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

export function Lists() {
  useTitle("Lists");
  const [showArchived, setShowArchived] = useState(false);
  const [ownedSort, setOwnedSort] = useState<"updated" | "name" | "created">("updated");
  const [sharedSort, setSharedSort] = useState<"updated" | "name" | "created">("updated");

  const ownedLists = useQuery({
    queryKey: ["lists", "owned", { archived: showArchived }],
    queryFn: () => getLists("owned", showArchived || undefined),
  });
  const sharedLists = useQuery({
    queryKey: ["lists", "shared", { archived: showArchived }],
    queryFn: () => getLists("shared", showArchived || undefined),
  });

  const sortedOwned = useMemo(() => sortLists(ownedLists.data ?? [], ownedSort), [ownedLists.data, ownedSort]);
  const sortedShared = useMemo(() => sortLists(sharedLists.data ?? [], sharedSort), [sharedLists.data, sharedSort]);

  if (ownedLists.isPending || sharedLists.isPending) return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">My Lists</h1>
      <Spinner />
    </div>
  );

  return (
    <div className="space-y-8">
      {/* My Lists */}
      <section>
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><ClipboardIcon className="h-6 w-6" /> My Lists</h1>
          <div className="flex items-center gap-2">
            {ownedLists.data && ownedLists.data.length > 0 && (
              <select
                value={ownedSort}
                onChange={(e) => setOwnedSort(e.target.value as "updated" | "name" | "created")}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
              >
                <option value="updated">Most recent</option>
                <option value="name">Name A–Z</option>
                <option value="created">Oldest first</option>
              </select>
            )}
            {!showArchived && (
              <Link
                to="/lists/new"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                New List
              </Link>
            )}
          </div>
        </div>

        <div className="mt-2">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="text-sm text-blue-600 hover:underline"
          >
            {showArchived ? "View active lists" : "View archived lists"}
          </button>
        </div>

        {ownedLists.data && ownedLists.data.length === 0 && !showArchived && (
          <p className="mt-4 text-gray-500">
            You haven't created any lists yet.{" "}
            <Link to="/lists/new" className="text-blue-600 hover:underline">Create your first list</Link>.
          </p>
        )}

        {ownedLists.data && ownedLists.data.length === 0 && showArchived && (
          <p className="mt-4 text-gray-500">No archived lists.</p>
        )}

        {sortedOwned.length > 0 && (
          <ul className="mt-4 divide-y divide-gray-200 rounded-lg bg-white shadow">
            {sortedOwned.map((list) => (
              <li key={list.id} className={showArchived ? "opacity-60" : undefined}>
                <Link to={`/lists/${list.id}`} className="block px-4 py-3 hover:bg-gray-50">
                  <p className="font-medium text-gray-900">{list.name}</p>
                  {list.description && (
                    <p className="mt-0.5 text-sm text-gray-500 truncate">{list.description}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Shared with Me */}
      {sharedLists.data && sharedLists.data.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><HandshakeIcon className="h-5 w-5" /> Shared with Me</h2>
            <select
              value={sharedSort}
              onChange={(e) => setSharedSort(e.target.value as "updated" | "name" | "created")}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
            >
              <option value="updated">Most recent</option>
              <option value="name">Name A–Z</option>
              <option value="created">Oldest first</option>
            </select>
          </div>
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
            {sortedShared.map((list) => (
              <li key={list.id} className={showArchived ? "opacity-60" : undefined}>
                <Link to={`/lists/${list.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div>
                    <p className="font-medium text-gray-900">{list.name}</p>
                    <p className="text-sm text-gray-500">from {list.owner_name}</p>
                    <p className="text-xs text-gray-400">
                      {list.claimed_count} of {list.gift_count} claimed
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sharedLists.data && sharedLists.data.length === 0 && !showArchived && (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><HandshakeIcon className="h-5 w-5" /> Shared with Me</h2>
          <p className="mt-3 text-gray-500">
            No one has shared a list with you yet.{" "}
            <Link to="/connections" className="text-blue-600 hover:underline">Add a connection</Link> to get started.
          </p>
        </section>
      )}
    </div>
  );
}
