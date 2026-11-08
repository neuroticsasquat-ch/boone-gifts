import { describe, it, expect } from "vitest";
import { occasionChoice } from "./occasion-choice";

const christmas = { id: 1, name: "Christmas 2026" };
const birthdays = { id: 2, name: "Birthdays" };

describe("occasionChoice", () => {
  it("has no choice to offer a family with no occasions", () => {
    expect(occasionChoice([])).toEqual({ kind: "none" });
  });

  it("names the single occasion rather than offering it", () => {
    // The common case, and the reason sharing stays one click.
    expect(occasionChoice([christmas])).toEqual({ kind: "one", occasion: christmas });
  });

  it("offers every occasion when there is more than one", () => {
    expect(occasionChoice([christmas, birthdays])).toEqual({
      kind: "many",
      occasions: [christmas, birthdays],
    });
  });

  it("does not count an archived occasion as a choice", () => {
    // Archiving blocks new shares and only that, so an archived occasion still
    // arrives — to be named on a share made before it, never to be picked.
    expect(occasionChoice([{ ...christmas, is_archived: true }])).toEqual({ kind: "none" });
    expect(
      occasionChoice([{ ...christmas, is_archived: true }, { ...birthdays, is_archived: false }]),
    ).toEqual({ kind: "one", occasion: { ...birthdays, is_archived: false } });
  });
});
