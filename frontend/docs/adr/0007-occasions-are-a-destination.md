# ADR 0007 — Occasions are a destination

**Status:** Accepted (2026-09-09)
**Project:** BG: Occasions and Navigation (not yet created in Linear)
**Spec:** [`docs/specs/occasions-and-navigation-project-spec.md`](../specs/occasions-and-navigation-project-spec.md)
**Amends:** [ADR 0005 — Grouping returns to Shared with me, as an opt-in](0005-grouping-returns-as-an-opt-in.md)

## Context

ADR 0005 shipped a **Group by** control on `/lists` and decided, in one line, that *"a folder heading
links to `/folders/:id`; an occasion or person heading links nowhere. A source is still not a
destination."*

The test that line was actually applying was not "is this a source". It was **does this page have any
other way in**. `/folders/:id` had none — the ADR says so directly, calling it "unreachable UI" — so
the heading became its entry point. `/occasions/:id` had one, through People → a family → its
Occasions section, so it did not need rescuing.

That entry point turns out to be inadequate, and the reasons are not the ones ADR 0005 weighed.

**An occasion is where the viewer acts, not just a label on a row.** It carries the My shopping tab
and the viewer's budget — the two things v0.5.0 built. Neither is reachable from `/lists` at all, and
both are things a user returns to repeatedly during a season.

**Its one entry point is under the wrong noun.** A user looking for Christmas does not look under
"People". Reaching an occasion means knowing which family owns it, which is a fact about how sharing
is recorded rather than a fact about Christmas.

**Sharing runs only one way**, which the dead heading makes worse: the sole route to an occasion is
also the sole route to the control that shares a list into it, and that control lives on the *list*,
three levels away.

Separately, `shared_via` is being widened from a single nullable source to a list of routes
(project spec §10.1), because the scalar could not describe a list that arrived both directly and
through an occasion — such a list reported `null` and fell into "Not in an occasion", the leftover
bucket ADR 0005 introduced precisely so that nothing could silently vanish. Widening it means a list
shared to two occasions now has two occasion routes, and grouping has to decide what to do with them.

## Decision

**Occasion headings link to `/occasions/:id`, and occasion membership is many-to-many.**

- **Group by Occasion headings are links.** This makes them consistent with the occasion cards the
  same project adds above `My Lists` (spec §5.1) — without it, `/lists` would carry linkable occasion
  cards six inches above dead occasion headings, the same word behaving two ways on one page.
- **Person headings still link nowhere.** The rule that replaces "a source is not a destination" is:
  **a heading links when its destination carries something the grouping does not.** `/occasions/:id`
  carries a shopping tab and a budget; `/folders/:id` carries membership management. `/people/:id`
  carries the same lists the grouping just showed, filtered the same way — and after this project it
  is derived from that very shared scope (spec §9.4), so it is a strictly emptier view of what the
  reader is already looking at.
- **A list shared to several occasions appears under each of them.** This is the reading ADR 0005
  already adopted for folders — *"the honest rendering of a many-to-many membership"* — and the only
  reason occasions did not behave that way was that the scalar could name one route.
- **Grouping stays opt-in and `None` stays the default.** Nothing in this amendment changes that.
  The occasion *strip* is on by default, but a strip is not a grouping: it does not subdivide
  **Shared with me**, does not reorder it, and does not hide anything from it.

## Consequences

**Good**

- An occasion is one click from the landing page by two routes — the strip for the common case, the
  grouping heading for the viewer who has already subdivided by occasion and is looking straight at
  the one they want.
- The budget and the shopping tab stop being the least reachable pages in the app despite being the
  point of the previous release.
- Combined with the `shared_via` array, Group by Occasion becomes complete: the both-ways list lands
  in its occasion bucket, and "Not in an occasion" goes back to meaning what it says.
- One rule governs every heading on the page, and it is stated in terms of what the destination is
  worth rather than what the heading is called.

**Bad, and accepted**

- **A list can now appear more than once under Group by: Occasion**, where before only Group by:
  Folder could duplicate. Accepted for the reason ADR 0005 already gave: the duplication is inside a
  grouping the viewer asked for, under headings that explain it.
- **"A source is not a destination" now has two exceptions and one holdout**, which is a weaker rule
  than the one it replaces and needs the test above to apply it. The alternative was keeping a
  memorable rule that produces a page contradicting itself.
- The strip being on by default is the kind of "app decides the hierarchy" move ADR 0005 was careful
  to avoid for grouping. It is accepted because the strip adds a surface rather than reshaping the
  one below it, and because a control nobody can find is not a choice.

## Alternatives rejected

- **Keep headings dead and rely on the strip alone.** Cheapest, and leaves `/lists` rendering
  linkable occasion cards directly above unlinkable occasion headings. The inconsistency is on one
  screen, in one scroll.
- **Link the headings and skip the strip.** Occasions would then surface only for a viewer who had
  already switched grouping on — invisible by default, which is the original complaint restated.
- **Link person headings too, for symmetry.** `/people/:id` is derived from the shared scope the
  reader is already in. A link that leads to less than the page you left is worse than no link.
- **A dashboard at `/`.** Rejected in the project spec (§3) for the reason the navigation project
  retired it: two-thirds of its content is `/lists`. The problem was never that `/lists` lacked a
  sibling; it was that occasions had no home on it.
