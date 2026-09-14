/**
 * How the My shopping tab groups by giftee, and what it calls each group
 * (NEU-1326 decisions 8, 9). The one place these rules live, so the tab and
 * its tests cannot drift from each other.
 *
 * A giftee is who a list is *for*, derived by the server from the list and
 * handed here as an opaque key. The client never builds a key and never reads
 * inside one: it groups on the key it was given and sends the same key back on
 * a write.
 */

import type { Giftee, ShoppingItem } from "../types";

/** One card on the tab: a giftee and the viewer's rows for them. `giftee` is
 *  null only for the group a stray item falls into (see {@link groupByGiftee}). */
export interface GifteeGroup {
  key: string;
  giftee: Giftee | null;
  items: ShoppingItem[];
}

/**
 * One group per entry of `giftees`, in array order — the server has already
 * sorted them and the tab renders that order — each holding the items whose
 * `giftee_key` matches. A giftee with no items is still a group: that is what
 * lets it be budgeted before anything is claimed for them.
 *
 * An item whose key matches no giftee cannot happen (the server guarantees a
 * group for every list behind the viewer's claims), but it is tolerated by
 * appending a group with the item's key and no giftee rather than dropping the
 * row. A section that claims to hold everything must never quietly lose a
 * claim.
 */
export function groupByGiftee(giftees: Giftee[], items: ShoppingItem[]): GifteeGroup[] {
  const groups = new Map<string, GifteeGroup>();
  for (const giftee of giftees) {
    groups.set(giftee.key, { key: giftee.key, giftee, items: [] });
  }
  for (const item of items) {
    let group = groups.get(item.giftee_key);
    if (!group) {
      group = { key: item.giftee_key, giftee: null, items: [] };
      groups.set(item.giftee_key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}

/**
 * The heading a giftee's card wears: the name alone, unless another giftee in
 * `all` has the same name (case-insensitive), in which case the keeper is
 * added in the words `attribution.ts` already uses — "Gran · Tom's account"
 * for an account person, "Beth · kept by Tom" for someone with no account.
 *
 * Two `owner` giftees with the same name stay identical: there is nothing
 * truthful to add, and it is the case the app already lives with on every
 * shared row.
 */
export function gifteeLabel(giftee: Giftee, all: Giftee[]): string {
  const name = giftee.name.toLocaleLowerCase();
  const collides = all.some(
    (other) => other.key !== giftee.key && other.name.toLocaleLowerCase() === name,
  );
  if (!collides || giftee.keeper === null) return giftee.name;
  return giftee.kind === "person"
    ? `${giftee.name} · ${giftee.keeper}'s account`
    : `${giftee.name} · kept by ${giftee.keeper}`;
}

/**
 * The tally clause that says where a derived overall came from:
 * "budget is the sum of 3 people's budgets" (decision 11). Singular for one.
 */
export function allocationSentence(count: number): string {
  return count === 1
    ? "budget is the sum of 1 person's budget"
    : `budget is the sum of ${count} people's budgets`;
}
