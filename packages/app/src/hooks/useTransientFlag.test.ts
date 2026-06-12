// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useTransientFlag } from "./useTransientFlag.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

describe("useTransientFlag", () => {
  it("turns true on trigger and resets to false after the timeout", () => {
    const { result } = renderHook(() => useTransientFlag(2000));
    expect(result.current[0]).toBe(false);

    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current[0]).toBe(false);
  });

  it("re-arms the timer on a second trigger instead of resetting early", () => {
    const { result } = renderHook(() => useTransientFlag(2000));

    act(() => result.current[1]());
    act(() => vi.advanceTimersByTime(1500)); // first window almost elapsed
    act(() => result.current[1]()); // re-arm — countdown restarts

    act(() => vi.advanceTimersByTime(1500)); // 1500ms since re-arm, still active
    expect(result.current[0]).toBe(true);

    act(() => vi.advanceTimersByTime(500)); // now 2000ms since re-arm
    expect(result.current[0]).toBe(false);
  });

  it("clears the timer on unmount so it never fires into a dead component", () => {
    const { result, unmount } = renderHook(() => useTransientFlag(2000));
    act(() => result.current[1]());
    unmount();
    // Advancing past the window must not throw (the timer was cleared).
    expect(() => act(() => vi.advanceTimersByTime(2000))).not.toThrow();
  });
});
