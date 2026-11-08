/**
 * How **Shared with me** subdivides when the viewer asks it to (project spec
 * §9.1).
 *
 * Grouping is opt-in and off by default: ADR 0001 made the section one flat
 * place for every list shared with the viewer, and ADR 0005 reintroduces the
 * hierarchy only as something the viewer switches on. Source is still a label
 * on the row and never a filter-by-default (`CONTEXT.md` rule 3); a heading
 * leads somewhere only when that page carries what the grouping does not
 * (ADR 0007).
 *
 * Every grouping is a projection of data the page already holds — `shared_via`
 * on the payload, and the folder memberships the filter's select already reads.
 * There is no grouped endpoint and no new query param.
 */

import type { GiftList } from "../types";

/** The control's four positions. "none" is the default and never reaches
 *  {@link groupLists} — see {@link Grouping}. */
export type GroupBy = "none" | "occasion" | "person" | "folder";

/** The three that actually subdivide anything. Narrowing "none" out here is what
 *  stops the flat case from needing a heading it does not have. */
export type Grouping = Exclude<GroupBy, "none">;

/** One folder and the lists it holds, as `GET /folders/{id}` already answers it. */
export interface FolderMembership {
  id: number;
  name: string;
  listIds: Set<number>;
}

/**
 * One bucket of the subdivided section.
 *
 * `href` is the page the heading names, and a heading has one when that page
 * carries something the grouping does not (ADR 0007): `/occasions/:id` has the
 * viewer's budget and My shopping tab, `/folders/:id` has membership
 * management. `/people/:id` is the same lists filtered the same way, so a
 * person heading — and every leftover bucket — stays `null`.
 */
export interface ListGroup {
  key: string;
  /** A plain prefix ahead of the heading, never linked. Only an occasion has
   *  one: the family, without which the occasion name does not identify one
   *  occasion. */
  qualifier: string | null;
  /** The heading's name — and what `href` points, when there is one. */
  heading: string;
  href: string | null;
  lists: GiftList[];
}

/** A bucket's whole heading as the viewer reads it, qualifier included. Bucket
 *  order keys off this rather than off `heading` alone: two families' "Christmas
 *  2026" headings would otherwise compare equal and fall back to insertion
 *  order. */
const headingText = (group: ListGroup) =>
  group.qualifier ? `${group.qualifier} · ${group.heading}` : group.heading;

/**
 * What the leftover bucket is called, per grouping.
 *
 * **It is not optional.** Every grouping keys on something a list may not have —
 * a direct-only share belongs to no occasion, an occasion-only one to no person,
 * and most lists to no folder — so without this bucket those lists would
 * silently vanish from a section that claims to hold everything shared with the
 * viewer. A list that *does* carry a route of the current kind is never here,
 * however else it also arrived.
 */
const UNGROUPED_HEADING: Record<Grouping, string> = {
  occasion: "Not in an occasion",
  person: "Not shared directly by a person",
  folder: "Not in a folder",
};

const UNGROUPED_KEY = "ungrouped";

/**
 * Subdivide `lists` into buckets, leftover bucket included.
 *
 * `lists` arrives in the order the page's sort control put it, and that order
 * survives inside each bucket: grouping subdivides an order, it does not impose
 * one. The buckets themselves are alphabetical by their full heading text,
 * qualifier included, with the leftover one always last — a stable order that
 * does not shuffle as lists are added.
 *
 * A bucket holding none of these lists is not rendered, which is what keeps a
 * folder the viewer has but has filed nothing under out of the way.
 */
export function groupLists(
  lists: GiftList[],
  grouping: Grouping,
  folders: FolderMembership[],
): ListGroup[] {
  const groups = new Map<string, ListGroup>();
  const ungrouped: GiftList[] = [];

  const into = (
    key: string,
    qualifier: string | null,
    heading: string,
    href: string | null,
    list: GiftList,
  ) => {
    const group = groups.get(key) ?? { key, qualifier, heading, href, lists: [] };
    group.lists.push(list);
    groups.set(key, group);
  };

  for (const list of lists) {
    // A folder membership is one-to-many — a list filed under both Christmas and
    // Birthdays belongs under each.
    if (grouping === "folder") {
      const holders = folders.filter((folder) => folder.listIds.has(list.id));
      if (holders.length === 0) ungrouped.push(list);
      for (const folder of holders) {
        into(`folder:${folder.id}`, null, folder.name, `/folders/${folder.id}`, list);
      }
      continue;
    }

    // A source is one-to-many too, since NEU-1290 widened `shared_via` to every
    // route a list arrived by: a list shared to two families' occasions belongs
    // under each of their headings, exactly as a list filed in two folders does.
    // Which route *labels* the row is a separate question, and not one asked
    // here — `lib/attribution.ts` owns it (NEU-1291).
    let matched = false;
    for (const route of list.shared_via) {
      if (grouping === "occasion" && route.kind === "occasion") {
        // The family qualifies the heading rather than decorating it — two
        // families routinely both call an occasion "Christmas 2026" — but it is
        // not part of the link: it names a family, and the link goes to an
        // occasion (ADR 0007). An archived occasion links like any other, and
        // unmarked: a route survives archiving (ADR 0002 §5.4) and `ShareRoute`
        // carries no archived flag, so the client cannot tell one apart.
        into(
          `occasion:${route.occasion.id}`,
          route.family.name,
          route.occasion.name,
          `/occasions/${route.occasion.id}`,
          list,
        );
        matched = true;
      } else if (grouping === "person" && route.kind === "direct") {
        // `/people/:id` shows the same lists this bucket just showed, so the
        // heading names a page worth no trip and stays dead (ADR 0007).
        into(`person:${route.person.id}`, null, route.person.name, null, list);
        matched = true;
      }
    }
    // No route of this kind — a direct-only list under Group by: Occasion, or an
    // occasion-only one under Group by: Person — so the leftover bucket catches
    // it, exactly as before.
    if (!matched) ungrouped.push(list);
  }

  const named = [...groups.values()].sort((a, b) => headingText(a).localeCompare(headingText(b)));
  if (ungrouped.length === 0) return named;
  return [
    ...named,
    {
      key: UNGROUPED_KEY,
      qualifier: null,
      heading: UNGROUPED_HEADING[grouping],
      href: null,
      lists: ungrouped,
    },
  ];
}
