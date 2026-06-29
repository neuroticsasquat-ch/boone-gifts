import { useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getLists } from "../api/lists";
import { useTitle } from "../hooks/useTitle";
import { Spinner } from "../components/Spinner";
import type { GiftList, FamilyRef } from "../types";

export function FamilyLists() {
  useTitle("Family Lists");

  const { data, isPending, isError } = useQuery({
    queryKey: ["lists", "family"],
    queryFn: () => getLists("family"),
  });

  const groups = useMemo(() => {
    const map = new Map<number, { family: FamilyRef; lists: GiftList[] }>();
    for (const list of data ?? []) {
      for (const family of list.families ?? []) {
        if (!map.has(family.id)) {
          map.set(family.id, { family, lists: [] });
        }
        map.get(family.id)!.lists.push(list);
      }
    }
    return Array.from(map.values());
  }, [data]);

  if (isPending) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Family Lists</h1>
      <Spinner />
    </div>
  );

  if (isError) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Family Lists</h1>
      <p className="text-red-600">Failed to load family lists.</p>
    </div>
  );

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Family Lists</h1>
        <p className="text-gray-500">No family lists to show yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Family Lists</h1>
      {groups.map(({ family, lists }) => (
        <section key={family.id} aria-labelledby={`family-${family.id}`}>
          <h2 id={`family-${family.id}`} className="text-lg font-semibold text-gray-900">{family.name}</h2>
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
            {lists.map((list) => (
              <li key={list.id}>
                <Link to={`/lists/${list.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div>
                    <p className="font-medium text-gray-900">{list.name}</p>
                    <p className="text-sm text-gray-500">from {list.owner_name}</p>
                    <p className="text-xs text-gray-400">{list.claimed_count} of {list.gift_count} claimed</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
