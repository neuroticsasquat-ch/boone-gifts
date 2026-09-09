import { useQuery } from "@tanstack/react-query";
import { getShares } from "../../api/shares";
import { getConnections } from "../../api/connections";
import { getShareTargets } from "../../api/lists";

/**
 * The one line on list detail that says who can see this list — the occasions
 * and the people it actually reaches, in that order, replacing the "Shared with"
 * and "Families" tabs as the place an owner reads their sharing state.
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
  const targets = useQuery({
    queryKey: ["share-targets", listId],
    queryFn: () => getShareTargets(listId),
  });

  const isLoading = shares.isLoading || connections.isLoading || targets.isLoading;
  const namesByUserId = new Map((connections.data ?? []).map((c) => [c.user.id, c.user.name]));
  // Occasions first, then people — "Shared with Boone Family · Christmas 2026,
  // Jane", the same order the sharing panel reads in (project spec §5.2). A
  // share points at an occasion, so naming the family alone would say more than
  // the list actually reaches (project spec §8).
  const names = [
    ...(targets.data ?? []).flatMap((family) =>
      family.occasions.filter((o) => o.shared).map((o) => `${family.name} · ${o.name}`),
    ),
    ...(shares.data ?? []).map((s) => namesByUserId.get(s.user_id) ?? `User ${s.user_id}`),
  ];

  // A failed fetch also leaves `names` empty, and "nobody can see this" is far
  // too load-bearing a sentence to say on the strength of a request that never
  // answered. Connections are exempt: their names decorate a share, and a share
  // we know about still counts without one.
  const failed = shares.isError || targets.isError;

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
