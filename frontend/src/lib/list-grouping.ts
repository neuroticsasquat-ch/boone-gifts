/**
 * How **Shared with me** subdivides when the viewer asks it to (project spec
 * §9.1).
 *
 * Grouping is opt-in and off by default: ADR 0001 made the section one flat
 * place for every list shared with the viewer, and ADR 0005 reintroduces the
 * hierarchy only as something the viewer switches on. Source is still a label
 * on the row, never a destination and never a filter-by-default
 * (`CONTEXT.md` rule 3).
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

/** One bucket of the subdivided section. `href` is the page the heading names —
 *  only a folder has one, and only because nothing else in the UI links to
 *  `/folders/:id`. */
export interface ListGroup {
  key: string;
  heading: string;
  href: string | null;
  lists: GiftList[];
}

/**
 * What the leftover bucket is called, per grouping.
 *
 * **It is not optional.** Every grouping keys on something a list may not have —
 * a direct share belongs to no occasion, a family share to no person, and most
 * lists to no folder — so without this bucket those lists would silently vanish
 * from a section that claims to hold everything shared with the viewer.
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
 * one. The buckets themselves are alphabetical by heading, with the leftover one
 * always last — a stable order that does not shuffle as lists are added.
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

  const into = (key: string, heading: string, href: string | null, list: GiftList) => {
    const group = groups.get(key) ?? { key, heading, href, lists: [] };
    group.lists.push(list);
    groups.set(key, group);
  };

  for (const list of lists) {
    // A folder membership is one-to-many — a list filed under both Christmas and
    // Birthdays belongs under each — where a source is one-to-one.
    if (grouping === "folder") {
      const holders = folders.filter((folder) => folder.listIds.has(list.id));
      if (holders.length === 0) ungrouped.push(list);
      for (const folder of holders) {
        into(`folder:${folder.id}`, folder.name, `/folders/${folder.id}`, list);
      }
      continue;
    }

    const via = list.shared_via;
    if (grouping === "occasion" && via?.kind === "occasion") {
      // The family is part of the heading, not decoration: two families
      // routinely both call an occasion "Christmas 2026".
      into(`occasion:${via.id}`, `${via.family.name} · ${via.name}`, null, list);
    } else if (grouping === "person" && via?.kind === "user") {
      into(`person:${via.id}`, via.name, null, list);
    } else {
      ungrouped.push(list);
    }
  }

  const named = [...groups.values()].sort((a, b) => a.heading.localeCompare(b.heading));
  if (ungrouped.length === 0) return named;
  return [
    ...named,
    { key: UNGROUPED_KEY, heading: UNGROUPED_HEADING[grouping], href: null, lists: ungrouped },
  ];
}
