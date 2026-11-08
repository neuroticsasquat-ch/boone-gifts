# NEU-1307 — New List reuses the sharing modal, and shares nothing by default

**Ticket:** [NEU-1307](https://linear.app/neuroticsasquatch/issue/NEU-1307/new-list-reuses-the-sharing-modal-and-shares-nothing-by-default)
**Repo:** `boone-gifts-frontend`
**Story:** [NEU-1303](https://linear.app/neuroticsasquatch/issue/NEU-1303/i-can-find-the-person-or-family-i-want-to-share-with) — "I can find the person or family I want to share with"
**Milestone:** M3 — Scale
**Depends on, merged:** [NEU-1306](https://linear.app/neuroticsasquatch/issue/NEU-1306) `SharingModal`, `Modal` ([PR #217](https://github.com/neuroticsasquat-ch/boone-gifts-frontend/pull/217)) · [NEU-1298](https://linear.app/neuroticsasquatch/issue/NEU-1298) `GET /occasions` index · [NEU-1301](https://linear.app/neuroticsasquatch/issue/NEU-1301) `useSearchParamState` · [NEU-1302](https://linear.app/neuroticsasquatch/issue/NEU-1302) `NavigationDepth`
**Project spec:** `docs/specs/occasions-and-navigation-project-spec.md` §7.2, §7.1, §12
**ADR:** [`docs/adr/0008-confirmation-is-one-dialog.md`](../adr/0008-confirmation-is-one-dialog.md) (NEU-1306 amendment) — not amended again here
**Branch from and target:** `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

`CreateList` shares to **families only**. There is no people section at all, though the list's own
panel has had one since v0.4.0, where the navigation project recorded the gap as a defect — *"The
create form can share to families but not to people"* — and never fixed it.

Worse, it arrives with every family that has exactly one active occasion **already ticked**. A list
created to hold a private idea is visible to the Boones before its first gift is added. "Uncheck any
you'd rather keep it from" is the wrong direction for a sharing control.

Two changes, and they support each other:

1. **`CreateList` mounts the sharing modal** — the same component the list page uses, so creation
   gains a people picker, the one filter box, the "Shared with …" line and every disabled-with-reason
   rule for free, and the two surfaces cannot drift.
2. **Nothing is pre-checked.** With nothing ticked the sharing section is *optional* rather than
   something the user must audit before submitting, which is also what makes mounting a ~58-row
   dialog on a create form safe rather than intimidating.

**This is the project's one user-visible behaviour change** (project spec §12): someone who has
learned to rely on the pre-check will create their next list unshared. It belongs in the v0.6.0
release notes.

NEU-1306 shipped the modal and deliberately left this ticket the seam:

> **The write seam stays unwritten.** `CreateList` has no `listId`, so it cannot write on toggle and
> must hold selections locally until submit. Designing that controlled/draft API today, against a
> caller that does not exist, is the same guess ADR 0008 declined to make about `Modal`.

The caller now exists. This ticket designs that seam against it, and against it alone — NEU-1308's
occasion mode is a different population, a different query and a different write, and is explicitly
not anticipated here.

## Acceptance criteria

1. `New List` arrives with **nothing checked** — no family, no person — however many families have
   exactly one active occasion. *(The assertion the ticket asks for by name.)*
2. The create form has a **`Who can see this list`** section showing the same "Shared with …"
   sentence the modal shows, and a control that opens the sharing modal over the form.
3. That modal is **the same component** the list page mounts: one filter box across both sections,
   the disabled-with-reason rows, the no-match wording, the occasion select and its three-state rule,
   and the "Shared with …" line.
4. Creating a list **shares with the people ticked** as well as the families — the picker the create
   form has never had.
5. Opening the modal pushes `?share=open` on `/lists/new`; `Done`, `Escape`, a backdrop click and the
   **Back** gesture all close it, leave the form's name, description and selections intact, and none
   of them leaves an entry that reopens it on the next Back press.
6. A family with several active occasions is **not ticked until an occasion is chosen**, refused on
   the row with the same message the list page uses.
7. A family with no active occasion is **listed, disabled, with the reason**; a family the viewer
   belongs to that has no occasions at all still appears.
8. **No person row is disabled** while creating, even when a ticked family would cover them.
9. If `POST /lists` succeeds and a share call fails, the list is **still created and navigated to**,
   and the failure names the person it could not share with.
10. The empty-state sentences render **without their links** while creating, so nothing on the form
    silently discards a half-typed list.

## Decisions

### 1. The sharing control is a modal opened from the form, not an inline fieldset

The form keeps a short section — the heading `Who can see this list`, the summary sentence, and a
button — and the rows live in the dialog:

```
New List
┌─────────────────────────────┐
│ Name        [____________]  │
│ Description [____________]  │
│ This list is for …          │
│                             │
│ Who can see this list       │
│ This list isn't shared      │
│ with anyone.   [ Choose… ]  │
│ You can change this later   │
│ from the list itself.       │
│                             │
│ [Create List]  Cancel       │
└─────────────────────────────┘
```

Inlining the sections instead was rejected. The component that M3 committed to reusing *is* the
modal: it is built as a column with a fixed header and footer under `max-h-[85vh]` precisely so the
filter box, the summary and `Done` stay in reach across ~58 rows. Dropped into a form that fieldset
has no fixed header, so the filter scrolls away from the rows it filters, and a create form for a
list most users share with nobody would open ~58 rows tall.

Opening it with no summary on the form was also rejected: a user who ticked three families would see
no trace of it before submitting, and the summary is exactly the "legible without reading every
checkbox" line M3 asked for.

**The button is `Choose…`, not `Change`.** The list page's control is `Change` because a list already
has a sharing state to change. The create form's default is nothing.

### 2. The seam is a controlled `selection`, and the sections stop owning it

```
SharingModal (shell: Modal, filter box, summary, Done)
  └─ FamiliesSection / PeopleSection      ← controlled
       props: rows, selection, onFamilyToggled/onPersonToggled,
              isLoading, isError, filter, linkAway

ListSharingModal (live)              DraftSharingModal (create)
  selection ← server data              selection ← useState
  onToggled → mutation                 onToggled → setState
  + revoke ConfirmDialog               + adapter over two queries
```

```ts
export interface SharingSelection {
  /** familyId → the occasion this list reaches that family through. A family
   *  absent from the map is unticked; there is no "ticked but unchosen" state,
   *  because a tick without a choice is refused before it lands here. */
  familyOccasions: Record<number, number>;
  /** Users the list is shared with directly. */
  userIds: number[];
}

onFamilyToggled(family: ShareTargetFamily, next: number | null): void
onPersonToggled(userId: number, next: boolean): void
```

`next` is the **intended state**, not a delta: the occasion to share to, or `null` to stop. The
container reads what is currently selected from `selection` — which the live container needs anyway,
since unsharing takes the occasion id.

Everything that is the same in both modes stays single-implementation: the filter predicate, the row
markup, `occasionChoice`'s three states, the `picked`/`needsChoice` refusal, the disabled reasons,
the no-match wording, and the summary sentence.

Rejected: **a `mode` discriminated union inside `SharingModal`**. The two modes differ at the data
source, the checked state, the toggle, the revoke 409 and the select — a branch through most of the
component, and NEU-1308 would add a third arm to every one of them.

Rejected: **shell-only reuse**, with `CreateList` composing its own draft sections. It duplicates the
row markup, the three-state rule, the reason strings and the no-match wording — the drift M3 exists
to end.

### 3. Three files in `components/`, and `SharingModal.tsx` does not move again

`SharingModal.tsx` keeps the shell and the two controlled sections. Two new siblings hold the
containers: `ListSharingModal.tsx` (the queries, the mutations, the revoke `ConfirmDialog`) and
`DraftSharingModal.tsx` (the two draft queries and the adapter). `ListDetail` imports
`ListSharingModal` instead of `SharingModal`; `CreateList` imports `DraftSharingModal`.

Flat, because `components/` is flat. Not moved into a `components/sharing/` folder: NEU-1306 moved
this file one week ago to make *this* ticket a pure addition rather than a move plus an addition, and
moving it again would spend that.

### 4. Draft families come from `GET /occasions` + `GET /families`, adapted

There is no `listId`, so `GET /lists/{id}/families` is unavailable. `getOccasionIndex(false)` already
returns **every non-archived occasion in every family the caller belongs to**, each carrying
`family_id` and `family_name`; `getFamilies()` supplies the families that have none, which rule 6
requires be listed and disabled with the reason rather than hidden.

```ts
getFamilies()           → [{id:1, name:"The Boones"}, {id:2, name:"Work Friends"}]
getOccasionIndex(false) → [{id:7, family_id:1, name:"Christmas 2026"},
                           {id:9, family_id:1, name:"Mum's birthday"}]

  ↓ group by family_id, shape as ShareTargetFamily[]

[{id:1, name:"The Boones",   member_ids:[], occasions:[
    {id:7, name:"Christmas 2026",  is_archived:false, shared:false},
    {id:9, name:"Mum's birthday",  is_archived:false, shared:false}]},
 {id:2, name:"Work Friends",  member_ids:[], occasions:[]}]
```

Two requests, and `["occasions","index",{archived:false}]` is the key the `/lists` occasion strip
already warms, so arriving at New List from `/lists` usually costs one.

`shared` is `false` throughout and `is_archived` is always `false` — the index excludes archived
occasions, which is exactly right, since a list being created can never already be shared and can
never be shared *to* an archived occasion. The `— archived` label branch and `sharedOccasionOf` are
simply never reached in draft.

Rejected: **keeping today's 1+N fan-out** (`getFamilyOccasions` per family) — 9 requests at the ~8
families M3 designs for, and it keeps a second way of asking the same question alive.
Rejected: **a new list-less `GET /share-targets`** — one request and real `member_ids`, at the cost of
a backend ticket and cross-repo sequencing in a milestone that is otherwise frontend-only, and M1
(the contract milestone) has closed. Decision 5 is why the `member_ids` it would buy are not needed.

`member_ids: []` is honest here rather than a lie: the draft adapter has no members to report, and
the one consumer of that field is disabled in draft by the next decision.

### 5. The coverage disable is inert while creating

No person row is greyed on the create form, even when the draft ticks a family that covers them.

Rule 6's disable is defined on a **live occasion share** — "their box is dead because ticking it would
change nothing". A draft tick is not a share: nobody is covered until the list exists, and the family
tick can be withdrawn before it ever is. Rule 1 says so from the other side — the API accepts that
direct share, because it is the grant that survives the person leaving the family — so the disable was
never a permission, only a nudge against redundancy.

And a create-mode disable would be worse than none: the row would go dead and live again under the
cursor as families are ticked and unticked mid-form.

Nothing downstream contradicts. Rule 6's other half is that the disable applies only to an *unticked*
box, so a list created with both a family share and a direct share to one of its members renders on
the list page with that person **ticked, live and revokable** — exactly as if the owner had made the
same pair from the list page.

```
Draft: ☑ The Boones · Christmas 2026        after Create List, /lists/12
People                                       People
  ☐ Gran Boone   gran@example.com     →        ☑ Gran Boone   gran@example.com
  ☐ Alice        alice@example.com               ↑ live direct share, revokable
```

Rejected: **fetching `GET /families/{id}` for ticked families** to compute coverage (usually 0–1
extra requests) — it buys the parity at the cost of the flicker above, against a rule that does not
apply yet. Rejected: **fanning members out eagerly** — 10 requests to open a form whose sharing
section many users never open.

### 6. Submit: create, then share, then navigate either way

`POST /lists` carries `occasion_ids` and has no `user_ids`, so the people ticked are N follow-up
`POST /lists/{id}/shares` calls.

```
POST /lists {name, …, occasion_ids:[7]}  → 201 {id:12}
  ├─ POST /lists/12/shares {user_id:4}   ✓
  └─ POST /lists/12/shares {user_id:9}   ✗
navigate("/lists/12", {replace:true})
  → toast: Your list was created, but we couldn't share it with Gran Boone.
           Try again from Change.
```

`Promise.allSettled` over the ticked users — a handful of calls, and one failing must not abandon the
rest. **Navigation happens either way**, because the list exists and the page being navigated to is
exactly where the failure is fixed: one `Change`, one tick. Naming the people is what makes the toast
actionable; a bare "some shares failed" would leave the owner comparing two lists by hand.

The existing **409 on create** is unchanged: an occasion archived between the form loading and being
submitted keeps its current form-level error and creates no list. The share calls are only reached
once the list is created.

Rejected: **landing on `/lists/12?share=open`** with the modal already open on the failed rows. It
shows the state rather than describing it, but it gives `?share=open` a second meaning — arriving
open, rather than opened — and pushes a modal onto a `replace` navigation.
Rejected: **adding `user_ids` to `GiftListCreate`**. One atomic call and no partial state to word
around, at the cost of a backend ticket this frontend-only milestone would then block on. The partial
failure it prevents is benign and recoverable in two clicks.

### 7. Two guards on `Create List` disappear, and the default change is why

Today the submit button is disabled while `families.isPending || occasionsPending`, and the comment
says why:

> Submitting before the families and their occasions answer would post no `occasion_ids` at all,
> silently skipping the pre-check and creating the list that reaches nobody.

**With nothing pre-checked that hazard is gone**: a user who submits before the families load shares
with nobody, which is precisely what they asked for. The `unchosen` guard goes too — a tick without a
chosen occasion is refused at the row and never lands in `selection`, so there is no such state left
to block on. `Create List` is disabled only while `submitting` or while the "this list is for" answer
is incomplete.

The modal renders its own loading and error arms, so `Choose…` stays live throughout.

### 8. The empty-state links are dropped in draft, and the sentences kept

`You don't have any connections yet.` and `You don't belong to any families yet.` still render — the
fact is what the row is there to say — but `Add a connection` and `Go to People` are not rendered
while creating. Nothing on the create form may silently discard a half-typed list, and People is one
tap away in the nav a moment later.

One `linkAway` prop on the sections, asserted in both modes.

Rejected: **keeping the links** — a user with no connections who clicks through loses the name and
description they typed, with no warning. Rejected: **guarding them with a `ConfirmDialog`** — a third
stacked dialog and a confirm on a path taken by the narrow set of users who have no connections at
all and decide to fix that mid-create.

### 9. `?share=open` on `/lists/new`, by the same hook and the same close path

`useEnumSearchParam("share", { mode: "push", values: ["open","closed"], fallback: "closed" })`, and
the same depth-aware close `ListDetail` uses: `navigate(-1)` at depth > 0, a replace-strip at depth 0.

`CONTEXT.md` rule 8 applies as written — a modal is a place you can be, so it pushes — and it buys the
thing that matters on a form: the mobile **Back** gesture closes the dialog instead of abandoning the
draft. The form is unmounted by neither, so the name, description and selections survive.

`/lists/new?share=open` deep-links to an empty draft with the dialog open, which is harmless. There
is no owner check to make here and so no equivalent of `ListDetail`'s non-owner strip: anyone may
create a list.

Rejected: **component state** — it would make rule 8's "a modal pushes" conditional on which page
mounts the component, and the same dialog would close two different ways.

### 10. The occasion select stays disabled once its family is ticked, in both modes

On the list page the select is disabled once shared, because re-pointing a live share is
untick-then-tick — the only order in which the claims question can be asked (project spec §5.4). In a
draft there are no claims and unticking costs nothing, so the rule is not *needed*.

It is kept anyway. One behaviour beats two, changing a draft's occasion is untick-re-pick-retick
exactly as it is on the list page, and a select that is live in one mounting of the dialog and dead
in the other is a difference a user would have to learn for no benefit.

### 11. The retired copy, and what replaces it

The fieldset legend `Share with families` and its hint go:

> Each family sees this list through one of its occasions. Uncheck any you'd rather keep it from —
> you can change this later from the list itself.

"Uncheck any you'd rather keep it from" is the sentence this ticket exists to delete. The second half
is still true and still reassuring, so it survives on its own under the summary line: **`You can
change this later from the list itself.`**

The dialog's own title, `Who can see this list`, is unchanged and is reused as the form section's
heading — the same words for the same thing, in both places it appears.

## What to change

| File | Change |
|---|---|
| `src/components/SharingModal.tsx` | Sections become **controlled**: take `selection`, `onFamilyToggled`/`onPersonToggled`, `linkAway`. Queries, mutations and the revoke dialog move out. `SharedWithLine` counts from `selection` |
| `src/components/ListSharingModal.tsx` | **New.** The live container: the three queries, the two mutations, the 409 handling, the revoke `ConfirmDialog`, and `selection` derived from `share-targets`/`shares` |
| `src/components/DraftSharingModal.tsx` | **New.** The draft container: `getFamilies` + `getOccasionIndex`, the `ShareTargetFamily[]` adapter, `getConnections`, and `selection` held by the caller |
| `src/lib/sharing-summary.ts` | **New.** `sharedWithSentence(families, people)` — stated once, so the form's line and the dialog's cannot drift |
| `src/pages/CreateList.tsx` | Loses the families fieldset, the fan-out, the pre-check, `picked`, `unchosen` and two submit guards. Gains `selection` state, the summary section, `?share=open`, `DraftSharingModal`, and the share-then-navigate submit |
| `src/pages/ListDetail.tsx` | Imports `ListSharingModal` |
| `src/components/SharingModal.test.tsx` | Existing assertions carried across the controlled refactor — the regression guard. New: `linkAway`, and a draft selection driving the rows |
| `src/components/DraftSharingModal.test.tsx` | **New.** The adapter, the empty-occasion family, no disabled people |
| `src/pages/CreateList.test.tsx` | Nothing pre-checked; people picker; submit payload and share calls; partial failure; `?share=open` push/pop; form survives a close |
| `CONTEXT.md` | The `Who can see this list` row notes New List mounts it too; rule 6 gains the live-share sentence from Decision 5 |
| `AGENTS.md` | Component table gains `ListSharingModal` and `DraftSharingModal` |

## Tests

- **`New List` arrives with nothing checked** — with two families each having exactly one active
  occasion, no box is ticked and the summary reads `This list isn't shared with anyone.` *(the
  ticket's named assertion)*
- **A people picker exists on create**, and ticking a connection sends
  `POST /lists/{id}/shares` after `POST /lists`.
- **Submit payload**: only ticked families appear in `occasion_ids`, at the occasion chosen.
- **Partial failure**: one share call rejects → the list is still created, navigation still happens,
  and the message names that person.
- **`?share=open`**: `Choose…` pushes; Back closes the dialog and leaves the form on screen with its
  name, description and selections intact; a second Back leaves the page rather than reopening.
- **Rule 6 in draft**: a family with no active occasion is listed, disabled, with the reason; a family
  with several is refused on tick until an occasion is chosen.
- **No coverage disable in draft**: ticking a family, then opening People, leaves every row live.
- **Empty states**: no links in draft; the links still render on the list page.
- **`Create List` no longer waits** on the families or occasions queries.
- The **whole live suite** carried across the controlled refactor, unchanged in behaviour.

## Out of scope

| Deferred | Owner |
|---|---|
| **Occasion mode** — occasion fixed, lists chosen. No third arm is added to the seam here (Decision 2) | [NEU-1308](https://linear.app/neuroticsasquatch/issue/NEU-1308) |
| **People page filter** and the `Remove` overflow menu | [NEU-1309](https://linear.app/neuroticsasquatch/issue/NEU-1309) |
| **The confirmation audit** — which actions confirm and which stop | [NEU-1319](https://linear.app/neuroticsasquatch/issue/NEU-1319) |
| **`user_ids` on `POST /lists`** — rejected in Decision 6, not deferred to a ticket | — |
| **The coverage disable in draft**, and the `member_ids` a list-less share-targets endpoint would buy | — |
| **Pagination and virtualisation** — until a real user passes ~15 connections (project spec §3) | — |

## Release notes

Project spec §12 asks for a line, and this is the only ticket in the project that earns one:

> **New lists are no longer shared with your families automatically.** Creating a list now shares it
> with nobody until you say otherwise — and you can now share with people as well as families while
> creating it.
