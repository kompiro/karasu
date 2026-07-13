// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useCollapsibleSet } from "./useCollapsibleSet.js";

afterEach(() => {
  cleanup();
});

describe("useCollapsibleSet", () => {
  it("starts empty with an empty key", () => {
    const { result } = renderHook(() => useCollapsibleSet<string>());
    expect(result.current.set.size).toBe(0);
    expect(result.current.key).toBe("");
  });

  it("toggle adds then removes an id (clone-before-mutate)", () => {
    const { result } = renderHook(() => useCollapsibleSet<string>());
    const first = result.current.set;

    act(() => result.current.toggle("a"));
    expect(result.current.set.has("a")).toBe(true);
    // The previous set is not mutated in place.
    expect(first.has("a")).toBe(false);

    act(() => result.current.toggle("a"));
    expect(result.current.set.has("a")).toBe(false);
  });

  it("key is the sorted, comma-joined ids regardless of insertion order", () => {
    const { result } = renderHook(() => useCollapsibleSet<string>());
    act(() => result.current.toggle("b"));
    act(() => result.current.toggle("a"));
    expect(result.current.key).toBe("a,b");
  });

  it("replace swaps the whole set, and empty-replace clears it", () => {
    const { result } = renderHook(() => useCollapsibleSet<string>());
    act(() => result.current.replace(["x", "y"]));
    expect([...result.current.set].sort()).toEqual(["x", "y"]);

    act(() => result.current.replace());
    expect(result.current.set.size).toBe(0);
  });

  it("toggle and replace keep stable identity across renders", () => {
    const { result, rerender } = renderHook(() => useCollapsibleSet<string>());
    const toggle = result.current.toggle;
    const replace = result.current.replace;
    act(() => result.current.toggle("a"));
    rerender();
    expect(result.current.toggle).toBe(toggle);
    expect(result.current.replace).toBe(replace);
  });
});
