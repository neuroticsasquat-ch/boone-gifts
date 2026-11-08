# NEU-1302 — History-aware back control and fallback table

**Ticket:** [NEU-1302](https://linear.app/neuroticsasquatch/issue/NEU-1302/history-aware-back-control-and-fallback-table-frontend)
**Repo:** `boone-gifts-frontend`
**Story:** [NEU-1297](https://linear.app/neuroticsasquatch/issue/NEU-1297/back-takes-me-where-i-came-from) — "Back takes me where I came from"
**Milestone:** M2 — Navigation
**Blocked by, merged:** [NEU-1301](https://linear.app/neuroticsasquatch/issue/NEU-1301/usesearchparamstate-and-url-held-view-state-frontend) — URL-held view state (PR 215, `e056c05`). Its `push`/`replace` split is the stated prerequisite: history-aware Back is worthless while going back loses your filters.
**Project spec:** `docs/specs/occasions-and-navigation-project-spec.md` §6.1, §6.2, §14 q3
**ADR:** [`docs/adr/0007-occasions-are-a-destination.md`](../adr/0007-occasions-are-a-destination.md)
**Branch from and target:** `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

Seven hardcoded back links, in seven phrasings, for four destinations. Enter a list from a folder or
an occasion and `← Back to lists` dumps you on `/lists`. Two of the phrasings — `← Back to
connections`, and the retired `families` wording — name a *section* of `/people` rather than a page,
and `CONTEXT.md` already forbids "connect" and "collect" as navigation words.

Replace all of them with one control:

- A `NavigationDepth` **context** counts in-app pushes for the session. React Router does not expose
  whether a history entry is in-app, which is why a counter exists rather than an inspection of
  `history.state`.
- **Depth > 0** → `navigate(-1)`, rendered as a plain `← Back`.
- **Depth 0** — a deep link, a new tab, an email — → the page's hardcoded parent, rendered with its
  **named** label.

The rule underneath: **a generic label that is always true beats a specific one that is sometimes a
lie.** This spec applies that to the `href` as well as the words (Decision 2) and to a family name
that has not loaded yet (Decision 7).

## The fallback table

One word per destination. `Lists` and `People` are the words `Layout.tsx`'s one `tabs` array already
uses, so the app has one name per section end to end.

| Page | Fallback | Label at depth 0 |
|---|---|---|
| `ListDetail` | `/lists` | `← Back to Lists` |
| `FolderDetail` | `/lists` | `← Back to Lists` |
| `ListsArchive` | `/lists` | `← Back to Lists` |
| `FamilyDetail` | `/people` | `← Back to People` |
| `ConnectionProfile` | `/people` | `← Back to People` |
| `OccasionDetail` | the family | `← Boone Family` |
| `FamilyArchive` | the family | `← Boone Family` |
| `NumericId` (invalid id) | per route | **unchanged** — keeps its own behaviour |

At depth > 0 every one of these renders `← Back`, the family rows included.

**"families" and "connections" are retired as navigation labels.** Both named a section of `/people`
rather than the page.

## What to change

| File | Change |
|---|---|
| `src/contexts/NavigationDepthContext.tsx` | **New.** `NavigationDepthProvider` + `useNavigationDepth()`. Counts `PUSH` +1, `POP` −1 clamped at 0, ignores `REPLACE`; resets to 0 when `user?.id` changes |
| `src/contexts/NavigationDepthContext.test.tsx` | **New.** The counting suite (Tests 1–6) |
| `src/components/BackControl.tsx` | **New.** The control, plus the exported `BACK_TO_LISTS` / `BACK_TO_PEOPLE` destination constants and the `backToFamily(id, name)` helper |
| `src/components/BackControl.test.tsx` | **New.** Element-by-depth, label-by-depth, the family placeholder |
| `src/routes.tsx` | Existing array becomes the `children` of one pathless root route whose element mounts the provider |
| `src/pages/ListDetail.tsx` | `:71` → `<BackControl fallback={BACK_TO_LISTS} />` |
| `src/pages/FolderDetail.tsx` | `:70` → same. The `// Folders have no index page` comment survives — it explains the destination, which has not changed |
| `src/pages/ListsArchive.tsx` | `:57` → same |
| `src/pages/FamilyDetail.tsx` | `:84` and the not-found arm at `:73` → `<BackControl fallback={BACK_TO_PEOPLE} />` |
| `src/pages/ConnectionProfile.tsx` | `:33` and the error arm at `:27` → same. Kills the last `connections` navigation label |
| `src/pages/OccasionDetail.tsx` | `:115` → `<BackControl fallback={backToFamily(...)} />`; the failure arm at `:71`, which has no family id, → `BACK_TO_PEOPLE` |
| `src/pages/FamilyArchive.tsx` | `:50` → `backToFamily(familyId, family.data?.name)` |
| `src/pages/FamilyDetail.test.tsx` | `:105`, `:121` rewritten for the new role-by-depth assertions |
| `src/pages/ListsArchive.test.tsx` | `:129` — `← Lists` becomes `← Back to Lists` |
| `src/pages/{ListDetail,FolderDetail,OccasionDetail,FamilyArchive}.test.tsx` | Gain the depth-0 and depth>0 cases for their row |
| `src/routes.test.tsx` | A push-then-Back case through the real route tree |
| `CONTEXT.md` | New rule 9; `connections`/`families` added to the forbidden navigation words |
| `AGENTS.md` | `## Navigation` gains the back-control paragraph and the fallback table |

`src/components/NumericId.tsx` is **not touched.** `src/pages/ForgotPassword.tsx`'s "Back to log in"
is not a page back control and is out of scope.

## Decisions

### 1. The counter is `PUSH` +1, `POP` −1 clamped at 0, `REPLACE` ignored

`useNavigationType()` is the whole mechanism. `REPLACE` being ignored is what makes NEU-1301's
replace-mode writes — every sort, filter, grouping and expansion — free: they add no history entry,
so they must not move the counter, and they don't.

`POP` fires for browser-**forward** as well as browser-back, so a forward after a back decrements
when it should increment. **Accepted.** The counter under-counts, never over-counts, and an
under-count renders the named fallback — which is still a true statement about where the control
goes. It self-heals on the next push. The alternatives (reading React Router's undocumented
`history.state.idx`, or running both mechanisms) buy accuracy in a case that already degrades safely,
at the cost of coupling to a private field whose silent absence would pin depth at 0 forever.

The counter does not increment on first render: the entry location is depth 0 by definition.

### 2. `<button>` at depth > 0, `<Link>` at depth 0

Each depth renders the element that tells the truth. At depth > 0 the control is an action with no
destination, so it is a `<button>`. At depth 0 it is a real address, so it is a `<Link to={fallback}>`
that cmd-clicks, right-clicks and shows a status bar like any link.

This is the ticket's own principle applied to the `href`. Always rendering a `<Link>` and intercepting
the click would mean that at depth > 0 the status bar and the context menu both state `/lists` while
activation goes somewhere else — a destination that is sometimes a lie. Always rendering a `<button>`
would give up open-in-new-tab at depth 0, the one case where a link is genuinely a link.

Consequence for tests: assertions ask for `role: "button"` or `role: "link"` by depth, not one role
throughout.

### 3. The provider mounts at the root of the route tree

`App.tsx` puts `AuthProvider` **above** `RouterProvider`, so a provider needing router hooks has to
live inside `routes.tsx`. The existing array becomes the `children` of one pathless root route:

```tsx
export const routes: RouteObject[] = [
  {
    element: <NavigationDepthProvider><Outlet /></NavigationDepthProvider>,
    children: [ /* everything that is there today, unchanged */ ],
  },
];
```

Root rather than inside `<Layout>`, because `family-invites/:token` sits outside `Layout` — arriving
at a family from an invite is an in-app push and has to count.

### 4. Depth resets to 0 when the identity changes

The same boundary that drops the query cache at `AuthContext.tsx:81`. Without it, after a logout and a
login on a shared device the counter still reads depth > 0 and Back navigates into the previous
session's address. The backend is always the gate, so that is an error arm rather than a leak — but
it contradicts the posture `CONTEXT.md` rule 2 takes about shared devices, and the fix is one
`useEffect` keyed on `user?.id`.

The login → `/lists` redirect is therefore not carried into the signed-in session: a freshly signed-in
user is at depth 0.

### 5. A hard reload resets depth to 0 — accepted

**This resolves project spec §14 open question 3.** After a reload the app genuinely does not know
whether the entry behind it is in-app, and `navigate(-1)` could land on a search engine — which would
break NEU-1297's "the back control never takes me off the site". The named parent is always true and
always inside the app.

Rejected: persisting the count in `sessionStorage` (survives a logout on a shared device, and drifts
from real history the moment it is stale — a counter that lies is worse than one that is
conservative); reading `history.state.idx` (see Decision 1).

This is specified behaviour with a test, not an accident: **Test 6.**

### 6. Destination constants, not seven string literals

```tsx
export const BACK_TO_LISTS  = { to: "/lists",  label: "Back to Lists"  } as const;
export const BACK_TO_PEOPLE = { to: "/people", label: "Back to People" } as const;
export function backToFamily(id: number, name: string | undefined) {
  return { to: `/people/families/${id}`, label: name ?? "Family" };
}
```

NEU-1297 asks that every destination be called one thing across the whole app. Seven literal strings
is exactly how the current seven phrasings happened; a shared constant means an eighth page that wants
a different word has to invent one rather than copy one.

Rejected: a table keyed by matched route, with `<BackControl />` taking no props. It is a truer single
source for the static five, but `OccasionDetail` and `FamilyArchive` need a family name that is not
known statically, so they need an escape hatch anyway — and then there are two mechanisms for one
table.

### 7. A family name that has not loaded reads `← Family`, and the link is already right

The destination is known before the name is: from the route on `FamilyArchive`, from the loaded
occasion on `OccasionDetail`. So the `<Link>` points at the correct family immediately and only the
word is pending; it swaps to `← Boone Family` when the name arrives, and **stays `← Family` if the
name fetch fails**. `FamilyArchive` already behaves this way (`:50`), with this word.

Rejected: showing `← Back to People` until the name arrives — the control would change destination
mid-render, so a viewer who clicks during the fetch lands somewhere different from one who waits,
which is the "sometimes a lie" failure this ticket exists to remove. Rejected: rendering nothing until
the name is known — NEU-1297 requires a deep-linked page to always have a back control, and a failed
name fetch would leave the page with none.

**`OccasionDetail`'s failure arm is the exception**, because there the occasion itself did not load
and there is no family id at all: that arm takes `BACK_TO_PEOPLE`.

### 8. The error and not-found arms get the control too

There are more link sites than the eight table rows. `FamilyDetail:73` (not found),
`ConnectionProfile:27` (error) and `OccasionDetail:71` (failure) each carry their own hardcoded link.
All three take `<BackControl>` with the same fallback as their page's main arm.

A reachability failure keeps its own arm (`CONTEXT.md` rule 7), but that arm still needs a way back,
and NEU-1297 asks that a back control return you where you came from. Arriving at a dead connection
from a list row, `← Back` returns you to the list rather than dumping you on `/people`. It is also
the last site of the retired word "connections".

Rejected: pinning the error arms to the fallback and never calling `navigate(-1)` — two behaviours for
one control, and the viewer is denied the page they were actually on.

### 9. `NumericId`'s invalid-id arm is unchanged

A **wrong address** is not a reachability failure (`CONTEXT.md` rule 7, ADR 0006): the page was never
asked for, and the arm deliberately offers one fixed way back with no retry, because retrying a
malformed address cannot help. It is also rendered *instead of* the page, so there is no page-level
back control to be consistent with. `sectionName()` already yields `Lists` and `People`, so its words
agree with the new table by construction.

### 10. `useNavigationDepth()` outside a provider is 0, and does not throw

No provider means depth 0, which renders the named link: always true, never leaves the site, and the
same thing a deep link gets. Every existing page test renders inside a bare `MemoryRouter`, so those
tests keep asserting a link with the named label and need no rewrite; the tests that exercise
`navigate(-1)` wrap deliberately.

This departs from `useNumericId`, which throws (`NumericId.tsx:19`). That hook throws because the
alternative was a silent `NaN` — a wrong answer that surfaced later, at the backend or in a spinner
that never stopped. Here the alternative is a correct, conservative answer, and the provider is at the
root of `routes.tsx`, so production cannot reach the default.

## `CONTEXT.md` edits

New **rule 9**:

> **Back follows how you arrived, and says so when it can't.** A page's back control returns you to
> the page you came from when the app knows you came from one, and renders as a plain `← Back`. When
> it doesn't — a deep link, a new tab, a reload — it goes to that page's one named parent and says
> its name. A generic label that is always true beats a specific one that is sometimes a lie, and the
> control never takes the viewer off the site. Every destination has one word: **Lists**, **People**,
> or the family's own name. A *wrong address* keeps its own fixed way back (rule 7) and is not
> history-aware, because the page it names was never asked for.

The forbidden-words paragraph gains `"connections"` and `"families"` **as navigation labels** — both
name a section of `/people` rather than the page, which is the same fault as "connect"/"collect".

## Acceptance criteria

1. Opening a list from a folder, an occasion or a person and pressing the page's back control returns
   you to **that** page, and the control reads `← Back`.
2. Landing on any of the seven pages from a deep link or a new tab gives a back control that names
   where it goes, per the fallback table.
3. The back control never navigates off the site.
4. Every destination is called one thing: `Lists`, `People`, or the family's name. No occurrence of
   `Back to lists`, `← Lists`, `Back to connections`, `Back to family` or `families` as a navigation
   label survives anywhere in `src/`.
5. A `replace`-mode URL write from NEU-1301 — sort, filter, grouping, `?occasions=all` — does not
   change what the back control does. A `push`-mode write — a tab, `?share=open` — does: one press
   returns to the previous tab.
6. After a hard reload the control reads its named fallback, not `← Back`.
7. After a logout and a login as another user, the control reads its named fallback.
8. At depth > 0 the control is a `button`; at depth 0 it is a `link` whose `href` is the fallback.
9. `NumericId`'s invalid-id arm is byte-for-byte unchanged, and `NumericId.test.tsx` passes untouched.
10. `task check` (lint, typecheck, tests) passes.

## Tests

**`NavigationDepthContext.test.tsx`**

1. A push raises depth to 1; a second push to 2.
2. A pop lowers it; two pops from depth 1 leave it at 0, not −1.
3. A `replace` navigation leaves it unchanged.
4. First render is depth 0.
5. Changing `user?.id` resets a non-zero depth to 0.
6. **A remount with no prior state — the reload case — is depth 0** (Decision 5, spec §14 q3).

**`BackControl.test.tsx`**

7. Depth 0 renders `role: "link"` with the fallback `href` and the named label.
8. Depth 1 renders `role: "button"` reading `← Back`, and clicking it calls `navigate(-1)`.
9. `backToFamily(3, undefined)` renders `← Family` with `href="/people/families/3"`; supplying the
   name renders `← Boone Family` at the same `href`.

**Per page**, reusing the existing `Address()` harness (`ListDetail.test.tsx:56`) and MSW fixtures —
for each of the seven rows: the deep-link case asserts the row's label and `href`; the arrived-from
case pushes into the page and asserts `← Back` returns to the pusher. `FamilyDetail`'s not-found arm,
`ConnectionProfile`'s error arm and `OccasionDetail`'s failure arm each get a deep-link case.

**`routes.test.tsx`**

10. Through the real route tree: `/lists` → push to `/lists/1` → the control is a button → press →
    back on `/lists`.

## Out of scope

- **The sharing modal's `?share=open`** and its Back-closes behaviour — M3, NEU-13xx. The `push` mode
  it needs already exists and this ticket's counter handles it for free.
- **`ForgotPassword`'s "Back to log in"** (`:39`, `:68`) — a flow step in an unauthenticated page, not
  a page back control, and outside the provider's useful range anyway.
- **A global back affordance in `Layout`.** The control stays per-page, because the fallback is
  per-page; `/lists` and `/people` are roots and get none.
- **Forward-navigation accuracy.** Decision 1 accepts the under-count; revisit only if a real user
  reports it, which requires them to press forward after back and notice a label rather than a
  behaviour change.
- **`NumericId`** (Decision 9).
