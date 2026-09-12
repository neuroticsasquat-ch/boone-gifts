import { describe, it, expect } from "vitest";
import { sharedWithSentence, joinNames, listsSharedHereSentence } from "./sharing-summary";

describe("sharedWithSentence", () => {
  it("says a list reaches nobody outright", () => {
    // The one sentence both surfaces must agree on: nothing grants a list to a
    // family on the owner's behalf (project spec §8), and New List now starts
    // here (NEU-1307).
    expect(sharedWithSentence(0, 0)).toBe("This list isn't shared with anyone.");
  });

  it.each([
    [1, 0, "Shared with 1 family"],
    [2, 0, "Shared with 2 families"],
    [0, 1, "Shared with 1 person"],
    [0, 3, "Shared with 3 people"],
    [2, 1, "Shared with 2 families and 1 person"],
  ])("counts %i families and %i people as %s", (families, people, expected) => {
    expect(sharedWithSentence(families, people)).toBe(expected);
  });
});

describe("joinNames", () => {
  it.each([
    [[], ""],
    [["The Boones"], "The Boones"],
    [["The Boones", "The Smiths"], "The Boones and The Smiths"],
    [["A", "B", "C"], "A, B and C"],
  ])("joins %j as %s", (names, expected) => {
    expect(joinNames(names)).toBe(expected);
  });
});

describe("listsSharedHereSentence", () => {
  it.each([
    [0, "None of your lists are shared here yet."],
    [1, "1 of your lists is shared here."],
    [3, "3 of your lists are shared here."],
  ])("counts %i of the viewer's own lists as %s", (count, expected) => {
    expect(listsSharedHereSentence(count)).toBe(expected);
  });
});
