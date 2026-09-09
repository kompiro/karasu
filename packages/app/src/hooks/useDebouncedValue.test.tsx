// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useDebouncedValue } from "./useDebouncedValue.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * Mount the hook on `initial` and record every value it ever returned, so a
 * test can assert not only where the value ends up but that an intermediate
 * value of a burst was never handed out.
 */
function renderDebounced<T>(initial: T, delayMs = 300) {
  const seen: T[] = [];
  const hook = renderHook(
    ({ value }: { value: T }) => {
      const settled = useDebouncedValue(value, delayMs);
      seen.push(settled);
      return settled;
    },
    { initialProps: { value: initial } },
  );
  return { ...hook, seen };
}

describe("useDebouncedValue", () => {
  it("returns the first value immediately, with no delay on mount (TC-1)", () => {
    vi.useFakeTimers();
    const { result } = renderDebounced("a");
    expect(result.current).toBe("a");
    // Nothing is pending either: a value that is already settled schedules no timer.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("holds the previous value until the new one has stayed unchanged for delayMs (TC-2)", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderDebounced("a");

    rerender({ value: "b" });
    expect(result.current).toBe("a");
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe("a");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("b");
  });

  it("restarts the window on every change, so only the last value of a burst lands (TC-3)", () => {
    vi.useFakeTimers();
    const { result, rerender, seen } = renderDebounced("a");

    rerender({ value: "b" });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: "c" });
    // 499 ms after "b" arrived, but only 299 ms after "c": still inside c's window.
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe("a");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("c");
    expect(seen).not.toContain("b");
  });

  it("keeps the settled value, with no timer left, when the input returns to it inside the window (TC-4)", () => {
    vi.useFakeTimers();
    const { result, rerender, seen } = renderDebounced("a");

    rerender({ value: "b" });
    act(() => vi.advanceTimersByTime(100));
    rerender({ value: "a" });
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("a");
    expect(seen).not.toContain("b");
  });

  it("preserves the identity of an object value until it changes (TC-5)", () => {
    vi.useFakeTimers();
    const first = { n: 1 };
    const second = { n: 2 };
    const { result, rerender } = renderDebounced(first);
    expect(result.current).toBe(first);

    // Same identity again is not a change.
    rerender({ value: first });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe(first);

    rerender({ value: second });
    expect(result.current).toBe(first);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe(second);
  });

  it("clears the pending timer on unmount, so a stale value cannot land afterwards (TC-6)", () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderDebounced("a");

    rerender({ value: "b" });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
