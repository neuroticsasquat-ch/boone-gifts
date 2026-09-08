import { describe, it, expect } from "vitest";
import {
  LIST_FOR_SOMEONE_ELSE,
  LIST_FOR_UNANSWERED,
  listForIncomplete,
  listForPayload,
  listForValueFrom,
} from "./list-for";

describe("listForPayload", () => {
  it("sends the person and clears the recipient", () => {
    expect(listForPayload({ kind: "person", personId: 4 })).toEqual({
      account_person_id: 4,
      recipient_name: null,
    });
  });

  it("sends the recipient and clears the person", () => {
    expect(
      listForPayload({
        kind: "someone-else",
        recipient: { enabled: true, name: "Beth" },
      }),
    ).toEqual({
      account_person_id: null,
      recipient_name: "Beth",
    });
  });

  it("sends null for everything on a household list", () => {
    expect(listForPayload({ kind: "household" })).toEqual({
      account_person_id: null,
      recipient_name: null,
    });
  });

  it("never sends both names, whichever branch it came from", () => {
    for (const value of [
      { kind: "person", personId: 4 } as const,
      LIST_FOR_SOMEONE_ELSE,
      { kind: "household" } as const,
      LIST_FOR_UNANSWERED,
    ]) {
      const payload = listForPayload(value);
      expect(payload.account_person_id === null || payload.recipient_name === null).toBe(true);
    }
  });
});

describe("listForIncomplete", () => {
  it("blocks an unanswered picker on a shared account", () => {
    expect(listForIncomplete(LIST_FOR_UNANSWERED, true)).toBe(true);
  });

  it("does not block a non-shared account, which has no picker to answer", () => {
    expect(listForIncomplete(LIST_FOR_UNANSWERED, false)).toBe(false);
  });

  it("does not block any answered picker", () => {
    expect(listForIncomplete({ kind: "household" }, true)).toBe(false);
    expect(listForIncomplete({ kind: "person", personId: 4 }, true)).toBe(false);
  });

  it("blocks 'Someone else' until the name is given", () => {
    expect(listForIncomplete(LIST_FOR_SOMEONE_ELSE, true)).toBe(true);
    expect(
      listForIncomplete(
        { kind: "someone-else", recipient: { enabled: true, name: "  " } },
        true,
      ),
    ).toBe(true);
    expect(
      listForIncomplete({ kind: "someone-else", recipient: { enabled: true, name: "Beth" } }, true),
    ).toBe(false);
  });
});

describe("listForValueFrom", () => {
  it("seeds a list marked for an account person", () => {
    expect(
      listForValueFrom({ recipient_name: null, account_person_id: 4 }),
    ).toEqual({ kind: "person", personId: 4 });
  });

  it("seeds a list kept for someone with no account", () => {
    expect(
      listForValueFrom({ recipient_name: "Beth", account_person_id: null }),
    ).toEqual({
      kind: "someone-else",
      recipient: { enabled: true, name: "Beth" },
    });
  });

  it("seeds a list marked for neither as the household answer", () => {
    expect(
      listForValueFrom({ recipient_name: null, account_person_id: null }),
    ).toEqual({ kind: "household" });
  });

  it("tolerates a response predating the account-person columns", () => {
    expect(listForValueFrom({ recipient_name: null })).toEqual({ kind: "household" });
  });
});
