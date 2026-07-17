// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useLatestRef } from "./useLatestRef.js";

afterEach(() => {
  cleanup();
});

describe("useLatestRef", () => {
  it("mirrors the initial value", () => {
    const { result } = renderHook(() => useLatestRef("a"));
    expect(result.current.current).toBe("a");
  });

  it("updates .current on every render without changing ref identity", () => {
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: "a" },
    });
    const ref = result.current;

    rerender({ value: "b" });
    expect(result.current).toBe(ref);
    expect(result.current.current).toBe("b");
  });

  it("reflects the latest value inside a callback captured on an earlier render", () => {
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: "a" },
    });
    const readLatest = () => result.current.current;

    act(() => {
      rerender({ value: "b" });
    });
    expect(readLatest()).toBe("b");
  });
});
