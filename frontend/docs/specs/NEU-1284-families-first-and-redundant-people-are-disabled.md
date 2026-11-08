# NEU-1284 — Families first, and a person an occasion already covers can't be ticked

**Ticket:** [NEU-1284](https://linear.app/neuroticsasquatch/issue/NEU-1284/sharing-panel-families-first-and-disable-people-an-occasion-share)
**Repo:** `boone-gifts-frontend`
**Blocked by:** [NEU-1285](https://linear.app/neuroticsasquatch/issue/NEU-1285/share-targets-carry-their-familys-member-ids-backend)
(backend — `GET /lists/{id}/families` gains `member_ids`)
**Project spec:** `docs/specs/shopping-lists-project-spec.md` §5.2 — amended by this ticket

## What to build and why

Two changes to the owner-only sharing panel, `src/pages/list-detail/SharingPanel.tsx`.

### 1. Families before People

The panel renders `PeopleGroup` then `FamiliesGroup`. Swap them. Families is the broader stroke,
and — after change 2 — it is the group that determines what the People rows can even offer. A
control whose top half is governed by its bottom half is read in the wrong order.

### 2. A person an active occasion share already covers is disabled

`backend/CONTEXT.md` invariant 2: a list is visible to its owner, OR to a `ListShare` row, OR to a
member of a family the list is shared to an occasion of. So when this list reaches a family, every
member of that family can already see it, and the checkbox beside their name offers a grant that
changes nothing — with no hint of why nothing changed.

Those rows render **disabled, with the reason on the detail line** — the idiom `FamilyRow` already
uses for a family with no active occasion (`NO_ACTIVE_OCCASION`).

```
WHO CAN SEE THIS LIST

  FAMILIES
    ☑ The Boones        Christmas 2026
    ☑ The Smiths        Easter 2026
    ☐ Work Friends      No active occasion — a member needs to create one

  PEOPLE
    ☑ Alice             alice@test.com
    ☐ Bob               Already sees this through The Boones and The Smiths
    ☐ Carol             carol@test.com
```

## Decisions

### 1. The trigger is an **active** occasion, not any standing share

A person is covered when they are a member of a family that holds a share on a **non-archived**
occasion:

```ts
family.occasions.some((o) => o.shared && !o.is_archived)
```

This is deliberately *narrower* than access. `can_view_list` never consults `is_archived`, so a
share made before archiving still grants sight — meaning a person covered only by an
archived-but-standing share keeps an enabled checkbox that, if ticked, duplicates access they
already have.

That is accepted, and it is not merely tolerated: an archived occasion is a route the owner is
winding down, so a direct share there is the useful thing to offer, not a redundant one. It
outlives the occasion. **The row shows no note** — it is an ordinary row, and the panel stays quiet
about a state most owners never reach.

Consequence to hold onto: a disabled row means *"the live route already covers them"*, not
*"they can already see this"*. The two differ only for archived shares.

### 2. Only **unticked** rows are disabled

A person may hold a direct share *and* be covered by a family. Disabling that row would strand the
grant — this panel is the only revoke surface there is, which is why `PeopleGroup` already
synthesises rows for shares held by people who are no longer connections.

So the rule is: **you can always remove a grant, you just can't add a redundant one.** A ticked box
stays operable regardless of coverage; only an unticked box is disabled. No row is ever a dead end.

A ticked-and-covered row carries **no extra note** — the same restraint as decision 1.

### 3. The reason names every covering family

`Already sees this through The Boones and The Smiths` — every family whose active occasion share
covers this person, joined with commas and a final "and". Naming only the first would tell the
owner to untick a family that won't re-enable the row.

Put it on the existing `detail` line of `ShareRow`, which currently carries the email. When a
person is covered, the reason **replaces** the email rather than stacking below it: the email is
decoration, the reason is why the control is dead.

### 4. Membership comes from the backend, not a fan-out

NEU-1285 adds `member_ids: number[]` to `ShareTargetFamily`. The panel already fetches
`share-targets`, so coverage becomes a set lookup with no second round trip and no late-arriving
disabled state.

The rejected alternative was fanning out `getFamily(id)` per covered family — cheaper to ship, one
repo, but it repaints the rows after they are already interactive, which is precisely the moment an
owner clicks.

`types/index.ts`:

```ts
export interface ShareTargetFamily {
  id: number;
  name: string;
  /** Every member of the family, the owner included. Not a new disclosure —
   *  `GET /families/{id}` already returns these ids to any member. */
  member_ids: number[];
  occasions: ShareTargetOccasion[];
}
```

### 5. The disable is a nudge, not a permission — and rule 1 gains an exception

`POST /lists/{id}/shares` keeps accepting a direct share to a covered person. A direct share is the
grant that **survives** the person leaving the family or the occasion share being revoked; refusing
it would quietly narrow who can see the list.

This is the deliberate exception to `frontend/CONTEXT.md` rule 1 ("anything the UI hides is also
refused server-side"), and it is written into that rule rather than left to be rediscovered as a
bug. **Already applied** — see *Docs already updated*.

### 6. `SharingSummary` flips too

The panel's order comment cites the header summary as its reason
(*"the same order the header summary reads in"*). Rather than retire the comment and let two
surfaces drift, flip both: the summary reads occasions first.

```
👥 Shared with The Boones · Christmas 2026, Alice   Change
```

The comment stays true; it just names the new order. Coverage does not affect the summary — it
names who the list actually reaches, and a covered person reaches it either way.

## Acceptance criteria

1. The Families group renders above the People group in the sharing panel.
2. `SharingSummary` names occasions before people.
3. An unticked connection who is a member of a family holding a share on a non-archived occasion is
   rendered with a disabled checkbox, and their detail line reads
   `Already sees this through <family>` — listing every such family when there is more than one.
4. A connection covered only by an **archived** occasion share stays enabled, with their email on
   the detail line and no note.
5. A connection who already holds a direct share stays operable and revokable, covered or not.
6. A connection in no covered family is unaffected.
7. Unticking a family re-enables the People rows it covered, and ticking one disables them, off the
   existing query invalidation — no reload.
8. Synthesised rows for share-holders who are no longer connections keep working: they are ticked
   by definition, so decision 2 keeps them operable.

## Tests

`src/pages/list-detail/SharingPanel.test.tsx`. The existing
`"puts both groups in a single panel, people first"` (line 93) is **renamed and inverted**, not
deleted — it is the assertion that the order is deliberate. The shared `shareTargets` fixture gains
`member_ids` on every family.

* Families group renders before People group.
* A covered, unshared connection is disabled and names the covering family.
* A connection covered by two families names both.
* A connection covered only by an archived-but-shared occasion stays enabled, showing their email.
* A connection holding a direct share stays operable while covered, and unchecking still `DELETE`s.
* Unticking the family re-enables the row without a remount.

`SharingSummary` has no test file of its own; it is covered from `src/pages/ListDetail.test.tsx`,
whose assertion at line 417 —
`"Shared with Alice, The Boones · Christmas 2026"` — becomes
`"Shared with The Boones · Christmas 2026, Alice"`.

## Docs already updated

Written during `/planit`; the code has to catch up, not the docs.

* `CONTEXT.md` rule 1 — the redundancy-nudge exception.
* `CONTEXT.md` rule 6 — a covered person's row.
* `docs/specs/shopping-lists-project-spec.md` §5.2 — the control sketch, in **both** repos (the
  backend carries an identical copy).

## Out of scope

* `CreateList.tsx` — the create form has a families section and no people section, so neither change
  reaches it.
* Refusing redundant direct shares server-side (decision 5).
* Any change to who can actually see a list. This ticket moves no access boundary; it only stops
  offering a grant that would move none either.
