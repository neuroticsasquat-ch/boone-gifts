# ADR 0004 — The query cache is cleared at the identity boundary, not keyed by viewer

**Status:** Accepted (2026-09-09)
**Ticket:** [NEU-1281](https://linear.app/neuroticsasquatch/issue/NEU-1281/clear-the-react-query-cache-on-logout-frontend)
**Project:** [Boone Gifts: Maintenance](https://linear.app/neuroticsasquatch/project/boone-gifts-maintenance-5b0684796a2f)
**Spec:** [`docs/specs/NEU-1281-clear-the-query-cache-on-identity-change.md`](../specs/NEU-1281-clear-the-query-cache-on-identity-change.md)

## Context

Every React Query key in this app is keyed by **resource** and never by **viewer** — 32 distinct
key shapes across 39 `useQuery` sites: `["lists"]`, `["account"]`, `["connections"]`,
`["list", id]`, `["shopping", kind, id]`, and so on. The `QueryClient` is a module-level singleton
(`src/App.tsx`) and logout is client-side — `setUser(null)`, then `ProtectedRoute` navigates — with
no reload. So the cache survived a logout and the next login read the previous viewer's entries
under identical keys, served without a refetch for the 30s `staleTime`.

That is `CONTEXT.md` rule 2 defeated by the cache rather than by an endpoint. Every request was
correctly scoped; nothing was over-fetched. The leak was entirely client-side, and NEU-1276 had
just widened what sat in that cache from "which gifts A claimed" to "what A has spent and what
their private target is".

The question this settles is not *whether* to fix it but **where the viewer belongs in the cache**:
in the keys, or in the cache's lifetime.

## Decision

**The cache has no concept of a viewer. It is emptied whenever the viewer changes.**

An effect in `AuthProvider` keyed on `user?.id` calls `queryClient.clear()`. Keys stay exactly as
they are — resource-shaped, viewer-free — and `queryKey` authors have nothing to remember.

Precisely, the boundary has two halves. A viewer **departing** — the previous id was set and is no
longer current — empties the cache outright. A viewer **arriving** from none removes the entries
nothing is observing.

The asymmetry is not cosmetic. `clear()` does not cancel mutations, so a mutation that outlived the
departing viewer's last screen can still write its response into the cache *after* the departure
clear (`SharedAccountCard` does exactly this). Arrival is the last moment to catch that before the
next person is served it, so arrival cannot be a no-op — but it also cannot be an outright clear,
because dropping a query that is still in flight leaves its observer pending forever rather than
refetching. Removing only the unobserved entries catches everything a departed viewer can have
left behind, since by then nothing of theirs is still mounted, and strands nothing.

Every path that can leak — logout, an account switch, a session ended by a failed refresh — is a
departure; the arrival sweep is the backstop for what lands after one.

**Both halves run in a layout effect, and the choice is load-bearing rather than stylistic.** A
passive effect fires after the commit it belongs to has been painted, which breaks the sweep twice
over. The screens an arriving viewer mounts read the cache *while they render*, so the previous
viewer's data reaches the new one's screen before a passive effect could drop it. Worse, React
Query subscribes its observer in a passive effect of its own, and a child's passive effects run
before its parent's — so by the time a passive sweep ran, a screen mounted in the same commit had
already claimed the stale entry. That made it *active*, which spared it from a sweep that spares
active queries, and `staleTime` then served it for the full 30s with no refetch. Running before
paint and before any child subscribes closes both. Queries observed from an earlier commit are
still active, and still spared.

Keyed on **identity change**, not wired into `logout` and `login` as a pair of calls, because a
list of entry points is a list a future entry point can be left off. It is keyed on the **id** and
not the user object so that `updateProfile` renaming someone is not treated as a change of viewer.

## Consequences

**Good**

- A `useQuery` added tomorrow is safe by construction. There is no rule for its author to know, and
  no review step that can miss one.
- The keys stay readable. `["shopping", kind, id]` says what it holds; `["shopping", userId, kind, id]`
  says what it holds plus a fact about the cache's implementation.
- It closes paths nobody enumerated — a token-expiry re-login in the same tab, and whatever the
  next entry point turns out to be — because it keys on the actual invariant rather than on the
  ways it can be broken.

**Bad, and accepted**

- Switching accounts leaves a cold cache: everything refetches. Deliberate — two people rapidly
  alternating logins in one tab is not a case this product has, and paying a refetch for it is
  cheaper than paying attention on every future key.
- `clear()` drops entries that still have mounted observers, so those refetch once against a dead
  token and reject before `ProtectedRoute` unmounts them. Bounded — the failure changes no id, so
  it triggers no further clear — and pinned by a test.
- A query dropped by `clear()` while it is still *in flight* does not refetch: its observer is left
  pending indefinitely. Harmless at a departure, where `ProtectedRoute` unmounts the observer
  immediately after, and the reason arrival sweeps rather than clears. Pinned by a test.
- The arrival sweep spares observed queries, so it would not catch a viewer's data that something
  was still observing at the moment the next viewer arrived. Nothing can be: protected screens
  unmount with `setUser(null)`, the public ones issue no queries, and a screen mounting in the same
  commit has not subscribed yet when the layout effect runs.
- `useLayoutEffect` is synchronous with the commit, so the work happens on React's critical path.
  It is a ref comparison and, at most, one cache operation per identity change — not per render.
- `AuthProvider` now requires a `QueryClientProvider` above it. `App.tsx` already provided one;
  tests that render the provider must too.
- The rule is invisible at the call sites it protects. Someone reading `["lists"]` cannot see why
  it is safe, which is why `AGENTS.md` says so next to the auth notes and points here.

## Alternatives rejected

**Key every query by user id.** The obvious fix, and the one that scales worst. It touches 39 call
sites now, and then binds every key written from here on — a burden with no enforcement, where one
omission silently reopens exactly this hole. It also buys a warm cache across account switches,
which is the one benefit and a case this product does not have. Correctness that depends on
everyone remembering is not correctness.

**Remove only the private keys.** `removeQueries` for the keys holding claims, budgets and account
data, leaving the rest cached. Smaller blast radius, but it requires a maintained list of what
counts as private, re-judged every time a query is added — the same "remember this" tax as per-user
keys, with a subtler failure mode, since the leak would be of whatever was most recently
misclassified.

**Clear in `logout` and `login` explicitly.** Two plain calls, easy to point at in review. Rejected
because it is a list: the token-expiry path already existed outside it, and would have been missed.

**Do nothing, and rely on the reload.** The cache is memory-only, so closing the tab is already
safe. But a same-tab account switch is precisely the shared-family-device case this product is
built around, and "log out, then remember to refresh" is not a mitigation anyone performs.
