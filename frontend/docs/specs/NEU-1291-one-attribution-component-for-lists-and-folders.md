# NEU-1291 — One attribution component for lists and folders

**Ticket:** [NEU-1291](https://linear.app/neuroticsasquatch/issue/NEU-1291/one-attribution-component-for-lists-and-folders-frontend)
**Repo:** `boone-gifts-frontend`
**Story:** [NEU-1286](https://linear.app/neuroticsasquatch/issue/NEU-1286/a-list-that-reached-me-two-ways-says-so) — "A list that reached me two ways says so"
**Milestone:** M1 — Contract
**Blocked by:** [NEU-1290](https://linear.app/neuroticsasquatch/issue/NEU-1290/shared-via-becomes-a-list-of-routes-backend) — **merged** ([PR 186](https://github.com/neuroticsasquat-ch/boone-gifts-backend/pull/186)), spec at `boone-gifts-backend` `docs/specs/NEU-1290-shared-via-becomes-a-list-of-routes.md`
**Blocks:** [NEU-1299](https://linear.app/neuroticsasquatch/issue/NEU-1299/occasion-and-folder-headings-link-person-headings-dont-frontend) (heading links), [NEU-1316](https://linear.app/neuroticsasquatch/issue/NEU-1316/derive-the-connection-profile-from-the-shared-scope-frontend) (connection profile)
**Project spec:** `docs/specs/occasions-and-navigation-project-spec.md` §9.3, §10.1, §13
**Branch from and target:** `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

NEU-1290 widened `shared_via` from a nullable scalar to an array of every route by which a list
reached the caller, on all four list-row surfaces:

```ts
shared_via: ShareRoute[]              // never null, never absent, [] on an owned row
ShareRoute = { kind: "direct",   person:   {id, name} }
           | { kind: "occasion", occasion: {id, name}, family: {id, name} }
```

The backend deliberately **ranks nothing** — routes come back direct-first then by ascending
occasion id, stable so responses do not churn, and its docstring says in as many words that this is
not a ranking the client may read `routes[0]` from (NEU-1290 decision 4). The label rule —
**direct wins** — is this ticket's, applied in `lib/attribution.ts` and rendered by
`components/ListAttribution.tsx`.

Right now `release/v0.6.0` renders attribution *wrong*: the scalar reads in `attribution.ts` and
`list-grouping.ts` do not throw against an array, they fall through — every shared row reads
`from {owner_name}` and every grouped list lands in a leftover bucket. NEU-1290 decision 10 accepted
that interim explicitly, on the grounds that this ticket is next and a compatibility shim would be
code this ticket deletes. This ticket ends it.

### The ticket's premise is already half-true

The ticket says "the folder page is the bug — point it at `ListAttribution`". It already points
there: `FolderDetail.tsx:256` renders `<ListAttributionLine>`, as do `Lists.tsx:77`,
`ListsArchive.tsx:97` and `OccasionDetail.tsx:288`. The two pages disagreed because folder rows
*carried no routes*, and NEU-1290 decision 5 fixed that by routing all four surfaces through
`to_summaries`. So the work here is **consuming the new shape**, not re-pointing a call site — plus
the cross-page test that keeps the call sites from drifting apart again (§13).

## What to change

| File | Change |
|---|---|
| `src/types/index.ts` | `ShareRoute` union replaces `SharedVia`; `GiftList.shared_via: ShareRoute[]` (required) |
| `src/lib/attribution.ts` | `attributionFor` applies direct-wins over the array; `ListLike.shared_via?: ShareRoute[]` |
| `src/lib/list-grouping.ts` | Occasion membership fans out over every occasion route; person grouping keys on `direct` |
| `src/components/ListAttribution.consistency.test.tsx` | **New** — one test, both call sites |
| `src/lib/attribution.test.ts`, `src/lib/list-grouping.test.ts` | Fixtures become arrays; scalar cases invert rather than being deleted |
| `src/pages/Lists.test.tsx`, `src/pages/ListsArchive.test.tsx` | Fixtures become arrays |
| `CONTEXT.md` | **Share route** gains a Terms row; the source-label row records direct-wins and the multi-family form |

`src/pages/ListDetail.tsx` is **not** touched — see decision 5.

## Decisions

### 1. Direct wins, applied here and nowhere else

```ts
const routes = list.shared_via ?? [];
const direct = routes.find((r) => r.kind === "direct");
if (direct) return { kind: "owner", subject: direct.person.name, keeper: null };
```

A direct share is the durable grant: it survives the viewer leaving the family or the occasion share
being revoked, and it is what `/lists` already showed before the widening. `CONTEXT.md` rule 1
already leans on exactly this property to justify the sharing panel disabling a redundant person
without the API refusing the grant.

This is the rule's **only home**. The backend refuses to rank (NEU-1290 decision 4) and grouping
needs the whole array anyway, so a second ranking anywhere would be a second statement of one rule.

### 2. An occasion-only row names every distinct family, comma-joined

A list can now carry two occasion routes from two different families — Boone Family's Christmas and
Extended Boones' Christmas. The row names the **family**, not the occasion (project spec §9.1: the
occasion is how the share was made, the family is who the viewer recognises), and with two families
there is no honest single name to pick.

```
one family:    Boone Family
two families:  Boone Family, Extended Boones
```

**Comma, not the middle dot.** The dot on this line already means "two different facts joined"
(`for Beth · kept by Tom`) and heads the grouping bucket as `Boone Family · Christmas 2026`. A comma
reads as a list of like things, and degrades to a bare name in the one-family case with no
special-casing.

Names are **de-duplicated** — two occasions of one family read as that family once, not twice — and
kept in route order, which is stable by ascending occasion id.

### 3. The `family` arm keeps a single pre-joined `subject`

`ListAttribution` is not the only consumer of `attributionFor`: `ListDetail.tsx:225` reads
`attribution.subject` on its non-absent branch. Widening the arm to `subjects: string[]` would force
every consumer to branch on a case none of them can reach (detail responses carry no routes at all —
NEU-1290 decision 8). The join belongs in `attribution.ts`, which `CONTEXT.md` already names as an
owner of these labels alongside the component.

### 4. Occasion membership fans out **here**, not in M2

`list-grouping.ts` cannot compile against the array — `via?.kind` on an array, and the `"user"` arm
renamed to `"direct"` — so this ticket must touch it regardless. It does the fan-out properly:

```ts
for (const route of list.shared_via) {
  if (grouping === "occasion" && route.kind === "occasion")
    into(`occasion:${route.occasion.id}`,
         `${route.family.name} · ${route.occasion.name}`, null, list);
  else if (grouping === "person" && route.kind === "direct")
    into(`person:${route.person.id}`, route.person.name, null, list);
}
// no matching route of this kind → the leftover bucket, exactly as today
```

The alternative — a `primaryRoute()` shim preserving one-bucket semantics until NEU-1299 — would
reintroduce client-side ranking (decision 1) and be deleted by the next ticket that reads the file.
NEU-1290 decision 10 already rejected shim code on that reasoning.

**NEU-1299 is not re-scoped in Linear.** Its point 1 (occasion headings link to `/occasions/:id`,
folder headings keep theirs, person headings still link nowhere — ADR 0007) is untouched and remains
the whole of that ticket; its point 2 arrives here. Note it on NEU-1299 when it is planned, as
NEU-1290 decision 6 did for NEU-1318.

This is also what closes story NEU-1286: the both-ways list groups under its **occasion** while being
*labelled* with the person, and leaves "Not in an occasion" — the bucket ADR 0005 introduced
precisely so nothing shared with the viewer could silently vanish.

The leftover bucket keeps its meaning: `href` stays `null` on every occasion and person heading, and
a list matching no route of the current kind still lands there (`CONTEXT.md` rule 3).

### 5. `shared_via` is required on `GiftList`, optional on `ListLike`

The API keeps the guarantee, so the row type should state it: a fixture that forgets `shared_via`
fails to compile rather than silently exercising the fallback. `ListLike` is structural and also
serves the detail shapes, which genuinely lack the field, so it stays optional there with `?? []`
absorbing that and any response cached across the deploy.

`SharedVia` and `SharedViaFamily` retire. The `"user"` arm becomes `"direct"` — matching the backend
union, the `CONTEXT.md` term, and the M1 contract every downstream ticket is written against.

### 6. `ListDetail` stays as it is

It calls `attributionFor` directly rather than rendering `<ListAttributionLine>`, which looks like a
violation of "one component renders a share route". It is not: the detail header renders a *linked*
subtitle the row form has no place for, and detail responses carry no `shared_via` at all, so it
renders no share route. Its non-absent branch resolves to `from {owner_name}` by the `?? []`
fallback, unchanged.

Its `from {linkToOwner(attribution.subject)}` branch would render a family name as a person's link if
a detail response ever did carry routes. Unreachable today, unreachable by decision 8 of NEU-1290,
and out of scope here.

## `CONTEXT.md` edits

* **Terms** gains **Share route** — "One way a list reached me: a direct share, or an occasion of a
  family I belong to. A list can have several; `shared_via` is the array of all of them" →
  `lib/attribution.ts`, `lib/list-grouping.ts`.
* The **from Jane / Boone Family** row records that a list may arrive several ways, that **direct
  wins** when both exist, and that an occasion-only row names every distinct family, comma-joined.
* **Rule 3** is unchanged in substance — source is still a label, headings still link nowhere — but
  note that a list may now appear under **several** occasion headings, as it already could under
  several folders.

## Acceptance criteria

1. A list carrying both a direct and an occasion route reads **from {person}** — direct wins.
2. An occasion-only list reads its family's bare name, with no `from`.
3. An occasion-only list reaching the viewer through two families reads
   `Boone Family, Extended Boones`; through two occasions of one family, that family once.
4. A row with `shared_via: []` reads `from {owner_name}`.
5. A recipient still outranks every route: `for Beth · kept by Tom`, however the list arrived.
6. The same list renders the **identical** attribution line on `/lists` and on `/folders/:id`.
7. Group by Occasion: a two-occasion list appears under **both** headings; a both-ways list appears
   under its occasion heading and **not** in "Not in an occasion".
8. Group by Person: a both-ways list appears under its person heading. A list with no direct route
   is in "Not shared directly by a person".
9. Occasion and person headings still carry `href: null`; folder headings keep their link.
10. `SharedVia` no longer exists in `src/`; no runtime read of `shared_via` treats it as a scalar.
11. `tsc` and `eslint` pass with no new suppressions.

## Tests

* `ListAttribution.consistency.test.tsx` — **new**: one both-ways fixture list, rendered through
  `/lists` and through `/folders/:id`, asserting the same line from each. This is project spec §13's
  "assert it once, against both call sites", and it fails if either page stops calling the component
  — the regression NEU-1286 was opened on.
* `attribution.test.ts` — direct-only, occasion-only, **both**, two families, two occasions of one
  family, and `[]`. The existing scalar tests **invert rather than being deleted**: each names a case
  that still has an answer, now plural.
* `attribution.test.ts` — recipient outranks a both-ways array (the existing precedence test, rearmed).
* `list-grouping.test.ts` — the two-occasion fan-out, and the both-ways list asserted **absent** from
  "Not in an occasion" and present under its occasion. The existing single-bucket assertions invert.
* `list-grouping.test.ts` — the leftover buckets still catch a list with no route of the current kind.
* `Lists.test.tsx`, `ListsArchive.test.tsx`, `OccasionDetail.test.tsx`, `FolderDetail.test.tsx` —
  fixtures updated to arrays; existing assertions hold unchanged, which is the point.

## Out of scope

* **Occasion headings linking to `/occasions/:id`** — NEU-1299 point 1, in M2, governed by ADR 0007.
  Only the fan-out (its point 2) lands here (decision 4).
* Re-scoping NEU-1299 in Linear — note it on the ticket when it is planned.
* `ConnectionProfile` and the retirement of `GET /connections/{id}/lists` — NEU-1316/NEU-1317, M4.
* The folder Add-a-List picker offering shared lists — NEU-1318, M4. Its backend half already
  shipped with NEU-1290 (decision 6 there).
* `ListDetail`'s direct use of `attributionFor`, and its latent family-name-as-person-link branch
  (decision 6).
* `FolderDetail` rendering `<ListAttributionLine>` on the viewer's **own** rows, where `/lists` uses
  `RecipientLine` — so an owned list in a folder reads `from Me`. Pre-existing, unchanged by the
  widening, and not what NEU-1286's "same attribution" claim is about; worth its own ticket if it
  ever bothers anyone.
* Any change to the `shared_via` contract itself. It shipped in NEU-1290 and this ticket consumes it
  as-is.
