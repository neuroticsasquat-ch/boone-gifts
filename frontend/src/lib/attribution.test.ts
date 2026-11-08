import { describe, it, expect } from "vitest";
import {
  attributionFor,
  isKeptForAbsentPerson,
  recipientLabel,
  type ListLike,
} from "./attribution";
import type { ShareRoute } from "../types";

const BOONE = { id: 1, name: "Boone Family" };
const EXTENDED = { id: 2, name: "Extended Boones" };

function list(overrides: Partial<ListLike> = {}): ListLike {
  return {
    owner_name: "Tom",
    recipient_name: null,
    ...overrides,
  };
}

function direct(id: number, name: string): ShareRoute {
  return { kind: "direct", person: { id, name } };
}

function occasion(id: number, name: string, family: { id: number; name: string }): ShareRoute {
  return { kind: "occasion", occasion: { id, name }, family };
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
    expect(attributionFor(list({ recipient_name: "   " }))?.kind).toBe("owner");
  });

  it("names the sharing person on a direct share", () => {
    expect(attributionFor(list({ shared_via: [direct(2, "Jane Boone")] }))).toEqual({
      kind: "owner",
      subject: "Jane Boone",
      keeper: null,
    });
  });

  it("names the family behind the occasion a list was shared to", () => {
    // Its own kind, because the family is a source and not a person: the row
    // reads "Boone Family", never "from Boone Family". The occasion is how the
    // share was made; the family is who the viewer recognises.
    expect(
      attributionFor(list({ shared_via: [occasion(3, "Christmas 2026", BOONE)] })),
    ).toEqual({ kind: "family", subject: "Boone Family", keeper: null });
  });

  // Direct wins. The durable grant is the one that names the row: it survives
  // the viewer leaving the family or the occasion share being revoked, and it
  // is what `/lists` read before routes went plural.
  it("names the person when a list arrived both directly and through an occasion", () => {
    expect(
      attributionFor(
        list({
          shared_via: [direct(2, "Carol Boone"), occasion(3, "Christmas 2026", BOONE)],
        }),
      ),
    ).toEqual({ kind: "owner", subject: "Carol Boone", keeper: null });
  });

  // Route order is the backend's, and stable, but it is not a ranking — so the
  // rule must not depend on which route happens to come first.
  it("names the person whichever order the routes arrive in", () => {
    expect(
      attributionFor(
        list({
          shared_via: [occasion(3, "Christmas 2026", BOONE), direct(2, "Carol Boone")],
        }),
      ),
    ).toEqual({ kind: "owner", subject: "Carol Boone", keeper: null });
  });

  // Two families' occasions both reached the viewer, and there is no honest
  // single name to pick, so the row names them both. A comma, not the middle
  // dot: the dot already means "two different facts joined" on this line.
  it("names every distinct family a list reached the viewer through", () => {
    expect(
      attributionFor(
        list({
          shared_via: [
            occasion(3, "Christmas 2026", BOONE),
            occasion(4, "Christmas 2026", EXTENDED),
          ],
        }),
      ),
    ).toEqual({ kind: "family", subject: "Boone Family, Extended Boones", keeper: null });
  });

  it("names one family once, however many of its occasions carried the list", () => {
    expect(
      attributionFor(
        list({
          shared_via: [
            occasion(3, "Christmas 2026", BOONE),
            occasion(4, "Beth's Birthday", BOONE),
          ],
        }),
      ),
    ).toEqual({ kind: "family", subject: "Boone Family", keeper: null });
  });

  it("prefers the absent-person form over the source label", () => {
    // Who the list is *for* outranks how it reached the viewer: an occasion
    // share of a list kept for Beth still reads "for Beth · kept by Tom".
    expect(
      attributionFor(
        list({
          recipient_name: "Beth",
          shared_via: [occasion(3, "Christmas 2026", BOONE)],
        }),
      ),
    ).toEqual({ kind: "absent", subject: "Beth", keeper: "Tom" });
  });

  it("prefers the absent-person form however many ways the list arrived", () => {
    // The recipient outranks every route, not merely the one that would have
    // labelled the row.
    expect(
      attributionFor(
        list({
          recipient_name: "Beth",
          shared_via: [direct(2, "Carol Boone"), occasion(3, "Christmas 2026", BOONE)],
        }),
      ),
    ).toEqual({ kind: "absent", subject: "Beth", keeper: "Tom" });
  });

  it("falls back to the owner when the list carries no routes", () => {
    // An owned list: the API sends an empty array rather than omitting it.
    expect(attributionFor(list({ shared_via: [] }))).toEqual({
      kind: "owner",
      subject: "Tom",
      keeper: null,
    });
  });

  // A blank owner name would render the literal "from " with nothing after it,
  // and NEU-1324 makes the owner branch far more reachable than it was.
  it("says nothing rather than a dangling preposition when the owner has no name", () => {
    expect(attributionFor(list({ owner_name: "   " }))).toBeNull();
  });

  it("drops the keeper half rather than trailing it when the owner has no name", () => {
    // Branch 1's other read of `owner_name`: "for Beth" is still true and still
    // the point of the line, so the row keeps it and loses only the half it
    // cannot fill.
    expect(attributionFor(list({ recipient_name: "Beth", owner_name: "  " }))).toEqual({
      kind: "absent",
      subject: "Beth",
      keeper: null,
    });
  });
});

/**
 * The surface tells the function what it has already established, and one step
 * of the precedence list steps aside. Everything else about the ranking is the
 * block above, unchanged — which is the point: one list, read one way.
 */
describe("attributionFor — withinFamily", () => {
  const occasionOnly = list({ shared_via: [occasion(3, "Christmas 2026", BOONE)] });

  // The default is the regression guard on every existing caller: none of them
  // passes the option, and none of them may move.
  it("names the family when the option is omitted", () => {
    expect(attributionFor(occasionOnly)).toEqual({
      kind: "family",
      subject: "Boone Family",
      keeper: null,
    });
    expect(attributionFor(occasionOnly, {})).toEqual(attributionFor(occasionOnly));
    expect(attributionFor(occasionOnly, { withinFamily: false })).toEqual(
      attributionFor(occasionOnly),
    );
  });

  // The whole rule, in one case: on a page already headed "Boone Family", the
  // family identifies nobody and the owner is what was missing.
  it("names the owner on a list that reached the surface through this family alone", () => {
    expect(attributionFor(occasionOnly, { withinFamily: true })).toEqual({
      kind: "owner",
      subject: "Tom",
      keeper: null,
    });
  });

  it("still names the family's own owner when several families carried the list", () => {
    // Two families is still "the family branch stepped aside" — the option is
    // about the surface, not about how many routes happen to exist.
    expect(
      attributionFor(
        list({
          shared_via: [
            occasion(3, "Christmas 2026", BOONE),
            occasion(4, "Christmas 2026", EXTENDED),
          ],
        }),
        { withinFamily: true },
      ),
    ).toEqual({ kind: "owner", subject: "Tom", keeper: null });
  });

  // The option skips exactly one branch. It does not outrank the two above it.
  it("does not outrank a direct share", () => {
    expect(
      attributionFor(
        list({
          shared_via: [direct(2, "Carol Boone"), occasion(3, "Christmas 2026", BOONE)],
        }),
        { withinFamily: true },
      ),
    ).toEqual({ kind: "owner", subject: "Carol Boone", keeper: null });
  });

  it("does not outrank a recipient", () => {
    expect(
      attributionFor(
        list({
          recipient_name: "Beth",
          shared_via: [occasion(3, "Christmas 2026", BOONE)],
        }),
        { withinFamily: true },
      ),
    ).toEqual({ kind: "absent", subject: "Beth", keeper: "Tom" });
  });

  // The family is the only true thing left, so the row falls back to it rather
  // than to nothing — the one place `withinFamily` un-skips the branch it skipped.
  it("falls back to the family it stepped over when the owner has no name", () => {
    expect(
      attributionFor(
        list({ owner_name: "", shared_via: [occasion(3, "Christmas 2026", BOONE)] }),
        { withinFamily: true },
      ),
    ).toEqual({ kind: "family", subject: "Boone Family", keeper: null });
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
