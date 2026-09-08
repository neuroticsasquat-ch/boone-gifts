import { useQuery } from "@tanstack/react-query";
import { getShares } from "../../api/shares";
import { getConnections } from "../../api/connections";
import { getListFamilies } from "../../api/lists";

/**
 * The one line on list detail that says who can see this list — people and
 * families together, in that order, replacing the "Shared with" and "Families"
 * tabs as the place an owner reads their sharing state.
 *
 * Owner-only, and always editable: it names who the list actually reaches and
 * carries the Change control that opens the sharing panel.
 */
export function SharingSummary({
  listId,
  onChange,
}: {
  listId: number;
  onChange: () => void;
}) {
  const shares = useQuery({ queryKey: ["shares", listId], queryFn: () => getShares(listId) });
  const connections = useQuery({ queryKey: ["connections"], queryFn: getConnections });
  const families = useQuery({
    queryKey: ["list-families", listId],
    queryFn: () => getListFamilies(listId),
  });

  const isLoading = shares.isLoading || connections.isLoading || families.isLoading;
  const namesByUserId = new Map((connections.data ?? []).map((c) => [c.user.id, c.user.name]));
  // People first, then families — "Shared with Jane, Boone Family".
  const names = [
    ...(shares.data ?? []).map((s) => namesByUserId.get(s.user_id) ?? `User ${s.user_id}`),
    ...(families.data ?? []).filter((f) => f.shared).map((f) => f.name),
  ];

  // A failed fetch also leaves `names` empty, and "nobody can see this" is far
  // too load-bearing a sentence to say on the strength of a request that never
  // answered. Connections are exempt: their names decorate a share, and a share
  // we know about still counts without one.
  const failed = shares.isError || families.isError;

  // A list that reaches nobody is the case the auto-grant retired in NEU-1261
  // used to make impossible, so the line states it outright rather than in passing
  // (project spec §8). Owner-only, like the rest of this component, and it says
  // nothing about claims.
  const unshared = !isLoading && !failed && names.length === 0;

  const text = isLoading
    ? "Loading sharing…"
    : failed
      ? "Couldn't load who this list is shared with."
      : unshared
        ? "This list isn't shared with anyone."
        : `Shared with ${names.join(", ")}`;

  return (
    <div
      className={`mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 ${
        unshared ? "rounded-md bg-gray-50 px-3 py-2 ring-1 ring-gray-200" : ""
      }`}
    >
      <p className={`text-sm ${unshared ? "font-medium text-gray-900" : "text-gray-600"}`}>
        <span aria-hidden="true">👥 </span>
        {text}
      </p>
      <button
        onClick={onChange}
        className="text-sm font-medium text-blue-600 hover:underline"
      >
        Change
      </button>
    </div>
  );
}
