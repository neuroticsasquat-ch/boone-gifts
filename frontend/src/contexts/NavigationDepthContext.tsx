/* eslint-disable react/only-export-components */
import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router";
import { useAuth } from "../hooks/useAuth";

/**
 * How many in-app pushes deep into the session this render is.
 *
 * Zero means there is nothing behind us that we put there — a deep link, a new
 * tab, an email, a reload — and so nothing `navigate(-1)` could be trusted with.
 * Above zero means the previous entry is one this app pushed, so Back lands on a
 * page of ours.
 *
 * React Router does not say whether a history entry is in-app, which is why this
 * is a counter rather than an inspection of `history.state`.
 */
const NavigationDepthContext = createContext(0);

/**
 * Depth outside a provider is 0, and does not throw. No provider means the named
 * fallback: always true, never off the site, and the same thing a deep link
 * gets. `useNumericId` throws in the same position because its alternative was a
 * silent `NaN` — a wrong answer that surfaced later; here the alternative is a
 * correct, conservative answer, and `routes.tsx` mounts the provider at the root
 * of the tree, so production never reaches the default.
 */
export function useNavigationDepth(): number {
  return useContext(NavigationDepthContext);
}

export function NavigationDepthProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const { user } = useAuth();

  const [depth, setDepth] = useState(0);
  // The entry location starts out already counted, at depth 0: we did not push
  // it, and after a reload the app genuinely cannot know what sits behind it.
  const [seenKey, setSeenKey] = useState(location.key);
  const [viewerId, setViewerId] = useState(user?.id);

  // Adjusted during render rather than in an effect, because an effect paints
  // first: every navigation would show the *previous* depth's control for a
  // frame — `← Back to Lists` flashing before `← Back` on the way in, and the
  // reverse on the way out.
  //
  // Counted per *history entry*, not per render: `location.key` is new for every
  // navigation and stable across re-renders of one, so a page re-rendering for
  // its own reasons cannot move the counter, and a double render cannot
  // double-count.
  //
  // `REPLACE` is ignored, and that is what makes NEU-1301's replace-mode writes
  // — every sort, filter, grouping and expansion — free: they add no history
  // entry, so they must not add depth.
  //
  // `POP` fires for browser-*forward* as well as back, so a forward after a back
  // decrements where it should increment. Accepted: the counter under-counts,
  // never over-counts, and an under-count renders the named fallback, which is
  // still a true statement about where the control goes. It self-heals on the
  // next push.
  if (seenKey !== location.key) {
    setSeenKey(location.key);
    if (navigationType === "PUSH") {
      setDepth((current) => current + 1);
    } else if (navigationType === "POP") {
      setDepth((current) => Math.max(0, current - 1));
    }
  }

  // The same boundary that drops the query cache (`AuthContext.tsx`, ADR 0004).
  // Without it, a logout and a login on a shared device leave the counter above
  // zero and Back walks into the previous session's address. The backend is
  // always the gate, so that is an error arm rather than a leak — but it
  // contradicts what CONTEXT.md rule 2 says about shared devices.
  //
  // Second, so that when a sign-in and its redirect land in one render this
  // reset is the queued update that wins: a freshly signed-in viewer is at depth
  // 0, not one push deep into the redirect that put them there.
  if (viewerId !== user?.id) {
    setViewerId(user?.id);
    setDepth(0);
  }

  return (
    <NavigationDepthContext.Provider value={depth}>{children}</NavigationDepthContext.Provider>
  );
}
