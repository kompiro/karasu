// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useRef } from "react";
import {
  useEditorWidth,
  EDITOR_WIDTH_STORAGE_KEY,
  EDITOR_MIN_WIDTH,
  PREVIEW_MIN_WIDTH,
} from "./useEditorWidth.js";

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
});

interface Container {
  el: HTMLDivElement;
  setWidth: (w: number) => void;
}

function makeContainer(width: number): Container {
  const div = document.createElement("div");
  let current = width;
  Object.defineProperty(div, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      width: current,
      left: 0,
      top: 0,
      right: current,
      bottom: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => "",
    }),
  });
  return {
    el: div,
    setWidth: (w) => {
      current = w;
    },
  };
}

function renderUseEditorWidth(container: HTMLElement) {
  return renderHook(() => {
    const ref = useRef<HTMLElement | null>(container);
    return useEditorWidth(ref);
  });
}

function makeHandle(left: number): HTMLDivElement {
  const handle = document.createElement("div");
  Object.defineProperty(handle, "getBoundingClientRect", {
    value: () => ({
      width: 6,
      left,
      top: 0,
      right: left + 6,
      bottom: 0,
      height: 0,
      x: left,
      y: 0,
      toJSON: () => "",
    }),
  });
  return handle;
}

describe("useEditorWidth", () => {
  it("starts as null when localStorage is empty", () => {
    const { result } = renderUseEditorWidth(makeContainer(1200).el);
    expect(result.current.editorWidth).toBeNull();
  });

  it("hydrates from localStorage", () => {
    window.localStorage.setItem(EDITOR_WIDTH_STORAGE_KEY, "600");
    const { result } = renderUseEditorWidth(makeContainer(1200).el);
    expect(result.current.editorWidth).toBe(600);
  });

  it("persists width changes to localStorage during drag", () => {
    const { result } = renderUseEditorWidth(makeContainer(1200).el);
    const handle = makeHandle(600);
    act(() => {
      result.current.onMouseDown({
        preventDefault: () => {},
        clientX: 600,
        currentTarget: handle,
      } as unknown as React.MouseEvent);
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 700 }));
    });
    expect(result.current.editorWidth).toBe(700);
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    expect(window.localStorage.getItem(EDITOR_WIDTH_STORAGE_KEY)).toBe("700");
  });

  it("enforces editor minimum during drag", () => {
    const { result } = renderUseEditorWidth(makeContainer(1200).el);
    const handle = makeHandle(600);
    act(() => {
      result.current.onMouseDown({
        preventDefault: () => {},
        clientX: 600,
        currentTarget: handle,
      } as unknown as React.MouseEvent);
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 0 }));
    });
    expect(result.current.editorWidth).toBe(EDITOR_MIN_WIDTH);
  });

  it("enforces preview minimum during drag", () => {
    const { result } = renderUseEditorWidth(makeContainer(1200).el);
    const handle = makeHandle(600);
    act(() => {
      result.current.onMouseDown({
        preventDefault: () => {},
        clientX: 600,
        currentTarget: handle,
      } as unknown as React.MouseEvent);
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 5000 }));
    });
    expect(result.current.editorWidth).toBe(1200 - PREVIEW_MIN_WIDTH);
  });

  it("resets to null on double-click and clears localStorage", () => {
    window.localStorage.setItem(EDITOR_WIDTH_STORAGE_KEY, "600");
    const { result } = renderUseEditorWidth(makeContainer(1200).el);
    expect(result.current.editorWidth).toBe(600);
    act(() => {
      result.current.onDoubleClick();
    });
    expect(result.current.editorWidth).toBeNull();
    expect(window.localStorage.getItem(EDITOR_WIDTH_STORAGE_KEY)).toBeNull();
  });

  it("re-clamps when viewport shrinks below stored width plus preview minimum", () => {
    window.localStorage.setItem(EDITOR_WIDTH_STORAGE_KEY, "900");
    const container = makeContainer(1200);
    const { result } = renderUseEditorWidth(container.el);
    expect(result.current.editorWidth).toBe(900);

    container.setWidth(800);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.editorWidth).toBe(800 - PREVIEW_MIN_WIDTH);
  });
});
