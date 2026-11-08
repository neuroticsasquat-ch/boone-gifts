import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches right now, kept current as the viewport
 * changes.
 *
 * CSS is still the default way this app answers a width question — every `md:`
 * class in the tree is that answer — and this hook is the documented exception
 * to it (ADR 0010), not a licence to convert them. It exists because `ActionBar`
 * must render *one* set of buttons: the two-copies-behind-`hidden`/`md:flex`
 * version puts every action name in the DOM twice, which doubles the
 * accessibility tree and breaks the `getByRole` uniqueness queries that
 * `action-policy.test.tsx` enforces rule 12 with.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the match is
 * external state that can change between render and commit, and this is what
 * React provides for reading it without tearing.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  // Reads the live value rather than a cached one, so the first render is
  // already right — a bar that painted collapsed and then corrected itself
  // would flash on every desktop load.
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
