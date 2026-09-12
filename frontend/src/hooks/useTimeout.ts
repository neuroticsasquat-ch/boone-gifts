import { useCallback, useEffect, useRef } from "react";

/**
 * A setTimeout whose cleanup is structural: the timer is cleared on unmount by
 * the hook rather than by each call site remembering to do it. `start` also
 * clears any pending timer, so debouncing is the default behaviour.
 *
 * One instance owns one timer. A component that needs two independent delays
 * (two banners, say) calls the hook twice.
 */
export function useTimeout() {
  const id = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (id.current) {
      clearTimeout(id.current);
      id.current = null;
    }
  }, []);

  const start = useCallback(
    (fn: () => void, ms: number) => {
      clear();
      id.current = setTimeout(fn, ms);
    },
    [clear],
  );

  useEffect(() => clear, [clear]);

  return { start, clear };
}
