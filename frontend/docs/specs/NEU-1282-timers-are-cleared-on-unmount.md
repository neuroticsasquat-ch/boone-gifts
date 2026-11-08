# NEU-1282 — Timers are cleared on unmount

**Ticket:** [NEU-1282](https://linear.app/neuroticsasquatch/issue/NEU-1282/people-searchs-blur-timer-outlives-the-component)
**Repo:** `boone-gifts-frontend`

## What to build and why

Four `setTimeout` call sites schedule a `setState` that can fire after the component is gone. In the
browser that is a harmless no-op. Under jsdom it is a **thrown** `ReferenceError: window is not
defined` from React DOM's `resolveUpdatePriority`, reported as an *unhandled error* rather than a
test failure — so Vitest exits non-zero and CI goes red **with every test passing**.

It is timing-dependent. It surfaced once locally while NEU-1278 added two unrelated test files, and
did not reproduce across several later runs or on CI. That is the argument for fixing it rather than
waiting: it appears when unrelated work shifts the suite's schedule, so the PR it eventually reddens
will be one that has nothing to do with it, and whoever owns that PR will lose an afternoon to it.

## The four sites

| Site | Timer | Today |
|---|---|---|
| `pages/People.tsx:329` | 200ms before hiding the search dropdown on blur | Never cleared |
| `pages/list-detail/GiftsTab.tsx:258` | 500ms URL-metadata debounce | Cleared on the next keystroke, **not** on unmount |
| `pages/AdminInvites.tsx:40` | 2s, resets the "Copied!" label | Never cleared |
| `pages/AdminInvites.tsx:162` | 3s, resets the success banner | Never cleared |

## Decisions

### 1. `People.tsx:329`'s timer is deleted, not managed

The delay exists to let a click on a dropdown row land before blur hides the row. **It is guarding a
case that cannot happen.** The option is `onMouseDown={() => selectUser(user)}`
(`People.tsx:352`), `mousedown` precedes `blur`, and `selectUser` already calls
`setShowDropdown(false)`. By the time blur runs the dropdown is closed and the selection is made.

```diff
- onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
+ onBlur={() => setShowDropdown(false)}
```

No ref, no cleanup, no timer — the bug class is removed at this site rather than managed.

**The invariant this rests on is already pinned.** `People.test.tsx:171` clicks a dropdown option and
then submits the form; if the ordering ever broke — a refactor from `onMouseDown` to `onClick`, say —
the selection would not land and that test fails. No new test is required for this change.

### 2. The other three get a `useTimeout` hook, not three hand-written cleanups

Those timers are real: a debounce and two delayed resets. Cleanup becomes **structural** rather than
something each future call site has to remember — the same reasoning the project spec applies to
owner-blindness ("a property of the schema rather than a rule someone has to remember").

```ts
// src/hooks/useTimeout.ts
export function useTimeout() {
  const id = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (id.current) clearTimeout(id.current);
  }, []);
  useEffect(() => clear, [clear]);
  return {
    start: (fn: () => void, ms: number) => { clear(); id.current = setTimeout(fn, ms); },
    clear,
  };
}
```

- `start` clears any pending timer first, so the debounce's per-keystroke reset is the hook's default
  behaviour rather than a thing GiftsTab does separately.
- **`GiftsTab` keeps its `fetchIdRef` re-entrancy guard.** That guard is not about timers — it drops a
  *resolved but superseded* fetch, which a cleared timer cannot help with. Do not collapse the two.
- `AdminInvites` needs two independent instances (copy label, success banner); they must not share
  one, or copying a link would cancel the success banner.

## Acceptance criteria

- No *unmanaged* `setTimeout` in `src/` — every timer is either owned by `useTimeout` or already
  cleared by its own `useEffect` return. `grep -rn setTimeout src | grep -v test` should show
  `hooks/useTimeout.ts` and `pages/People.tsx:230` (out of scope, see below) and nothing else.
- Selecting a search result on `/people` still fills the input and closes the dropdown; the dropdown
  still closes when the input is blurred without choosing anything.
- The URL-metadata debounce still fires once after 500ms of typing, and still ignores a superseded
  response.
- "Copied!" still reverts after 2s; the invite success banner still clears after 3s; triggering one
  does not cancel the other.
- Unmounting any of these three mid-timer produces no state update and no error.
- `task test`, `task lint` and `tsc -b --noEmit` all clean.

## Out of scope

- **Other flakes.** This ticket is the timer class only. It is not a general test-stability pass.
- **A lint rule.** oxlint has no rule for an uncleared timer; the hook is the enforcement.
- **`People.tsx:230`.** That debounce already clears correctly in its `useEffect` return and needs no
  change — reviewers should not "fix" it to match.
- **NEU-1283** (a non-numeric route id spinning forever) is a separate defect in the same files;
  do not fold it in.
