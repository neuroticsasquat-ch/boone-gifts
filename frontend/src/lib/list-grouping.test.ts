import { describe, it, expect } from "vitest";
import { groupLists, type FolderMembership } from "./list-grouping";
import type { GiftList, SharedVia } from "../types";

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
    ...overrides,
  };
}

function viaOccasion(id: number, name: string, family: { id: number; name: string }): SharedVia {
  return { kind: "occasion", id, name, family };
}

function viaUser(id: number, name: string): SharedVia {
  return { kind: "user", id, name };
}

function folder(id: number, name: string, listIds: number[]): FolderMembership {
  return { id, name, listIds: new Set(listIds) };
}

const BOONE = { id: 1, name: "Boone Family" };
const EXTENDED = { id: 2, name: "Extended Family" };

describe("groupLists — by occasion", () => {
  it("names a bucket for the family and the occasion together", () => {
    const groups = groupLists(
      [list({ id: 1, name: "Carol's Wishlist", shared_via: viaOccasion(3, "Christmas 2026", BOONE) })],
      "occasion",
      [],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].heading).toBe("Boone Family · Christmas 2026");
    expect(groups[0].lists.map((l) => l.name)).toEqual(["Carol's Wishlist"]);
  });

  // Two families routinely both call an occasion "Christmas 2026", so the name
  // alone does not identify one — merging them would claim a share that isn't there.
  it("keeps two families' same-named occasions apart", () => {
    const groups = groupLists(
      [
        list({ id: 1, name: "Carol's Wishlist", shared_via: viaOccasion(3, "Christmas 2026", BOONE) }),
        list({ id: 2, name: "Dave's Wishlist", shared_via: viaOccasion(4, "Christmas 2026", EXTENDED) }),
      ],
      "occasion",
      [],
    );

    expect(groups.map((g) => g.heading)).toEqual([
      "Boone Family · Christmas 2026",
      "Extended Family · Christmas 2026",
    ]);
  });

  it("collects the lists no occasion brought into the leftover bucket, last", () => {
    const groups = groupLists(
      [
        list({ id: 1, name: "Jane's Wishlist", shared_via: viaUser(2, "Jane Boone") }),
        list({ id: 2, name: "Carol's Wishlist", shared_via: viaOccasion(3, "Christmas 2026", BOONE) }),
      ],
      "occasion",
      [],
    );

    expect(groups.map((g) => g.heading)).toEqual(["Boone Family · Christmas 2026", "Not in an occasion"]);
    expect(groups[1].lists.map((l) => l.name)).toEqual(["Jane's Wishlist"]);
  });
});

describe("groupLists — by person", () => {
  it("buckets a direct share under the person who shared it", () => {
    const groups = groupLists(
      [
        list({ id: 1, name: "Jane's Wishlist", shared_via: viaUser(2, "Jane Boone") }),
        list({ id: 2, name: "Jane's Other List", shared_via: viaUser(2, "Jane Boone") }),
      ],
      "person",
      [],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].heading).toBe("Jane Boone");
    expect(groups[0].lists.map((l) => l.name)).toEqual(["Jane's Wishlist", "Jane's Other List"]);
  });

  it("collects the lists that arrived through a family into the leftover bucket", () => {
    const groups = groupLists(
      [
        list({ id: 1, name: "Carol's Wishlist", shared_via: viaOccasion(3, "Christmas 2026", BOONE) }),
        list({ id: 2, name: "Jane's Wishlist", shared_via: viaUser(2, "Jane Boone") }),
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
      [list({ id: 1, name: "Jane's Wishlist", shared_via: viaUser(2, "Jane Boone") })],
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
      [list({ id: 1, name: "Jane's Wishlist", shared_via: viaUser(2, "Jane Boone") })],
      "folder",
      [folder(5, "Christmas 2026", [1])],
    );

    expect(groups[0].href).toBe("/folders/5");
  });

  it("gives a heading no destination when it names no folder", () => {
    const groups = groupLists(
      [list({ id: 1, name: "Jane's Wishlist", shared_via: viaUser(2, "Jane Boone") })],
      "occasion",
      [],
    );

    expect(groups[0].href).toBeNull();
  });

  it("collects the lists in no folder into the leftover bucket", () => {
    const groups = groupLists(
      [
        list({ id: 1, name: "Filed", shared_via: viaUser(2, "Jane Boone") }),
        list({ id: 2, name: "Unfiled", shared_via: viaUser(2, "Jane Boone") }),
      ],
      "folder",
      [folder(5, "Christmas 2026", [1])],
    );

    expect(groups.map((g) => g.heading)).toEqual(["Christmas 2026", "Not in a folder"]);
    expect(groups[1].lists.map((l) => l.name)).toEqual(["Unfiled"]);
  });

  it("leaves out a folder holding none of these lists", () => {
    const groups = groupLists(
      [list({ id: 1, name: "Jane's Wishlist", shared_via: viaUser(2, "Jane Boone") })],
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
        list({ id: 1, name: "Zoe's Wishlist", shared_via: viaOccasion(3, "Christmas 2026", BOONE) }),
        list({ id: 2, name: "Adam's Wishlist", shared_via: viaOccasion(3, "Christmas 2026", BOONE) }),
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
        list({ id: 1, name: "Carol's Wishlist", shared_via: viaOccasion(3, "Christmas 2026", BOONE) }),
        list({ id: 2, name: "Dave's Wishlist", shared_via: viaOccasion(4, "Christmas 2026", EXTENDED) }),
        list({ id: 3, name: "Jane's Wishlist", shared_via: viaUser(2, "Jane Boone") }),
      ],
      "occasion",
      [],
    );

    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
  });

  // A list carrying no source at all — an owned row, or a response cached from
  // before the column existed — must still land somewhere.
  it("puts a list with no source in the leftover bucket", () => {
    const groups = groupLists([list({ id: 1, name: "Sourceless" })], "person", []);

    expect(groups.map((g) => g.heading)).toEqual(["Not shared directly by a person"]);
    expect(groups[0].lists.map((l) => l.name)).toEqual(["Sourceless"]);
  });
});
