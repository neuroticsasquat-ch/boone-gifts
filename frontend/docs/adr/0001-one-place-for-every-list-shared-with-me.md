# ADR 0001 — One place for every list shared with me

**Status:** Accepted (2026-09-07)
**Project:** [Navigation and shared accounts](https://linear.app/neuroticsasquatch/project/navigation-and-shared-accounts-1cbf5b5d867b)

## Context

The app grew a destination per sharing mechanism. A list shared directly with me appeared under
"Shared with Me" on `/lists`; a list shared with a family I belong to appeared only on
`/family-lists`, which in full mode had no navigation entry at all — it was a text link on the
Families page, and landing there highlighted no tab. In simple mode the split was worse: the tab
labelled "My Lists" held my lists *and* lists shared with me, while family-shared lists sat behind a
second tab.

Both are the same fact to the user: *someone made a list visible to me*. The mechanism is an
implementation detail of how the grant was recorded.

The nav had grown to five mobile tabs, two of them labelled "Connect" and "Collect".

## Decision

**One section, one page, source as a label.**

- Primary navigation is two tabs — **Lists** and **People** — identical in both modes.
- `/lists` shows "My lists" and "Shared with me". The second section holds every list shared with the
  viewer regardless of path, each row labelled with its source: `from Jane`, or `Boone Family`.
- Connections and families live together on **People**, because both answer "who do I share with".
- `/` (Dashboard), `/families`, `/family-lists` and `/collections` are retired as destinations.
- Anything awaiting a decision — a connection request, a family invite — renders as a banner at the
  top of Lists, so it is reachable in simple mode where People is hidden.
- List detail loses its four tabs; the gifts are the page, and sharing collapses to a header summary
  line opening one combined people-and-families picker.

The API changes to match: `GET /lists?filter=shared` returns every list shared with the caller by any
path, each row carrying `shared_via`. The merge rule lives server-side rather than being re-derived
in the client.

## Consequences

**Good**

- The question "where do I find the list Carol shared?" has one answer.
- Simple mode stops being a second information architecture and becomes a subtraction from this one,
  which removes an entire class of divergence bugs (a page reachable in one mode and orphaned in the
  other).
- Two tabs fit a 390px viewport with room for real words instead of "Connect"/"Collect".

**Bad, and accepted**

- Grouping by family is gone as a view. A user who thinks "show me the Boone Family's lists" now
  filters or scans source labels instead. If this proves wrong, the fix is a filter on Lists — not a
  second destination.
- A long "Shared with me" section is a flat list. Sorting exists; grouping does not. Revisit only
  with real data showing it is unreadable.

## Alternatives rejected

- **Keep five tabs, fix the contents** — smallest change, but the shared-vs-family split survives at
  the navigation level, which is the actual complaint.
- **Group shared lists by person or by source** — reintroduces the "how did this reach me?" hierarchy
  the project exists to remove, and makes a list shared two ways appear twice.
- **Merge the two sources in the client** — leaves sort order and any future paging to be solved
  per-consumer, and duplicates the dedupe rule for a list shared both directly and via a family.
