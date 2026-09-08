import { describe, it, expect } from "vitest";
import {
  NO_RECIPIENT,
  recipientIncomplete,
  recipientPayload,
  recipientValueFrom,
} from "./recipient";

describe("recipientPayload", () => {
  it("sends null when the disclosure is closed", () => {
    expect(recipientPayload(NO_RECIPIENT)).toEqual({ recipient_name: null });
  });

  it("sends the name when the disclosure is open", () => {
    expect(recipientPayload({ enabled: true, name: "Beth" })).toEqual({
      recipient_name: "Beth",
    });
  });

  it("trims the name", () => {
    expect(recipientPayload({ enabled: true, name: "  Beth  " }).recipient_name).toBe("Beth");
  });

  it("sends null when the name is blank — the disclosure alone says nothing", () => {
    expect(recipientPayload({ enabled: true, name: "   " })).toEqual({ recipient_name: null });
  });
});

describe("recipientIncomplete", () => {
  it("blocks submission while the disclosure is open and the name blank", () => {
    // recipientPayload would send null here, silently discarding the disclosure.
    expect(recipientIncomplete({ enabled: true, name: "" })).toBe(true);
    expect(recipientIncomplete({ enabled: true, name: "   " })).toBe(true);
  });

  it("allows submission once the name is given", () => {
    expect(recipientIncomplete({ enabled: true, name: "Beth" })).toBe(false);
  });

  it("allows submission with the disclosure closed", () => {
    expect(recipientIncomplete(NO_RECIPIENT)).toBe(false);
  });
});

describe("recipientValueFrom", () => {
  it("seeds from a list with a recipient", () => {
    expect(recipientValueFrom({ recipient_name: "Beth" })).toEqual({
      enabled: true,
      name: "Beth",
    });
  });

  it("seeds closed from a list with no recipient", () => {
    expect(recipientValueFrom({ recipient_name: null })).toEqual(NO_RECIPIENT);
  });
});
