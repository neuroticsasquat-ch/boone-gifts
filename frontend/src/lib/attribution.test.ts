import { describe, it, expect } from "vitest";
import {
  attributionFor,
  isKeptForAbsentPerson,
  recipientLabel,
  type ListLike,
} from "./attribution";

function list(overrides: Partial<ListLike> = {}): ListLike {
  return {
    owner_name: "Tom",
    recipient_name: null,
    recipient_has_account: null,
    ...overrides,
  };
}

describe("attributionFor", () => {
  it("attributes a list with no recipient to its owner", () => {
    expect(attributionFor(list())).toEqual({
      kind: "owner",
      subject: "Tom",
      keeper: null,
    });
  });

  it("attributes a recipient who has an account to the recipient alone", () => {
    // A shared login: Jane is the person a viewer would talk to, so naming the
    // account as well would be noise.
    const attribution = attributionFor(
      list({ recipient_name: "Jane", recipient_has_account: true }),
    );
    expect(attribution).toEqual({ kind: "shared", subject: "Jane", keeper: null });
  });

  it("names both the absent recipient and the keeper", () => {
    expect(
      attributionFor(list({ recipient_name: "Beth", recipient_has_account: false })),
    ).toEqual({ kind: "absent", subject: "Beth", keeper: "Tom" });
  });

  it("falls back to the owner when the fields are absent entirely", () => {
    // A response cached from before these columns existed.
    const attribution = attributionFor({ owner_name: "Tom" });
    expect(attribution).toEqual({ kind: "owner", subject: "Tom", keeper: null });
  });

  it("treats a recipient named but not yet answered for as having an account", () => {
    // The safe branch: never claims someone is absent without being told so.
    expect(attributionFor(list({ recipient_name: "Jane" })).kind).toBe("shared");
  });
});

describe("recipientLabel", () => {
  it("labels the owner's own row with the recipient", () => {
    expect(recipientLabel(list({ recipient_name: "Beth", recipient_has_account: false })))
      .toBe("for Beth");
    expect(recipientLabel(list({ recipient_name: "Jane", recipient_has_account: true })))
      .toBe("for Jane");
  });

  it("is null on a list with no recipient", () => {
    expect(recipientLabel(list())).toBeNull();
  });
});

describe("isKeptForAbsentPerson", () => {
  it("is false with no recipient", () => {
    expect(isKeptForAbsentPerson(list())).toBe(false);
  });

  it("is false when the recipient has an account", () => {
    expect(
      isKeptForAbsentPerson(list({ recipient_name: "Jane", recipient_has_account: true })),
    ).toBe(false);
  });

  it("is true only for a named recipient without an account", () => {
    expect(
      isKeptForAbsentPerson(list({ recipient_name: "Beth", recipient_has_account: false })),
    ).toBe(true);
  });
});
