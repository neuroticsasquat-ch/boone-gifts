# NEU-1309 — The People filter and the `Remove` overflow menu

**Ticket:** [NEU-1309](https://linear.app/neuroticsasquatch/issue/NEU-1309/people-filter-and-the-remove-overflow-menu-frontend)
**Repo:** `boone-gifts-frontend`
**Story:** [NEU-1305](https://linear.app/neuroticsasquatch/issue/NEU-1305/i-can-find-someone-on-my-people-page) — "I can find someone on my People page"
**Milestone:** M3 — Scale
**Depends on, merged:** [NEU-1293](https://linear.app/neuroticsasquatch/issue/NEU-1293) `ConfirmDialog` (ADR 0008) · [NEU-1306](https://linear.app/neuroticsasquatch/issue/NEU-1306) `Modal`, `matchesFilter`, `NoMatches` · [NEU-1308](https://linear.app/neuroticsasquatch/issue/NEU-1308) `sharing-rows.tsx`
**Project spec:** `docs/specs/occasions-and-navigation-project-spec.md` §7.3, §9.4, §3
**Branch from and target:** `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

`/people` is two flat unsorted sections with no filter. The only search box on the page sits under
**Add** and is `GET /users/search` — it finds **strangers to connect to**, the opposite of what
someone with fifty connections needs. And `Remove` is a red button on every individual's row, firing
`removeMutation.mutate(conn.id)` on click with no confirmation, which on mobile makes *delete this
person* the most visually dominant element on a page whose job is to list people.

Three changes, all on `src/pages/People.tsx`:

1. **Filter-as-you-type** across both Families and Individuals, from one box.
2. **`Remove` moves off the row** into a `⋯` overflow menu.
3. **`Remove` gains a `ConfirmDialog`.**

**This narrows; it does not restructure.** Sections and headings stay. At ~50 connections and ~8
families a single filter box is the whole fix — splitting `/people` into separate pages would
re-fragment what the navigation project spent v0.4.0 collapsing into one place. The design point is
**anticipated, not observed** (§3): no user is near fifty connections today, nothing here bounds a
payload, and pagination stays out of scope.

**The `Add` panel is untouched.** `SendRequestForm`'s debounced `GET /users/search` box, its
dropdown, its keyboard handling and its by-email fallback are exactly as they are. Two text inputs
now exist on this page and they do opposite things; keeping them visually and positionally separate
is a requirement of this ticket, not an accident of layout.

### The confirm belongs to this ticket, not to M4's audit

Project spec §7.3's table and [NEU-1319](https://linear.app/neuroticsasquatch/issue/NEU-1319) (M4)
both list *Remove a connection → confirmed*, and NEU-1293 was explicitly forbidden from adding it.
NEU-1319's own description resolves the overlap: *"`Remove connection` may already be done by the M3
People ticket — check before duplicating; this ticket covers whatever remains."*

**This ticket owns remove-connection's confirmation.** NEU-1319 keeps the other six rows of the
audit table — archive losing its confirm, `Remove member`, `Leave Family`, and the rest — and must
not re-add this one. Nothing else in §7.3's table moves here.

## Decisions

### 1. The filter's text is component state, not URL-held

`const [filter, setFilter] = useState("")` in `People`, exactly as `SharingShell` holds its own.

`CONTEXT.md` rule 8 says a page's filter is URL-held `replace` state, and then carves out the
sharing modal's box: *"The rule stops at the dialog edge: a modal's own open-ness is URL-held view
state, but scratch input inside it — the sharing modal's filter box — is component state, because
nobody links to a half-typed filter and one write per keystroke can reach Safari's `replaceState`
throttle."*

Both halves of that rationale are about the input being **free text**, not about it being inside a
dialog: nobody links `/people?q=car` either, and a keystroke-rate `replaceState` throttles the same
on a page as in a modal. Every existing `replace`-mode call site holds an **enum** — `folder`,
`filter`, `sort`, `occasions` — where the URL carries a nameable view, and a free-text box has no
nameable view to carry.

`CONTEXT.md` is **not amended**. Rule 8's dialog-edge clause stays as written; this spec is where the
page-level case is recorded. If a third free-text filter appears, widening the clause to "scratch
input, wherever it renders" becomes worth doing with three call sites to shape it — the same
reasoning ADR 0008 applied to the `Modal` shell it declined to extract speculatively.

No ADR. This decides nothing the app's architecture turns on; ADR 0008 already governs the dialog and
rule 8 already governs the URL.

### 2. `HeaderMenu` is reused as-is

```tsx
<HeaderMenu
  ariaLabel={`Actions for ${conn.user.name}`}
  items={[{ label: "Remove", danger: true, onClick: () => setConfirming(true) }]}
  pending={pending}
/>
```

It is already a generic `⋯` trigger plus an item list with click-outside dismissal, and its
`ariaLabel` is per-instance *because* "a page may hold more than one" — fifty rows is the case that
comment anticipated. Critically, it already focuses the trigger **before** running the action:

> Focus goes back to `⋯` before the action runs, not after: choosing an item unmounts it, and an
> action that opens a `ConfirmDialog` captures whatever is focused at that moment as the element to
> restore to when the dialog closes. Without this the capture lands on `<body>` and the focus return
> is lost.

That comment was written for exactly this call site. A second row-sized menu component would
duplicate the open state, the click-outside listener, the focus return and the panel markup to
differ in trigger padding.

**Its doc comment widens** past "a page header's `⋯` menu" to say it is the app's one overflow menu,
whether in a header or on a row. **The file is not renamed** — `ActionMenu` would be the honester
name, but the rename touches four call sites and their tests in a ticket that otherwise opens none of
them, and a rename is cheap to do later and never gets harder.

**Individuals only.** A family row has no row-level action today — it is a `Link` to
`/people/families/:id` and nothing else — so a `⋯` there would mean inventing `Leave Family` on this
page, which is NEU-1319's row in the audit table. Families get the filter; they do not get a menu.

### 3. A `ConnectionRow` component owns the menu and the dialog

NEU-1293 set the precedent for row-scoped confirmations: *"`Folders.tsx` and `GiftsTab.tsx` confirm
against a specific row, so their state holds the id / gift rather than a boolean. In `GiftsTab` the
state belongs in the row component that owns the button."*

`ConnectionRow` holds `confirming`, renders the `Link`, the `⋯` and its own `<ConfirmDialog>`.
`People` keeps the mutation and passes `onRemove` and `pending` down — the mutation must stay at page
level because `invalidateConnections` invalidates four query keys and `removeMutation.variables` is
how a row knows the in-flight removal is *its own*.

At most one dialog is ever open, since only one `⋯` can be. The alternative — one dialog on `People`
holding `pendingRemove: Connection | null`, as `AdminUsers` does with its union — mounts one
component instead of N, but `AdminUsers` has two *actions* and one row, while this has one action and
N rows; the row is the thing that repeats, so the row is the thing to extract. It also gives the
Individuals list a component that can be tested without mounting the whole page.

### 4. The confirmation names the person and says what is lost

```
title:   `Remove ${conn.user.name}?`
body:    "You'll stop seeing each other's shared lists. You can send a new request later."
actions: [{ id: "remove", label: "Remove", tone: "danger" }]
```

`Cancel` is always rendered and never listed (ADR 0008).

Naming the person is the guard the confirmation exists to be: "Remove this connection?" is unambiguous
on a page acting on itself, and meaningless when it could be any of fifty rows reached through a `⋯`
the viewer may have mis-tapped. The body states the thing the row cannot: removal **cuts list
visibility in both directions**, which is why this action confirms at all under §7.3's rule (*confirm
where the action is irreversible or affects somebody else*). The second sentence keeps it from reading
as permanent — it isn't, and a confirmation that overstates its own stakes trains people to click
through.

It names **no gift, claim, count or claimer** — `CONTEXT.md` rule 2. There is nothing to name here:
the dialog is built from a connection's own name and two fixed sentences.

### 5. The filter box renders once either list is non-empty

Rendered when `families.data.length + connections.data.length > 0`.

A control that materialises at an invisible threshold is a control nobody learns, so there is no
count-based rule — but a filter box floating above *"You aren't connected to anyone yet"* and *"You
aren't in any families yet"* is chrome over nothing. Non-empty is the only threshold that is
self-evident from the page.

It sits **below `ActionableBanner` and the `Add` panel, directly above the `Families` heading** —
nothing between the control and the two sections it narrows. `ActionableBanner` keeps its current
position and its comment (*"anything awaiting a decision stays reachable while the two lists load"*),
and the filter stays away from `Add`'s stranger-search box, which it must not be mistaken for.

It is a plain `<input type="text">` with `aria-label="Filter people"` and `placeholder="Filter
people…"`, matching `SharingShell`'s label-doubles-as-placeholder shape. No debounce: the filter is a
client-side predicate over two arrays already in memory, and `SendRequestForm`'s 300 ms debounce
exists only because it fires a request.

### 6. `matchesFilter` and `NoMatches` are imported from `sharing-rows.tsx`

```tsx
const visibleFamilies = families.data.filter((f) => matchesFilter(filter, f.name));
const visibleConnections = connections.data.filter((c) =>
  matchesFilter(filter, c.user.name, c.user.email),
);
```

- **Individuals match on name and email.** Both are rendered on the row, and the sharing modal
  already matches this same population on both fields — typing `carol@` must not find Carol in one
  place and nobody in the other.
- **Families match on name alone.** `role` and `member_count` are facts about a family, not its
  identity, and nobody types "organizer" to find the Boones.

`sharing-rows.tsx` is imported from rather than being split into a neutral module. Its own doc
comment is the reason: *"`No lists match "zzz"` must read exactly like `No people match "zzz"` because
they are the same sentence about the same box."* That sentence now has a third caller, which makes
the shared module more load-bearing, not less. Renaming it — `components/filtering.tsx` — would be
honester about scope but rewrites imports in `SharingModal`, `OccasionSharingModal` and their tests
for no behaviour change; it can follow later, like the `HeaderMenu` rename.

### 7. Two emptinesses, said differently

| State | Families section | Individuals section |
|---|---|---|
| No filter, nothing to show | *"You aren't in any families yet. Use Add to create one."* (unchanged) | *"You aren't connected to anyone yet. Use Add to send a request."* (unchanged) |
| Filter active, no matches | `No families match "zzz"` | `No people match "zzz"` |

The existing empty states are **never** shown while the filter is non-empty, for the reason
`sharing-rows.tsx` already records: *"showing 'add a connection' to someone with forty of them is a
lie."*

**Headings always render**, in both sections, in both states — the M3 contract keeps them
(*"Sections and headings stay"*), and a section that vanishes when filtered gives no clue that the
filter is why.

The `NoMatches` nouns are `families` and `people`. "People" is the page's own word for a connection —
`CONTEXT.md` retired "connections" as a user-facing navigation label in M2 — even though the heading
above it reads `Individuals`, which distinguishes a person from a family within the page.

### 8. Error and pending arms are unchanged

`families.isError` and `connections.isError` keep their independent per-section messages, and are
unaffected by the filter. The combined `isPending` spinner arm is unchanged, filter box included —
it renders nothing to filter yet.

While a row's own removal is in flight, `pending` is `removeMutation.isPending &&
removeMutation.variables === conn.id` — the same predicate the red button uses today. It now feeds
both `HeaderMenu`'s `pending` (which disables `⋯`) and `ConfirmDialog`'s (which disables every
button, Cancel included, per ADR 0008), so the dialog stays open with the mutation visibly in flight
rather than closing optimistically. On success the row disappears with the invalidated query and the
dialog unmounts with it; on failure the existing `toast.error("Failed to remove connection.")` fires
and — because `removeMutation.isPending` goes false while `confirming` stays true — the dialog is
left standing and re-armed, which is the right place to be told it didn't work.

**The filter text is not reset** by a removal, by opening `Add`, or by anything else. It is scratch
input and it stays until the viewer changes it.

## Files

| File | Change |
|---|---|
| `src/pages/People.tsx` | Filter state + box; `visibleFamilies` / `visibleConnections`; `NoMatches` arms; new `ConnectionRow` replacing the inline `<li>`; the red `Remove` button deleted |
| `src/components/HeaderMenu.tsx` | Doc comment widened past "a page header's menu". No code change |
| `src/pages/People.test.tsx` | See below |

No new component files. No API change — `deleteConnection`, `getConnections` and `getFamilies` are
untouched, and nothing new is fetched.

## Tests

**Rewritten:** `People.test.tsx:286` *"removes a connection"* — it clicks the red button, which no
longer exists. It now opens `Actions for …`, chooses `Remove`, confirms, and asserts
`deleteConnection` was called with the connection's id.

**New:**

- Typing narrows **both** sections at once from one box.
- A family matches on name; a person matches on name **and** on email.
- The filter is case-insensitive and ignores surrounding whitespace (`matchesFilter` trims).
- A section with no matches shows `No families match "zzz"` / `No people match "zzz"`, **keeps its
  heading**, and does **not** show the "You aren't connected to anyone yet" empty state.
- With both lists empty and no filter, both original empty states still render and **no filter box
  does**.
- `Remove` is not reachable without opening the row's menu; choosing it opens a dialog naming that
  person; **Cancel leaves the connection in place** and calls no mutation.
- Confirming calls `deleteConnection` with that row's id.
- Focus returns to that row's `⋯` when the dialog closes — the behaviour `HeaderMenu`'s
  focus-before-action comment exists to protect, asserted rather than assumed.
- A failed removal toasts and leaves the dialog open.

**Kept green unchanged:** every `Add`-panel test (`hides both Add forms until Add is pressed`, the
four `SendRequestForm` cases, `creates a family…`), `renders pending requests with Accept/Decline`,
`keeps the actionable banner visible while the two lists load`, and `reports a failure to load either
section without hiding the other`.

## Out of scope / deferred

- **The rest of the confirm audit** — archive losing its confirm, `Remove member`, `Leave Family`,
  occasion archive. NEU-1319, M4. Only remove-connection moves here.
- **`ConnectionProfile`** (`/people/:id`) — derived client-side from the shared scope, and retiring
  `GET /connections/{id}/lists`. §9.4, M4.
- **Sorting either section.** The ticket asks for a filter. Two flat unsorted lists stay flat and
  unsorted; sorting is a separate argument about *which* order, and filtering is what fifty
  connections actually need.
- **Pagination or any bound on either payload.** §3 — not until a real user passes ~15 connections.
- **Renaming `HeaderMenu` → `ActionMenu`,** and **splitting `matchesFilter` / `NoMatches` out of
  `sharing-rows.tsx`.** Both are honest, both are pure churn in this ticket, both stay easy.
- **Amending `CONTEXT.md` rule 8.** Decision 1 records the page-level case here instead.
- **The `Add` panel** in every respect, including its own search box.

## Acceptance criteria

1. One filter box narrows **both** Families and Individuals as the viewer types, matching family
   name, person name and person email, case-insensitively.
2. A section with no matches keeps its heading and says `No families match "…"` / `No people match
   "…"`; the "you aren't connected to anyone yet" empty states never appear while the filter is set.
3. The filter box is absent when the viewer has no families and no connections, and present
   otherwise.
4. Filtering does not touch the URL, and one Back press from `/people` leaves the page regardless of
   what was typed.
5. `Remove` no longer renders on the row; it is reached through a `⋯` menu labelled for that person.
6. Choosing `Remove` opens a `ConfirmDialog` naming the person; cancelling removes nothing; Escape
   cancels and focus returns to that row's `⋯`.
7. Confirming removes the connection, and the invalidations on success are unchanged.
8. No action other than remove-connection gains or loses a confirmation in this ticket.
9. `Add`'s search box, dropdown, keyboard handling and by-email fallback behave exactly as before.
10. `task test` and `task lint` pass.

## Related documents

- [`docs/specs/occasions-and-navigation-project-spec.md`](occasions-and-navigation-project-spec.md) §7.3, §9.4, §3
- [ADR 0008 — Confirmation is one hand-rolled dialog](../adr/0008-confirmation-is-one-dialog.md) — governs the dialog; unchanged
- [`CONTEXT.md`](../../CONTEXT.md) rules 2 and 8 — both respected, neither amended
- [NEU-1293 spec](NEU-1293-confirmdialog-replaces-three-patterns.md) — the component, and the audit it deferred
- [NEU-1306 spec](NEU-1306-sharing-panel-becomes-a-modal.md) — `Modal`, `matchesFilter`, `NoMatches`
