# NEU-1301 — `useSearchParamState` and URL-held view state

**Ticket:** [NEU-1301](https://linear.app/neuroticsasquatch/issue/NEU-1301/usesearchparamstate-and-url-held-view-state-frontend)
**Repo:** `boone-gifts-frontend`
**Story:** [NEU-1296](https://linear.app/neuroticsasquatch/issue/NEU-1296/my-place-in-a-list-survives-a-round-trip) — "My place in a list survives a round trip"
**Milestone:** M2 — Navigation
**Siblings, merged:** [NEU-1298](https://linear.app/neuroticsasquatch/issue/NEU-1298/occasion-strip-on-lists-frontend) — **built the base hook** and the strip's `?occasions=all` (PR 212, `8d353d6`); [NEU-1299](https://linear.app/neuroticsasquatch/issue/NEU-1299/occasion-and-folder-headings-link-person-headings-dont-frontend) (PR 213, `c256497`); [NEU-1300](https://linear.app/neuroticsasquatch/issue/NEU-1300/family-page-occasions-section-reduced-to-management-frontend) (PR 214, `01ce28f`)
**Blocks:** [NEU-1302](https://linear.app/neuroticsasquatch/issue/NEU-1302/history-aware-back-control-and-fallback-table-frontend) — history-aware Back. This ticket is its stated prerequisite.
**Project spec:** `docs/specs/occasions-and-navigation-project-spec.md` §6.3, §9.1–9.3, §13
**ADR:** [`docs/adr/0007-occasions-are-a-destination.md`](../adr/0007-occasions-are-a-destination.md)
**Branch from and target:** `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

`/lists`' Folder, Sort and Group by are component state. Set Group by to Person, open a list, press
Back — and you land on an unfiltered page. The tabs on `/occasions/:id` and `/folders/:id` have the
same problem and are additionally unlinkable: "My shopping for Christmas 2026" has no address.

The rule that fixes it is project spec §6.3: **is this a place, or a preference about where I already
am.** A tab is a place — linkable, Back-closable, so it `push`es. A sort order is not, and pushing it
makes Back mean "undo my last dropdown", so leaving a page you glanced at takes four presses.

### Scope observation: the hook already exists

The M2 contract names `useSearchParamState(key, { mode })` as this ticket's deliverable, but
NEU-1298 built it — at full width, with `mode` required, a 5-case suite, and the strip as its first
caller. Its spec says so directly: *"NEU-1301 becomes a conversion ticket: it moves `/lists`' Folder,
Sort and Group by, `/lists/:id`'s gift filter and sort, and `/occasions/:id` and `/folders/:id`'s tabs
onto the hook that already exists, and brings its own tests for those call sites."*

So this ticket is **the conversion, plus the two things the conversion turns up**: a typed decode
layer, because all five call sites are enums and the hook is string-valued (Decision 1), and a no-op
guard in the base hook, because `push` mode stacks an entry per click on an already-active tab
(Decision 5).

## What to change

| File | Change |
|---|---|
| `src/hooks/useSearchParamState.ts` | Base hook gains the unchanged-value no-op (Decision 5). **Signature unchanged.** Gains `useEnumSearchParam` (Decision 1) — same file, since it is the typed face of the same idea |
| `src/hooks/useSearchParamState.test.tsx` | Existing 5 cases keep passing untouched; gains the no-op cases and the `useEnumSearchParam` suite (decode, fallback, scrub, heal-replaces) |
| `src/pages/Lists.tsx` | `sortBy`, `folderId`, `groupBy` move off `useState`. `folderId` keeps its `number \| null` shape behind a validated adapter (Decision 3) |
| `src/pages/list-detail/GiftsTab.tsx` | `OwnerGifts.giftSort`, `ViewerGifts.giftFilter`, `ViewerGifts.giftSort` move off `useState`. Owner and viewer share the `sort` key — they are never mounted together |
| `src/pages/OccasionDetail.tsx` | `OccasionPage.tab` moves off `useState`, `push` mode |
| `src/pages/FolderDetail.tsx` | `FolderDetail.tab` moves off `useState`, `push` mode |
| `src/pages/Lists.test.tsx` | Gains the URL-state cases for this page |
| `src/pages/ListDetail.test.tsx` | Gains the gift filter/sort URL cases |
| `src/pages/OccasionDetail.test.tsx` | Gains the tab push/Back/deep-link cases |
| `src/pages/FolderDetail.test.tsx` | Gains the same three for the folder page |
| `CONTEXT.md` | New rule 8 (view state lives in the URL); the **Group by** row annotated |
| `AGENTS.md` | Routes table: the three detail rows note their query params |

No component's rendered output changes. `TabBar` is untouched — the guard is in the hook, not the bar
(Decision 5).

## The key set

| Route | Key | Mode | Values | Fallback |
|---|---|---|---|---|
| `/lists` | `folder` | `replace` | a folder id the viewer owns | absent = All lists |
| `/lists` | `sort` | `replace` | `updated` · `name` · `created` | `updated` |
| `/lists` | `group` | `replace` | `none` · `occasion` · `person` · `folder` | `none` |
| `/lists` | `occasions` | `replace` | `all` | absent — **shipped, untouched** |
| `/lists/:id` | `filter` | `replace` | `all` · `available` · `mine` | `all` — viewer view only |
| `/lists/:id` | `sort` | `replace` | `added` · `price_asc` · `price_desc` | `added` — both views |
| `/occasions/:id` | `tab` | `push` | `lists` · `shopping` | `lists` |
| `/folders/:id` | `tab` | `push` | `lists` · `shopping` | `lists` |

Names are short and **page-local**: `sort` means different things on `/lists` and `/lists/:id`, and
that is fine because a URL only ever carries one of them. This matches `?occasions=all`, which
shipped unqualified.

## Decisions

### 1. A typed wrapper, `useEnumSearchParam`, carries the decode

The base hook returns `string | null`. Every one of the five call sites wants *one of these literals,
else the default* — so the narrowing would otherwise be copied five times, and the bogus-value rule
(Decision 2) would have five places to go wrong.

```ts
function useEnumSearchParam<T extends string>(
  key: string,
  options: { mode: SearchParamMode; values: readonly T[]; fallback: T },
): [T, (value: T) => void];
```

- **Returns `T`, never `null`.** The call site gets a value it can switch on, with no cast.
- **The setter writes `null` for the fallback**, deleting the key. An unset preference leaves no trace
  in the URL — the base hook's existing rule, inherited rather than restated.
- `mode` stays required and un-defaulted, because that is the entire point of §6.3 and a wrapper that
  defaulted it would hand back the answer the call site is supposed to give.
- It lives in `useSearchParamState.ts` beside the hook it wraps. Two files would suggest two ideas.

The base hook stays exported and directly usable: `?occasions=all` is a presence flag rather than an
enum, and M3's `?share=open` will be the same shape.

### 2. An unrecognised value is scrubbed from the URL on mount

`/lists?sort=bogus` — a typo, a stale bookmark, a truncated share — renders the fallback. The key is
then **removed from the URL** by a replace-navigation, so what the address says and what the page
shows never disagree.

The alternative was to render the fallback and leave the junk in place, which is less code and one
fewer write on mount. It was rejected because a URL is the thing this whole ticket makes meaningful:
a viewer who bookmarks or re-shares the page would propagate the broken key onward, and the next
reader would have no way to tell that `sort=bogus` was already being ignored.

Not a toast. A wrong *address* is told to the viewer plainly (`CONTEXT.md` rule 7) because it names a
thing that does not exist; an unreadable *preference* just has a default, and announcing it would be
noise for a case nobody reaches deliberately.

### 3. The heal always replaces, whatever the key's mode

`/occasions/1?tab=bogus` is a `push`-mode key. Healing it with a push would leave the broken URL
*behind* the viewer: their first Back press returns to `?tab=bogus`, which heals, which pushes again —
a page you cannot leave by pressing Back.

**The rule: `mode` describes what happens when the viewer sets the value.** A mount-time scrub is not
the viewer setting anything; it is a correction to the entry they are already standing on. So it
replaces, in both modes, and the docstring says so in one sentence.

The alternative — only `replace`-mode keys heal — splits the two tab call sites off from the other
three for a reason no reader would guess, and lands the split exactly where §6.3 says the interesting
distinction *isn't*.

### 4. The folder filter is validated against the loaded folder list

`folder` is the odd one out: a number, whose valid values are not known until `getFolders()` resolves.
So it cannot be judged at mount the way `?sort=bogus` can, and `useEnumSearchParam` does not fit it.

Two stages:

1. **At mount, syntactically.** `?folder=abc`, `?folder=-1`, `?folder=0` are not positive integers and
   are treated as absent immediately — scrubbed, filter shows All lists. Same shape as `NumericId`'s
   rule for route ids (ADR 0006), applied to a param.
2. **Once `folders.data` arrives, semantically.** An id the viewer does not own falls back to All lists
   and the key is scrubbed. Until then the page is in its existing `sectionsPending` arm — `filtering`
   is true and `folderListIds` is null — which shows nothing rather than briefly showing everything.
   That arm already exists and needs no change.

Letting `GET /folders/999` 404 instead was rejected: `Lists.tsx` has no error arm for `selectedFolder`
today, because `folderId` could previously only come from the dropdown. A 404 there leaves `filtering`
true and `folderListIds` null forever, which renders **both sections empty with no explanation** — the
worst available outcome, and the one thing `CONTEXT.md` rule 3 says must never happen quietly.

Dropping `folder` from the URL entirely was rejected: the M2 contract names it, and it is the first
word of NEU-1296's first acceptance criterion.

### 5. The base hook no-ops on an unchanged value

`TabBar`'s `onSelect` fires on every click, the active tab included. In `push` mode that stacks a
history entry per click: three taps on "Lists" means three Back presses to leave the page — precisely
the disease §6.3 exists to prevent, and a direct contradiction of NEU-1296's second acceptance
criterion.

```ts
const setValue = useCallback((next: string | null) => {
  if (next === value) return;      // not a move; navigate nowhere
  setSearchParams(/* ... */);
}, [key, mode, value, setSearchParams]);
```

**It goes in the base hook, not the wrapper.** The signature NEU-1298 fixed is untouched — this is a
behaviour fix inside it — and every caller inherits it: the enum wrapper's five sites, the shipped
strip, and M3's `?share=open`, whose "Change" button has exactly the same double-click problem. A
guard in `TabBar` would fix the observed case and leave NEU-1306 to rediscover it.

It applies in `replace` mode too, where the only cost is a saved render. One rule, no exception.

### 6. `ListDetail`'s `panel` state is not touched

`ListDetail.tsx:41` holds `panel: "sharing" | "folders" | null`, sitting right next to the gift filter
and sort this ticket converts. It stays `useState`.

`?share=open` is in the M2 contract but assigned to **M3 / NEU-1306**, where `SharingPanel` stops
being an inline region and becomes a modal. Writing a URL contract now means NEU-1306 inherits one
written for a shape it replaces, and the "Back closes it" test belongs to a modal that does not exist
yet. The folder picker's open state is in no contract at all — §6.3 lists six call sites and that
would be a seventh.

### 7. Owner and viewer share the `sort` key

`GiftsTab` branches on `isOwner` and renders exactly one of `OwnerGifts` / `ViewerGifts`, so the two
sorts are never live at once. One key, one meaning per rendered page. Separate keys would mean a URL
carrying a param the current viewer's branch ignores — and the two share their option values anyway.

`filter` exists on the viewer branch alone. An owner arriving at `/lists/3?filter=mine` has an
unrecognised key for that page; it is left alone rather than scrubbed, because scrubbing is the
wrapper's job and no wrapper is mounted for a key nobody read.

### 8. Defaults are absent from the URL, including tabs

Setting a control back to its default deletes the key rather than writing `?sort=updated`. `/lists`
with no query string is the default view, and a viewer who changes nothing leaves no trace.

For the `push`-mode tabs this means Lists → My shopping → Lists produces three entries —
`/occasions/1`, `?tab=shopping`, `/occasions/1` — which is right: each was a move, and Back from the
last returns to My shopping. `/occasions/1` is already a link to the Lists tab, so nothing is lost in
linkability.

## `CONTEXT.md` edits

**New rule 8**, after rule 7:

> 8. **View state lives in the URL, and its mode says what kind of state it is.** A filter, a sort, a
>    grouping and an expansion are *preferences about a page you are already on*: they **replace**, so
>    one Back press leaves a page you glanced at. A tab and an open modal are *places you can be*:
>    they **push**, so they are linkable and Back closes them. Every call site states which — the mode
>    is required and never defaulted, because the wrong answer is felt only through the Back button,
>    where nobody looks. A value the URL carries but the app does not recognise is replaced by the
>    default and removed from the address, so what the link says and what the page shows never
>    disagree.

**Group by row**, gain a clause: *"…Off by default; every grouping keeps a 'Not in a …' bucket so
nothing vanishes; held in the URL as `?group=`, so it survives a round trip and can be shared."*

No new ADR. §6.3 is a spec-level rule that ADR 0007 already governs, and nothing here amends a
previous decision.

## Acceptance criteria

1. Filtering, sorting or grouping `/lists`, opening a list, and pressing Back returns the viewer to
   the view they left.
2. A filter, sort, grouping or gift-sort change **does not** grow the history stack — one Back press
   leaves the page.
3. A tab change **does** grow it by one, and Back returns to the previous tab.
4. A URL carrying a tab, filter, sort or grouping renders that exact view on load.
5. Clicking the already-active tab navigates nowhere and adds no history entry.
6. An unrecognised value for any key renders the default **and is removed from the URL**, by a
   replace in every mode — including `?tab=`.
7. `?folder=` naming a folder the viewer does not own, or a non-positive-integer, falls back to All
   lists and is scrubbed; neither leaves the page with two empty sections.
8. `useSearchParamState` keeps the signature NEU-1298 fixed, and its five existing tests pass
   unchanged.
9. `?occasions=all` and the strip's behaviour are unchanged.
10. `mode` is still required at every call site — passing only a key does not typecheck.
11. No rendered output changes anywhere: the conversion is invisible except through the URL and the
    Back button.

## Tests

**`src/hooks/useSearchParamState.test.tsx`** — existing five unchanged, plus:

- Setting the value it already holds navigates nowhere: assert the history length is unmoved in
  `push` mode and that no re-render/`setSearchParams` occurs.
- `useEnumSearchParam` returns the URL's value when it is one of `values`.
- It returns `fallback` when the key is absent, and when the value is not in `values`.
- The unrecognised value is **scrubbed**: after mount the search string no longer carries the key.
- The scrub **replaces in `push` mode**: mount at `/occasions/1?tab=bogus` from a prior entry, and one
  Back press reaches the prior entry — not the bogus URL.
- Its setter writes `null` for `fallback`, leaving no key behind.

**`src/pages/Lists.test.tsx`**

- Choosing a sort, then `navigate(-1)`, leaves `/lists` rather than unsetting the sort.
- Mounting at `/lists?group=occasion` renders the occasion headings with no interaction.
- Mounting at `/lists?folder=<owned id>` narrows both sections to that folder.
- `/lists?folder=999` (not owned) renders All lists, both sections populated, and the key gone.
- `/lists?folder=abc` is treated as absent at mount.
- `/lists?sort=bogus` renders Most recent and the key is gone.

**`src/pages/ListDetail.test.tsx`**

- Viewer view: `/lists/3?filter=available` hides claimed gifts on load.
- Owner view: `/lists/3?sort=price_asc` orders on load, with no `filter` control present.
- Changing the gift sort does not grow history.

**`src/pages/OccasionDetail.test.tsx`** and **`src/pages/FolderDetail.test.tsx`** — the same three each:

- `?tab=shopping` renders **My shopping** on load.
- Clicking **My shopping** then Back returns to the Lists tab.
- Clicking the already-active tab, then Back, leaves the page.

Run in the container: `task test`. CI also runs `npx oxlint` in a clean node environment — push and
confirm a fresh run before declaring done (`AGENTS.md`).

## Out of scope

- **`?share=open` and the sharing modal** — NEU-1306 (M3), where `SharingPanel` becomes a modal.
  `ListDetail`'s `panel` state is untouched here (Decision 6).
- **The folder picker's open state** — in no contract.
- **`NavigationDepth`, the `← Back` control and the fallback table** — NEU-1302, which this unblocks.
  This ticket creates the pushes that counter will count and nothing more.
- **Project spec §14 open question 3** (depth across a reload) — explicitly the back-link ticket's.
- **Persisting a preference beyond the URL** (localStorage, per-user defaults). The URL is the whole
  mechanism; a preference that outlives the link is a different feature nobody has asked for.
- **A codec for non-string values.** All eight keys are string-shaped; `folder`'s integer parse is
  a two-stage check at one call site (Decision 4), not a general facility.
