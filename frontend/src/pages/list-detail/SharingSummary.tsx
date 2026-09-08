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

  const text = isLoading
    ? "Loading sharing…"
    : names.length > 0
      ? `Shared with ${names.join(", ")}`
      : "Not shared with anyone yet";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
      <p className="text-sm text-gray-600">
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
