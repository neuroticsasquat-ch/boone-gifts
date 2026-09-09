import { describe, it, expect } from "vitest";
import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("renders a two-decimal amount as it stands", () => {
    expect(formatMoney("39.00")).toBe("$39.00");
    expect(formatMoney("19.50")).toBe("$19.50");
  });

  it("pads an amount carrying fewer than two decimals", () => {
    // The column's scale is not a guarantee: a budget total, a hand-typed
    // amount, or a backend that stops round-tripping two decimals all arrive
    // short, and `$19.5` is the bug this function exists to prevent.
    expect(formatMoney("19.5")).toBe("$19.50");
    expect(formatMoney("39")).toBe("$39.00");
  });

  it("groups thousands", () => {
    expect(formatMoney("1234.5")).toBe("$1,234.50");
  });

  it("has nothing to render for a missing amount", () => {
    // Null is the wire's "no amount recorded"; the empty string is what an
    // untouched input hands back. Neither is zero, and neither may render as
    // one — an understated total must read as an understatement (spec §7).
    expect(formatMoney(null)).toBeNull();
    expect(formatMoney(undefined)).toBeNull();
    expect(formatMoney("")).toBeNull();
    expect(formatMoney("   ")).toBeNull();
  });

  it("has nothing to render for a value that is not a number", () => {
    expect(formatMoney("free")).toBeNull();
  });

  it("renders a recorded zero, which is not the same as no amount", () => {
    expect(formatMoney("0")).toBe("$0.00");
  });

  it("renders a negative amount", () => {
    expect(formatMoney("-5")).toBe("-$5.00");
  });
});
