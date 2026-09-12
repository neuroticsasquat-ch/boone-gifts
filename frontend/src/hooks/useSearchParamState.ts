import { useCallback, useEffect } from "react";
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
 *
 * Setting the value it already holds **navigates nowhere**. `TabBar` fires
 * `onSelect` on every click, the active tab included, and in `push` mode an
 * entry per click means three taps on "Lists" costs three Back presses to leave
 * the page. The guard lives here rather than in any one caller so every call
 * site inherits it — the strip, the enum wrapper below, and M3's `?share=open`,
 * whose "Change" button has the same double-click shape.
 */
export function useSearchParamState(
  key: string,
  { mode }: { mode: SearchParamMode },
): [string | null, (value: string | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(key);

  const setValue = useCallback(
    (next: string | null) => {
      if (next === value) return;
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
    [key, mode, value, setSearchParams],
  );

  return [value, setValue];
}

/**
 * The typed face of {@link useSearchParamState}: one piece of view state whose
 * values are a closed set of string literals.
 *
 * Returns `T` and never `null` — an absent key reads as `fallback`, so the call
 * site gets something it can switch on with no cast and no narrowing of its
 * own. The setter writes `null` for `fallback`, deleting the key: a viewer who
 * puts a control back where they found it leaves no trace in the URL.
 *
 * A value the URL carries but `values` does not contain — a typo, a stale
 * bookmark, a truncated share — renders `fallback` and is **removed from the
 * address**, so what the link says and what the page shows never disagree. That
 * heal is a **replace in both modes**: `mode` describes what happens when the
 * *viewer* sets the value, and a mount-time scrub is a correction to the entry
 * they are already standing on. Healing a `push` key with a push would leave
 * the broken URL behind them, where Back would reach it, heal it, and push
 * again — a page Back cannot leave.
 *
 * `mode` stays required and un-defaulted for the reason it is on the base hook.
 */
export function useEnumSearchParam<T extends string>(
  key: string,
  { mode, values, fallback }: { mode: SearchParamMode; values: readonly T[]; fallback: T },
): [T, (value: T) => void] {
  const [raw, setRaw] = useSearchParamState(key, { mode });
  const [, setSearchParams] = useSearchParams();

  const recognised = raw !== null && (values as readonly string[]).includes(raw);

  useEffect(() => {
    if (raw === null || recognised) return;
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.delete(key);
        return params;
      },
      { replace: true },
    );
  }, [key, raw, recognised, setSearchParams]);

  const setValue = useCallback(
    (next: T) => setRaw(next === fallback ? null : next),
    [fallback, setRaw],
  );

  return [recognised ? (raw as T) : fallback, setValue];
}
