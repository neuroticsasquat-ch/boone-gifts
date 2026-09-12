import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMediaQuery } from "./useMediaQuery";

/**
 * The suite's own `matchMedia` stub (`src/test/viewport.ts`) answers a fixed
 * width and never fires `change`, which is the right shape for a test that just
 * needs a viewport. This file is about the subscription itself, so it installs
 * a list it can actually flip.
 */
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<() => void>();
  const list = {
    matches: initial,
    addEventListener: vi.fn((_: string, fn: () => void) => void listeners.add(fn)),
    removeEventListener: vi.fn((_: string, fn: () => void) => void listeners.delete(fn)),
  };

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: () => list,
  });

  return {
    list,
    /** What the browser does on a resize past the breakpoint. */
    change(matches: boolean) {
      list.matches = matches;
      act(() => listeners.forEach((fn) => fn()));
    },
  };
}

describe("useMediaQuery", () => {
  // Every test here replaces `window.matchMedia`; `setup.ts` puts the suite's
  // default back after each one, so nothing leaks into the next file.
  afterEach(() => vi.restoreAllMocks());

  it("reports the query's match on the first render", () => {
    stubMatchMedia(true);

    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));

    expect(result.current).toBe(true);
  });

  it("re-renders with the new answer when the query changes", () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));

    expect(result.current).toBe(false);

    media.change(true);

    expect(result.current).toBe(true);
  });

  it("unsubscribes on unmount", () => {
    const media = stubMatchMedia(true);
    const { unmount } = renderHook(() => useMediaQuery("(min-width: 768px)"));

    expect(media.list.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));

    unmount();

    expect(media.list.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
