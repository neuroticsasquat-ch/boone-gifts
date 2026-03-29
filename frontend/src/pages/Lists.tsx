import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getLists } from "../api/lists";

export function Lists() {
  const ownedLists = useQuery({ queryKey: ["lists", "owned"], queryFn: () => getLists("owned") });
  const sharedLists = useQuery({ queryKey: ["lists", "shared"], queryFn: () => getLists("shared") });

  return (
    <div className="space-y-8">
      {/* My Lists */}
      <section>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">My Lists</h1>
          <Link
            to="/lists/new"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New List
          </Link>
        </div>

        {ownedLists.data && ownedLists.data.length === 0 && (
          <p className="mt-4 text-gray-500">You haven't created any lists yet.</p>
        )}

        {ownedLists.data && ownedLists.data.length > 0 && (
          <ul className="mt-4 divide-y divide-gray-200 rounded-lg bg-white shadow">
            {ownedLists.data.map((list) => (
              <li key={list.id}>
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
          <h2 className="text-lg font-semibold text-gray-900">Shared with Me</h2>
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
            {sharedLists.data.map((list) => (
              <li key={list.id}>
                <Link to={`/lists/${list.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div>
                    <p className="font-medium text-gray-900">{list.name}</p>
                    <p className="text-sm text-gray-500">from {list.owner_name}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
