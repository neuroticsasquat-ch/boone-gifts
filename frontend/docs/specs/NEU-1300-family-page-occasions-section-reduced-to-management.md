# NEU-1300 — Family page occasions section reduced to management

**Ticket:** [NEU-1300](https://linear.app/neuroticsasquatch/issue/NEU-1300/family-page-occasions-section-reduced-to-management-frontend)
**Repo:** `boone-gifts-frontend`
**Story:** [NEU-1295](https://linear.app/neuroticsasquatch/issue/NEU-1295/i-can-see-and-reach-the-occasions-im-shopping-for) — "I can see and reach the occasions I'm shopping for"
**Milestone:** M2 — Navigation
**Siblings, merged:** [NEU-1298](https://linear.app/neuroticsasquatch/issue/NEU-1298/occasion-strip-on-lists-frontend) — the occasion strip is on `/lists` (PR 212, `8d353d6`); [NEU-1299](https://linear.app/neuroticsasquatch/issue/NEU-1299/occasion-and-folder-headings-link-person-headings-dont-frontend) — occasion headings link (PR 213, `c256497`); [NEU-1293](https://linear.app/neuroticsasquatch/issue/NEU-1293/confirmdialog-component-replacing-the-three-current-patterns-frontend) — `ConfirmDialog` exists and `FamilyDetail` already uses it (PR 211, `3ba835b`)
**Siblings, open:** [NEU-1301](https://linear.app/neuroticsasquatch/issue/NEU-1301/usesearchparamstate-and-url-held-view-state-frontend) — `useSearchParamState`; [NEU-1302](https://linear.app/neuroticsasquatch/issue/NEU-1302/history-aware-back-control-and-fallback-table-frontend) — history-aware Back
**Project spec:** `docs/specs/occasions-and-navigation-project-spec.md` §5.6, §9.5, §6.2, §13
**ADR:** [`docs/adr/0007-occasions-are-a-destination.md`](../adr/0007-occasions-are-a-destination.md) (amends ADR 0005)
**Branch from and target:** `release/v0.6.0` — not `main` (project spec §12.1)

## What to build and why

`/people/families/:id` was the only route to `/occasions/:id`, and `/occasions/:id` holds the My
shopping tab and the viewer's budget — the two things v0.5.0 built. Reaching them meant People → a
family → an Occasions section buried mid-page. ADR 0007 calls that entry point inadequate and
NEU-1298 replaced it: the occasion strip on `/lists` is now the way in, one click from the landing
page.

This ticket collects the consequence. §5.6: the family page's Occasions section is reduced to
**management** — create, rename, archive, view archive — and *"the page should stop reading as though
it were the entry point."* The ticket names the defect precisely: the page "interleaves member
administration, occasions, invites, rename and delete in one long column, with the occasions list
sitting in the middle as the only route to a page holding the viewer's budget."

The first half of that sentence is the work. The second half already stopped being true when
NEU-1298 merged.

**Permissions do not change.** Organizer-only rename and archive, any member may create, plain
members see neither invite nor rename nor delete. Nothing here touches a gate, a mutation, or an
endpoint.

### Scope observation: the section is already management-shaped

Read against §5.6's four verbs, `OccasionsSection.tsx` today does **exactly** create, rename, archive
and view archive, and nothing else. There is no browsing affordance to strip, no listing behaviour to
remove, no fifth verb hiding in it. The one thing it does beyond those four — linking each occasion
name to `/occasions/:id` — is kept deliberately (Decision 1).

So the reduction is delivered almost entirely by **the page around the section**, not by the section.
Saying that out loud is the point: an implementer who reads §5.6 and goes looking for things to
delete from `OccasionsSection` will find nothing and will start inventing.

## What to change

| File | Change |
|---|---|
| `src/pages/FamilyDetail.tsx` | Rezoned to four `h2` sections; Members and the organizer block extracted; keeps the family query, the layout, and a new `leaveFamily` mutation. ~361 → ~110 lines |
| `src/pages/family-detail/MembersSection.tsx` | **New.** Member list, role toggle, remove, and their shared 409 error |
| `src/pages/family-detail/FamilySettingsSection.tsx` | **New.** Invite form, pending invites, rename, delete + its `ConfirmDialog`. Organizer-only; mounted only when the parent gates it |
| `src/pages/family-detail/OccasionsSection.tsx` | Docstring rewritten; three bare project-spec references qualified. No behaviour change |
| `src/pages/family-detail/harness.tsx` | **New.** Shared test fixtures: `organizerToken`, `memberToken`, `sampleFamily`, `renderFamilyDetail` |
| `src/pages/FamilyDetail.test.tsx` | Member/role/invite/rename/delete cases move out; keeps the query arms and Leave; gains zone-order and role-shape tests |
| `src/pages/family-detail/MembersSection.test.tsx` | **New.** Cases moved from the page suite |
| `src/pages/family-detail/FamilySettingsSection.test.tsx` | **New.** Cases moved from the page suite |
| `src/pages/family-detail/OccasionsSection.test.tsx` | Imports the harness instead of its own copy. No case changes |
| `CONTEXT.md` | Occasion and Family rows annotated |

No other file imports `FamilyDetail` or anything under `family-detail/`. `FamilyArchive.tsx` is a
separate route and is untouched.

## Decisions

### 1. The occasion name keeps its link

§5.6 lists four verbs and "view the occasion" is not among them. Read literally that would strip the
link. It says something narrower, though: the page is no longer *the only* route, not that it is no
longer *a* route.

The link stays, because **ADR 0007's entire argument is that an occasion is a destination.** Removing
a link to `/occasions/:id` from a page that names the occasion would contradict the ADR this
milestone is governed by, and would strand a member who is already on the family page — they would
have to navigate back to `/lists` to reach a page whose name is in front of them.

"Reduced to management" means the section stops being *the index*. It does not mean the section
becomes a dead end.

### 2. The page becomes four zones, in one fixed order

```
h1  Boone Family
 h2  Members
 h2  Occasions
 h2  Family settings        ← organizer only
  h3  Invite to Family
  h3  Invites               ← still conditional on there being any
  h3  Rename Family
  h3  Delete Family
 h2  Leave Family
```

Against it, §9.5 says "Everything else unchanged." The two are reconciled by scope: **the order and
grouping of sections change; no behaviour does.** Every mutation, gate, error path and piece of copy
inside a zone survives the move intact. §9.5's "unchanged" is true of what the page *does*.

Members stays first because it is what the page is about, and Occasions second because it is the one
zone a plain member can write to. The organizer-only administration collects at the bottom, where a
destructive action belongs and where it stops separating two things a member uses.

### 3. Leave Family is its own zone, last, outside the organizer gate

Every member may leave; only an organizer sees Family settings. Folding Leave into that zone would
hide it from exactly the people most likely to want it. It gets the `h2` it never had and sits after
the settings zone for everyone.

Today it is a bare button wedged between Occasions and the organizer block — an unlabelled
destructive control in the middle of the page, which is the interleaving the ticket complains about
in miniature.

### 4. Zone order does not vary by role

A member sees Members → Occasions → Leave; an organizer sees Members → Occasions → Family settings →
Leave. **Role changes what renders, never where it renders.** An organizer who demotes themselves
sees a zone disappear rather than the page reshuffle around them, and there is one layout to test and
one to describe.

The alternative — Occasions first for a member, on the grounds that a read-only roster is not what
they came for — buys a marginally better member view for two layouts, two order tests, and a page
that rearranges itself when a role changes.

### 5. Members and Family settings become their own components

`FamilyDetail.tsx` is 361 lines holding six mutations and, after the rezoning, four zones.
`OccasionsSection` is already extracted; the other two follow it, and the zone boundary this ticket
draws becomes a real module boundary rather than a comment.

`FamilyDetail` keeps:

- the `family` query and its pending / error / not-found arms,
- `useTitle`,
- the derivation of `currentMember` and `isOrganizer`,
- the four-zone layout and the organizer gate around zone three,
- the `leaveFamily` mutation (Decision 6).

`MembersSection` receives `members`, `isOrganizer` and the viewer's id as props from the parent,
which already holds the family data — it does not re-query. `FamilySettingsSection` receives
`familyId` and the family's current name, and owns the invites query, the invite/revoke/rename/delete
mutations and the delete `ConfirmDialog`, including the `navigate("/people")` that follows a
successful delete. Because the parent mounts it only for an organizer, its invites query drops the
`enabled: isOrganizer` guard — the gate moved up a level rather than disappearing.

### 6. Remove and Leave split into two mutations, each reporting where it happened

One mutation, `removeOrLeaveMutation`, serves both today: it calls `removeMember(familyId, userId)`
and branches on whether `userId` is the viewer's, navigating away if so. It shares a single
`actionError` string with `updateRoleMutation` — the 409 *"Promote another organizer first, or delete
the family."*

After the split, Remove lives in `MembersSection` and Leave lives in `FamilyDetail`, so:

- `MembersSection` owns `removeMember` and `updateMemberRole` and renders their shared `actionError`
  under its own heading. Those two genuinely share it: both 409 for the same reason.
- `FamilyDetail` owns a distinct `leaveFamily` mutation — same endpoint, the viewer's own id, no
  branch — and renders its own 409 beside the Leave button.

The endpoint is called from two places, which it effectively already was; what stops being shared is
the *branch on whose id it is*, which was the confusing part. And the last-organizer 409 now appears
next to the control that provoked it instead of scrolling away into another zone.

### 7. `OccasionsSection` changes only its docstring, and three ambiguous references

Per the scope observation, nothing in the section's behaviour changes. Its docstring is rewritten to
state what the section now is.

Two bare references are also qualified. The docstring cites *"project spec §9.6"* and an inline
comment cites *"§9.5"*; both are correct references to **`shopping-lists-project-spec.md`** (§9.6
"Family page", §9.5 "Archive views"). They were unambiguous when written and are not any more — this
project's spec has its own §9.5, about this very section, and no §9.6 at all. An implementer
following *"project spec §9.6"* today lands nowhere. Each gets its spec named.

```
- * The family's occasions, on the family page (project spec §9.6).
+ * The family's occasions, on the family page — management only
+ * (occasions-and-navigation project spec §5.6, §9.5).
+ *
+ * This is no longer the way *in* to an occasion; the strip on /lists is
+ * (NEU-1298). The name still links, because an occasion is a destination
+ * (ADR 0007) — but nobody has to come here to find one. What stays here is
+ * what only belongs here: create, rename, archive, view archive.
```

The "warn, never block" comment above `alreadyActiveWarning` cites `§5.3`, which is
`shopping-lists-project-spec.md` again; it is qualified the same way and its behaviour is otherwise
untouched — that warning is inherited and unrelated to this ticket.

### 8. The back link's wording is fixed; its behaviour is not

`FamilyDetail` renders `← Back to families` twice — once in the not-found arm, once in the page
header. §6.2 retires **"families"** and **"connections"** as navigation labels and sets this page's
fallback label to `← Back to People`.

The *control* belongs to NEU-1302, which wraps it in `NavigationDepth` and the fallback table. The
*word* does not: it is a forbidden navigation label sitting in a page this ticket is already
rewriting, and it is two string literals. Fixing it here leaves NEU-1302 a purely behavioural diff —
wrapping a correctly-labelled link in a depth check — rather than a mix of copy and mechanism.

Both links keep their hardcoded `to="/people"` and their current markup. The not-found arm's layout
is not otherwise touched.

### 9. Four `h2` zones; the settings children drop to `h3`

Invite to Family, Invites, Rename Family and Delete Family are each an `h2` today, siblings of
Members and Occasions — six peers with no structure, which is the "one long column" restated as a
document outline. Nesting them under a Family settings `h2` makes them `h3`.

This is also what makes Decision 2 testable: with exactly four `h2`s on the page, the zone-order test
reads the `h2` list in order and asserts it, rather than hunting for text.

### 10. `CONTEXT.md`: two rows annotated, no new rule

No UI word changes meaning. What changes is where the user meets two of them, and `CONTEXT.md` claims
to name where each concept is rendered — so leaving the Occasion row as-is would keep implying the
family page is a peer of the strip for *finding* an occasion, which is exactly what this ticket ends.

No new rule is added. Generalising one page's zoning into a rule the codebase would have to keep
everywhere is broader than one ticket's evidence supports.

### 11. Tests: behaviour moves down, composition stays up

`OccasionsSection.test.tsx` sets the convention already — it lives beside the section, is scoped to
that section, and **renders `FamilyDetail`**, asserting `within` the section. The new suites follow
it exactly. That is what makes this split cheap: the cases move file without changing how they mount,
because MSW mocks at the network boundary and not the module boundary.

### 12. One shared harness for all four suites

`FamilyDetail.test.tsx` and `OccasionsSection.test.tsx` each carry a near-identical ~60 lines of JWT
tokens, `sampleFamily` and `renderFamilyDetail`. Two more suites would make four copies of an auth
fixture — the kind of drift that makes one suite quietly stop testing what it claims, because its
copy of the token still says `organizer` after the shape changed.

`src/pages/family-detail/harness.tsx` exports `organizerToken`, `memberToken`, `sampleFamily` and
`renderFamilyDetail(token, id?)`. All four suites import it. This is the one edit the ticket makes to
`OccasionsSection.test.tsx`, and it is an import swap and a deletion — no case changes.

Repo convention is per-suite duplication, and this departs from it deliberately and locally: four
suites over one page sharing one fixture, not a repo-wide test-utils module.

## `CONTEXT.md` edits

**Occasion row** — the renderer list gains the strip and says what each surface is for:

> | **Occasion** | A family's shared gifting occasion — "Christmas 2026". The unit a list is shared *to*, and the only thing that makes a family shareable | `pages/OccasionDetail.tsx`, `pages/lists/OccasionStrip.tsx` (finding one), `pages/family-detail/OccasionsSection.tsx` (managing one), `lib/occasion-choice.ts` |

**Family row** — states what its page is for:

> | **Family** | A named group of people. A list reaches one **through an occasion of that family**, never the family itself. Its page administers the family — members, occasions, settings — and is **not** the way in to an occasion | `pages/FamilyDetail.tsx` |

## Acceptance criteria

1. `/people/families/:id` renders exactly four `h2` headings for an organizer, in order: **Members**,
   **Occasions**, **Family settings**, **Leave Family**.
2. A plain member renders three, in the same order, with **Family settings** absent.
3. Invite to Family, Invites, Rename Family and Delete Family render as `h3` inside the Family
   settings zone.
4. The occasion name in each row is still a link to `/occasions/:id`.
5. Occasions still offers create to any member, and rename / archive / view archive exactly as
   before, with organizer-only gating unchanged.
6. Removing a member and leaving the family each still work, and a last-organizer 409 renders its
   message **inside the zone whose control produced it**.
7. Invite, revoke, rename and delete all behave as before, delete still routed through
   `ConfirmDialog`.
8. Both back links read `← Back to People` and still navigate to `/people`.
9. `CONTEXT.md`'s Occasion and Family rows are updated.
10. `task check` passes: `oxlint`, `tsc`, and the full vitest suite.

## Tests

**`FamilyDetail.test.tsx`** — composition, and what only the page can assert:

- pending, error and not-found arms (kept as-is)
- **new:** the `h2` list for an organizer is `["Members", "Occasions", "Family settings", "Leave Family"]`, **in order**
- **new:** the `h2` list for a plain member is `["Members", "Occasions", "Leave Family"]`
- leave → `DELETE /families/:id/members/:userId` → navigates to `/people` (moved from its current position, unchanged)
- 409 on leave renders the last-organizer message **within the Leave Family zone**
- back link reads `← Back to People` and points at `/people` (existing case, retitled)

**`MembersSection.test.tsx`** — moved from the page suite:

- renders members with roles
- organizer sees promote/demote and remove for other members; not for themselves
- a plain member sees neither
- demote sends `role: member`
- 409 on remove, and 409 on demote, each render the last-organizer message **within the Members zone**

**`FamilySettingsSection.test.tsx`** — moved from the page suite:

- invite success → `POST /families/1/invites` → the new row appears
- the default invite body carries the email and `member`
- the role dropdown sends `organizer` and resets to `member` after send
- invite rows show status and role; revoke removes the row
- 409 duplicate invite and 400 bad email render their inline messages
- rename submits `PUT /families/:id`
- delete → `ConfirmDialog` → confirm navigates to `/people`
- the dialog stays open with every button disabled while deleting
- a plain member sees no invite form and no invite list

**`OccasionsSection.test.tsx`** — every case unchanged; only the harness import changes.

No test asserts an occasion row is *not* a link — Decision 1 keeps it, and criterion 4 asserts it
positively.

## Out of scope

- **`NavigationDepth` and history-aware Back** — NEU-1302. This ticket changes two strings and leaves
  both links hardcoded.
- **`useSearchParamState`** — NEU-1301. Nothing on this page holds view state in the URL, before or
  after.
- **The confirmation audit** — NEU-1319 (M4). Archive keeps having no confirm; leave-family and
  remove-member keep having none. All three are that ticket's, and adding one here would be undone
  or duplicated by it.
- **`FamilyArchive.tsx`** — its own route, its own back link (`← Boone Family`, §6.2), NEU-1302's.
- **The empty-occasions copy** — *"{family} has no active occasion, so no list can be shared with
  it."* is `CONTEXT.md` rule 6's language and stays word for word.
- **Any pointer copy toward `/lists` or the strip.** No line is added telling the user where
  occasions now live; the strip is on the landing page and does not need signposting from three
  levels down.
- **Promoting the create form** into the section header. Considered and rejected — it relocates a
  form any member uses to buy a visual read that the rezoning already delivers.
- **Any backend change.** No endpoint, schema or permission is touched.
