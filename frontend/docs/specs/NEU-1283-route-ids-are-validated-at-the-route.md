# NEU-1283 — Route ids are validated at the route

**Ticket:** [NEU-1283](https://linear.app/neuroticsasquatch/issue/NEU-1283/a-non-numeric-route-id-is-never-checked-so-six-pages-guess-at-what-it)
**Repo:** `boone-gifts-frontend`
**Related:** [NEU-1278](https://linear.app/neuroticsasquatch/issue/NEU-1278) (archive views — inherited the
pattern verbatim, which is what surfaced this)

## What to build and why

Six routes carry a numeric `:id`. Every one of them reads it with `Number(useParams().id)` and then
guesses at what to do when that isn't a number. There are two guesses in the codebase and both are
wrong.

**Four pages guard and hang.** `enabled: Number.isFinite(id)` means the query never runs, so it stays
`isPending` forever — and every one of these pages renders a bare `<Spinner />` on `isPending`.
`/people/families/abc` spins until the user gives up.

| File | Guard | Spinner |
|---|---|---|
| `pages/FamilyDetail.tsx` | `:30` (family), `:46` (invites) | `:156` |
| `pages/FamilyArchive.tsx` | `:34` (family), `:43` (occasions) | `:114`, occasions arm |
| `pages/OccasionDetail.tsx` | `:47` | `:52` |
| `pages/family-detail/OccasionsSection.tsx` | `:64` | its own |

**Three pages don't guard and send `NaN` to the backend.** `enabled: !!id` is true for any non-empty
string, so `/lists/abc` fires `GET /lists/NaN` and renders whatever a 422 renders.

| File | Guard |
|---|---|
| `pages/ListDetail.tsx` | `:49` — `enabled: !!id` |
| `pages/FolderDetail.tsx` | `:44` — `enabled: !!id` |
| `pages/ConnectionProfile.tsx` | `:16` — `enabled: !!id` |

The ticket names only the first group, but the second is the *"firing `getFamily(NaN)` at the backend
would be worse"* case that the first group's guard exists to prevent. Both groups are the same missing
decision — nobody ever said what a malformed address means — and a fix that covers one leaves
`routes.tsx` showing three guarded and three bare `:id` routes with no stated reason, which is how the
next person picks the wrong one to copy.

**A malformed id is not a slow read and not a 404 the server was ever asked about.** It is a wrong
address, and it should say so plainly, with a way back and no retry — the shape `OccasionDetail.tsx:52`
already uses for an occasion the viewer can't reach, for the same reason its comment gives there:
*"'Try again' is only offered where trying again could work."*

## Decisions

### 1. The check is a route-level wrapper, not a per-page guard

A `<NumericId>` component wraps each `:id` route element in `routes.tsx`. A bad id renders the
bad-address arm and **the page component never mounts**.

```tsx
{ path: "people/families/:id", element: <NumericId back="/people"><FamilyDetail /></NumericId> },
```

This is why the fix removes the bug class rather than handling it six times: a page that mounts is
guaranteed a real id, so **every `enabled:` id guard is deleted** — the four `Number.isFinite(...)`
conjuncts and the three `!!id` ones alike. `FamilyDetail:46` becomes `enabled: isOrganizer`.

`OccasionsSection` needs no wrapper of its own. It is a child of `FamilyDetail` and receives
`familyId` as a prop, so wrapping `people/families/:id` covers it.

**Regex path constraints are not an option.** React Router removed `:id(\d+)` in v6; the app is on v7.
Do not go looking for it.

### 2. All six `:id` routes are wrapped

| Route | Page | `back` |
|---|---|---|
| `lists/:id` | `ListDetail` | `/lists` |
| `folders/:id` | `FolderDetail` | `/lists` |
| `people/:id` | `ConnectionProfile` | `/people` |
| `people/families/:id` | `FamilyDetail` | `/people` |
| `people/families/:id/archive` | `FamilyArchive` | `/people` |
| `occasions/:id` | `OccasionDetail` | `/people` |

`family-invites/:token` is **not** wrapped — its param is a token, not a number.

### 3. Validity is asked of the address text, not of `Number()`'s output

`/^[0-9]+$/` on the raw param, then `Number.isSafeInteger(n) && n > 0`.

The question is whether the *address* is well-formed, so it is asked of the address, not of whatever
`Number()` coerces it into. Today's `Number.isFinite(Number(id))` has real holes:

| Raw | `Number()` | `isFinite` today | Strict rule |
|---|---|---|---|
| `"42"` | `42` | valid | valid |
| `"abc"` | `NaN` | rejected | rejected |
| `"0x10"` | `16` | **loads family 16** | rejected |
| `"1e3"` | `1000` | **loads family 1000** | rejected |
| `"1.5"` | `1.5` | → backend 422 | rejected |
| `" "` | `0` | → backend 404 | rejected |
| `"-1"` | `-1` | → backend 422 | rejected |
| `"99999999999999999999"` | `1e20` | → backend 422 | rejected |

`0x10` and `1e3` are the ones that matter beyond tidiness: the URL bar says one thing and the page
loads another. `0` is rejected — ids start at 1, so `/lists/0` is a wrong address, not a missing list.

### 4. The wrapper publishes the parsed id; pages read a typed `number`

```tsx
const NumericIdContext = createContext<number | null>(null);

export function useNumericId(): number {
  const id = useContext(NumericIdContext);
  if (id === null) throw new Error("useNumericId must be used inside <NumericId>");
  return id;
}
```

```diff
  // FamilyDetail.tsx
- const { id } = useParams();
- const familyId = Number(id);
+ const familyId = useNumericId();
```

The parse lives in one place, the pages stop carrying `Number()` conversions, and the type is `number`
rather than a `number` that might be `NaN`. Using the hook outside a wrapper throws immediately
instead of silently yielding `NaN` — the failure is loud at the point of the mistake.

Context, not `useOutletContext`: a layout route would nest all six routes a level deeper in
`routes.tsx` for no gain.

### 5. The arm

Generic copy, per-route destination, no retry — matching `OccasionDetail`'s existing shape:

```
This page's address isn't valid.

← Back to People
```

## Acceptance criteria

- `/people/families/abc`, `/occasions/abc`, `/people/families/abc/archive`, `/lists/abc`,
  `/folders/abc` and `/people/abc` each render the bad-address arm **immediately**. No spinner, no
  network request, no retry button.
- `/people/families/0x10` and `/people/families/1e3` render the arm — they do **not** load families 16
  and 1000.
- No `Number(id)`, `Number.isFinite(...)` id guard, or `enabled: !!id` remains in the six pages.
  `grep -rn "enabled: !!id\|Number.isFinite" src | grep -v test` returns only `NumericId.tsx`.
- Valid ids are wholly unaffected: every existing page test passes untouched except where it renders a
  page component directly and must now supply the id (see below).
- `NumericId.test.tsx` tables the validity rule over the eight rows in Decision 3.
- `routes.test.tsx` walks the `routes` array, and for every path containing `:id` renders it with a
  non-numeric id, asserting the arm appears and MSW records zero requests. **Adding a seventh `:id`
  route without a wrapper fails this test** — that is its whole job, in the spirit of
  `test/simple-mode-retired.test.ts`.
- `docs/adr/0006-route-ids-are-validated-at-the-route.md` records the decision: the two wrong guesses
  as context, the wrapper as the decision, per-page guards and regex paths as the rejected
  alternatives. Link it from the **Routing** line of `AGENTS.md:44`, the way `AGENTS.md:42` links
  ADR 0004.
- `task test`, `task lint` and `tsc -b --noEmit` all clean.

## Notes for the implementer

- Existing page tests that render a page component **directly** (not through the router) will lose
  their id when `useParams` goes, and must render inside `<NumericId>` or provide the context. Tests
  that go through `createMemoryRouter(routes, ...)` need no change.
- `FamilyArchive` builds a back link from `familyId` (`:50`) before its queries resolve. That still
  works — the id is valid by the time the component mounts.

## Out of scope

- **`family-invites/:token`.** Not a numeric id; its own validation is the backend's answer to the
  token, which is correct as it stands.
- **Backend behaviour for a malformed id.** The 422 is fine; the point is that the frontend no longer
  produces one from a wrong address.
- **The `isError` arms of these pages.** A real 403/404 on a valid id is a different case and keeps its
  current handling. Only the malformed-address path changes.
- **A general audit of `<Spinner />` on `isPending`.** That pairing is correct wherever the query can
  actually run; this ticket is the case where it never could.
- **NEU-1282** (timers cleared on unmount) touches some of the same files and is already shipped
  separately. Do not fold the two.
