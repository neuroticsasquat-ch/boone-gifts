# NEU-1281 — Clear the query cache when the viewer changes

**Ticket:** [NEU-1281](https://linear.app/neuroticsasquatch/issue/NEU-1281/clear-the-react-query-cache-on-logout-frontend)
**Project:** Boone Gifts: Maintenance
**Repo:** `boone-gifts-frontend`
**Records:** [ADR 0004](../adr/0004-the-query-cache-is-cleared-at-the-identity-boundary.md)

## 1. What is wrong

`logout` clears the access token and the user and nothing else:

```ts
// src/contexts/AuthContext.tsx
const logout = useCallback(async () => {
  try { await apiLogout(); } catch { /* best-effort */ }
  clearAccessToken();
  setUser(null);
}, []);
```

The React Query cache survives, and **no query key carries the viewer's identity** — 32 distinct
key shapes across 39 `useQuery` sites, all keyed by resource alone (`["lists"]`, `["account"]`,
`["list", id]`, `["shopping", kind, id]`). `staleTime` is 30s (`src/App.tsx`), so a surviving entry
is served to the next viewer **without a refetch** rather than being briefly visible before one
lands.

This is `CONTEXT.md` rule 2 — no user sees another's claims — defeated by the cache rather than by
any endpoint. Every request is correctly scoped; nothing is over-fetched. The leak is entirely
client-side. Since NEU-1276 the cache also holds the budget rollup, so what can be served now
includes another person's spend and their private target (rule 5), not only which gifts they
claimed.

### 1.1 How far it actually reaches — and how far it does not

Stated precisely, because the ticket's original wording was broader than the truth:

- **It is a same-tab account switch.** Logout is client-side: `setUser(null)` → `ProtectedRoute`
  renders `<Navigate to="/login" replace />`. No reload, and the `QueryClient` is a module-level
  singleton (`src/App.tsx`), so the cache carries into the next login intact.
- **A reload is already safe.** There is no `persistQueryClient` and no persister in
  `package.json`; the cache is memory-only. Closing the tab, or any refresh, empties it.
- **Logout is not the only way in.** On refresh failure the 401 interceptor calls
  `clearAccessToken()` (`src/api/client.ts:83`) but never clears `user` and never navigates. The
  app stays mounted, fully cached, with a dead token — and a re-login in that same tab inherits
  everything. **A fix that only hooks `logout` does not close this.**

## 2. What to build

### 2.1 Clear the cache whenever the viewer's identity changes

In `AuthProvider`, which already sits inside `QueryClientProvider` (`src/App.tsx`), so
`useQueryClient()` is available with no restructuring:

```ts
const queryClient = useQueryClient();

// The cache is keyed by resource, never by viewer, so one person's entries would
// otherwise be served to the next. Keyed on the id and not the user object:
// updateProfile renaming someone is not a change of viewer.
const viewerId = useRef(user?.id);
useLayoutEffect(() => {
  const departing = viewerId.current;
  viewerId.current = user?.id;
  if (departing === user?.id) return;
  if (departing !== undefined) {
    queryClient.clear();
  } else if (user?.id !== undefined) {
    queryClient.removeQueries({ type: "inactive" });
  }
}, [user?.id, queryClient]);
```

Keyed on identity rather than hooked into each entry point, so it covers logout, login, a
token-expiry re-login, and any path added later without that path having to remember.

**Departure clears; arrival sweeps.** A departing viewer empties the cache outright. An arriving
one removes only what nothing is observing — it cannot be a no-op, because `clear()` does not
cancel mutations and one that outlived the departing viewer's last screen can write its response in
*after* the departure clear (`SharedAccountCard.tsx` does precisely this, unconditionally). Nor can
it be an outright clear: a query dropped while still in flight leaves its observer pending forever
instead of refetching (§4.1), which is harmless at a departure — `ProtectedRoute` unmounts it in
the same commit — but not at an arrival. Removing the unobserved entries catches everything a
departed viewer can have left behind, since nothing of theirs is still mounted by then.

The initial mount is neither: `user?.id` does not change, so nothing runs.

**It must be a layout effect.** A passive effect fires after its commit is painted, and the screens
an arriving viewer mounts read the cache while they render — so the previous viewer's data would
reach the new one's screen first. It also loses a race it cannot see: React Query subscribes its
observer in a passive effect, and a child's run before the parent's, so a screen mounting in the
same commit claims the stale entry and makes it *active* before a passive sweep runs — sparing it
from a sweep that spares active queries, and leaving it served for the full `staleTime`. A layout
effect runs before paint and before any child subscribes, which closes both.

### 2.2 End the session properly when the refresh fails

`src/api/client.ts` is a module and cannot reach React state, so it takes a registered handler —
the same shape the token accessors above it already use:

```ts
let onSessionEnded: (() => void) | null = null;

/** Registered by AuthProvider. The interceptor cannot reach React state directly,
 *  and the token accessors above already work this way. */
export function setSessionEndedHandler(handler: (() => void) | null): void {
  onSessionEnded = handler;
}
```

Called where the refresh gives up:

```ts
} catch (refreshError) {
  clearAccessToken();
  onSessionEnded?.();
  processQueue(refreshError);
  return Promise.reject(refreshError);
}
```

And registered once:

```ts
useEffect(() => {
  setSessionEndedHandler(() => setUser(null));
  return () => setSessionEndedHandler(null);
}, []);
```

Both behaviours then fall out of that one `setUser(null)`: §2.1's effect clears the cache, and
`ProtectedRoute` lands the person on `/login` instead of stranding them in a broken session.

**The mount-time silent refresh is deliberately unaffected.** It posts `/auth/refresh` directly
(`AuthContext.tsx:42`), and the interceptor skips URLs under `/auth/`, so no handler fires — right,
because there was no session to end and its own `.catch` already leaves the viewer logged out.

## 3. Acceptance criteria

- Log in as A, populate a cached view, log out, log in as B in the same tab: B sees none of A's
  data, and no query resolves from A's cache entry.
- The same across a login with **no** logout before it — the token-expiry path of §1.1.
- `updateProfile` renaming the current user does **not** clear the cache.
- A failed refresh leaves the viewer on `/login` with `user` null, not on a mounted page with a
  dead token.
- Nothing clears on first mount, and a session restored by the silent refresh does not strand a
  query that is still in flight.
- An entry left in the cache after the departing viewer's clear — a mutation response landing late
  — is gone before the next viewer is served it, including when a screen mounting in that same
  commit is what would read it.

Pin these at the seam — one test that the cache is empty after an identity change is worth more
than a test per page, and it does not rot as pages are added.

## 4. Decisions

**Clear the whole cache; do not key queries by user.** Recorded in ADR 0004. `queryClient.clear()`
is one line that cannot be forgotten by the next person to add a `useQuery`; per-user keys would
touch 39 call sites now and silently bind every key written afterwards, where a single omission
reopens the hole. The cost is a cold cache after an account switch — a case this product barely
has.

**Clear on identity change, not at each entry point.** A list of call sites is a list a future
entry point can be left off. `user?.id` is the actual invariant.

**Fix the stranded session here rather than filing it.** It is the path that makes the
login-without-logout case reachable, it touches the same two files, and after §2.1 the two are one
change: the interceptor's `setUser(null)` is what triggers the clear.

### 4.1 Accepted consequence

`queryClient.clear()` drops entries that still have mounted observers, so those queries refetch
once against a now-dead token, 401, and reject (`retry: false`). `ProtectedRoute` unmounts them on
the navigate that follows. This is bounded — the second failure changes no id, so no further clear
is triggered — and **a test should pin that it does not loop**.

A query dropped while its fetch is still *in flight* behaves worse: it does not refetch, and its
observer stays pending indefinitely. Also harmless at a departure, for the same unmount reason, and
the reason arrival sweeps rather than clears. Both are pinned by tests.

## 5. Out of scope

- **Per-user query keys**, in whole or in part. Rejected above and in ADR 0004.
- **Persisting the cache** across reloads. Nothing does today, and this ticket must not start.
- **The backend.** Every endpoint is already correctly scoped; there is no server-side change here.
- **`gcTime` / `staleTime` tuning.** Once the cache is cleared at the boundary, the 30s window
  stops mattering for this bug, and changing it would be an unrelated performance decision.

## 6. Also update

- **`CONTEXT.md` rule 2** — add the client-side corollary: the cache is dropped whenever the viewer
  changes, so the rule holds across an account switch and not only per request. Do this in the same
  ticket, so the document never describes behaviour the code lacks.
- **`AGENTS.md`** — a line under the auth section saying the cache is cleared on identity change and
  that this is *why* query keys carry no user id, so the next author does not "fix" the keys.
