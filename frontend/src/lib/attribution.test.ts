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

  it("names both the recipient and the keeper", () => {
    // A recipient now means one thing only: a person with no account (§5.4), so
    // a name is all it takes to reach the "kept by" form.
    expect(attributionFor(list({ recipient_name: "Beth" }))).toEqual({
      kind: "absent",
      subject: "Beth",
      keeper: "Tom",
    });
  });

  it("falls back to the owner when the recipient field is absent entirely", () => {
    // A response cached from before this column existed.
    expect(attributionFor({ owner_name: "Tom" })).toEqual({
      kind: "owner",
      subject: "Tom",
      keeper: null,
    });
  });

  it("treats a blank recipient name as no recipient", () => {
    expect(attributionFor(list({ recipient_name: "   " })).kind).toBe("owner");
  });

  it("names the sharing person on a direct share", () => {
    expect(
      attributionFor(list({ shared_via: { kind: "user", id: 2, name: "Jane Boone" } })),
    ).toEqual({ kind: "owner", subject: "Jane Boone", keeper: null });
  });

  it("names the family on a family share", () => {
    // Its own kind, because the family is a source and not a person: the row
    // reads "Boone Family", never "from Boone Family".
    expect(
      attributionFor(list({ shared_via: { kind: "family", id: 1, name: "Boone Family" } })),
    ).toEqual({ kind: "family", subject: "Boone Family", keeper: null });
  });

  it("prefers the absent-person form over the source label", () => {
    // Who the list is *for* outranks how it reached the viewer: a family share
    // of a list kept for Beth still reads "for Beth · kept by Tom".
    expect(
      attributionFor(
        list({
          recipient_name: "Beth",
          shared_via: { kind: "family", id: 1, name: "Boone Family" },
        }),
      ),
    ).toEqual({ kind: "absent", subject: "Beth", keeper: "Tom" });
  });

  it("falls back to the owner when the list carries no source", () => {
    // An owned list, or a response cached from before `shared_via` existed.
    expect(attributionFor(list({ shared_via: null }))).toEqual({
      kind: "owner",
      subject: "Tom",
      keeper: null,
    });
  });
});

describe("recipientLabel", () => {
  it("labels the owner's own row with the recipient", () => {
    expect(recipientLabel(list({ recipient_name: "Beth" }))).toBe("for Beth");
  });

  it("is null on a list with no recipient", () => {
    expect(recipientLabel(list())).toBeNull();
  });

  it("labels a list marked for one of the account's own people", () => {
    expect(recipientLabel(list({ account_person_name: "Gran" }))).toBe("for Gran");
  });

  it("is null on a household list of a shared account", () => {
    expect(recipientLabel(list({ account_person_name: null }))).toBeNull();
  });

  it("says nothing to a viewer about an account person — the account is one identity", () => {
    expect(attributionFor(list({ account_person_name: "Gran", owner_name: "Gran & Grandpa" })))
      .toEqual({ kind: "owner", subject: "Gran & Grandpa", keeper: null });
  });
});

describe("isKeptForAbsentPerson", () => {
  it("is false with no recipient", () => {
    expect(isKeptForAbsentPerson(list())).toBe(false);
  });

  it("is true for any named recipient", () => {
    expect(isKeptForAbsentPerson(list({ recipient_name: "Beth" }))).toBe(true);
  });

  it("is false for a blank recipient name", () => {
    expect(isKeptForAbsentPerson(list({ recipient_name: "   " }))).toBe(false);
  });
});
