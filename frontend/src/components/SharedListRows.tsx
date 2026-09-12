import { Link } from "react-router";
import type { GiftList } from "../types";
import { ListAttributionLine } from "./ListAttribution";

/** `• N to buy` — how many of the viewer's own claims on this list they have
 *  yet to buy. Nothing at zero, and nothing when the field is absent: most
 *  shared lists are ones the viewer has never claimed from, and a "0 to buy" on
 *  every one of them would be noise.
 *
 *  Not decorative. A claim on a directly-shared list belongs to no occasion and,
 *  unless the viewer files that list in a folder, to no folder either — so it
 *  appears on no shopping tab at all, and this badge is its only route back
 *  (project spec §9.4). */
function ToBuyBadge({ count }: { count: number | undefined }) {
  // Zero and absent both render nothing, for different reasons. Zero is the
  // common case and a "0 to buy" on every unclaimed list is noise. Absent is
  // the contract saying this row has no such count — an owned row, or a scope
  // that carries none — and there is simply no number to draw. The backend
  // makes the field required on viewer rows so that "absent" can never quietly
  // stand for "nothing left to buy" there; the equivalent loud failure is not
  // available to a row renderer, since throwing would cost the viewer the whole
  // Lists page rather than one badge.
  if (!count) return null;
  return <span className="shrink-0 text-sm font-medium text-blue-600">{`• ${count} to buy`}</span>;
}

/** The rows of one shared section — the whole section when it is flat, one
 *  bucket of it when the viewer has grouped it. Every shared row the app draws
 *  comes through here, which is what puts the badge under every grouping,
 *  "Not in a …" buckets included, and keeps it off the owned rows: those are
 *  rendered separately and never reach this component.
 *
 *  Two call sites, deliberately one component: `/lists` and a person's page now
 *  draw the same rows from the same shared scope, and a page that hand-rolled
 *  its own markup is the exact shape of the defect NEU-1286 was opened on
 *  (NEU-1316 decision 3). `ListAttribution.consistency.test.tsx` is what keeps
 *  them from drifting apart again. */
export function SharedRows({ lists }: { lists: GiftList[] }) {
  return (
    <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
      {lists.map((list) => (
        <li key={list.id}>
          <Link to={`/lists/${list.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50">
            {/* `min-w-0` against the badge's `shrink-0`: on a narrow viewport the
                attribution line wraps within what is left rather than squeezing
                the badge, so the two never crowd each other. */}
            <div className="min-w-0">
              <p className="font-medium text-gray-900">{list.name}</p>
              <ListAttributionLine list={list} />
              <p className="text-xs text-gray-400">
                {list.claimed_count} of {list.gift_count} claimed
              </p>
            </div>
            <ToBuyBadge count={list.my_unpurchased_claim_count} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
