# NEU-1318 — Folder Add-a-List offers shared lists

**Ticket:** [NEU-1318](https://linear.app/neuroticsasquatch/issue/NEU-1318/folder-add-a-list-offers-shared-lists-frontend)
**Repo:** `boone-gifts-frontend`
**Story:** [NEU-1312](https://linear.app/neuroticsasquatch/issue/NEU-1312/i-can-add-any-list-i-can-see-to-a-folder) — "I can add any list I can see to a folder"
**Milestone:** M4 — Correctness
**Depends on:** [NEU-1290](https://linear.app/neuroticsasquatch/issue/NEU-1290/shared-via-becomes-a-list-of-routes-backend) — **merged**, spec at `boone-gifts-backend` `docs/specs/NEU-1290-shared-via-becomes-a-list-of-routes.md`; [NEU-1291](https://linear.app/neuroticsasquatch/issue/NEU-1291/one-attribution-component-for-lists-and-folders-frontend) — **merged**, spec at `docs/specs/NEU-1291-one-attribution-component-for-lists-and-folders.md`
**Project spec:** `docs/specs/occasions-and-navigation-project-spec.md` §9.3, §13
**Branch from and target:** `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

### The ticket's premise is half-stale, and this is the half that is left

NEU-1318 says the picker "currently offers only lists the viewer **owns**." On `release/v0.6.0` that
is no longer true, and it is worth writing down exactly why before building anything on it:

- `FolderDetail.tsx:303` calls `getLists()` **unfiltered**, and has since NEU-1259 — before this
  project opened.
- M1's NEU-1290 widened `get_all_visible_lists` (`boone-gifts-backend` `app/lists/repository.py:169`)
  from `owner OR ListShare` to `owner OR ListShare OR occasion-share`. Its own spec says so at line
  157, and a merged integration test pins it:
  `test_unfiltered_lists_includes_an_occasion_only_shared_list`.
- `folders/service.py:80` gates `add_item` on `can_view_list`, so adding a shared list has always
  been accepted server-side. **No backend change is needed and none is in scope.**
- `existingListIds` (`FolderDetail.tsx:315`) already excludes lists in the folder.

M4's milestone note predicted that pulling `ListAttribution` into M1 would cover "the worst of" these
defects. It covered this one's data source too, which nobody noticed. So two of the story's three
acceptance criteria pass today — **untested from the frontend**, resting on a backend test two
milestones away that names neither folders nor pickers.

### What is actually wrong

The picker is a `<select>` whose `<option>` renders a bare `list.name` (`FolderDetail.tsx:341`). The
seeded `Christmas 2026 Shopping` folder is offered Jane's Wishlist, Carol's Wishlist and Gran's List
with nothing saying whose they are. The ticket asks for attribution from `ListAttribution` — and an
`<option>` holds text, while `ListAttributionLine` renders a `<p>`. That conflict is the ticket.

So: **the picker stops being a `<select>` and becomes rows**, each rendering the same attribution
component every other list surface renders, and the offered-set behaviour gets frontend tests that
name it.

## What to change

| File | Change |
|---|---|
| `src/pages/FolderDetail.tsx` | `AddListForm` becomes a row list; two queries replace the unfiltered one; `FolderLists` gains the ownership split |
| `src/pages/FolderDetail.test.tsx` | The picker's cases, below — it covers none today |
| `src/components/ListAttribution.consistency.test.tsx` | The picker becomes a fourth call site |
| `CONTEXT.md` | A Terms row for the picker |

## Decisions

### 1. Rows, not a `<select>`

```
Add a List
┌────────────────────────────────────┐
│ Gran's List                  [Add] │
│ Boone Family                       │
├────────────────────────────────────┤
│ Carol's Wishlist             [Add] │
│ from Carol Boone                   │
├────────────────────────────────────┤
│ My Christmas Ideas           [Add] │
└────────────────────────────────────┘
```

Name, attribution line, Add button — the same shape as the folder's own rows directly above it.

The alternative was keeping the `<select>` and composing option text from `attributionFor()`. It is
the smaller diff and it was rejected: it makes a **second place that turns a share route into words**,
which is the precise drift M1's contract ("`ListAttribution` becomes the only component rendering a
share route") exists to prevent. A picker that computes its own label is how `/lists` and the folder
page came to disagree in the first place (NEU-1286).

A third option — `<select>` with the line rendered beside the *selected* list — honors the contract
but makes the viewer select a list to learn whose it is. A picker you cannot scan is not a picker.

### 2. The owned row's line comes from `RecipientLine`, not `ListAttributionLine`

`attributionFor()` falls through to the owner's name on a list with no route and no recipient, so
`ListAttributionLine` on a list the viewer owns reads **"from Tom Boone" to Tom** — the app telling
you a list came from yourself.

`/lists` already solved this by pairing: `RecipientLine` on owned rows (`Lists.tsx:307`),
`ListAttributionLine` on shared ones (`SharedListRows.tsx:49`). The picker mixes both populations in
one control, so it applies the same pairing per row rather than per section:

- the viewer owns it → `RecipientLine` — "for Beth", or **no second line at all**
- someone else owns it → `ListAttributionLine` — "from Carol Boone", "Boone Family", "for Beth ·
  kept by Gran"

This is an existing rule reaching a third surface, not a new one. No ADR.

### 3. Two queries, reusing `/lists`' cache keys

`getLists()` unfiltered is dropped for the pair `/lists` already warms:

```ts
const owned = useQuery({
  queryKey: ["lists", "owned", { archived: false }],
  queryFn: () => getLists("owned", false),
});
const shared = useQuery({
  queryKey: ["lists", "shared", { archived: false }],
  queryFn: () => getLists("shared", false),
});
```

Three things fall out of it:

1. **Ownership is which query a row came from** — the same fact `/lists` reads it from, so decision 2
   needs no second way of answering "is this mine". Not `owner_id === user.id` (a second answer to a
   settled question) and certainly not `shared_via.length === 0`, which also means "reached the viewer
   a way this endpoint does not report".
2. **Arriving from `/lists` costs no request.** `OccasionSharingModal.tsx:46` already makes this
   argument for the same keys.
3. **`queryKey: ["lists"]` is retired.** It encodes neither filter nor archived, alone among the
   call sites, and holds a third copy of rows the cache already has.

The union of the two queries equals the unfiltered scope: `filter=owned` is `owner_id == user`,
`filter=shared` is taken from `get_share_routes`' keys, and `get_all_visible_lists` is those two
terms OR'd. Nothing is lost by splitting them.

### 4. Owned rows first, then shared, each in the backend's order

Concatenation in `/lists`' own section order, each half keeping `updated_at desc`. It preserves what
the `<select>` shows today, and decision 2 already marks where the boundary falls — a shared row
carries a "from" line, an owned one mostly carries nothing.

Alphabetical was the real contender, and is the better order for a find-by-name control. It was
turned down because this is a correctness ticket: changing the order is a second change, unrelated to
the defect, made on a control nobody has complained about the ordering of.

### 5. Either query failing fails the whole control

Today `allLists.data ?? []` reads a failed request as "no lists". With two queries that gets sharper:
**if the shared half fails and the owned half succeeds, the picker offers owned lists only — the
exact defect this ticket exists to fix, produced by a network error instead of a query param.**

So the control renders "Failed to load your lists." and no rows unless both halves loaded, and a
spinner while either is loading. This is `OccasionSharingModal.tsx:116`'s rule verbatim: a failed read
on either half leaves the rows unsafe to render.

### 6. The two emptinesses are said apart

`if (availableLists.length === 0) return null` deletes the heading and the control together, so a
complete folder and a broken page look identical. Two different absences, two sentences — the split
`OccasionSharingModal.tsx:197` already makes:

- **The viewer can see no lists at all** → "You can't see any lists yet." with a `Create a list` link
  to `/lists/new`. Someone who owns nothing needs a way to make one.
- **Every list they can see is already here** → "Every list you can see is already in this folder."
  Nothing to offer and nothing to fix; this is the folder working.

The heading stays in both cases.

### 7. `FolderLists` gets the same ownership split

The folder's own rows render `ListAttributionLine` on every row, so a list the viewer owns with no
recipient reads "from Tom Boone" there too. Left alone, this ticket ships a page whose rows and whose
picker disagree about the same list — the defect class NEU-1286 and M1's one-component contract exist
to prevent, reintroduced one section apart on one page.

So `FolderLists` takes decision 2's pairing as well. The consistency test's fixture is a **shared**
list, so that test is untouched by this.

Scope stops there. Auditing every other `ListAttributionLine` call site for the same owned-row
fallthrough is a separate sweep and is **not** in this ticket.

### 8. No filter box

Both sharing modals gained one in M3, and this picker does not. M3 scoped its filters to the two
surfaces that fail first and put pagination explicitly out of scope until a real user passes ~15
connections — anticipated, not observed (project spec §3). A filter here would be the same
anticipation one milestone later, on a control this ticket is meant to make *correct* rather than to
scale. The picker stays inline at the bottom of the Lists tab; it does not become a modal.

## Acceptance criteria

1. A list shared with the viewer **through an occasion only** is offered by the picker.
2. A list shared with the viewer **directly** is offered by the picker.
3. A list already in the folder is **not** offered.
4. Adding a shared list succeeds and the new row carries the same attribution line the picker showed.
5. A row for a list someone else owns carries `ListAttributionLine`'s line; a row the viewer owns
   carries `RecipientLine`'s, which is nothing when the list is for no one.
6. The picker's line for a given shared list is **identical** to the line `/lists` renders for it.
7. Either query failing renders a failure and no rows — never a partial population.
8. The two empty states render their two different sentences, and the heading survives both.
9. `FolderLists` no longer attributes an owned list to its own viewer.
10. No request is made on a folder page reached from `/lists` — both keys are already warm.

## Testing

Project spec §13 lists no folder-picker expectation; these are this ticket's.

**`FolderDetail.test.tsx`** — the picker has no coverage at all today:

- an occasion-only shared list is offered (criterion 1 — the regression that pins the stale premise,
  and the one that would have failed before NEU-1290)
- a directly shared list is offered (2)
- a list already in the folder is absent from the picker (3)
- clicking Add on a shared row calls `addFolderItem` with that list's id (4)
- an owned row renders no "from" line; a shared row does (5)
- the shared query failing renders the failure and **no rows**, with the owned query succeeding —
  asserting the owned-only population is not rendered (7)
- no visible lists → the create-a-list sentence; all lists already in the folder → the other
  sentence (8)

**`ListAttribution.consistency.test.tsx`** — the picker becomes a fourth call site (6).

The existing `BOTH_WAYS` fixture is *inside* `FOLDER`, so the picker excludes it by design. Covering
the picker needs a **second shared list that is not in the folder**, and the assertion must be scoped
to the picker's subtree — `findByText` would otherwise match the folder's row and the picker's row
for the same name and fail as ambiguous. The second fixture should also be a both-ways list, for the
reason the first one is: it is the case where every page-local shortcut gives a different answer from
"direct wins".

## Out of scope

- **Any backend change.** `add_item`'s `can_view_list` gate and the widened unfiltered scope both
  already do the right thing; this ticket adds no endpoint and changes no schema.
- **A filter box, pagination, or a modal** for the picker (decision 8).
- **The generic `toast.error("Failed to add list.")` on a 409.** A stale cache in a second tab can
  still add a list the folder already holds and get a generic failure for it. Pre-existing, rare, and
  unrelated to the offered set — left as is.
- **An app-wide audit** of `ListAttributionLine` call sites for the owned-row fallthrough
  (decision 7).
- **Row ordering as a UX question.** Decision 4 preserves today's order deliberately; changing it is
  a separate ticket if anyone ever wants it.
