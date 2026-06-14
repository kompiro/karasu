// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useTransientError } from "./useTransientError.js";

afterEach(cleanup);
beforeEach(() => vi.useRealTimers());

describe("useTransientError", () => {
  it("shows a reported message and auto-dismisses after the timeout", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTransientError(6000));
    expect(result.current.error).toBeNull();

    act(() => result.current.reportError("boom"));
    expect(result.current.error).toBe("boom");

    act(() => vi.advanceTimersByTime(5999));
    expect(result.current.error).toBe("boom");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.error).toBeNull();
  });

  it("re-arms the timer on a second report (the first timer can't hide it early)", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTransientError(6000));

    act(() => result.current.reportError("first"));
    act(() => vi.advanceTimersByTime(5000));
    act(() => result.current.reportError("second"));
    // 5s after the first, but only just reported the second — still shown.
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.error).toBe("second");
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.error).toBeNull();
  });

  it("clearError hides the message immediately", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTransientError(6000));
    act(() => result.current.reportError("boom"));
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it("does not fire the timer after unmount", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useTransientError(6000));
    act(() => result.current.reportError("boom"));
    unmount();
    // Advancing past the timeout must not throw (timer was cleared on unmount).
    expect(() => act(() => vi.advanceTimersByTime(10000))).not.toThrow();
  });
});
