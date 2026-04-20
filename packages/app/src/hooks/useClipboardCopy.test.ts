// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useClipboardCopy } from "./useClipboardCopy.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

describe("useClipboardCopy", () => {
  it("sets copied=true after a successful write and resets after the timeout", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    mockClipboard(writeText);

    const { result } = renderHook(() => useClipboardCopy(2000));

    expect(result.current.copied).toBe(false);

    await act(async () => {
      result.current.copy("hello");
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("hello");
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.copied).toBe(false);
  });

  it("keeps copied=false when clipboard write rejects", async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new Error("denied"));
    mockClipboard(writeText);

    const { result } = renderHook(() => useClipboardCopy());

    await act(async () => {
      result.current.copy("nope");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.copied).toBe(false);
  });

  it("restarts the reset timer when copy is called again", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    mockClipboard(writeText);

    const { result } = renderHook(() => useClipboardCopy(2000));

    await act(async () => {
      result.current.copy("first");
      await Promise.resolve();
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.copied).toBe(true);

    await act(async () => {
      result.current.copy("second");
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.copied).toBe(false);
  });
});
