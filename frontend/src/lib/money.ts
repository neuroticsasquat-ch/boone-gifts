/**
 * The one place money becomes text (project spec §14 open question 1).
 *
 * Every money value in this app arrives as a **string**, because the backend
 * serialises `Decimal` that way (Pydantic v2 default) — `gifts.price`, a
 * claim's `amount_paid`, and every budget figure alike. Before this module each
 * display site hardcoded a literal `$` immediately before the raw value, which
 * rendered correctly only for as long as the column happened to round-trip two
 * decimals: `19.5` reaching a site that way reads `$19.5`, and a budget total
 * computed rather than stored has no such column behind it at all.
 *
 * **Currency is single and implicit.** Nothing is stored, nothing is chosen,
 * and every amount is US dollars — see `docs/adr/0003-money-is-formatted-in-one-place.md`.
 */

/** Constructed once: `Intl.NumberFormat` is expensive to build and these render
 *  inside list rows. */
const FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/**
 * A money string as it should be shown, or `null` when there is nothing to show.
 *
 * Returning `null` rather than an empty string is deliberate: every call site
 * already guards its own markup, and a nullable return lets it guard on the
 * *formatted* value, so "is there an amount here?" is answered in one place
 * instead of re-derived from the raw field at each site.
 *
 * Absent (`null`/`undefined`), blank, and unparseable all mean **no amount** —
 * never zero. A recorded `0` is a real amount and renders as `$0.00`.
 */
export function formatMoney(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return FORMATTER.format(amount);
}
