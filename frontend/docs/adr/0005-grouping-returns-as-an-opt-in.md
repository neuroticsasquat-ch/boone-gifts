# ADR 0005 — Grouping returns to Shared with me, as an opt-in

**Status:** Accepted (2026-09-09)
**Project:** [BG: Shopping Lists](https://linear.app/neuroticsasquatch/project/bg-shopping-lists-6fdd1e4a3cc1)
**Amends:** [ADR 0001 — One place for every list shared with me](0001-one-place-for-every-list-shared-with-me.md)

## Context

ADR 0001 collapsed four destinations into one **Shared with me** section and accepted, in writing,
that "sorting exists; grouping does not — revisit only with real data showing it is unreadable".

Two things changed since.

An **occasion** is now the unit a list is shared to, and a season's worth of family lists arrives
through one. A viewer in three families at Christmas holds a flat section of everything anyone shared
with them, in one order, with the family name as a row label — which is precisely the "long flat
list" ADR 0001 named as the thing to watch for.

**Folders have a page again** (`/folders/:id`, NEU-1274) and still no index. Nothing in the UI linked
to it: the concept was reachable only through the Lists page's folder *filter*, which narrows the
page rather than taking the viewer anywhere.

## Decision

**A Group by control on `/lists`, defaulting to None.**

- Four positions — **None · Occasion · Person · Folder** — subdividing **Shared with me** only. My
  lists is the viewer's own and has no source to group by, and the two-section split is untouched.
- **None is the default and is the shipped page, unchanged.** A viewer who asks for nothing gets the
  flat section ADR 0001 decided on. The hierarchy is something a viewer switches on, never something
  the app infers, so `CONTEXT.md` rule 3 — source is a label, not a filter-by-default — stands.
- **Every grouping renders a leftover bucket**: "Not in an occasion", "Not shared directly by a
  person", "Not in a folder". Each grouping keys on something a list may not have, so without it a directly-shared
  list would vanish from a section that claims to hold everything shared with the viewer. That
  disappearance is the failure mode this control is most likely to cause.
- **A folder heading links to `/folders/:id`; an occasion or person heading links nowhere.** A folder
  is the viewer's own thing and has a page with no other entry point. A source is still not a
  destination.
- **Grouping is client-side**, off `shared_via` and the folder memberships the filter already reads.
  No grouped endpoint, no new query param. Grouping by folder fans out `GET /folders/{id}` over the
  viewer's folders, on the cache entries the filter already populates, and only once that grouping is
  chosen.
- The rule lives in `lib/list-grouping.ts` as a pure function over a list array, not in the page.

## Consequences

**Good**

- The "show me the Boone Family's lists" question ADR 0001 knowingly gave up now has an answer that
  is a control on the one Lists page, not a second destination — which is the fix ADR 0001 itself
  named.
- `/folders/:id` stops being unreachable UI.
- A list in several folders appears under each, which is the honest rendering of a many-to-many
  membership and matches what the folder filter already does.

**Bad, and accepted**

- A list can appear more than once on the page under Group by: Folder. ADR 0001 rejected grouping
  partly for this. It is accepted here because the duplication is *within* a grouping the viewer
  asked for and whose headings explain it, rather than across two destinations that each claimed to
  be complete.
- Grouping by folder costs one request per folder. Folders are few and per-user, and nothing is
  fetched until that grouping is chosen.
- Bucket order is alphabetical, so it does not follow the sort control. A sort that reordered the
  buckets as well as the rows would move headings under the viewer for no stated benefit.

## Alternatives rejected

- **Group by default when the section is long.** Guessing a threshold, and a page whose shape changes
  as lists arrive. None-by-default keeps the decision with the viewer.
- **A grouped endpoint.** The client already holds `shared_via` and folder membership; a second
  representation of the same set is a merge rule to keep in sync for no new information.
- **Group My lists too.** They are the viewer's own, reached no way at all, and the only grouping that
  would apply — folder — is already the filter's job.
