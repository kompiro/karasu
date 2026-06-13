// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { MouseEvent } from "react";
import { usePersistedPanelWidth } from "./usePersistedPanelWidth.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

beforeEach(() => localStorage.clear());

const fixedClamp = (min: number, max: number) => (w: number) => Math.min(max, Math.max(min, w));

function mouseDownAt(clientX: number): MouseEvent {
  // Minimal MouseEvent stand-in; the hook only reads clientX/preventDefault/currentTarget.
  return {
    clientX,
    preventDefault() {},
    currentTarget: null,
  } as unknown as MouseEvent;
}

function dragTo(clientX: number) {
  window.dispatchEvent(new MouseEvent("mousemove", { clientX }));
}
function dropDrag() {
  window.dispatchEvent(new MouseEvent("mouseup"));
}

describe("usePersistedPanelWidth", () => {
  it("seeds from defaultWidth when nothing is persisted", () => {
    const { result } = renderHook(() =>
      usePersistedPanelWidth({
        storageKey: "k",
        defaultWidth: 210,
        clamp: fixedClamp(180, 480),
        measureStart: () => 210,
      }),
    );
    expect(result.current.width).toBe(210);
  });

  it("seeds from a persisted value when present", () => {
    localStorage.setItem("k", "300");
    const { result } = renderHook(() =>
      usePersistedPanelWidth({
        storageKey: "k",
        defaultWidth: 210,
        clamp: fixedClamp(180, 480),
        measureStart: () => 210,
      }),
    );
    expect(result.current.width).toBe(300);
  });

  // Review of #1543: the prior sidebar readPersistedWidth clamped on read, so an
  // out-of-range stored value must not render unclamped on hydration.
  it("clamps an out-of-range persisted value on hydration when clampInitial is set", () => {
    localStorage.setItem("k", "700"); // above max 480
    const over = renderHook(() =>
      usePersistedPanelWidth({
        storageKey: "k",
        defaultWidth: 210,
        clamp: fixedClamp(180, 480),
        measureStart: () => 210,
        clampInitial: true,
      }),
    );
    expect(over.result.current.width).toBe(480);

    localStorage.setItem("k", "50"); // below min 180
    const under = renderHook(() =>
      usePersistedPanelWidth({
        storageKey: "k",
        defaultWidth: 210,
        clamp: fixedClamp(180, 480),
        measureStart: () => 210,
        clampInitial: true,
      }),
    );
    expect(under.result.current.width).toBe(180);
  });

  it("leaves the persisted value unclamped on hydration by default (editor defers to resize)", () => {
    localStorage.setItem("k", "700");
    const { result } = renderHook(() =>
      usePersistedPanelWidth({
        storageKey: "k",
        defaultWidth: null,
        clamp: fixedClamp(320, 480),
        measureStart: () => 400,
      }),
    );
    expect(result.current.width).toBe(700);
  });

  it("drags from the current width, clamps, and persists", () => {
    const { result } = renderHook(() =>
      usePersistedPanelWidth({
        storageKey: "k",
        defaultWidth: 210,
        clamp: fixedClamp(180, 480),
        measureStart: () => 210,
      }),
    );

    act(() => result.current.onMouseDown(mouseDownAt(100)));
    act(() => dragTo(250)); // 210 + (250-100) = 360
    expect(result.current.width).toBe(360);
    act(() => dragTo(10_000)); // clamps to max 480
    expect(result.current.width).toBe(480);
    act(() => dropDrag());
    expect(result.current.isDragging).toBe(false);
    expect(localStorage.getItem("k")).toBe("480");
  });

  it("double-click resets to defaultWidth", () => {
    const { result } = renderHook(() =>
      usePersistedPanelWidth({
        storageKey: "k",
        defaultWidth: 210,
        clamp: fixedClamp(180, 480),
        measureStart: () => 210,
      }),
    );
    act(() => result.current.onMouseDown(mouseDownAt(100)));
    act(() => dragTo(300)); // 210 + (300-100) = 410
    act(() => dropDrag());
    expect(result.current.width).toBe(410);
    act(() => result.current.onDoubleClick());
    expect(result.current.width).toBe(210);
  });

  it("seeds drag from measureStart when width starts null (nullable default)", () => {
    const { result } = renderHook(() =>
      usePersistedPanelWidth({
        storageKey: "k",
        defaultWidth: null,
        clamp: fixedClamp(320, 9999),
        measureStart: () => 400,
      }),
    );
    expect(result.current.width).toBeNull();
    act(() => result.current.onMouseDown(mouseDownAt(100)));
    act(() => dragTo(150)); // 400 + (150-100) = 450
    expect(result.current.width).toBe(450);
  });

  it("clears the key when width is null and reset returns to null", () => {
    localStorage.setItem("k", "450");
    const { result } = renderHook(() =>
      usePersistedPanelWidth({
        storageKey: "k",
        defaultWidth: null,
        clamp: fixedClamp(320, 9999),
        measureStart: () => 400,
      }),
    );
    expect(result.current.width).toBe(450);
    act(() => result.current.onDoubleClick()); // reset to null
    expect(result.current.width).toBeNull();
    expect(localStorage.getItem("k")).toBeNull();
  });

  it("reclamp re-applies clamp to the current width", () => {
    let max = 480;
    const { result, rerender } = renderHook(() =>
      usePersistedPanelWidth({
        storageKey: "k",
        defaultWidth: 400,
        clamp: (w) => Math.min(max, Math.max(180, w)),
        measureStart: () => 400,
      }),
    );
    expect(result.current.width).toBe(400);
    max = 300; // viewport shrank
    rerender();
    act(() => result.current.reclamp());
    expect(result.current.width).toBe(300);
  });
});
