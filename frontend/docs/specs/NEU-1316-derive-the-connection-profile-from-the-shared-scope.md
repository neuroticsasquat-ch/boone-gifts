# NEU-1316 — Derive the connection profile from the shared scope

**Ticket:** [NEU-1316](https://linear.app/neuroticsasquatch/issue/NEU-1316/derive-the-connection-profile-from-the-shared-scope-frontend)
**Repo:** `boone-gifts-frontend`
**Story:** [NEU-1311](https://linear.app/neuroticsasquatch/issue/NEU-1311/a-persons-page-shows-everything-theyve-shared-with-me) — "A person's page shows everything they've shared with me"
**Milestone:** M4 — Correctness
**Blocked by:** [NEU-1290](https://linear.app/neuroticsasquatch/issue/NEU-1290/shared-via-becomes-a-list-of-routes-backend) — **merged**, spec at `boone-gifts-backend` `docs/specs/NEU-1290-shared-via-becomes-a-list-of-routes.md`; [NEU-1291](https://linear.app/neuroticsasquatch/issue/NEU-1291/one-attribution-component-for-lists-and-folders-frontend) — **merged**, spec at `docs/specs/NEU-1291-one-attribution-component-for-lists-and-folders.md`
**Blocks:** [NEU-1317](https://linear.app/neuroticsasquatch/issue/NEU-1317/retire-the-connection-lists-endpoint-backend) — the backend cannot delete the endpoint until this ships
**Project spec:** `docs/specs/occasions-and-navigation-project-spec.md` §9.4, §10.3, §13
**ADR:** `docs/adr/0007-occasions-are-a-destination.md`
**Branch from and target:** `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

`ConnectionProfile` fetches `GET /connections/{id}/lists`, and that endpoint answers **direct shares
only** — `app/connections/service.py:136` reads `get_lists_shared_by_user`, whose predicate is
`ListShare.list_id IN (…)`, the direct-share table. The shared scope the client already holds is
wider: since NEU-1290, `GET /lists?filter=shared` is taken from `get_share_routes`' keys, which cover
direct **and** occasion routes.

So clicking "from Carol Boone" on a list that reached the viewer through the Boone Family's Christmas
lands on a Carol page that omits the very list they came from. The page stops asking the server a
narrower question and derives its rows from the scope it already has: **every list owned by that
person, by any route.**

One source of truth. The profile then agrees with `/lists` by construction rather than by two
implementations happening to match, and `GET /connections/{id}/lists` has no caller left — which is
what NEU-1317 needs.

**It does not gain a list of occasions shared with that person.** That is the family's business and
belongs on the occasion card; the profile stays a label's destination, not a second index (project
spec §9.4). This is also why person headings do not link — ADR 0007, not reopened here.

### The back control is already done

The ticket notes `← Back to connections` is gone by the time this lands. Confirmed:
`ConnectionProfile.tsx:34` already renders `<BackControl fallback={BACK_TO_PEOPLE} />`, in the
not-found arm too, and `ConnectionProfile.test.tsx` covers all three cases from NEU-1302. Nothing
here touches it.

## What to change

| File | Change |
|---|---|
| `src/pages/ConnectionProfile.tsx` | Reads the shared scope, filters on `owner_id`, gains an error arm, renders `<SharedListRows>` |
| `src/components/SharedListRows.tsx` | **New** — `SharedRows` and `ToBuyBadge` lifted verbatim out of `Lists.tsx` |
| `src/pages/Lists.tsx` | Imports the component; its local `SharedRows` and `ToBuyBadge` are deleted |
| `src/api/connections.ts` | `getConnectionLists` deleted |
| `src/pages/ConnectionProfile.test.tsx` | Handler swap, and the new cases below |
| `src/components/ListAttribution.consistency.test.tsx` | The profile becomes a third call site |
| `CONTEXT.md` | A Terms row for the person's page; rule 3 records the owner/route distinction |

## Decisions

### 1. Membership is keyed on the **owner**, not on a direct route

```ts
const ownerId = connection?.user.id;
const lists = useMemo(
  () => (sharedLists.data ?? []).filter((list) => list.owner_id === ownerId),
  [sharedLists.data, ownerId],
);
```

The route param is the **connection id**, not the user id — `/people/5` is connection 5, whose
`user.id` may be 2. The `["connections"]` query the page already runs is the mapping, and this is the
same hop `ListDetail.tsx:289` makes in the other direction to decide where "from Gran Boone" links.
So the filter waits on `connection`, which the page already waits on to render a name at all.

Keying on ownership rather than on `shared_via` is what makes the occasion-reached list appear.
A `direct` route's person *is* the list's owner — `lib/attribution.ts` says so where it resolves the
direct arm — so ownership is the wider key, and the wider key is the ticket's whole point.

### 2. Group by → Person stays direct-keyed, and the two deliberately differ

`list-grouping.ts:146` buckets Group by → Person on `route.kind === "direct"`, with an occasion-only
list falling to "Not shared directly by a person". That is NEU-1291 decision 4, shipped in M1, and it
is **not** re-keyed here.

So Carol's page is the **wider** of the two: it holds her occasion-reached lists, and her Group-by
bucket does not. NEU-1311's "the page agrees with what Group by → Person shows for the same person"
is satisfied as **containment** — nothing the grouping files under Carol is missing from Carol's page,
which is the direction the story's defect runs. Re-keying the grouping on ownership was considered
and rejected: every shared list has an owner, so "Not shared directly by a person" would never catch
anything again, and a leftover bucket that can never fill is a bucket whose name is a lie
(`CONTEXT.md` rule 3).

**Known tension, recorded not resolved.** ADR 0007 keeps person headings dead partly on the grounds
that `/people/:id` is "a strictly emptier view of what the reader is already looking at". Against the
whole shared scope that stays true; against the *person bucket* the reader is looking at while
grouped, it no longer is. The heading rule is ADR 0007's and this ticket does not reopen it; the
profile is still a filtered cut of the same scope and carries no fact the reader could not get by
ungrouping.

### 3. One shared-row component, so the two pages cannot drift

`Lists.tsx` renders shared rows through a local `SharedRows`; the profile hand-rolls its own markup.
Now that both draw the same rows from the same scope, that is the exact shape of the defect NEU-1286
was opened on, one page over. `SharedRows` and its `ToBuyBadge` move to
`components/SharedListRows.tsx` unchanged and both pages call it.

A profile row therefore reads:

```
Gran's List
from Alice                          • 2 to buy
3 of 8 claimed
```

- The **attribution line comes along**, and it earns its place: an occasion-only row reads
  `Boone Family`, which is what explains the row's presence on a page about a person. A direct row
  reads `from Alice` on Alice's page — mildly redundant, and the price of one component rather than a
  second labelling rule outside `lib/attribution.ts`, which NEU-1291 decision 1 named that rule's
  only home.
- The **`• N to buy` badge comes along**, and its own comment already cites this section: a claim on a
  directly-shared list belongs to no occasion and appears on no shopping tab, so the badge is its only
  route back (project spec §9.4).
- The **description line is dropped.** `/lists` has never shown it on a shared row, and keeping it
  would mean a prop only one of two call sites sets — near-identical rows instead of identical ones,
  and a consistency test that has to allow for the difference.

`FolderDetail`, `OccasionDetail` and `ListsArchive` keep their own row markup: their rows carry
different affordances (a remove action, an unarchive control) over different payloads. They already
render `<ListAttributionLine>`, which is the part that had to agree.

### 4. A failed read is not an empty person

The empty state is a claim about Alice — "No lists shared with you yet." — and may only be made on
data that arrived. Today a failed `/connections/5/lists` renders the heading with nothing under it and
says nothing; derived from a shared scope that can fail the same way, that silence would become the
empty state, stating as fact about Alice what is really a fact about the network.

`sharedLists.isError` gets its own arm — `Couldn't load these lists.` — and suppresses the empty
state. This is `CONTEXT.md` rule 7's distinction applied one layer down: a wrong address, a slow one
and a failed one are three different things, and the milestone is named Correctness.

The spinner arm becomes `connections.isPending || sharedLists.isPending`. The not-found arm
(`!connection`) is unchanged, still rendering `BACK_TO_PEOPLE`, and still takes precedence over
anything about lists — a connection the viewer cannot see has no page to put an error on.

### 5. The same cache entry `/lists` already fills

```ts
const sharedLists = useQuery({
  queryKey: ["lists", "shared", { archived: false }],
  queryFn: () => getLists("shared"),
});
```

Key and function copied exactly from `Lists.tsx:137`, so arriving from `/lists` paints from cache with
no request, and every mutation that already invalidates `["lists"]` keeps this page fresh too. A key
that differed by a character would be a second copy of the same data, which is the thing this ticket
exists to stop.

### 6. Archived lists stay out, and the order is the server's

`getLists("shared")` sends `archived=false`, and the retired endpoint filtered
`is_archived == False` too — so nothing changes for the viewer, and the archive stays `/lists/archive`
alone (project spec §9.5). Row order is the shared scope's `updated_at DESC`, which is also what the
retired endpoint returned. The profile gains no sort, filter or grouping control: it is a cut of a
page that has all three.

### 7. `getConnectionLists` is deleted, not left unused

The client function goes with its last caller. NEU-1317 deletes the endpoint behind it, and a
dead API wrapper left in `src/api/connections.ts` would read as a contract the backend still owes.
After this ticket no file under `src/` mentions `connections/{id}/lists`.

## `CONTEXT.md` edits

* **Terms** gains **A person's page** — "Every list that person owns which I can see, however it
  reached me. Derived from the shared scope, not fetched as its own index; it lists no occasions, and
  it is a label's destination rather than a second index" → `pages/ConnectionProfile.tsx`.
* The **Shared with me** row gains `components/SharedListRows.tsx` alongside `pages/Lists.tsx` as
  what renders it — one row component, two pages.
* **Rule 3** notes that a person's page is keyed on **ownership** while Group by → Person keys on the
  **direct route**, so the page is the wider of the two, and that the heading still leads nowhere
  (ADR 0007).

## Acceptance criteria

1. A list that reached the viewer **only through an occasion**, owned by this person, appears on their
   page. (The ticket's stated test.)
2. A directly-shared list of theirs still appears, and a both-ways list appears **once**.
3. A list owned by someone else does not appear, whatever occasion it came through.
4. No request to `/connections/{id}/lists` is made by any page, and `getConnectionLists` no longer
   exists in `src/`.
5. Arriving from `/lists` renders rows with no new request — same query key, same cache entry.
6. A row on the profile renders the identical attribution line the same list gets on `/lists`.
7. The `• N to buy` badge shows on a profile row whose list carries unbought claims, and is absent at
   zero or when the count is.
8. An archived list of theirs does not appear.
9. With no visible lists of theirs, the page reads "No lists shared with you yet."
10. When the shared-scope read fails, the page reads "Couldn't load these lists." and **not** the empty
    state.
11. A connection id the viewer is not party to still renders "Connection not found." with
    `← Back to People`.
12. The page lists no occasions and gains no second section.
13. `tsc` and `eslint` pass with no new suppressions.

## Tests

`ConnectionProfile.test.tsx` — handlers become `GET /lists?filter=shared` instead of
`GET /connections/5/lists`; the fixture is a shared scope holding four lists: one owned by Alice
reached **only** through an occasion, one owned by Alice reached directly, one owned by Alice reached
**both** ways, and one owned by a third party through the same occasion.

* The occasion-only list appears — the regression this ticket is for.
* The third party's list does not.
* The both-ways list appears exactly once.
* Rows read their `ListAttributionLine`: the occasion-only one reads `Boone Family`, the direct one
  `from Alice`.
* `• N to buy` renders from `my_unpurchased_claim_count` and is absent at zero.
* Empty state on a scope holding none of theirs.
* **Error arm**: the shared-scope handler answers 500 — "Couldn't load these lists." is shown and the
  empty state is not.
* The three existing back-control tests are unchanged and must stay passing.

`ListAttribution.consistency.test.tsx` — the both-ways fixture gains a **third** rendering, through
`/people/:id`, asserting the same line as `/lists` and `/folders/:id`. The test exists to fail when a
page stops calling the component or draws a line of its own beside it (project spec §13), and the
profile is now such a page.

`Lists.test.tsx`, `ListsArchive.test.tsx` — untouched, and passing unchanged is the point: the row
component moved files without changing markup.

## Out of scope

* **Retiring the endpoint** — NEU-1317, backend, which this unblocks.
* **A list of occasions shared with that person** — refused by project spec §9.4 and the M4 contract:
  the profile is a label's destination, not a second index.
* **Re-keying Group by → Person on ownership** — decision 2.
* **Linking person headings** — ADR 0007.
* **`FolderDetail`, `OccasionDetail` and `ListsArchive` adopting `SharedListRows`** — decision 3.
* **The description line on shared rows**, on either page — decision 3.
* **Any filter, sort or pagination on the profile.** M3 scoped the sharing modal and `/people` for
  scale; a person with fifty lists is not a state any user is near, and project spec §3 defers
  pagination until one is.
* **A profile for someone who is not a connection.** An occasion can carry a list from a family member
  the viewer has no connection to; there is no `/people/:id` for them and this ticket makes none —
  `ListDetail` already renders that owner's name unlinked.
