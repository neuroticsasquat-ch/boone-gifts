import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * Whether writing this key is navigating somewhere or restating where you
 * already are.
 *
 * `push` for a **place** — a tab, an open modal: linkable, and Back closes it.
 * `replace` for a **preference** about a place you are already on — a sort
 * order, an expansion: Back leaves the page rather than undoing the last
 * dropdown.
 */
export type SearchParamMode = "push" | "replace";

/**
 * One piece of view state, held in the URL query string.
 *
 * `mode` is **required and un-defaulted**: the call site has to answer "is this
 * a place, or a preference about where I already am" (project spec §6.3). A
 * default would let a call site inherit that answer instead of giving one, and
 * the wrong answer is felt only through the Back button, where nobody looks.
 *
 * String-valued, `null` for absent. Setting `null` deletes the key rather than
 * writing an empty one, so an unset preference leaves no trace in the URL.
 *
 * Updates are applied functionally against the current params, so two call
 * sites on one page cannot clobber each other's key.
 */
export function useSearchParamState(
  key: string,
  { mode }: { mode: SearchParamMode },
): [string | null, (value: string | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(key);

  const setValue = useCallback(
    (next: string | null) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          if (next === null) {
            params.delete(key);
          } else {
            params.set(key, next);
          }
          return params;
        },
        { replace: mode === "replace" },
      );
    },
    [key, mode, setSearchParams],
  );

  return [value, setValue];
}
