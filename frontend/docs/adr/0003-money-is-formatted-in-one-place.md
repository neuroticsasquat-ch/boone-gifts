# ADR 0003 — Money is formatted in one place, in one implicit currency

**Status:** Accepted (2026-09-09)
**Resolves:** [BG: Shopping Lists] project spec §14 open question 1
**Ticket:** [NEU-1272](https://linear.app/neuroticsasquatch/issue/NEU-1272/shared-money-formatting-frontend)
**Project:** [BG: Shopping Lists](https://linear.app/neuroticsasquatch/project/bg-shopping-lists-6fdd1e4a3cc1)

## Context

Every money value in this app arrives from the backend as a **string**, because Pydantic v2
serialises `Decimal` that way. Until now there was no money formatting anywhere in either repo:
each display site hardcoded a literal `$` immediately before the raw value —
`gifts.price` in four places in `list-detail/GiftsTab.tsx` (the desktop price, the mobile duplicate,
the viewer row, and the "listed at" hint), a claimer's `amount_paid` in a fifth, and the folder
shopping list in `FolderDetail.tsx`.

That worked by accident. `19.5` renders as `$19.50` only because the `numeric(10, 2)` column
round-trips two decimals, so the string was already correctly shaped before it reached the `$`.
Nothing in the client enforced it, and nothing warned when the assumption stopped holding.

Budgets are where it stops holding. A budget total is **computed, not stored** — "$142 of $200
spent · $58 left" (project spec §7) — so there is no column scale behind it, and a subtraction that
lands on `58.5` reads `$58.5`. The same is true of any hand-typed amount echoed back before a round
trip. An understated or oddly-shaped total is exactly the thing project spec §7 says must never
happen: the numbers a user checks their own spending against have to look like money.

The second question was whether to store a currency alongside each amount.

## Decision

**One shared formatter, and every money site goes through it** — including the `gifts.price`
displays that were rendering correctly by accident. `src/lib/money.ts` exports `formatMoney`, which
takes the wire string and returns display text, or `null` when there is no amount.

It returns `null` rather than an empty string so a call site can guard its markup on the *formatted*
value. "Is there an amount here?" is then answered in one place instead of re-derived from the raw
field at six sites, which is what let `null`, `""` and `"0"` drift apart in the first place. A
recorded `0` is a real amount and renders `$0.00`; absent, blank and unparseable all render nothing.

**Currency stays single and implicit — US dollars, nothing stored, nothing chosen.** The formatter
hardcodes `en-US`/`USD`.

## Consequences

**Good**

- A short-decimal value can no longer reach a screen. The formatter pads, and it is the only path.
- Budgets get correct formatting for free rather than re-solving it, which is why this ticket was
  parked in M5 even though it has no blockers.
- Thousands separators arrive with `Intl.NumberFormat`, which no site had before.
- The null/blank/zero distinction is stated once, with a test, rather than six times by hand.

**Bad, and accepted**

- Amounts are formatted for `en-US` regardless of the viewer's locale, so a user whose browser is
  set to `de-DE` still sees `$1,234.50`. Deliberate: with one implicit currency, following the
  viewer's locale would render US dollars in European notation — `1.234,50 $` for a value that is
  not in euros — which is worse than being consistently American about an amount that is
  consistently American.
- Every stored amount is now committed to being dollars. Adding a currency later is a backend
  migration plus a formatter signature change, not a client-side switch.

## Alternatives rejected

**Store a currency per amount.** Nothing in the product asks for it. There is no currency field in
either repo's schema, no UI that offers a choice, and no multi-currency use case — the project spec
lists multi-currency under non-goals (§3) as well as leaving the question open in §14. Adding a
column, a picker, and a per-amount currency argument to serve a case nobody has is speculative
generality, and it would have to be threaded through `budgets` — the very table this ticket was
sequenced ahead of — for no behaviour anyone can currently reach. If a real case appears, the
formatter is a single function with one call shape, which is the cheapest possible place to widen.

**Format in the backend and send display strings.** Would put presentation in the API and break
`price` for the client-side sort in `GiftsTab.tsx`, which coerces with `Number(...)`. The wire
format is a number-as-string on purpose; only the last step is text.

**Leave `gifts.price` alone and format only the new budget sites.** The cheaper diff, and it
preserves the exact fragility the ticket names: two ways to render money, one of them correct by
coincidence. It also guarantees a visible inconsistency the first time a price and a budget total
sit on the same screen, which the occasion shopping tab (NEU-1274) does.
