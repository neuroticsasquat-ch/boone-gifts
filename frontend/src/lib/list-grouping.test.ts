import { describe, it, expect } from "vitest";
import { groupLists, type FolderMembership, type ListGroup } from "./list-grouping";
import type { GiftList, ShareRoute } from "../types";

function list(overrides: Partial<GiftList> & { id: number; name: string }): GiftList {
  return {
    description: null,
    owner_id: 2,
    owner_name: "Jane Boone",
    recipient_name: null,
    account_person_id: null,
    account_person_name: null,
    is_archived: false,
    gift_count: 0,
    claimed_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    shared_via: [],
    ...overrides,
  };
}

function viaOccasion(id: number, name: string, family: { id: number; name: string }): ShareRoute {
  return { kind: "occasion", occasion: { id, name }, family };
}

function viaDirect(id: number, name: string): ShareRoute {
  return { kind: "direct", person: { id, name } };
}

function folder(id: number, name: string, listIds: number[]): FolderMembership {
  return { id, name, listIds: new Set(listIds) };
}

/** Every bucket's heading in its two parts, in bucket order. Asserted as parts
 *  rather than as one joined string: a test-side join would re-implement the
 *  production one and then agree with it whatever it did. */
function headings(groups: ListGroup[]): (string | null)[][] {
  return groups.map((group) => [group.qualifier, group.heading]);
}

const BOONE = { id: 1, name: "Boone Family" };
const EXTENDED = { id: 2, name: "Extended Family" };

describe("groupLists — by occasion", () => {
  it("names a bucket for the family and the occasion together", () => {
    const groups = groupLists(
      [list({ id: 1, name: "Carol's Wishlist", shared_via: [viaOccasion(3, "Christmas 2026", BOONE)] })],
      "occasion",
      [],
    );

    expect(groups).toHaveLength(1);
    // Asserted apart, not as one string: the family is a plain qualifier and the
    // occasion name is the part that links, and nothing may re-join them.
    expect(groups[0].qualifier).toBe("Boone Family");
    expect(groups[0].heading).toBe("Christmas 2026");
    expect(groups[0].lists.map((l) => l.name)).toEqual(["Carol's Wishlist"]);
  });

  // Two families routinely both call an occasion "Christmas 2026", so the name
  // alone does not identify one — merging them would claim a share that isn't there.
  it("keeps two families' same-named occasions apart", () => {
    const groups = groupLists(
      [
        list({ id: 1, name: "Carol's Wishlist", shared_via: [viaOccasion(3, "Christmas 2026", BOONE)] }),
        list({ id: 2, name: "Dave's Wishlist", shared_via: [viaOccasion(4, "Christmas 2026", EXTENDED)] }),
      ],
      "occasion",
      [],
    );

    expect(headings(groups)).toEqual([
      ["Boone Family", "Christmas 2026"],
      ["Extended Family", "Christmas 2026"],
    ]);
  });

  // A list shared to two families' occasions belongs under each heading, the
  // same way a list filed in two folders does. Nothing ranks the routes.
  it("shows a list under every occasion it reached the viewer through", () => {
    const groups = groupLists(
      [
        list({
          id: 1,
          name: "Carol's Wishlist",
          shared_via: [
            viaOccasion(3, "Christmas 2026", BOONE),
            viaOccasion(4, "Christmas 2026", EXTENDED),
          ],
        }),
      ],
      "occasion",
      [],
    );

    expect(headings(groups)).toEqual([
      ["Boone Family", "Christmas 2026"],
      ["Extended Family", "Christmas 2026"],
    ]);
    expect(groups.every((g) => g.lists.map((l) => l.name).includes("Carol's Wishlist"))).toBe(true);
  });

  // The list story NEU-1286 was opened on: it arrived both ways, so it groups
  // under its occasion — while the row still reads "from Carol Boone". Being
  // labelled with the person is not a reason to call it occasionless.
  it("groups a list that also arrived directly under its occasion, not the leftover bucket", () => {
    const groups = groupLists(
      [
        list({
          id: 1,
          name: "Carol's Wishlist",
          shared_via: [viaDirect(2, "Carol Boone"), viaOccasion(3, "Christmas 2026", BOONE)],
        }),
      ],
      "occasion",
      [],
    );

    expect(headings(groups)).toEqual([["Boone Family", "Christmas 2026"]]);
    expect(groups.map((g) => g.heading)).not.toContain("Not in an occasion");
  });

  it("collects the lists no occasion brought into the leftover bucket, last", () => {
    const groups = groupLists(
      [
        list({ id: 1, name: "Jane's Wishlist", shared_via: [viaDirect(2, "Jane Boone")] }),
        list({ id: 2, name: "Carol's Wishlist", shared_via: [viaOccasion(3, "Christmas 2026", BOONE)] }),
      ],
      "occasion",
      [],
    );

    expect(headings(groups)).toEqual([
      ["Boone Family", "Christmas 2026"],
      [null, "Not in an occasion"],
    ]);
    expect(groups[1].lists.map((l) => l.name)).toEqual(["Jane's Wishlist"]);
  });

  // Bucket order keys off the whole heading, so a family whose name sorts later
  // keeps its occasions later even when their names sort earlier. Sorting on the
  // bare occasion name would lift Anniversary to the top and reshuffle the order
  // the viewer sees today.
  it("orders buckets by the family and the occasion together", () => {
    const groups = groupLists(
      [
        list({ id: 1, name: "Dave's Wishlist", shared_via: [viaOccasion(4, "Anniversary", EXTENDED)] }),
        list({ id: 2, name: "Carol's Wishlist", shared_via: [viaOccasion(3, "Christmas 2026", BOONE)] }),
      ],
      "occasion",
      [],
    );

    expect(headings(groups)).toEqual([
      ["Boone Family", "Christmas 2026"],
      ["Extended Family", "Anniversary"],
    ]);
  });

  // ADR 0007: the occasion page carries the viewer's budget and My shopping tab,
  // neither of which the grouping shows, so the heading is the way there.
  // Asserted alongside the leftover bucket, whose heading names no occasion and
  // still leads nowhere — a test reading only the leftover bucket would pass
  // whatever the real headings did.
  it("points each occasion heading at that occasion's page, and the leftover bucket nowhere", () => {
    const groups = groupLists(
      [
        list({ id: 1, name: "Carol's Wishlist", shared_via: [viaOccasion(3, "Christmas 2026", BOONE)] }),
        list({ id: 2, name: "Jane's Wishlist", shared_via: [viaDirect(2, "Jane Boone")] }),
      ],
      "occasion",
      [],
    );

    expect(headings(groups)).toEqual([
      ["Boone Family", "Christmas 2026"],
      [null, "Not in an occasion"],
    ]);
    expect(groups[0].href).toBe("/occasions/3");
    expect(groups[1].href).toBeNull();
  });
});

describe("groupLists — by person", () => {
  it("buckets a direct share under the person who shared it", () => {
    const groups = groupLists(
      [
        list({ id: 1, name: "Jane's Wishlist", shared_via: [viaDirect(2, "Jane Boone")] }),
        list({ id: 2, name: "Jane's Other List", shared_via: [viaDirect(2, "Jane Boone")] }),
      ],
      "person",
      [],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].heading).toBe("Jane Boone");
    expect(groups[0].lists.map((l) => l.name)).toEqual(["Jane's Wishlist", "Jane's Other List"]);
  });

  it("buckets a list that also arrived through an occasion under its person", () => {
    const groups = groupLists(
      [
        list({
          id: 1,
          name: "Carol's Wishlist",
          shared_via: [viaDirect(2, "Carol Boone"), viaOccasion(3, "Christmas 2026", BOONE)],
        }),
      ],
      "person",
      [],
    );

    expect(groups.map((g) => g.heading)).toEqual(["Carol Boone"]);
  });

  it("collects the lists that arrived through a family into the leftover bucket", () => {
    const groups = groupLists(
      [
        list({ id: 1, name: "Carol's Wishlist", shared_via: [viaOccasion(3, "Christmas 2026", BOONE)] }),
        list({ id: 2, name: "Jane's Wishlist", shared_via: [viaDirect(2, "Jane Boone")] }),
      ],
      "person",
      [],
    );

    expect(groups.map((g) => g.heading)).toEqual(["Jane Boone", "Not shared directly by a person"]);
    expect(groups[1].lists.map((l) => l.name)).toEqual(["Carol's Wishlist"]);
  });
});

describe("groupLists — by folder", () => {
  it("shows a list under every folder it belongs to", () => {
    const groups = groupLists(
      [list({ id: 1, name: "Jane's Wishlist", shared_via: [viaDirect(2, "Jane Boone")] })],
      "folder",
      [folder(5, "Christmas 2026", [1]), folder(6, "Birthdays", [1])],
    );

    expect(groups.map((g) => g.heading)).toEqual(["Birthdays", "Christmas 2026"]);
    expect(groups.every((g) => g.lists.map((l) => l.name).includes("Jane's Wishlist"))).toBe(true);
  });

  // The folder page is the one destination a grouping heading has: nothing else
  // in the UI links to `/folders/:id`.
  it("points each folder heading at that folder's page", () => {
    const groups = groupLists(
      [list({ id: 1, name: "Jane's Wishlist", shared_via: [viaDirect(2, "Jane Boone")] })],
      "folder",
      [folder(5, "Christmas 2026", [1])],
    );

    expect(groups[0].href).toBe("/folders/5");
    // And the whole heading is the folder's name: only an occasion is qualified.
    expect(groups[0].qualifier).toBeNull();
  });

  // ADR 0007's holdout: `/people/:id` shows the same lists this grouping just
  // showed, filtered the same way, so a person heading leads nowhere — and
  // neither does a leftover bucket.
  it("gives a person heading no destination", () => {
    const groups = groupLists(
      [
        list({ id: 1, name: "Jane's Wishlist", shared_via: [viaDirect(2, "Jane Boone")] }),
        list({ id: 2, name: "Carol's Wishlist", shared_via: [viaOccasion(3, "Christmas 2026", BOONE)] }),
      ],
      "person",
      [],
    );

    expect(groups.map((g) => g.heading)).toEqual(["Jane Boone", "Not shared directly by a person"]);
    expect(groups.every((g) => g.href === null)).toBe(true);
  });

  it("collects the lists in no folder into the leftover bucket", () => {
    const groups = groupLists(
      [
        list({ id: 1, name: "Filed", shared_via: [viaDirect(2, "Jane Boone")] }),
        list({ id: 2, name: "Unfiled", shared_via: [viaDirect(2, "Jane Boone")] }),
      ],
      "folder",
      [folder(5, "Christmas 2026", [1])],
    );

    expect(groups.map((g) => g.heading)).toEqual(["Christmas 2026", "Not in a folder"]);
    expect(groups[1].lists.map((l) => l.name)).toEqual(["Unfiled"]);
  });

  it("leaves out a folder holding none of these lists", () => {
    const groups = groupLists(
      [list({ id: 1, name: "Jane's Wishlist", shared_via: [viaDirect(2, "Jane Boone")] })],
      "folder",
      [folder(5, "Christmas 2026", [1]), folder(6, "Birthdays", [99])],
    );

    expect(groups.map((g) => g.heading)).toEqual(["Christmas 2026"]);
  });
});

describe("groupLists — shape", () => {
  // Order comes from the caller, which has already applied the page's sort
  // control; grouping subdivides that order, it does not re-impose one.
  it("keeps the order it was handed within a bucket", () => {
    const groups = groupLists(
      [
        list({ id: 1, name: "Zoe's Wishlist", shared_via: [viaOccasion(3, "Christmas 2026", BOONE)] }),
        list({ id: 2, name: "Adam's Wishlist", shared_via: [viaOccasion(3, "Christmas 2026", BOONE)] }),
      ],
      "occasion",
      [],
    );

    expect(groups[0].lists.map((l) => l.name)).toEqual(["Zoe's Wishlist", "Adam's Wishlist"]);
  });

  it("renders no bucket at all for no lists", () => {
    expect(groupLists([], "occasion", [])).toEqual([]);
    expect(groupLists([], "folder", [folder(5, "Christmas 2026", [1])])).toEqual([]);
  });

  it("gives every bucket a key of its own", () => {
    const groups = groupLists(
      [
        list({ id: 1, name: "Carol's Wishlist", shared_via: [viaOccasion(3, "Christmas 2026", BOONE)] }),
        list({ id: 2, name: "Dave's Wishlist", shared_via: [viaOccasion(4, "Christmas 2026", EXTENDED)] }),
        list({ id: 3, name: "Jane's Wishlist", shared_via: [viaDirect(2, "Jane Boone")] }),
      ],
      "occasion",
      [],
    );

    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
  });

  // A list carrying no route at all — an owned row, or a response cached from
  // before the field existed — must still land somewhere.
  it("puts a list with no routes in the leftover bucket", () => {
    const groups = groupLists([list({ id: 1, name: "Sourceless" })], "person", []);

    expect(groups.map((g) => g.heading)).toEqual(["Not shared directly by a person"]);
    expect(groups[0].lists.map((l) => l.name)).toEqual(["Sourceless"]);
  });
});
