# NEU-1323 — A linked eyebrow, and a header that may collapse its actions

**Ticket:** [NEU-1323](https://linear.app/neuroticsasquatch/issue/NEU-1323/move-family-prefix-on-occasion-title-to-linked-eyebrow) —
"family name + occasion name is too long for mobile width. instead move the family name above
occasion name as a smaller eyebrow linked to the family."
**ADR:** [`docs/adr/0010-a-header-may-collapse-its-actions-on-a-phone.md`](../adr/0010-a-header-may-collapse-its-actions-on-a-phone.md),
amending [ADR 0009](../adr/0009-actions-are-visible.md)
**Repos:** `boone-gifts-frontend` **only**. `GET /occasions/{id}` already carries `family_name` and
`family_id` (NEU-1321), so there is no backend half and this file is not checked in to the backend.
**Project:** Boone Gifts: Maintenance. **No milestone, no project description, no project spec** — no
shared contracts beyond `CONTEXT.md` and the ADRs named here.
**Story / parent:** none. **Blocked by:** nothing. **Blocks:** nothing. **Related:** none in Linear,
but this ticket **reverses a decision NEU-1321 wrote down one day earlier** and **amends the ADR
NEU-1322 accepted the same day** — see "What this reopens".
**Branch from and target:** `main`. `release/v0.6.0` has shipped and no release branch is open.

## What to build and why

Three things, one cause: at a phone's width the occasion page's header has no room for its heading
*or* its actions, and the two are competing for the same row.

1. **The occasion page's `<h1>` moves the family from a prefix beside the name to a linked eyebrow
   above it** — the ticket as filed.
2. **`ActionBar` gains an opt-in `collapseOnMobile`**, granted to exactly two headers, which is what
   frees the width the eyebrow needs and what ADR 0010 exists to justify.
3. **Sharing moves out of `SharingSummary`'s own `Change` control and into the list owner's action
   bar as `Sharing…`**, so that one bar is the whole answer to "what can I do to this list" on the
   surface where the bar is now collapsible.

### The measurement

`OccasionDetail.tsx:357` is the one page header in the app that **never stacks**:

```tsx
<div className="flex items-start justify-between gap-3">   // OccasionDetail
<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">  // ListHeader, FolderDetail
```

NEU-1321 then put the family into that heading, and NEU-1322 turned the `⋯` beside it into two
visible buttons. At a 375px viewport those three facts compound: the heading column is left roughly
**128px** next to Rename and Archive, and `Christmas 2026` alone wraps to two lines at `text-2xl`
before the family qualifier is considered at all.

So the ticket's "too long for mobile width" is not only the heading's fault, and moving the family to
its own line does not on its own fix it. That is why this ticket is three changes.

## What this reopens

**NEU-1321 decision 1 rejected this ticket's own design, by name:**

> Rejected: **a linked eyebrow above the `<h1>`**, which contradicts rule 3's "unlinked" and
> duplicates the `BackControl`.

Both halves of that rejection are answered rather than ignored, and the answer is already written
into `CONTEXT.md` rule 3:

- **"Contradicts rule 3's unlinked."** Rule 3's test for whether a heading links is whether the
  destination *carries something the surface does not* (ADR 0007). That test gives different answers
  on the two surfaces, which is why the rule now gives different answers too. In a *grouping*
  heading the family is a **qualifier** — it is there to tell two Christmas 2026s apart, and the
  heading's own link already goes to the occasion. On the occasion **page** the viewer has arrived:
  nothing is being disambiguated any more, and the family is simply the parent that administers this
  occasion — members, settings, its other occasions — none of which this page carries. So the family
  half is a link **here and nowhere else**, and every heading that points *at* an occasion keeps the
  unlinked `Boone Family · Christmas 2026` prefix, unchanged.

- **"Duplicates the `BackControl`."** It duplicates it at **depth 0 only**. At depth > 0 — which
  NEU-1321's own table shows is every route a viewer actually takes to this page — the control reads
  `← Back` and points at history, not at the family, so for the common case the eyebrow is the
  page's *only* route to the family. At depth 0 there are two links to `/people/families/:id` two
  lines apart, and that is accepted: one is "the way back to where you were", the other is "the
  parent of the thing you are looking at", and they coincide only on a cold deep link.

**ADR 0009** admitted no width, and its consequences section priced the thing this ticket is paying:
"Headers are taller on narrow screens — two rows of buttons where there was one glyph." ADR 0010
narrows it to a mechanical, opt-in exception. Read ADR 0010 before implementing; it is the reasoning
and this file is what to build.

## Part 1 — The linked eyebrow

### 1.1 What it looks like

`src/pages/OccasionDetail.tsx`, the resting heading (`:357`–`:376`):

```tsx
<h1 className="text-2xl font-bold text-gray-900">
  <Link
    to={`/people/families/${occasion.family_id}`}
    className="block text-sm font-normal text-gray-500 hover:underline"
  >
    {occasion.family_name}
  </Link>
  {occasion.name}
</h1>
```

- **The eyebrow is inside the `<h1>`, not a line above it.** This is the load-bearing detail. The
  heading's accessible name still contains both halves, so a screen-reader user still hears the page
  identified as `Boone Family Christmas 2026` — the identification NEU-1321 was filed to get, which a
  detached `<p>` above the heading would give back.
- **`block`** is what puts it on its own line; `text-sm font-normal text-gray-500` is what makes it an
  eyebrow. This also finally honours NEU-1321's acceptance criterion 6 ("visually subordinate"),
  which the shipped code did not: the span inherits `text-2xl` today and carries only colour and
  weight.
- **The ` · ` separator is dropped here and only here.** Two lines do not need a separator. It stays
  in `list-grouping.ts`, `Lists.tsx`, `OccasionStrip`, `SharingSummary` and the document title.
- **The accessible name becomes `Boone Family Christmas 2026`** — no `·`, one space, because the two
  element children are trimmed and joined. Every assertion on the old exact string must be updated;
  see "Tests".
- **Destination:** `/people/families/:id`, the same address `backToFamily` builds. Do not invent a
  second route string — the family page lives under `/people`.

### 1.2 The `Archived` pill stays beside the occasion name, and stays outside the `<h1>`

The pill is a sibling of the heading today, inside `<div className="flex min-w-0 items-center gap-2">`.
With a two-line `<h1>`, `items-center` would float it against the eyebrow. The row becomes
`items-end`, which puts the pill on the occasion-name line where it belongs.

It stays **outside** the `<h1>`: it is a state badge, not part of the occasion's name, `ListHeader`
and `FolderDetail` both keep it outside theirs, and pulling it in would change the heading's
accessible name a second time in one ticket.

### 1.3 The rename form keeps the eyebrow, and it stays a link

NEU-1321 decision 6 gave the rename form a static `Boone Family ·` ahead of the input, for a reason
that still holds — the family would otherwise leave the page the moment an organizer started typing,
and at depth > 0 the control above reads only `← Back`.

The form now renders **the same linked eyebrow above the input**, not a static prefix:

```tsx
<form onSubmit={handleRename}>
  <Link to={`/people/families/${occasion.family_id}`} className="block text-sm ...">
    {occasion.family_name}
  </Link>
  <div className="flex items-center gap-2">…input, Save, Cancel…</div>
</form>
```

Static was rejected: the resting and editing states would then disagree about what the family half
*is*, one line apart and one keystroke apart. The "a link loses my typing" objection does not survive
contact with the page — the `BackControl` and the whole tab bar are already live during a rename, so
navigating away mid-edit is already possible and already loses the same keystrokes.

What NEU-1321 decision 6 was actually protecting is untouched: the family is still on screen while
renaming, and the input still holds and submits **only** `occasion.name`, with its `sr-only`
`Occasion name` label.

### 1.4 What does not change

- `useTitle` keeps the qualified `Boone Family · Christmas 2026`. A browser tab has no width problem
  and two families' Christmas 2026 still have to be told apart there.
- `backToFamily(occasion.family_id, occasion.family_name)` and the `BackControl` above the card.
- Every heading that *points at* an occasion: `list-grouping.ts`'s `qualifier`, `Lists.tsx:352`,
  `OccasionStrip`, `SharingSummary`, `OccasionSharingModal`.
- The organizer gate, the `family` query, the tabs, `?share=open`, and the archive confirmation.

## Part 2 — A header may collapse its actions below `md`

### 2.1 `ActionBar` gains one prop

`src/components/ActionBar.tsx`:

```tsx
export function ActionBar({
  items,
  collapseOnMobile = false,
}: {
  items: ActionBarItem[];
  collapseOnMobile?: boolean;
}): React.ReactNode;
```

Below `md`, and only when `collapseOnMobile` is set, the bar renders a disclosure instead of the
buttons:

```tsx
<button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Actions</button>
{open && <div className="flex flex-wrap items-center gap-2">…the same buttons…</div>}
```

- **The trigger is the word `Actions`**, never a glyph. This is the part of ADR 0009 that survives
  untouched and is its most important finding: NEU-1322's complaint was never "a menu exists", it
  was that `⋯` *"does not read as a menu"*. `expectNoGlyphControls()` must keep passing.
- **It expands in place, below the trigger — it is a disclosure, not a floating menu.** So
  `HeaderMenu`'s outside-click effect and its `triggerRef.current?.focus()` dance stay deleted, and
  nothing new arrives to replace them.
- **Triggering an action does not close the disclosure.** This is a constraint, not a preference:
  `ConfirmDialog` captures the focused element as its focus-return target, so a bar that unmounted
  the button on click would re-create exactly the bug ADR 0009 deleted the focus dance to avoid. The
  panel closes when the trigger is pressed again, and on nothing else.
- **Ordering, tones, `ariaLabel`, and the whole-bar `pending` disable are unchanged** and apply
  inside the panel exactly as they do on the open bar.
- **`aria-expanded` carries the state**; no `aria-controls`/`id` plumbing is required for a
  disclosure whose panel immediately follows its trigger, and none is added.

### 2.2 Driven in JavaScript, not in CSS

A new `src/hooks/useMediaQuery.ts`, subscribing through `useSyncExternalStore` over
`window.matchMedia(query)` and its `change` event. `ActionBar` calls it with `(min-width: 768px)` —
Tailwind v4's default `md`, and the same breakpoint `ListHeader` and `FolderDetail` already stack at.

Two copies of the bar behind `hidden` / `md:flex` was rejected: it puts every action name in the DOM
twice, which breaks `action-policy.test.tsx`'s `getByRole` uniqueness queries and doubles the
accessibility tree. One set is rendered.

The consequence lands in `src/test/setup.ts`, whose `matchMedia` stub answers `matches: false` to
every query — under which the whole suite would render the *collapsed* arm. It must answer `true`
for the `md` query and keep answering `false` to everything else, since `react-hot-toast`'s `Toaster`
asks it about `prefers-reduced-motion` and the honest answer there is still no:

```ts
matches: /\(min-width:\s*768px\)/.test(query),
```

That makes the desktop arm the suite's default — every existing test keeps asserting what it asserts
today — and the mobile arm a deliberate per-test override.

### 2.3 `OccasionHeader`'s row stacks below `md`

`OccasionDetail.tsx:357` becomes `flex flex-col gap-3 md:flex-row md:items-start md:justify-between`,
matching `ListHeader` and `FolderDetail`.

**This is required, and ADR 0010 does not forbid it.** What that ADR rejected was stacking *as the
whole fix*, on its own, leaving five buttons on the list owner's header. Without it the collapsed
trigger and its expanded panel are rendered inside a `justify-between` right-hand column about 80px
wide, and the disclosure reveals a column of one-word-per-line buttons — a worse header than the one
being replaced.

### 2.4 Which call sites get the prop — two of eight

| Site | `collapseOnMobile` | Why |
|---|---|---|
| `ListDetail.tsx:236` — owner header | **yes** | Five actions after Part 3 |
| `OccasionDetail.tsx:380` — occasion header | **yes** | Two actions beside a two-line heading |
| `ListDetail.tsx:317` — viewer header | no | One item: `Add to a folder…` |
| `FolderDetail.tsx:203` — folder header | no | The header ADR 0009 held up as the model |
| `People.tsx:243` (row) | no | A row never collapses |
| `Folders.tsx:77` (row) | no | " |
| `FolderDetail.tsx:281` (row) | no | " |
| `MembersSection.tsx:104` (row) | no | " |

The two "no"s on headers are the limiting principle, not an oversight. `ListDetail`'s viewer header
holds `Add to a folder…` and nothing else — one of the two single-item menus ADR 0009 was filed
against **by name** — and collapsing it would rebuild the exact fault. A header with one action has
nothing to group. Rows are where the single-item menu did its worst damage (`People`'s lone
`Remove`), and a row has no heading competing for the width in the first place.

## Part 3 — Sharing moves into the list owner's bar

`SharingSummary` loses its `Change` button and its `onChange` prop. The summary line — the `👥`, the
"Shared with Boone Family · Christmas 2026, Jane", the unshared and failed states — is unchanged and
stays where it is, as the informational line it already mostly was.

`ListDetail`'s `OwnerHeader` gains a fifth action, `Sharing…`, wired to the same `onChangeSharing`
handler, so the bar reads:

```
Sharing…   Add to a folder…   Edit   Archive        Delete
```

- **`Sharing…`, not `Change`.** Out of the summary sentence, "Change" no longer has a subject; the
  label has to name what it opens. The trailing ellipsis follows a noun that says what it does, the
  way `Add to a folder…` does, and `expectNoGlyphControls()` is written to allow exactly that.
- **First in the bar**, ahead of `Add to a folder…`: it is the most-reached action on an owner's
  list and the one the ticket's surface pushes furthest from the user. Danger stays last and
  `ActionBar` still enforces it.
- **`?share=open` is untouched.** The control still pushes it, Back still closes it, a deep link
  still opens it, and `CreateList`'s `Choose…` is a different surface and is not renamed.
- **Viewers are unaffected** — `SharingSummary` is owner-only and the viewer header gains nothing.

This is the second of two changes pushing the same way on the same surface: an owner on a phone now
needs one tap to open the bar and one to reach sharing, where today the `Change` control is on the
page. ADR 0010 accepts that cost explicitly; it is the price of the header fitting.

## Constraints

1. **Nothing gains or loses an action, and no gate moves.** `OccasionDetail`'s bar is still rendered
   only when `canRename || canArchive` and still carries only what the viewer may do. A viewer who
   could not delete a list still cannot.
2. **Rule 11 is untouched.** Archiving still does not ask; deleting, and the occasion archive, still
   do. No `ConfirmDialog` gains or loses a call site.
3. **Rule 2 is untouched.** No label, `aria-label`, busy state or disclosure state may reveal claim
   state.
4. **No new colours and no new tone.** The disclosure trigger uses the existing `neutral` classes
   from `tone.ts`.
5. **The `md` breakpoint is not parameterised.** One query, one constant, in `ActionBar`. A prop for
   it would be a second way to say the same thing.
6. **No `setQueryData` on this page.** NEU-1321 decision 5 still binds: `PUT /occasions/{id}` returns
   `OccasionRead` with no `family_name`, so writing a mutation response into `["occasion", id]` would
   blank the eyebrow until the next refetch. Both mutations keep invalidating.

## Acceptance criteria

**The eyebrow**

1. The occasion page's `<h1>` renders the family name on its own line above the occasion name, at a
   visibly smaller size and lighter weight than the occasion name.
2. The family half is a **link** to `/people/families/:family_id`.
3. The `<h1>`'s accessible name still contains both halves — `Boone Family Christmas 2026`.
4. Both halves paint on the **first** paint, at any navigation depth, with a cold cache (NEU-1321
   AC 5 still holds — `family_name` comes off the occasion payload).
5. At a 375px viewport neither half of the heading is truncated, the occasion name is not pushed
   into more lines than its own length requires, and the page does not scroll horizontally.
6. An archived occasion shows the `Archived` pill beside the **occasion name**, not beside the
   eyebrow.
7. With the rename form open, the linked eyebrow is still on screen and the textbox contains only
   `Christmas 2026`. Saving changes only the occasion half.
8. The document title still reads `Boone Family · Christmas 2026`, with the separator.
9. Every heading that points *at* an occasion still reads `Boone Family · Christmas 2026` as an
   unlinked prefix — the grouping headings, the strip, the sharing summary.

**The collapsing header**

10. At ≥ 768px, all eight `ActionBar` call sites render exactly as they do today — every action
    visible, enabled, no disclosure anywhere.
11. Below 768px, the occasion header and the list owner's header render a single control labelled
    `Actions` carrying `aria-expanded="false"`, and no action button is in the document.
12. One press of that control reveals **every** action in the bar, enabled, with its tone and
    ordering intact; `aria-expanded` becomes `"true"`.
13. Triggering an action from inside the panel leaves the panel open, and focus returns to the
    triggering button when a `ConfirmDialog` it opened closes.
14. Below 768px, the other six call sites — the list viewer's header, the folder header and all four
    rows — still render every action visibly, with no disclosure.
15. No control anywhere in the app has a glyph or bare ellipsis as its whole label.

**Sharing**

16. An owner's list header carries `Sharing…` in its action bar; `SharingSummary` renders its
    sentence with no button.
17. `Sharing…` pushes `?share=open` and opens the sharing dialog; Back closes it; a deep link to
    `?share=open` still opens it directly.
18. A viewer's list page has no sharing control and no sharing summary.

**Everything**

19. `task lint`, `task test` and `task build` pass.

## Documentation deliverables

- **`docs/adr/0010-a-header-may-collapse-its-actions-on-a-phone.md`** — written, accepted
  2026-09-12. No further work.
- **`CONTEXT.md`** — the **Occasion** row, the **Who can see this list** row and rules 3 and 12 are
  **already edited** in the working tree, and rule 12's exception paragraph has been reflowed to the
  file's ~100-column convention. Ship them with the code; no further edit is wanted there.
- **`AGENTS.md`** — six places state the current behaviour and must be updated with the code:
  - `:75` the `hooks/` list gains `useMediaQuery`.
  - `:82` the `ActionBar.tsx` entry gains `collapseOnMobile` and a pointer to ADR 0010.
  - `:149` the `list-detail/` entry — `SharingSummary` no longer owns a Change control.
  - `:183` the `/lists/:id` routes-table row — the header's bar now holds five actions including
    `Sharing…`, and collapses below `md`.
  - `:295` and `:298` the sharing sections — "opened on a list by the header's **Change** control"
    becomes the header bar's `Sharing…`.
  - The `/occasions/:id` row and the occasion section should say the heading's family half is a link
    on this page and a plain prefix everywhere else.
- **No glossary entry** for the disclosure. "Action bar" was kept out of the term table by NEU-1322
  for the same reason: it is not a word the user meets.

## Tests

**`src/components/ActionBar.test.tsx`**
- `collapseOnMobile` absent → identical markup at both widths.
- Below `md` with the prop → one `Actions` button, `aria-expanded="false"`, no action buttons.
- One click → every action present, enabled, danger last, tones intact, `aria-expanded="true"`.
- Clicking an action leaves the panel open.
- A `pending` item disables every button in the open panel, and the panel's own trigger.
- At ≥ `md` with the prop → no trigger, all actions visible.

**`src/components/action-policy.test.tsx`** — the file that enforces rule 12, and it gains the
exception. Extend its docstring to say in English *why* the set is still the assertion: the
exception is mechanical, and a seventh site adopting it must fail this file.
- The four existing header cases and four row cases keep passing unchanged at the default (desktop)
  width.
- A **mobile case for each collapsing header**: the actions are behind a disclosure, the disclosure
  is not a glyph, and one interaction reaches every one of them.
- A **mobile case for the six non-collapsing sites**: every action is still visible with no prior
  interaction. This is the guard on the exception.
- `await screen.findByRole("heading", { level: 1, name: "Boone Family · Christmas 2026" })` becomes
  `"Boone Family Christmas 2026"`.
- The owner-header case's expected set gains `Sharing…`.

**`src/hooks/useMediaQuery.test.ts`** — new: reports the initial match, updates on a `change` event,
and unsubscribes on unmount.

**`src/test/`** — a viewport helper (`mockViewport("mobile" | "desktop")`) that redefines
`window.matchMedia` for one test and restores the `setup.ts` default afterwards, so the override is
one call rather than a stub rebuilt per file.

**`src/pages/OccasionDetail.test.tsx`** — NEU-1321's heading cases are the ones this ticket moves:
- The heading's accessible name is `Boone Family Christmas 2026`.
- The family half **is** a link, to `/people/families/7` — this is the exact inversion of NEU-1321's
  "the family half is not a link" case, which is deleted and replaced rather than left to rot.
- With the rename form open, the linked family is still present and the textbox value is
  `Christmas 2026`; a successful rename leaves it intact.
- An archived occasion shows the eyebrow, the name and the pill.
- `document.title` still carries the ` · `.
- The tabs, `?share=open`, the 403/404 arm and the organizer gates keep passing untouched.

**`src/pages/ListDetail.test.tsx`** — seven `getByRole("button", { name: "Change" })` queries at
`:122`, `:171`, `:476`, `:531`, `:734`, `:1750` and `:1781` become `"Sharing…"`. `:171`'s negative
assertion (a viewer has no sharing control) keeps its meaning and its shape.

**`src/pages/list-detail/SharingSummary`'s own coverage** — the summary, unshared and failed-fetch
sentences are asserted as before; anything asserting the `Change` button moves to `ListDetail`.

## Out of scope / deferred

- **Every other `ActionBar` call site.** Six of the eight keep byte-for-byte the behaviour ADR 0009
  shipped. A seventh adopting `collapseOnMobile` is a new decision and a new ADR.
- **`GiftsTab`, `ActionableBanner`, the admin pages, `FamilySettingsSection`, `SharedAccountCard`.**
  Outside rule 12 by NEU-1322's own reckoning, and outside this ticket by the same reckoning.
- **Stacking or collapsing anything on a **row**, at any width.** ADR 0010 forbids it.
- **A general responsive-layout pass.** `useMediaQuery` arrives for one consumer. It is not a licence
  to convert existing `md:` classes to JavaScript — CSS stays the default and this is the documented
  exception to it.
- **`OccasionSharingModal`'s heading, `MyShopping`, `BudgetLine`, the tab bar.** Still inside a page
  whose heading names the family (NEU-1321 out-of-scope list, unchanged).
- **`OccasionStrip`'s card.** It already renders the family as a subtitle and is not a heading.
- **A shared `occasionLabel()` formatter.** NEU-1321 decision 10 still stands; this ticket removes a
  call site rather than adding one.
- **Renaming `CreateList`'s `Choose…`.** Different surface, different default, deliberately
  different word.
- **Any backend change.** `family_name` and `family_id` are already on the detail payload.
