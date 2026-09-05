import { describe, it, expect } from "vitest";
import {
  NO_RECIPIENT,
  recipientIncomplete,
  recipientPayload,
  recipientValueFrom,
} from "./recipient";

describe("recipientPayload", () => {
  it("sends null for both fields when the disclosure is closed", () => {
    expect(recipientPayload(NO_RECIPIENT)).toEqual({
      recipient_name: null,
      recipient_has_account: null,
    });
  });

  it("sends both fields together when answered", () => {
    expect(
      recipientPayload({ enabled: true, name: "Beth", hasAccount: false }),
    ).toEqual({ recipient_name: "Beth", recipient_has_account: false });
  });

  it("trims the name", () => {
    expect(
      recipientPayload({ enabled: true, name: "  Beth  ", hasAccount: true })
        .recipient_name,
    ).toBe("Beth");
  });

  it("sends null for both when the name is blank — a flag with no name is meaningless", () => {
    expect(recipientPayload({ enabled: true, name: "   ", hasAccount: true })).toEqual({
      recipient_name: null,
      recipient_has_account: null,
    });
  });
});

describe("recipientIncomplete", () => {
  it("blocks submission while the disclosure is open and the radio unanswered", () => {
    expect(recipientIncomplete({ enabled: true, name: "Beth", hasAccount: null })).toBe(true);
  });

  it("allows submission once the radio is answered", () => {
    expect(recipientIncomplete({ enabled: true, name: "Beth", hasAccount: true })).toBe(false);
  });

  it("allows submission with the disclosure closed", () => {
    expect(recipientIncomplete(NO_RECIPIENT)).toBe(false);
  });

  it("blocks submission while the name is blank, even with the radio answered", () => {
    // recipientPayload would send nulls here, silently discarding the answer.
    expect(recipientIncomplete({ enabled: true, name: "", hasAccount: true })).toBe(true);
    expect(recipientIncomplete({ enabled: true, name: "   ", hasAccount: false })).toBe(true);
  });
});

describe("recipientValueFrom", () => {
  it("seeds from a list with a recipient", () => {
    expect(
      recipientValueFrom({ recipient_name: "Beth", recipient_has_account: false }),
    ).toEqual({ enabled: true, name: "Beth", hasAccount: false });
  });

  it("seeds closed from a list with no recipient", () => {
    expect(
      recipientValueFrom({ recipient_name: null, recipient_has_account: null }),
    ).toEqual(NO_RECIPIENT);
  });
});
