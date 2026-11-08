# NEU-1308 — Occasion mode for the sharing modal, and the empty-occasion CTA

**Ticket:** [NEU-1308](https://linear.app/neuroticsasquatch/issue/NEU-1308/occasion-mode-for-the-sharing-modal-and-the-empty-occasion-cta)
**Repo:** `boone-gifts-frontend`
**Story:** [NEU-1304](https://linear.app/neuroticsasquatch/issue/NEU-1304/i-can-share-a-list-into-an-occasion-from-the-occasion) — "I can share a list into an occasion from the occasion"
**Milestone:** M3 — Scale
**Depends on, merged:** [NEU-1306](https://linear.app/neuroticsasquatch/issue/NEU-1306) `SharingModal`, `Modal` · [NEU-1307](https://linear.app/neuroticsasquatch/issue/NEU-1307) the controlled sections and the two containers · [NEU-1298](https://linear.app/neuroticsasquatch/issue/NEU-1298) the occasion strip and its body slot · [NEU-1301](https://linear.app/neuroticsasquatch/issue/NEU-1301) `useSearchParamState` · [NEU-1302](https://linear.app/neuroticsasquatch/issue/NEU-1302) `NavigationDepth`
**Project spec:** `docs/specs/occasions-and-navigation-project-spec.md` §5.4, §7.1, §9.2
**ADR:** [`docs/adr/0007-occasions-are-a-destination.md`](../adr/0007-occasions-are-a-destination.md) — the argument this ticket completes. ADR 0008 is **not** amended: `Modal` is unchanged
**Branch from and target:** `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

Every sharing flow in the app starts from a **list**: open it, open its modal, find the family, pick
the occasion. There is no way to start from the occasion. So `/occasions/:id` — the page ADR 0007
argued was worth reaching, the one holding the budget and the shopping tab — says
"No lists are shared to this occasion yet." and offers nothing, and the empty card in the `/lists`
strip says "No lists yet" and links nowhere. A dead end on the one page whose whole purpose is
collecting lists.

This ticket adds the **second mode**: the occasion is fixed and the **list** is chosen, the reverse
of every existing flow. Filtered to lists the viewer owns. Each selection is a
`PUT /lists/{list_id}/occasions/{occasion_id}` — the endpoint already exists and is `OwnedList`-gated,
so there is **no new endpoint and no new authorization**: a member can only offer lists they own.

**Consequence worth stating once:** this puts a write control on an occasion card any member can see,
not just an organizer. That is consistent — sharing your own list into an occasion was never an
organizer power, and the gate that enforces it is the same one that always did.

Sharing to an **archived** occasion stays refused, unchanged (Decision 7).

NEU-1306 and NEU-1307 both deferred this ticket by name and both refused to anticipate it:

> NEU-1308's population (*lists the viewer owns*) is a different query, different rows and a different
> write, so today's guess about a shared adapter is likely the wrong shape. — NEU-1306, Decision 8

That refusal was correct and this spec does not undo it: **no third arm is added to NEU-1307's
`SharingSelection` seam** (Decision 11). What is shared is the *chrome*, not the selection model.

## Acceptance criteria

1. From an occasion with **no lists**, the viewer can share one of their own lists into it without
   leaving the page — from `/occasions/:id`'s Lists tab **and** from the empty card in the `/lists`
   strip.
2. The same is possible from an occasion that **already has lists**, through a control on the Lists
   tab. *(Story NEU-1304's second criterion, which the ticket description does not name.)*
3. Only lists the viewer **owns** are offered, and archived lists are not among them.
4. A list already shared to this occasion is **listed, ticked, dead, with the reason** — it is never
   silently absent, and unticking it here does nothing.
5. Ticking a live row shares immediately: one `PUT /lists/{list_id}/occasions/{occasion_id}`, no Save
   step, and `Done` only closes.
6. After a successful share the occasion's Lists tab, the strip's card and the list's own row all
   show it without a manual reload.
7. Opening from `/lists` pushes `?share=<occasionId>`; opening from `/occasions/:id` pushes
   `?share=open`. `Done`, `Escape`, a backdrop click and **Back** all close it the same way, and none
   of them leaves an entry that reopens it on the next Back press.
8. `?share=` naming an occasion that is not in the strip is stripped from the address once the index
   resolves, and no dialog mounts.
9. On an **archived** occasion the control is rendered, **disabled, with the reason**; no share can be
   attempted from it.
10. A viewer who owns no lists at all opens the dialog and is told so, with a way to create one.
11. Every behaviour of the existing sharing modal — the filter box, the "no matches" wording distinct
    from "no data", the fixed header and footer under `max-h-[85vh]`, the focus trap and the
    topmost-only Escape — holds here, because it is the same shell.

## Decisions

### 1. A `SharingShell` is extracted, and both modals compose it

The two modes share the chrome and nothing else. `SharingModal` today *is* the chrome plus the
families/people pair; occasion mode needs the chrome plus one list section, a different title, and a
different summary sentence.

```
SharingShell (Modal size="lg", title, filter box + state, summary slot, Done footer)
  ├─ SharingModal          families + people, controlled  (list mode, unchanged)
  └─ OccasionSharingModal  lists the viewer owns          (this ticket)
```

`SharingShell` exposes the filter to its children — `children: (filter: string) => ReactNode` — so the
input, its label, its placeholder, the scroll column and the footer are stated once, and the filter
text stays where CONTEXT.md rule 8 puts it: component state inside the dialog, out of the URL.

The row primitives go with it: `matchesFilter`, `Group`, `Hint`, `NoMatches` and `ShareRow` move to
a module both modals import, so the one predicate stays one predicate and `No lists match "zzz"`
cannot drift from `No people match "zzz"`.

This is the same argument ADR 0008 made about `Modal` itself and NEU-1306 cashed in — *"a shell
primitive designed against one caller is a guess […] it can be extracted then, with two callers to
shape it."* There are now two callers, and they are the two the milestone named.

Rejected: **a `mode` discriminated union inside `SharingModal`**, for the third time and for the same
reason NEU-1307 gave — the modes differ at the data source, the row shape, the checked state, the
toggle and the select, which is a branch through most of the component.

Rejected: **`OccasionSharingModal` composing `Modal` directly** and re-hand-rolling the header column.
It duplicates the filter chrome, the `overflow-y-auto` middle and the no-match wording — precisely
the drift M3 exists to end, and the second time this project would have paid it.

### 2. The checked set is `GET /occasions/{id}/lists` ∩ the owned rows

There is no field to read it off. `shared_via` is **empty on every list the caller owns**, on purpose:

```python
# app/lists/service.py:102 — to_summaries
foreign_ids = [gift_list.id for gift_list in lists if gift_list.owner_id != viewer_id]
routes = repo.get_share_routes(db, viewer_id, foreign_ids)
```

> Both arms of the union exclude the caller's own lists, so a route query about one is a question
> whose answer is already known.

So `GET /lists?filter=owned` reports the population and says nothing about where those lists already
reach. `GET /occasions/{id}/lists` answers the other half — it is the endpoint the Lists tab already
calls, under the key `["occasion-lists", occasionId]` that tab already warms — and the intersection by
`id` is the ticked set.

```
getLists("owned", false)  → [{id:3,…}, {id:8,…}, {id:12,…}]
getOccasionLists(7)       → [{id:8,…}, {id:31, owner_id: someone else}]
                              ↓ intersect on id
ticked = {8}
```

Two requests, both existing, both often warm — from `/occasions/:id` the occasion-lists half is free,
from `/lists` the owned half is.

Rejected: **`GET /lists/{id}` per owned list** to read its routes — N requests to open a dialog.
Rejected: **a backend change** putting `shared_via` on owned rows, or a new
`GET /occasions/{id}/share-targets`. It would be honest, and it is a backend ticket plus cross-repo
sequencing in a milestone that is otherwise frontend-only, with M1 — the contract milestone — closed.
Two warm reads do not justify reopening it.

**Accepted consequence:** `getOccasionLists` is filtered by `can_view_list`, and `list_count` on the
card is not. The viewer is a member of the occasion's family in every case that reaches this dialog,
so the two agree in practice; where they could not, the dialog is answering about the viewer's own
lists, which they can always see.

### 3. A list already shared here is ticked, dead, and says why — and rule 6 gains its third arm

```
☑ Mum's wishlist        Already shared here
☐ Dad's birthday
☐ Household
```

The write stays **add-only**, as the ticket specifies ("each selection is a `PUT`"). Unticking does
nothing; the row is disabled, and the reason is on it.

This needs saying against `CONTEXT.md` rule 6, which currently reads *"It applies only to an
**unticked** box — a direct share already made stays revokable, **because this panel is the only
place to revoke one**."* That clause is the whole justification, and it is false here: the list's own
sharing modal revokes this share, and it is the surface that has the owner's context — the list in
front of them, the family named, and the release-or-keep `ConfirmDialog` when a member holds a claim.

So rule 6 gains a sentence: **in occasion mode the tick is the dead one**, because revoking has a home
and this is not it. The reason line points there: `Already shared here — change this from the list`.

Rejected: **untick revokes, reusing the claims `ConfirmDialog`**. Parity with list mode, at the cost of
putting a destructive decision about other people's claims on a card reachable in one tap from the
app's landing page — and of a second stacked-dialog flow to build and test for a path the ticket does
not ask for.
Rejected: **dropping already-shared lists from the population**. Every row would be actionable, and
"why isn't my list here?" is exactly the question rule 6's listed-disabled-reason shape exists to
answer.

### 4. Three entry points, one control, and the story's second criterion

The ticket names two, both empty states. Story NEU-1304 asks for a third — *"The same is possible from
an occasion that already has lists"* — and without it the story cannot close on this ticket.

| Where | Shape |
|---|---|
| `/occasions/:id` Lists tab, **no lists** | The empty state's body *is* the button, replacing today's "No lists are shared to this occasion yet." |
| `/occasions/:id` Lists tab, **with lists** | `Share a list` above the list rows |
| `/lists` strip, **empty card** | The body slot NEU-1298 built for it, replacing "No lists yet" |

One component, `ShareIntoOccasionButton`, in all three — the copy and the disabled reason are stated
once.

The `/lists` card gets it **only when empty**, as the ticket says. A non-empty card has no body slot,
and giving it one would mean either restructuring the card or a second card shape — the thing
NEU-1298's Decision 2 shaped the card to avoid. The occasion page is one tap away and carries the
control in both states.

### 5. `?share=<occasionId>` on `/lists`, and why the enum hook cannot carry it

M3's contract is that opening pushes `?share=open`. That is unambiguous on `/occasions/:id`, where the
path already names the occasion, and its existing `useEnumSearchParam` call is **unchanged**. On
`/lists` the strip can hold fifteen cards and `open` does not say which. One key; the value says what
is open:

```
/lists?share=7                 the dialog for occasion 7
/occasions/7?share=open        the dialog for the occasion this page is
```

`useEnumSearchParam` cannot validate the first one. Its heal is an effect that fires whenever the raw
value is not in `values` (`hooks/useSearchParamState.ts:94`), and the occasion index is async — so
`/lists?share=7` would be scrubbed from the address on the first render, before the query that could
recognise `7` has answered.

So `/lists` uses the base `useSearchParamState("share", { mode: "push" })` and heals **once the index
resolves**: an id not among the viewer's occasions is replace-stripped and no dialog mounts. That is
the pattern `ListDetail` already uses for a non-owner's `?share=open`, for the same reason — ownership,
like membership, is not known until a query answers.

Closing is the **same depth-aware path** `ListDetail` and `CreateList` use: `navigate(-1)` at depth > 0,
a replace-strip at depth 0 (rule 8's last sentence).

Rejected: **`?share=<occasionId>` on the occasion page too**. `/occasions/7?share=7` restates the path
and buys uniformity nobody reads.
Rejected: **component state for the strip's modal**. Rule 8 is explicit that a modal is a place, and on
a phone the Back gesture would leave `/lists` entirely instead of closing the dialog.

### 6. The strip mounts the dialog; the card only opens it

A successful share takes the occasion's `list_count` from 0 to 1, which is exactly what makes the
card's body slot — and the button inside it — stop rendering. If the dialog were mounted by the card,
it would unmount under the viewer's cursor the moment their first tick succeeded, mid-session, with
the filter typed.

`OccasionStrip` holds the `?share` value and renders at most one `OccasionSharingModal` beside the
grid; a card's button only sets the param. The occasion page does the same at page level, where it
falls out anyway.

### 7. An archived occasion renders the control disabled, with the reason

The strip excludes archived occasions, so this is the occasion page alone — which renders an archived
occasion exactly like an active one (archiving blocks new shares and nothing else, project spec §5.4).

```
[ Share a list ]  ·  This occasion is archived, so lists can't be shared to it.
```

Rule 6's shape is "listed, disabled, **reason given**", and unlike the placeholder NEU-1298 rejected
— *"because a later milestone hasn't shipped" is not a reason a viewer can act on* — this one is:
ask an organizer to unarchive it. The wording is the one `ListSharingModal`'s 409 toast already uses,
minus the "pick another" half, which has no meaning when the occasion is fixed.

Rejected: **no control at all on an archived occasion** — it silently drops a control the viewer sees
on every other occasion, with nothing saying why.
Rejected: **a live control and the 409 as the only feedback** — a click that can never succeed.

### 8. The copy, and a sibling in `lib/sharing-summary`

```
┌──────────────────────────────────┐
│ Share a list with Christmas 2026 │  fixed
│ [ filter your lists…           ] │  fixed
│ 1 of your lists is shared here.  │  fixed
│──────────────────────────────────│
│ ☑ Mum's wishlist                 │  scrolls
│    Already shared here           │
│ ☐ Dad's birthday                 │
│──────────────────────────────────│
│                          [Done]  │  fixed
└──────────────────────────────────┘
```

The title names the fixed occasion — from `/lists`, four cards sit side by side and the dialog must
say which one it is about. The summary sentence is a **sibling of `sharedWithSentence`** in
`lib/sharing-summary.ts`, where the family/people sentence already lives, so both are stated once:

| Count | Sentence |
|---|---|
| 0 | `None of your lists are shared here yet.` |
| 1 | `1 of your lists is shared here.` |
| N | `N of your lists are shared here.` |

It counts the viewer's **own** lists, never the occasion's total. `list_count` includes other people's
lists, and a sentence on a member's dialog that counted them would be answering a different question
from the checkboxes below it.

### 9. The population is owned and non-archived; an empty one says so

`getLists("owned", false)` — the key `["lists", "owned", { archived: false }]` that `/lists` already
warms. Archived lists are excluded: an archived list is one the owner has put away, and offering it as
something to share into a live occasion is the opposite of what archiving meant.

A viewer who owns nothing gets the same two-emptinesses treatment the other sections get
(NEU-1306, Decision 6): `You don't have any lists yet.` with a `Create a list` link — distinct from
`No lists match "zzz"`. The link is rendered here, unlike on the create form: there is no half-typed
draft to discard, and `linkAway` is the prop that already says so.

**Accepted consequence:** creating a list from that link lands the viewer on the new list rather than
back at the occasion. Two taps to return, against a path taken only by a viewer who owns no lists at
all, on the day they get their first one.

### 10. A successful share invalidates four things

Mirroring `ListSharingModal.invalidateFamilies`, which already names three of them:

- `["occasion-lists", occasionId]` — the tab the viewer may be standing on
- `["occasions"]` — the strip's `list_count` and `last_activity_at` are both stale (the prefix sweeps
  the index and the per-family entries together, as NEU-1298 intended)
- `["lists"]` — the list's own row now carries a route
- `["list", listId]` — its detail page's sharing summary

The failure arm is a toast naming the list, and the row stays unticked because the read behind it is
unchanged: `Couldn't share "Mum's wishlist" with Christmas 2026.` A 409 means the occasion was archived
since the dialog loaded, and says so in the words Decision 7 uses.

### 11. NEU-1307's seam is not widened

`SharingSelection` stays `{ familyOccasions, userIds }`. Occasion mode's selection is a set of list
ids against one fixed occasion — a different shape with no overlap — and the two containers that hold
it (`ListSharingModal`, `DraftSharingModal`) are untouched by this ticket.

NEU-1307 designed that seam "against one caller and against it alone" and said occasion mode was "not
anticipated here". It was right to, and generalising it now — to hold either families-and-people or
lists — would buy one type and cost every reader of both modes.

## Smaller calls

- **Focus on open** lands on the filter input, unchanged: `Modal` focuses the first tabbable element
  and `SharingShell` puts the filter first in the markup.
- **The filter matches list names only.** A list's recipient line is rendered by `ListAttribution` and
  is not the row's identity, and the population is one the viewer named themselves.
- **No per-row spinner.** A write in flight disables the section, as both existing modes do through
  `SectionState.pending`.
- **`Share a list` is the button's words in all three places**, including the empty states — the
  condition ("No lists yet") is what the CTA replaces, not something it repeats.
- The dialog is **not** offered on an occasion the viewer cannot see: `/occasions/:id` already answers
  403/404 as one unreachable state before any tab renders.

## What to change

| File | Change |
|---|---|
| `src/components/SharingShell.tsx` | **New.** `Modal size="lg"`, the title, the filter box and its state, the summary slot, the scroll column and the `Done` footer. Children take the filter |
| `src/components/sharing-rows.tsx` | **New.** `matchesFilter`, `Group`, `Hint`, `NoMatches`, `ShareRow`, `EmptyGroup` — moved out of `SharingModal.tsx` unchanged |
| `src/components/SharingModal.tsx` | Composes `SharingShell` and imports the row primitives; the families/people sections and the controlled API are otherwise untouched |
| `src/components/OccasionSharingModal.tsx` | **New.** The occasion-mode container and its `ListsSection`: the two reads, the intersection, the `PUT` on tick, the disabled already-shared rows, the invalidation |
| `src/components/ShareIntoOccasionButton.tsx` | **New.** The one control behind all three entry points, including the archived-occasion disabled state and its reason |
| `src/lib/sharing-summary.ts` | Gains `listsSharedHereSentence(count)` beside `sharedWithSentence` |
| `src/pages/OccasionDetail.tsx` | `ListsTab` gains the header control and replaces its empty-state sentence; the page mounts `OccasionSharingModal` on `?share=open` with the existing depth-aware close |
| `src/pages/lists/OccasionStrip.tsx` | Holds `?share` as a raw param, heals it against the index, mounts at most one modal beside the grid; the empty card's body slot becomes the button |
| `src/components/SharingShell.test.tsx` | **New.** Filter state, the summary slot, `Done`, and that the trap and Escape still come from `Modal` |
| `src/components/OccasionSharingModal.test.tsx` | **New.** See Tests |
| `src/components/SharingModal.test.tsx` | Carried unchanged across the extraction — the regression guard |
| `src/pages/OccasionDetail.test.tsx` | The three states of the Lists tab, the archived branch, `?share=open` push/pop |
| `src/pages/lists/OccasionStrip.test.tsx` | The empty card's button, `?share=<id>`, the heal, and the card surviving its own success |
| `CONTEXT.md` | Rule 6 gains the occasion-mode arm (Decision 3); rule 8 gains the sentence that `?share`'s **value** names what is open where a page can open several; the sharing-modal vocabulary row notes the second mode |
| `AGENTS.md` | Component table gains `SharingShell`, `OccasionSharingModal` and `ShareIntoOccasionButton` |

## Tests

- **Ticking shares**: a live row sends `PUT /lists/{id}/occasions/{occasionId}` once, and the row is
  ticked and dead afterwards.
- **Already shared**: a list in both reads renders ticked, disabled, with `Already shared here`, and
  clicking it sends nothing.
- **Only owned, only live**: a list shared to the occasion by someone else is absent; an archived
  owned list is absent.
- **Summary sentence** at zero, one and several.
- **Empty population**: no owned lists → the sentence and the `Create a list` link, worded apart from
  `No lists match "zzz"`.
- **Filter**: matches list names; a disabled already-shared row survives a filter that matches it,
  with its reason *(the rule-6 assertion, in this mode)*.
- **Archived occasion**: the control renders disabled with the reason and opens nothing.
- **Three entry points**: the occasion page's empty state, its populated Lists tab, and the strip's
  empty card each open the same dialog.
- **`?share` on `/lists`**: a card pushes `?share=<id>`; Back closes the dialog and leaves the viewer
  on `/lists`; a second Back leaves the page rather than reopening. `?share=999` is stripped once the
  index resolves and mounts nothing; `?share=banana` likewise.
- **The card survives its own success**: with the dialog open from an empty card, a successful share
  leaves the dialog mounted and usable *(Decision 6's regression)*.
- **Invalidation**: after a share, the occasion-lists, occasions, lists and list keys are all
  invalidated.
- **Failure**: a rejected `PUT` toasts, names the list, and leaves the row unticked; a 409 says the
  occasion has been archived.
- **The whole `SharingModal` suite** green across the shell extraction, unchanged in behaviour.

## Out of scope

| Deferred | Owner |
|---|---|
| **Revoking from occasion mode**, and the claims release-or-keep flow it would carry (Decision 3) | — the list's own modal, unchanged |
| **A share control on a non-empty `/lists` card** (Decision 4) | — |
| **`shared_via` on owned list rows**, and any backend change (Decision 2) | — rejected, not deferred |
| **People page filter** and the `Remove` overflow menu | [NEU-1309](https://linear.app/neuroticsasquatch/issue/NEU-1309) |
| **The archive nudge** in `ActionableBanner` | [NEU-1315](https://linear.app/neuroticsasquatch/issue/NEU-1315) |
| **The confirmation audit** | [NEU-1319](https://linear.app/neuroticsasquatch/issue/NEU-1319) |
| **Pagination and virtualisation** — until a real user passes ~15 connections (project spec §3) | — |
