import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTimeout } from "./useTimeout";

describe("useTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs the callback once the delay elapses", () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useTimeout());

    act(() => result.current.start(fn, 500));
    expect(fn).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(500));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("replaces a pending timer when start is called again", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result } = renderHook(() => useTimeout());

    act(() => result.current.start(first, 500));
    act(() => void vi.advanceTimersByTime(300));
    act(() => result.current.start(second, 500));
    act(() => void vi.advanceTimersByTime(500));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending timer when clear is called", () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useTimeout());

    act(() => result.current.start(fn, 500));
    act(() => result.current.clear());
    act(() => void vi.advanceTimersByTime(500));

    expect(fn).not.toHaveBeenCalled();
  });

  it("cancels a pending timer on unmount", () => {
    const fn = vi.fn();
    const { result, unmount } = renderHook(() => useTimeout());

    act(() => result.current.start(fn, 500));
    unmount();
    act(() => void vi.advanceTimersByTime(500));

    expect(fn).not.toHaveBeenCalled();
  });

  it("keeps two instances independent", () => {
    const a = vi.fn();
    const b = vi.fn();
    const { result } = renderHook(() => ({ one: useTimeout(), two: useTimeout() }));

    act(() => result.current.one.start(a, 2000));
    act(() => result.current.two.start(b, 3000));
    act(() => void vi.advanceTimersByTime(3000));

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
