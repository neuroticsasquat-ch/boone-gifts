# ADR 0006 — Route ids are validated at the route

**Status:** Accepted (2026-09-09)
**Ticket:** [NEU-1283](https://linear.app/neuroticsasquatch/issue/NEU-1283)
**Spec:** [`docs/specs/NEU-1283-route-ids-are-validated-at-the-route.md`](../specs/NEU-1283-route-ids-are-validated-at-the-route.md)

## Context

Six routes carry a numeric `:id`. Every one of them read it with `Number(useParams().id)` and then
guessed at what to do when that wasn't a number. There were two guesses in the codebase and both were
wrong.

**Four pages guarded and hung.** `enabled: Number.isFinite(id)` meant the query never ran, so it
stayed `isPending` forever — and every one of those pages rendered a bare `<Spinner />` on
`isPending`. `/people/families/abc` spun until the viewer gave up. (`FamilyDetail`, `FamilyArchive`,
`OccasionDetail`, and `family-detail/OccasionsSection`.)

**Three pages didn't guard and sent `NaN` to the backend.** `enabled: !!id` is true for any non-empty
string, so `/lists/abc` fired `GET /lists/NaN` and rendered whatever a 422 renders. (`ListDetail`,
`FolderDetail`, `ConnectionProfile`.)

The second group is the *"firing `getFamily(NaN)` at the backend would be worse"* case that the first
group's guard existed to prevent. Both were the same missing decision — nobody had ever said what a
malformed address means — and fixing one would have left `routes.tsx` showing three guarded and three
bare `:id` routes with no stated reason, which is how the next person picks the wrong one to copy.

Regex path constraints were not available: React Router removed `:id(\d+)` in v6 and the app is on
v7. Don't go looking for it.

## Decision

**A `<NumericId back="…">` wrapper on each `:id` route element, not a guard in each page.**

```tsx
{ path: "people/families/:id", element: <NumericId back="/people"><FamilyDetail /></NumericId> },
```

- **A bad id renders the bad-address arm and the page component never mounts.** So a page that mounts
  has a real id *by construction*, and **every `enabled:` id guard is deleted** — the four
  `Number.isFinite(...)` conjuncts and the three `!!id` ones alike. `FamilyDetail`'s invites query
  becomes `enabled: isOrganizer`. `OccasionsSection` needs no wrapper of its own: it is a child of
  `FamilyDetail` and takes `familyId` as a prop.
- **Validity is asked of the address text, not of `Number()`'s output**: `/^[0-9]+$/` on the raw
  param, then `Number.isSafeInteger(n) && n > 0`. `Number.isFinite(Number(id))` had real holes —
  `/people/families/0x10` loaded family **16** and `1e3` loaded family **1000**, the URL bar saying
  one thing while the page loaded another. `0` is rejected too: ids start at 1, so `/lists/0` is a
  wrong address, not a missing list.
- **The wrapper publishes the parsed id via context**; pages call `useNumericId()` and get a `number`,
  not a `number` that might be `NaN`. `Number(useParams().id)` is gone from all six pages, and calling
  the hook outside a wrapper throws at the point of the mistake instead of yielding `NaN`. Context
  rather than `useOutletContext`, because a layout route would nest all six routes a level deeper in
  `routes.tsx` for no gain.
- **The arm says the address is wrong, plainly, with one way back and no retry** — the shape
  `OccasionDetail` already uses for an occasion the viewer can't reach, for the reason its comment
  gives there: *"'Try again' is only offered where trying again could work."*
- **`family-invites/:token` is not wrapped.** Its param is a token, not a number; the backend's answer
  to the token is its validation.

A **wrong address is not a missing thing, and not a slow one** (`CONTEXT.md` rule 7). A *reachability*
failure — a valid id the viewer may not see — stays the backend's answer and keeps its own `isError`
arm, unchanged.

## Consequences

**Good**

- The bug class is removed rather than handled six times, and the two contradictory guesses are gone
  along with it.
- `routes.tsx` now reads as six wrapped `:id` routes and one deliberately-unwrapped `:token` route —
  a next person copying any line copies the right one.
- Pages take `number`, not `number | NaN`, so the id is no longer a value each page has to re-decide
  about.
- `routes.test.tsx` walks the `routes` array rather than naming the six, so **adding a seventh `:id`
  route without a wrapper fails the suite**. The guarantee is enforced, not documented.

**Bad, and accepted**

- Every page test that renders its component *directly* rather than through `createMemoryRouter`
  must now render it inside `<NumericId>`. Six test files changed; the assertions did not.
- Leading zeros are accepted (`/lists/007` loads list 7). The rule is what the spec prescribed, and
  the `0x10`/`1e3` mismatches it exists to close are the ones that load a *different* page.

## Alternatives rejected

- **Fix the guard in each page.** Seven files carrying the same decision, re-made each time, is how
  the two contradictory guesses arose in the first place — and it leaves the page mounted, holding an
  id it must keep re-checking.
- **Regex path constraints (`:id(\d+)`).** Removed in React Router v6; the app is on v7.
- **Let the backend answer it.** A 422 on `GET /lists/NaN` is a round trip and an error arm for an
  address that was never valid, and it says "something went wrong" where the truth is "that isn't an
  address".
- **`useOutletContext` via a layout route.** Nests all six routes a level deeper in `routes.tsx` and
  buys nothing over a context the wrapper already has to hold.
