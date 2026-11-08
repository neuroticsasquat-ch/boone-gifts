# NEU-1298 — Occasion strip on `/lists`

**Ticket:** [NEU-1298](https://linear.app/neuroticsasquatch/issue/NEU-1298/occasion-strip-on-lists-frontend)
**Repo:** `boone-gifts-frontend`
**Story:** [NEU-1295](https://linear.app/neuroticsasquatch/issue/NEU-1295/i-can-see-and-reach-the-occasions-im-shopping-for) — "I can see and reach the occasions I'm shopping for"
**Milestone:** M2 — Navigation
**Project:** BG: Occasions and Navigation ([project spec](occasions-and-navigation-project-spec.md) §5.1, §5.2, §5.3, §9.1, §10.2)
**Blocked by:** [NEU-1292](https://linear.app/neuroticsasquatch/issue/NEU-1292/occasion-index-endpoint-with-per-viewer-counts-backend) — **Done**, shipped in `boone-gifts-backend` PR #187
**Blocks:** [NEU-1308](https://linear.app/neuroticsasquatch/issue/NEU-1308/occasion-mode-for-the-sharing-modal-and-the-empty-occasion-cta-frontend) (M3 — the empty card's CTA)
**Governed by:** [`docs/adr/0007-occasions-are-a-destination.md`](../adr/0007-occasions-are-a-destination.md)
**Branch:** from `release/v0.6.0`, targets `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

`/occasions/:id` holds the My shopping tab and the viewer's budget — the two things v0.5.0 built —
and is the hardest page in the app to reach: People → a family → its Occasions section. Nobody looks
for Christmas under "People".

This ticket puts a row of occasion cards on `/lists`, the app's landing page, **below
`ActionableBanner` and above `My Lists`**, reading the index endpoint NEU-1292 shipped. Every
non-archived occasion in every family the viewer belongs to, including the ones with no lists —
§5.1 is explicit that an empty occasion is the one most likely to need action, so hiding it defeats
the purpose.

The backend already did the hard part. `GET /occasions?archived=false` returns each row with its
family name, list count, the viewer's own claimed/bought counts, and a per-viewer
`last_activity_at`, ordered `last_activity_at DESC, id DESC`. This ticket renders it.

**It also lands `useSearchParamState`** — see Decision 1.

## The contract this consumes

```
GET /occasions?archived=false  →  OccasionSummary[]
```

`OccasionSummary` = `OccasionRead` + `family_name: str`, `list_count: int`, `my_claimed_count: int`,
`my_bought_count: int`, `last_activity_at: datetime`. Verified against
`app/schemas/occasion.py:OccasionSummary` and `app/occasions/router.py` on `release/v0.6.0`, not
just the ticket text.

Two properties of the shipped endpoint the client relies on and must not re-derive:

- **`last_activity_at` is non-null**, floored at the occasion's `created_at`. No null branch in any
  client sort or format.
- **Rows arrive ordered** `last_activity_at DESC, id DESC`, with the `id` tiebreak so the order is
  stable across requests. The client renders array order and **does not re-sort** — see Decision 6.

`last_activity_at` never includes another user's claim (`CONTEXT.md` rule 2 / backend invariant 1).
That guarantee is the server's and stays there; nothing in this ticket may reintroduce a
claim-derived value on the card.

## What to change

| File | Change |
|---|---|
| `src/api/occasions.ts` | new `getOccasionIndex(archived = false)` |
| `src/types/index.ts` | new `OccasionSummary extends Occasion` |
| `src/hooks/useSearchParamState.ts` | **new** — the shared hook (Decision 1) |
| `src/pages/lists/OccasionStrip.tsx` | **new** — the strip and its card |
| `src/pages/Lists.tsx` | mount `<OccasionStrip />` between `ActionableBanner` and the header |
| `src/pages/family-detail/OccasionsSection.tsx` | widen invalidation to the `["occasions"]` prefix |
| `src/pages/OccasionDetail.tsx` | same |
| `src/pages/list-detail/SharingPanel.tsx` | invalidate `["occasions"]` on share/unshare |
| `src/pages/list-detail/GiftsTab.tsx` | invalidate `["occasions"]` on claim/purchase/file |
| `src/test/mocks/handlers.ts` | default handler: `GET /occasions → []` |
| `CONTEXT.md` | new term (see below) |

`src/pages/lists/` is a new directory, following the existing `pages/list-detail/`,
`pages/family-detail/` and `pages/account/` convention: a component used by exactly one page lives
beside it. The strip is **not** a `components/` module — `ActionableBanner` earned that place by
being mounted on two pages, and the strip is mounted on one.

## Decisions

### 1. `useSearchParamState` lands in this ticket, at full width

The M2 contract holds the strip's expansion in the URL through
`useSearchParamState(key, { mode })`, a hook scoped to sibling ticket
[NEU-1301](https://linear.app/neuroticsasquatch/issue/NEU-1301/usesearchparamstate-and-url-held-view-state-frontend).
NEU-1301 is not a formal blocker and is still in Backlog. **This ticket builds the hook**, and
NEU-1301 becomes a conversion ticket: it moves `/lists`' Folder, Sort and Group by, `/lists/:id`'s
gift filter and sort, and `/occasions/:id` and `/folders/:id`'s tabs onto the hook that already
exists, and brings its own tests for those call sites.

Because the signature is fixed here, it ships at **full width immediately** — not narrowed to the
boolean the strip happens to need and then widened by a different ticket:

```ts
type SearchParamMode = "push" | "replace";

function useSearchParamState(
  key: string,
  options: { mode: SearchParamMode },
): [string | null, (value: string | null) => void];
```

- **`mode` is required and un-defaulted.** That is the whole point of the hook (spec §6.3): the call
  site must answer "is this a place, or a preference about where I already am". A tab and an open
  modal are places — linkable, Back-closable, `push`. A sort order is not, and pushing it makes Back
  mean "undo my last dropdown". A default would let a call site inherit an answer instead of giving
  one.
- **String-valued, `null` for absent.** Setting `null` deletes the key rather than writing an empty
  one, so an unset preference leaves no trace in the URL. All six contracted call sites are
  string-shaped; nothing needs a codec.
- Implemented over `useSearchParams` from `react-router`, passing `{ replace: mode === "replace" }`.
  Updates are functional against the current params so two call sites on one page cannot clobber
  each other's key.

The strip's own call is `useSearchParamState("occasions", { mode: "replace" })`, holding `"all"` or
nothing. The expansion is a preference, not a place (§5.1, §6.3).

### 2. The card is a link region plus a body slot

A card is a plain container holding two children:

1. a `<Link to={/occasions/${id}}>` wrapping the name, the family name, the list count and the
   bought line, and
2. a **body slot** beneath it — a sentence today, NEU-1308's sharing control tomorrow.

Not one large `<Link>` around the whole card. M3 puts a `<button>` in that body, and a `<button>`
inside an `<a>` is invalid HTML; a whole-card anchor would force NEU-1308 either to restructure the
card or to split empty cards into a second shape. It also matters that **every** occasion keeps its
route to `/occasions/:id`, empty ones included — that page holds the budget and the shopping tab,
which is the entire argument of ADR 0007.

The trade accepted: the click target is the card's upper region rather than its whole area. It is
still the large majority of the card, and the alternative (an absolutely-positioned stretched link
with the CTA raised above it) is a pointer-events arrangement this codebase uses nowhere.

### 3. Nothing while pending; nothing plus a toast on failure

The strip renders `null` while its query is pending and `null` when it fails, firing a toast on
failure — the same shape as `ActionableBanner` directly above it, which also renders nothing when it
has nothing and toasts when its loads fail.

- **It does not join `Lists.tsx`'s existing `isPending` gate.** Holding the viewer's own lists
  behind a request that exists to show occasions inverts §5.1's argument, which is precisely about
  not letting occasion discovery bury everything else.
- **No skeleton.** A placeholder that collapses to nothing for a viewer with no occasions is its own
  flash, and this page has no skeleton idiom to borrow.
- The accepted cost is a reflow: the strip appears after the lists and pushes them down. It is one
  shift, on a page that already shifts when `ActionableBanner` resolves.
- The toast reads **"Couldn't load your occasions."** — the absence is explained rather than silent,
  because a viewer who has occasions and sees no strip otherwise has no way to tell a failure from
  having none.

### 4. Renders nothing at all when there are no occasions

No empty card, no "Occasions" heading, no empty section element. Same shape as `ActionableBanner`
(§5.1). The heading is inside the thing that disappears — a bare heading over nothing is exactly
what the contract forbids.

### 5. Four cards, then "See all N" ⇄ "Show fewer"

- **Collapsed:** the first four rows of the response.
- **The control appears only when there are more than four occasions**, labelled **"See all N"**
  where `N` is the **total** number of occasions, matching §9.1's mock ("See all 6" over six
  occasions).
- **Expanded:** every row, and the same control reads **"Show fewer"** and clears the param.
- One control in one place, in both states. An expansion the viewer can set and cannot unset is a
  trap, and on a phone showing fifteen cards collapsing is the first thing they will want.

### 6. The server's order is the order

Render array order and take `slice(0, 4)` for the collapsed strip. No client-side sort.

The server holds the definition of `last_activity_at` and is the only place that can order on it
without a consumer re-deriving it; its `id DESC` tiebreak is what makes "the first four" stable for
two members of one family and across repeated requests (NEU-1292 Decision 6). A client re-sort would
be a second, drifting copy of an ordering rule whose whole point is that it is defined once.

### 7. What the card shows, and what it must not

Occasion name · family name · `list_count` · **"N of M bought"**.

- The bought line is `my_bought_count` of `my_claimed_count` — the **viewer's own** claims in that
  occasion.
- **Suppressed entirely when `my_claimed_count` is 0**, so an untouched occasion reads as empty
  rather than as "0 of 0 bought" (§5.2). Zero *bought* out of three claimed still renders: "0 of 3
  bought" is a real state.
- **The family name is not decoration.** Two families routinely both call an occasion "Christmas
  2026"; the name alone does not identify one.
- **No money, anywhere on the card.** The budget line stays on the occasion page. `/lists` is the
  first screen the app shows, and a budget figure there puts the viewer's Christmas spend in front of
  whoever is standing behind them — including the people they are buying for. `BudgetLine` is not
  imported by this component.
- **`list_count` is the server's number**, rendered as-is. A claim filed under an occasion survives
  its list being unshared, so an occasion can legitimately show 0 lists and a non-zero bought line
  (NEU-1292 Decision 1's accepted consequence). The card renders both without comment.

### 8. An occasion with no lists states its condition and nothing more

The body slot reads **"No lists yet"** — the condition, and no instruction.

§9.1's mock draws "No lists yet — share one", but that sentence is written against the M3 control.
Shipping the words without the control puts an instruction on the landing page with no way to follow
it. NEU-1308 replaces the sentence with the button, and the wording arrives with the thing it
describes. A disabled button is worse still: `CONTEXT.md` rule 6's shape is "listed, disabled,
**reason given**", and "because a later milestone hasn't shipped" is not a reason a viewer can act
on.

### 9. A wrapping responsive grid, not a literal strip

A CSS grid — one column on the narrowest phones, two from `sm`, four from `md` — using the Tailwind
idiom the rest of the app already uses.

"Four cards" is a cap on how many are **rendered**, not a promise about how many sit on a line. A
horizontal-scroll carousel would keep the row literal and put cards off-screen, which is the exact
discoverability failure this ticket exists to fix.

### 10. Query key and invalidation reach

The query key is **`["occasions", "index", { archived: false }]`**. The literal `"index"` segment
keeps it clearly distinct from the existing per-family `["occasions", familyId]` entries while
sharing their `["occasions"]` prefix, so one prefix sweep invalidates both.

`staleTime` is 30s app-wide, so a card can show stale numbers on a quick return to `/lists` — and
claiming a gift and going straight back is exactly the flow the strip exists for. Every writer that
moves a number on a card therefore gains
`queryClient.invalidateQueries({ queryKey: ["occasions"] })`, one line beside the invalidations
already there:

| Site | Moves |
|---|---|
| `OccasionsSection` (create, rename, archive) | which cards exist |
| `OccasionDetail` (rename, archive) | which cards exist |
| `SharingPanel` (share/unshare a list into an occasion) | `list_count`, `last_activity_at` |
| `GiftsTab` (claim, unclaim, purchase, file under an occasion) | `my_claimed_count`, `my_bought_count`, `last_activity_at` |

This touches four files the ticket does not otherwise own. The alternative is a landing page that
tells the viewer something false for thirty seconds immediately after their own action.

## `CONTEXT.md` edits

**Applied in this ticket** — the Terms table gains **Occasion strip**:

> **Occasion strip** — The row of occasion cards at the top of `/lists`: every non-archived occasion
> in every family I belong to, most recently active first, four at a time. Absent entirely when I
> have none. Carries no money. · *Rendered by* `pages/lists/OccasionStrip.tsx`

**Deliberately not applied here.** Rule 3 still reads "…never as a link: the one grouping whose
heading leads anywhere is Folder", which ADR 0007 overturns — but the code that falsifies it is
[NEU-1299](https://linear.app/neuroticsasquatch/issue/NEU-1299/occasion-and-folder-headings-link-person-headings-dont-frontend),
not this ticket. Following NEU-1290 and NEU-1292: an edit describes the state *after* its own code
lands, so applying NEU-1299's amendment now would make `CONTEXT.md` lie for as long as the two
tickets are apart. The strip is not a grouping heading and does not engage rule 3 — it adds a
surface rather than subdividing **Shared with me** (ADR 0007, "a strip is not a grouping").

## Acceptance criteria

1. `/lists` renders a strip of occasion cards **below `ActionableBanner` and above `My Lists`**,
   from one `GET /occasions?archived=false`.
2. A viewer with **no** non-archived occasions sees **nothing** — no cards, no heading, no empty
   section.
3. Occasions with **no lists shared to them** are present, their body reading "No lists yet".
4. Cards appear in the server's order; the collapsed strip is the **first four**.
5. With more than four occasions, **"See all N"** (N = the total) expands in place; the control then
   reads **"Show fewer"** and collapses it again.
6. Expanding writes `?occasions=all` with **`replace`** — the history entry count does not grow, and
   Back leaves `/lists` rather than collapsing the strip. Loading `/lists?occasions=all` renders
   expanded.
7. Each card shows occasion name, family name, list count and — **only when
   `my_claimed_count > 0`** — "N of M bought" from `my_bought_count`/`my_claimed_count`.
8. **No monetary amount appears anywhere in the strip.**
9. Each card links to `/occasions/:id`, including a card for an occasion with no lists.
10. While the occasions query is pending the strip renders nothing and **does not delay** the lists
    below it; on failure it renders nothing and a toast says so.
11. Claiming or purchasing a gift, sharing a list into an occasion, and creating or archiving an
    occasion each leave the strip correct on an immediate return to `/lists`.
12. `useSearchParamState(key, { mode })` exists as a shared hook with **`mode` required**; passing
    `null` removes the key from the URL.

## Tests

**New — `src/pages/lists/OccasionStrip.test.tsx`:**

- Renders **nothing at all** for `[]` — assert no heading, not merely no cards.
- Renders a card per occasion, in response order, with name, family name and list count.
- **The suppression rule, both ways:** `my_claimed_count: 0` renders no bought line anywhere on the
  card (and specifically not "0 of 0"); `my_claimed_count: 3, my_bought_count: 0` renders "0 of 3
  bought".
- **No money:** a strip rendered from a full fixture contains no `$`/currency-formatted text. This is
  the rule-2-adjacent guard for this component — cheap, and it fails loudly if a later ticket
  imports `BudgetLine`.
- Five occasions → four cards and a "See all 5"; clicking it shows all five and the control becomes
  "Show fewer"; clicking that returns to four.
- Four or fewer → no "See all" control.
- Mounting at `/lists?occasions=all` renders expanded on first paint.
- An occasion with `list_count: 0` renders "No lists yet" and **still** links to `/occasions/:id`.
- An occasion with `list_count: 0` and `my_claimed_count: 2` renders both the empty-body sentence and
  "N of 2 bought" — the unshared-list consequence from NEU-1292.
- Pending: nothing rendered, and the lists below are not blocked.
- Error: nothing rendered, and `toast.error` called.

**New — `src/hooks/useSearchParamState.test.ts(x)`:**

- `replace` mode does not grow history; Back leaves the page.
- `push` mode grows history; Back restores the previous value.
- A value already in the URL is the initial value.
- Setting `null` removes the key entirely.
- Two keys on one page do not clobber each other.

**Updated:**

- `src/test/mocks/handlers.ts` gains a default `GET /occasions → []`, alongside the existing
  no-folders and no-invites defaults — every `/lists` render will now fetch it.
- `src/pages/Lists.test.tsx` — existing cases stay green against the empty default; add one asserting
  the strip renders above the `My Lists` heading in DOM order.

## Out of scope / deferred

- **The empty card's sharing control** — NEU-1308 (M3). This ticket ships the body slot and a
  sentence in it.
- **Converting `/lists`' Folder, Sort and Group by, the gift filter and sort, and the occasion and
  folder tabs to `useSearchParamState`** — NEU-1301, which now owns the conversion and its tests.
  This ticket ships the hook and one call site.
- **Occasion and folder grouping headings becoming links** — NEU-1299, along with rule 3's
  `CONTEXT.md` amendment.
- **History-aware Back** — NEU-1302.
- **The archive nudge** in `ActionableBanner` — NEU-1315 (M4). It reads the same `last_activity_at`
  clock, server-side.
- **Archived occasions.** The strip is `archived=false` only; the archive stays at
  `/people/families/:id/archive`.
- **Pagination.** Project spec §3 — out of scope until a real user passes ~15 connections.
- **Any change to `/occasions/:id` itself**, including the budget line's placement.

## Related documents

- [`docs/adr/0007-occasions-are-a-destination.md`](../adr/0007-occasions-are-a-destination.md)
- [`docs/adr/0005-grouping-returns-as-an-opt-in.md`](../adr/0005-grouping-returns-as-an-opt-in.md) —
  amended by 0007
- [Project spec](occasions-and-navigation-project-spec.md) §5, §6.3, §9.1, §10.2
- Backend: `boone-gifts-backend` `docs/specs/NEU-1292-occasion-index-with-per-viewer-counts.md` — the
  endpoint this consumes, and why its clock is restricted
