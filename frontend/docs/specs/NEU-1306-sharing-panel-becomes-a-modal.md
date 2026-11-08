# NEU-1306 — The sharing panel becomes a modal with one filter

**Ticket:** [NEU-1306](https://linear.app/neuroticsasquatch/issue/NEU-1306/sharing-panel-becomes-a-modal-with-one-filter-frontend)
**Repo:** `boone-gifts-frontend`
**Story:** [NEU-1303](https://linear.app/neuroticsasquatch/issue/NEU-1303/i-can-find-the-person-or-family-i-want-to-share-with) — "I can find the person or family I want to share with"
**Milestone:** M3 — Scale
**Blocks:** [NEU-1307](https://linear.app/neuroticsasquatch/issue/NEU-1307) (`CreateList` reuses the modal), [NEU-1308](https://linear.app/neuroticsasquatch/issue/NEU-1308) (occasion mode)
**Depends on, merged:** [NEU-1293](https://linear.app/neuroticsasquatch/issue/NEU-1293) `ConfirmDialog` (ADR 0008) · [NEU-1301](https://linear.app/neuroticsasquatch/issue/NEU-1301) `useSearchParamState` · [NEU-1302](https://linear.app/neuroticsasquatch/issue/NEU-1302) `NavigationDepth` (`d2d4db3`) · [NEU-1285](https://linear.app/neuroticsasquatch/issue/NEU-1285) `member_ids` on share targets
**Project spec:** `docs/specs/occasions-and-navigation-project-spec.md` §7.1, §6.3, §3
**ADR:** [`docs/adr/0008-confirmation-is-one-dialog.md`](../adr/0008-confirmation-is-one-dialog.md) — amended by this ticket
**Branch from and target:** `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

`SharingPanel` is a flat wall. Every family, then every connection, no filter, rendered as an inline
`<section>` **above** the gifts so it pushes the list's own content down the page. At the ~50
connections and ~8 families this milestone is designed for it is unusable — and the design point is
**anticipated, not observed**: no user is near it today, and nothing here bounds a payload.

It becomes a **modal** with **one filter box across both sections**, a **"Shared with …" summary
line**, and an address — `?share=open` — so the mobile back gesture closes it rather than navigating
away.

Someone typing "boone" does not know or care whether Boone is a family or a surname, and one box
answers both. Two boxes would double the chrome in a dialog already dense with occasion dropdowns and
disabled-with-reason rows.

**This ticket moves and filters. It does not change what sharing means.** `coveringFamilies`,
`occasionChoice`, `sharedOccasionOf`, the 409 handling on both mutations, and every disabled-row rule
are carried over unchanged. `CONTEXT.md` rule 6's other half is likewise unchanged: the disabled
state applies only to an **unticked** box — a direct share already made stays live and revokable,
because this modal is the only place to revoke one.

### One correction to the ticket description

The ticket asks that "the revoke-a-share confirmation currently nested inside the panel becomes a
`ConfirmDialog` rather than a second hand-rolled dialog inside the first." **That already happened.**
NEU-1293 migrated `RevokeClaimsDialog` to `ConfirmDialog` and kept it as a thin wrapper, exactly as
ADR 0008 describes. Its wording is already unchanged and already names no gifts, claimers or counts
(`CONTEXT.md` rule 2).

What is genuinely new is that the panel around it is now *also* a modal, so two dialogs stack — which
today's implementation gets wrong (Decision 2).

## Acceptance criteria

1. The sharing control renders as `role="dialog"`, `aria-modal="true"`, over the page. The gifts are
   no longer pushed down by it.
2. Opening it pushes `?share=open`. The browser/mobile **Back** gesture closes it and leaves the
   viewer on the list.
3. `Done`, `Escape`, a backdrop click and Back all close it the same way, and none of them leaves an
   entry that reopens it on the next Back press.
4. One filter box narrows **both** sections at once, matching family name, person name and person
   email, case-insensitively.
5. A row the filter matches still renders **when it is disabled**, greyed, **with its reason** — a
   family with no active occasion, and a person a live occasion share already reaches.
6. A "Shared with …" line states what is ticked without the viewer reading every checkbox.
7. A revoke that hits a 409 opens the `ConfirmDialog` **on top of** the sharing modal: Escape closes
   the confirm and leaves the sharing modal standing, and Tab cycles within the confirm.
8. The filter box, the summary line and `Done` stay in reach when the list is long enough to scroll.
9. Every behaviour the panel has today — the occasion select, the needs-a-choice message, the
   archived-occasion 409 toast, the synthesised `User 42` row, the coverage disable — still holds.

## Decisions

### 1. A `<Modal>` shell is extracted, and `ConfirmDialog` is rebuilt on it

`components/Modal.tsx` owns the backdrop, the z-index, `role="dialog"`/`aria-modal`, the focus trap,
Escape, and focus return. `ConfirmDialog` becomes `Modal` + title/body/actions. `SharingModal`
composes `Modal` directly.

ADR 0008 rejected exactly this shell in NEU-1293, and said why it was rejecting it *for now*:

> A `<Modal>` shell with `<ConfirmDialog>` built on top […] Rejected because it leaves a bespoke
> dialog body in the codebase — the thing this ticket exists to remove — and because a shell
> primitive designed against one caller is a guess. **If M3's sharing modal wants one, it can be
> extracted then, with two callers to shape it.**

It does, and there are now two callers. Hand-rolling a second backdrop and trap in `SharingModal`
would recreate precisely the duplication ADR 0008 existed to remove, and NEU-1308 and NEU-1309 would
inherit it.

Widening `ConfirmDialog` itself instead — a rich `body` with the action row suppressed — was
rejected: it would make a confirmation component the app's general modal, and "Cancel is always
rendered and never listed here" would stop being true.

### 2. Stacked modals: topmost-only, via a registry in `Modal`

Two `Modal`s are mounted at once whenever a revoke needs confirming. Today's implementation breaks
both ways:

- **Escape resolves both.** Each dialog attaches its own `keydown` listener to `document`.
- **The outer trap fights the inner one.** The Tab handler's check is
  `!panelRef.current?.contains(active)`; focus sitting inside the *inner* dialog fails that test, so
  the outer modal yanks focus back to its own first tabbable on the first Tab.

A module-level stack in `Modal.tsx`: each open modal pushes a token on mount and removes it on
unmount; both the Escape handler and the Tab trap return early unless the token is last in the stack.
~12 lines, self-contained, and every future stacking pair inherits it.

Rejected: making the revoke *replace* the sharing modal's body — it would stop being a `ConfirmDialog`
call site, which is the thing NEU-1293 just standardised. Rejected: closing the sharing modal before
confirming — the owner loses their place and their filter text mid-decision, and reopening costs a
second history entry.

### 3. Closing pops; it never pushes

A modal is not a tab. The two existing `push` call sites are tabs, where re-pushing on every click is
correct. Here, opening pushes `?share=open`, so a close that writes `setShare(null)` through the
push-mode hook would add *another* entry — and a viewer who pressed `Done` and then Back would get
the modal **reopened** instead of leaving the page.

One close path, depth-aware, mirroring `BackControl`:

- `useNavigationDepth() > 0` → `navigate(-1)`. The app pushed the open entry, so popping lands exactly
  where the viewer was.
- Depth `0` — a deep link straight to `/lists/1?share=open` — → a **replace** that strips `?share`.

`CONTEXT.md` rule 9 already states this rule for the page's back control; the app now has one answer
for "undo a push".

Rejected: always replace-stripping. It duplicates the pre-open entry, so the first Back after closing
is a press that visibly does nothing — the exact complaint rule 8 raises about the wrong mode.
Rejected: dropping Escape and backdrop close — an accessibility regression against the trap
`ConfirmDialog` just gained, and `Done` has the same problem anyway.

### 4. The filter matches on name; **disabled is not a filter criterion**

"The filter must not hide disabled rows" has a literal reading that defeats the feature: if a disabled
row is never removed, then at 8 families and 20 covered people the list never gets short, and there
was no point filtering.

The contract is the narrow one. **One predicate, applied identically to every row.** A disabled row
is never *specially* dropped and never *specially* kept. "Why can't I share with Gran?" is answered by
typing "gran" and seeing Gran, greyed, with the reason — which is what `CONTEXT.md` rule 6 exists to
answer.

```
query = "boone"

  The Boones     [x] Christmas 2026
  Gran Boone     [ ] disabled — "Already sees this through The Boones"
  (Work Friends — no match, dropped)
  (Alice         — no match, dropped)
```

Rejected: appending a "4 more you can't share with yet" count per section. Belt and braces, at the
cost of new chrome in a dialog the milestone itself calls dense.

### 5. It matches family name, person name and person email

Case-insensitive substring, trimmed. A person's email is rendered on the row, so a viewer typing what
they can see should find it, and it is what separates two people called Chris.

**Occasion names are not matched.** An occasion is not the row's identity, the `<select>` already
lists them, and a family row matching on text inside a collapsed control the viewer cannot see is
worse than one that does not appear at all.

A synthesised `User 42` row has no email and matches on that name alone.

### 6. Headings always render; no-match is worded apart from no-data

Two emptinesses, kept apart:

| Case | Wording |
|---|---|
| No data | `You don't belong to any families yet.` → Go to People · `You don't have any connections yet.` → Add a connection |
| No matches | `No families match "zzz"` · `No people match "zzz"` |

Showing "add a connection" to someone with forty of them would be a lie. Both section headings stay
while filtering, each with its own no-match line, so a viewer whose query matched three families and
no people can see which population came up empty rather than guessing — and the dialog does not jump
as headings appear and vanish under the cursor.

**The filter box renders unconditionally.** A control that appears once you cross some row count is a
control nobody learns.

### 7. "Shared with N" counts the ticked boxes, named by unit

> Shared with 2 families and 1 person

Pluralised per unit; single units read `Shared with 1 family` / `Shared with 3 people`. The zero case
reuses the sentence `SharingSummary` already says: **`This list isn't shared with anyone.`**

The milestone's stated purpose is "so the state is legible **without reading every checkbox**" — that
is a question about what is ticked, and this answers it directly. It needs no reach arithmetic, cannot
drift when family membership changes underneath it, and stays truthful when the share-targets fetch
fails.

A true headcount **was** available and was rejected: `member_ids` is every member of the family,
owner included (NEU-1285 decision 3), so reach is computable as direct shares ∪ members of every
family with a `shared` occasion, minus the owner. But it would count people the owner has never met
and cannot name, it moves when someone joins a family without the owner touching anything, and it
would have to include occasions archived *after* their share — archiving withdraws nothing — which is
a subtlety easy to get silently wrong.

The header's `SharingSummary` already **names** everyone ("Shared with Boone Family · Christmas 2026,
Jane"); it is behind the modal and unreadable while the modal is open. It names; the modal counts.

### 8. Lift the reads; leave the writes where they are

`SharingModal` owns the three queries (`shares`, `connections`, `share-targets`) and the filter text,
and passes data plus the filter down. The two sections keep their own mutations and render their own
loading and error arms from lifted state.

The filter spans both sections and the summary needs both halves, so one source beats three components
re-deriving "what is this list shared to" — the disagreement `ListAttribution` was pulled out in
NEU-1291 to end.

**The write seam stays unwritten.** NEU-1307 needs more than lifted reads: `CreateList` has no
`listId`, so it cannot write on toggle and must hold selections locally until submit. Designing that
controlled/draft API today, against a caller that does not exist, is the same guess ADR 0008 declined
to make about `Modal` — and NEU-1308's population (*lists the viewer owns*) is a different query,
different rows and a different write, so today's guess about a shared adapter is likely the wrong
shape.

### 9. Sharing leaves the panel slot; `FolderPicker` stays inline

`ListDetail` holds `panel: "sharing" | "folders" | null`, justified by "one header panel at a time —
both open in the same slot under the header, and two of them stacked there would bury the gifts."
Once sharing is a modal it is not in that slot, and the invariant has no reason left.

`panel` collapses to a `foldersOpen` boolean. The two controls stop knowing about each other: sharing
lives in the URL, folders in component state. Opening the modal over an open folder panel is harmless
— the modal covers it, and closing returns the viewer exactly where they were.

`FolderPicker` is **not** modalised here. It is reached by owner and viewer alike, and would want its
own `?folder=open` decision, its own filter question at the same scale, and its own tests. No ticket
asks for it.

### 10. `?share=open` is read as an enum, and healed two ways

```ts
useEnumSearchParam("share", { mode: "push", values: ["open", "closed"], fallback: "closed" })
```

`?share=banana` heals away for free through the hook's existing mount-time scrub, and setting
`closed` writes `null`, so a shut modal leaves no trace in the address.

Separately: the modal is **owner-only**, but `/lists/1?share=open` can be pasted by anyone, and
ownership is not known until the list query resolves. Once it does and the viewer is not the owner,
**replace-strip `?share`** so the address and the page agree (`CONTEXT.md` rule 8). A non-owner never
mounts the modal — only the strip.

The base hook was rejected for this: its heal lives only on the enum wrapper, so `?share=banana` would
sit in the address forever with the modal shut.

### 11. The filter text is local state, and rule 8 says why

Rule 8 reads "a filter, a sort, a grouping and an expansion are preferences about a page you are
already on: they **replace**". Read literally, this filter belongs in the URL as `?share=open&q=boone`.

It does not. The modal's own open-ness is already the URL-held state; the filter is scratch input
inside a dialog that pops out of existence, and nobody links to a half-typed filter. There is also a
concrete ceiling: Safari throttles `replaceState` to roughly 100 calls per 30 seconds, and one write
per keystroke in a 50-connection list can reach it.

This is a genuine exception to a stated rule, so **`CONTEXT.md` rule 8 gains a sentence** drawing the
line at the dialog edge, rather than the code quietly disagreeing with the doc.

No debounce — ~58 rows filter synchronously.

### 12. ADR 0008 is amended in place

A dated **Amendment — NEU-1306** section on `docs/adr/0008-confirmation-is-one-dialog.md`: the
deferred `<Modal>` extraction came due because the second caller arrived, `ConfirmDialog` now composes
the shell, and stacking is resolved topmost-only. The rejected alternative becomes a *deferred* one
that came due — the honest story, and it keeps one document answering "how do dialogs work here".
ADR 0007 already sets the precedent by amending ADR 0005.

A reader landing on 0008 must not find a rejection that is no longer true.

### 13. `components/SharingModal.tsx`, with a fixed header and footer

**It moves and is renamed in this ticket.** Reuse is a committed M3 contract — "the sharing control
becomes one component that both the list page and New List use" — unlike the *API shape*, which
Decision 8 deferred. A file under `pages/list-detail/` that `CreateList` imports is a lie about
ownership, and moving now makes NEU-1307 a pure addition rather than a move plus an addition, keeping
that review about behaviour.

"Panel" is retired: the ticket, the milestone and the spec all say modal.

**Layout.** `ConfirmDialog` is `max-w-md`, centred, content-sized — right for two sentences and three
buttons, wrong for 8 family rows and ~50 person rows. `Modal` takes a `size` prop so `ConfirmDialog`
keeps its current shape untouched, and `SharingModal` gets a column:

```
┌────────────────────────┐
│ Who can see this list  │  fixed
│ [ filter…            ] │  fixed
│ Shared with 2 families │  fixed
│────────────────────────│
│ Families               │
│   ☐ The Boones     ▕█▕ │  scrolls
│ People                 │
│   ☐ Alice          ▕ ▕ │
│────────────────────────│
│                 [Done] │  fixed
└────────────────────────┘
```

`max-h-[85vh]`, `max-w-lg` on desktop; effectively the whole viewport on small screens, because a
centred card holding 50 rows on a phone is a card-shaped scroll area inside a scrollable page.

**No virtualisation and no pagination.** Explicitly out of scope until a real user passes ~15
connections (project spec §3, milestone M3).

## Smaller calls

- **Focus on open** lands on the filter input. `Modal` keeps `ConfirmDialog`'s existing "first
  tabbable element" rule, and the filter is first in the markup — so this falls out rather than
  needing an `autoFocus` prop.
- **Close affordances:** `Done` in the footer, Escape, backdrop click, Back. No separate `✕`.
- **`SharingSummary` is untouched** except that `Change` now pushes `?share=open` instead of toggling
  component state. Its wording stays.
- The accessible name moves from `aria-label` on a `<section>` to `aria-labelledby` on the dialog
  title; the title text `Who can see this list` is unchanged.

## What to change

| File | Change |
|---|---|
| `src/components/Modal.tsx` | **New.** Backdrop, z-index, `role="dialog"`/`aria-modal`, focus trap, Escape, focus return, `size` prop, topmost-only stack registry |
| `src/components/ConfirmDialog.tsx` | Composes `Modal`; keeps its `actions`/`pending`/`onResolve` API and its `max-w-md` shape verbatim |
| `src/components/SharingModal.tsx` | Moved from `pages/list-detail/SharingPanel.tsx` and renamed. Owns the three queries and the filter text; adds the filter box, the summary line, the fixed header/footer layout. Sections become `FamiliesSection`/`PeopleSection` taking data + filter, keeping their mutations |
| `src/pages/ListDetail.tsx` | `panel` → `foldersOpen`; `useEnumSearchParam("share", …)`; the depth-aware close; the non-owner replace-strip |
| `src/pages/list-detail/SharingSummary.tsx` | `Change` opens via the URL |
| `src/components/Modal.test.tsx` | **New.** Trap, Escape, focus return, and the stacking rule |
| `src/components/SharingModal.test.tsx` | Moved from `pages/list-detail/SharingPanel.test.tsx`; `getByRole("region", …)` → `getByRole("dialog", …)`; new filter, summary and stacking cases |
| `src/pages/ListDetail.test.tsx` | Same role change; `?share=open` push/pop cases at both depths |
| `src/components/ConfirmDialog.test.tsx` | Unchanged assertions — they are the regression guard for the refactor |
| `docs/adr/0008-confirmation-is-one-dialog.md` | Amendment — NEU-1306 |
| `CONTEXT.md` | Rule 8 gains the dialog-scratch-state sentence; a vocabulary row for the sharing modal |
| `AGENTS.md` | Component table gains `Modal` and `SharingModal`; the `list-detail/` line loses `SharingPanel` |

## Tests

Beyond carrying the existing suite across the rename:

- **Rule 6 under filter** (the assertion the ticket asks for by name): filter to a term matching only
  a family with no active occasion and only a person a live occasion share covers — **both still
  render, greyed, with their reasons**.
- **Filter spans both sections** from one box, and matches a person by email.
- **No-match wording** is distinct from no-data wording, per section.
- **Summary line** at zero, one and several of each unit.
- **Stacking:** with the revoke `ConfirmDialog` open over the modal, Escape closes the confirm and the
  sharing modal is still on screen; Tab cycles inside the confirm.
- **Close semantics:** at depth > 0, `Done` returns to the list and a subsequent Back leaves the page
  rather than reopening the modal; at depth 0, closing strips `?share` without navigating.
- **Healing:** `?share=banana` is removed from the address; a non-owner's `?share=open` is stripped
  once the list resolves and no dialog mounts.

## Out of scope

| Deferred | Owner |
|---|---|
| **Occasion mode** — occasion fixed, filtered to lists the viewer owns (project spec §7.1's last bullet, §5.4). No `mode` prop, no switch, no placeholder branch is added here | [NEU-1308](https://linear.app/neuroticsasquatch/issue/NEU-1308) |
| **`CreateList` reuse**, the people picker it has never had, and **nothing pre-checked** — the project's one user-visible behaviour change. The controlled/draft write seam is designed there | [NEU-1307](https://linear.app/neuroticsasquatch/issue/NEU-1307) |
| **People page filter** and the `Remove` overflow menu | [NEU-1309](https://linear.app/neuroticsasquatch/issue/NEU-1309) |
| **The confirmation audit** — which actions confirm and which stop | [NEU-1319](https://linear.app/neuroticsasquatch/issue/NEU-1319) |
| **Modalising `FolderPicker`** — no ticket asks for it (Decision 9) | — |
| **Pagination and virtualisation** — until a real user passes ~15 connections (project spec §3) | — |
