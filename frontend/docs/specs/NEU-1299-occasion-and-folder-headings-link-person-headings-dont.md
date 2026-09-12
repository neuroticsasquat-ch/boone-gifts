# NEU-1299 — Occasion and folder headings link; person headings don't

**Ticket:** [NEU-1299](https://linear.app/neuroticsasquatch/issue/NEU-1299/occasion-and-folder-headings-link-person-headings-dont-frontend)
**Repo:** `boone-gifts-frontend`
**Story:** [NEU-1295](https://linear.app/neuroticsasquatch/issue/NEU-1295/i-can-see-and-reach-the-occasions-im-shopping-for) — "I can see and reach the occasions I'm shopping for"
**Milestone:** M2 — Navigation
**Blocked by:** [NEU-1290](https://linear.app/neuroticsasquatch/issue/NEU-1290/shared-via-becomes-a-list-of-routes-backend) — **merged** ([PR 186](https://github.com/neuroticsasquat-ch/boone-gifts-backend/pull/186)); [NEU-1291](https://linear.app/neuroticsasquatch/issue/NEU-1291/one-attribution-component-for-lists-and-folders-frontend) — **merged** ([PR 210](https://github.com/neuroticsasquat-ch/boone-gifts-frontend/pull/210)), spec at `docs/specs/NEU-1291-one-attribution-component-for-lists-and-folders.md`
**Sibling, merged:** [NEU-1298](https://linear.app/neuroticsasquatch/issue/NEU-1298/occasion-strip-on-lists-frontend) — the occasion strip is already on `/lists`
**Project spec:** `docs/specs/occasions-and-navigation-project-spec.md` §5.5, §9.1, §13
**ADR:** [`docs/adr/0007-occasions-are-a-destination.md`](../adr/0007-occasions-are-a-destination.md) (amends ADR 0005)
**Branch from and target:** `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

Group by Occasion on `/lists` renders headings that lead nowhere. ADR 0007 reverses the one line in
ADR 0005 that made them dead, and replaces "a source is not a destination" with a test stated in
terms of the destination: **a heading links when its destination carries something the grouping does
not.** `/occasions/:id` carries the My shopping tab and the viewer's budget — the two things v0.5.0
built — and neither is reachable from the grouping. `/folders/:id` carries membership management and
already links. `/people/:id` carries the same lists the grouping just showed, filtered the same way,
and M4 makes it literally derived from that shared scope, so a person heading stays dead.

**The inconsistency is live right now.** NEU-1298 merged the occasion strip, so `/lists` today
renders linkable occasion cards directly above unlinkable occasion headings — the same word behaving
two ways in one scroll, which is the concrete defect ADR 0007 was written to remove.

### Scope correction: the ticket's point 2 has already shipped

The Linear ticket asks for two changes. The second — occasion membership fanning out over every
route, so a list shared to two occasions appears under both headings, and the both-ways list leaves
"Not in an occasion" — **landed with NEU-1291**, which said so in as many words:

> **Decision 4 — "Occasion membership fans out here, not in M2."** … "NEU-1299 is not re-scoped in
> Linear. Its point 1 … remains the whole of that ticket; its point 2 arrives here. Note it on
> NEU-1299 when it is planned."

`list-grouping.ts` already loops every route and fans out (`:104`–`:119`), and
`list-grouping.test.ts:94`–`:124` already asserts the both-ways list groups under its occasion and is
**absent** from "Not in an occasion" — the test the ticket asks for by name. That test is not
rewritten here; it is the inherited guard, and it must keep passing.

So this ticket is point 1 alone: **the occasion name in a grouping heading becomes a link to
`/occasions/:id`.** Folder headings already link (`list-grouping.ts:93`) and are not touched.

## What to change

| File | Change |
|---|---|
| `src/lib/list-grouping.ts` | `ListGroup` gains `qualifier`; `heading` narrows to the linkable name; occasion groups get `href`; bucket order keys off a new `headingText()` |
| `src/pages/Lists.tsx` | Render the qualifier as plain text ahead of the heading; the link wraps the heading only |
| `src/lib/list-grouping.test.ts` | Occasion assertions split into `qualifier` + `heading`; the two dead-heading tests invert into link assertions; bucket order re-asserted against the qualifier |
| `src/pages/Lists.test.tsx` | One rendered-page test: the occasion heading is a link to `/occasions/:id`, the family prefix is not |
| `CONTEXT.md` | Rule 3 retitled and rewritten around ADR 0007's test |

No other file reads `ListGroup`. `ListsArchive.tsx:141` has a `heading` field of its own on an
unrelated interface and does not call `groupLists`.

## Decisions

### 1. Only the occasion name links; the family name is a plain qualifier

The heading reads `Boone Family · Christmas 2026`, and the family name is load-bearing rather than
decoration — two families routinely both call an occasion "Christmas 2026", so the name alone does
not identify one. Linking the whole string would make "Boone Family" clickable text that leads to an
occasion page, which is not where that name points.

```
Boone Family · [Christmas 2026]        ← only the name links
Extended Boones · [Christmas 2026]
```

**Not two links.** The route carries `family.id`, so `Boone Family → /people/families/:id` is
buildable, and it is rejected: NEU-1300 reduces that page's Occasions section to management, so it
would point a heading at a page carrying less than the grouping — exactly what ADR 0007's test
forbids.

The visible consequence is that an occasion heading is now two-toned — the family prefix in the
heading's own gray, the occasion name in the link blue a folder heading already uses. A folder
heading, having no qualifier, stays wholly blue as it is today.

### 2. `ListGroup` gains `qualifier`; `heading` becomes the linkable name

```ts
export interface ListGroup {
  key: string;
  /** A plain prefix ahead of the heading, never linked. Only an occasion has one:
   *  the family, without which the occasion name does not identify one occasion. */
  qualifier: string | null;
  /** The heading's name — and what `href` points, when there is one. */
  heading: string;
  href: string | null;
  lists: GiftList[];
}
```

| grouping | `qualifier` | `heading` | `href` |
|---|---|---|---|
| occasion | `"Boone Family"` | `"Christmas 2026"` | `"/occasions/3"` |
| folder | `null` | `"Christmas 2026"` | `"/folders/5"` |
| person | `null` | `"Jane Boone"` | `null` |
| leftover | `null` | `"Not in an occasion"` | `null` |

`href` keeps the exact meaning it already had — where this heading points — and now points the
`heading` text unambiguously. Folder, person and leftover buckets are untouched in every field but
the added `null`.

Rejected: a nested heading object, and a general `segments: {text, href}[]` list. The segment list
would let a grouping express a heading with two links, which decision 1 forbids, and nothing in the
project needs a third segment.

`into()` takes the qualifier as a new parameter rather than inferring it, so each grouping's call
site states the whole heading in one place.

### 3. Bucket order still keys off the **full** heading text

Buckets are sorted `localeCompare` on the heading, leftover last. That must now compare
`qualifier · heading`, not `heading` alone, via a small helper:

```ts
const headingText = (g: ListGroup) => (g.qualifier ? `${g.qualifier} · ${g.heading}` : g.heading);
```

Sorting on the bare name would change the shipped order — two families' "Christmas 2026" headings
would compare equal and fall back to insertion order, and `Extended Boones · Anniversary` would sort
ahead of `Boone Family · Christmas`. Today's order groups a viewer's buckets by family, which is the
order the "keeps two families' same-named occasions apart" test asserts. Nothing about bucket order
changes in this ticket; the helper is what keeps it from changing by accident.

### 4. An archived occasion's heading links, unmarked

`backend/app/lists/repository.py:79`–`:81` deliberately still yields a route for an archived
occasion, because archiving blocks new shares and withdraws no visibility (ADR 0002 §5.4,
`CONTEXT.md` invariant 2). So archived occasions appear as headings, and they link like any other:
`/occasions/:id` still serves the budget and the My shopping tab when archived, which is precisely
what a viewer still settling up a finished season wants to reach.

Decisive practically: `ShareRoute`'s occasion is `{id, name}` only, so the client holds no archived
flag. Marking or suppressing the link would mean reopening the M1 contract that shipped in NEU-1290
— a backend change in neither this ticket nor this milestone.

### 5. Person headings and the leftover bucket stay dead — asserted, not assumed

`href` stays `null` on every person heading and on every leftover bucket, including
"Not in an occasion". The leftover bucket is the one that matters to assert: it is constructed
separately from the named buckets, so a change that linked every occasion bucket indiscriminately
would make a link out of a heading that names no occasion. Its `null` is tested on the occasion
grouping specifically, alongside a linked named bucket in the same result — a test that only read the
leftover bucket would pass whatever the real headings did.

### 6. `CONTEXT.md` rule 3 is retitled

Rule 3 currently says a heading is rendered "never as a link", with Folder named as the lone
exception "which is the viewer's own grouping and not a source at all". This ticket falsifies that
sentence, and ADR 0007 records that the old rule "now has two exceptions and one holdout". The
headline stops asserting the falsified half and the body carries ADR 0007's test, which is what the
ADR asked for: one rule governing every heading, stated in terms of what the destination is worth
rather than what the heading is called.

Every other clause of rule 3 survives unchanged — source is never a filter-by-default, a heading
appears only inside **Shared with me** and only because the viewer switched Group by on, a list may
appear under several occasion headings, and every grouping keeps its "Not in a …" bucket.

## `CONTEXT.md` edits

Rule 3 becomes:

> 3. **Source is a label; a heading links only when its page carries more.** How a list reached the
>    viewer is rendered on the row. It never becomes a filter-by-default. It may become a *heading* —
>    but only inside **Shared with me**, and only because the viewer switched Group by on.
>
>    A heading links when its destination carries something the grouping does not: `/occasions/:id`
>    has a budget and a shopping tab, `/folders/:id` has membership management. `/people/:id` does
>    not — it is the same lists, filtered the same way — so a person heading leads nowhere
>    (`docs/adr/0007-occasions-are-a-destination.md`, amending ADR 0005). An occasion heading names
>    its family as an unlinked prefix, because the occasion name alone does not identify one
>    occasion.
>
>    A list may appear under **several** occasion headings, as it already could under several
>    folders: grouping fans out over every route, where the row's *label* picks one (direct wins).
>    Every grouping keeps its "Not in a …" bucket, because a section that claims to hold everything
>    shared with the viewer may never quietly drop a list that fits no bucket.

## Acceptance criteria

1. Group by Occasion: each named bucket carries `href: "/occasions/{occasion.id}"`.
2. Each occasion bucket carries `qualifier` set to its family's name and `heading` set to the bare
   occasion name.
3. On `/lists`, the occasion name in a heading is a link to `/occasions/:id`; the family prefix in the
   same heading is **not** a link.
4. Folder headings still link to `/folders/:id`, with `qualifier: null` — unchanged.
5. Person headings carry `href: null`, and so does every leftover bucket, "Not in an occasion"
   included.
6. Bucket order is unchanged from today: alphabetical by the full `qualifier · heading` text, leftover
   last, so two families' same-named occasions stay apart and in family order.
7. An archived occasion's heading links exactly like a live one's.
8. Inherited and still passing: a two-occasion list appears under both headings, and the both-ways
   list is under its occasion heading and **not** in "Not in an occasion".
9. `tsc` and `eslint` pass with no new suppressions.

## Tests

`src/lib/list-grouping.test.ts`

* **The two dead-heading tests invert rather than being deleted.**
  "gives an occasion heading no destination" becomes "points each occasion heading at that occasion's
  page" — asserting `href` is `/occasions/3` on the named bucket. "gives a person heading no
  destination" keeps its assertion and is the holdout ADR 0007 names; it stays as it is.
* The occasion heading's parts: `qualifier` is `"Boone Family"` and `heading` is `"Christmas 2026"` —
  asserted separately, which is what stops a later change from re-joining them into one link.
* The leftover bucket's `href` is `null` in a result that **also** contains a linked named bucket, per
  decision 5.
* Bucket order re-asserted on the two-family fixture against `qualifier · heading`, so the shipped
  order is pinned to the full text rather than to the bare name.
* An occasion grouping where the family name sorts against another family's different occasion name
  (e.g. `Boone Family · Christmas 2026` before `Extended Boones · Anniversary`), which fails if the
  sort keys off `heading` alone.

`src/pages/Lists.test.tsx`

* One rendered test, since the split heading is a render concern the pure function cannot state: with
  Group by Occasion, the occasion name resolves to an anchor with `href="/occasions/3"`, and the
  family name rendered in the same heading resolves to no anchor. This is the assertion that fails if
  `Lists.tsx` ever wraps the whole heading again.

Unchanged and must keep passing: every existing `Lists.test.tsx` and `ListsArchive.test.tsx` fixture,
the NEU-1291 fan-out and both-ways tests, and `ListAttribution.consistency.test.tsx` — this ticket
changes no attribution.

## Out of scope

* **Occasion membership fanning out** — the ticket's point 2, shipped in NEU-1291 (its decision 4).
* **Marking or suppressing an archived occasion's link**, and any change to the `ShareRoute` contract
  (decision 4).
* **`/people/:id` gaining a link from a person heading** — ADR 0007's holdout, and NEU-1316/NEU-1317
  make that page derived from the shared scope in M4.
* **The family page's Occasions section** reducing to management — NEU-1300, same milestone.
* **`/occasions/:id`'s own back link**, today a hardcoded `back="/people"` on the route
  (`routes.tsx:68`). M2's `NavigationDepth` ticket owns it; arriving from a grouping heading is
  exactly a case it will need to handle, and nothing here should pre-empt it.
* **Group by staying opt-in with `none` the default** — unchanged by ADR 0007, which says so
  explicitly.
