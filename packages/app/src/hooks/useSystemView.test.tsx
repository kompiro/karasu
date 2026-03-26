// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useSystemView } from "./useSystemView.js";

afterEach(cleanup);

// Sources must have child nodes so the SVG renderer produces visible output
const SOURCE_A = `system SysA {
  service FrontendSvc {
    label "FrontendA"
  }
}`;
const SOURCE_B = `system SysB {
  service BackendSvc {
    label "BackendB"
  }
}`;
const INVALID_SOURCE = "!!! invalid krs !!!";

describe("useSystemView", () => {
  it("initial state is compiled synchronously on mount", () => {
    const { result } = renderHook(() => useSystemView(SOURCE_A, "", []));
    // No timer advancement needed — initial compile happens in useState initializer
    expect(result.current.svg).not.toBe("");
    expect(result.current.svg).toContain("FrontendA");
  });

  it("source changes are debounced by 300ms", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ src }) => useSystemView(src, "", []), {
      initialProps: { src: SOURCE_A },
    });
    const initialSvg = result.current.svg;

    rerender({ src: SOURCE_B });

    // Not yet updated — still showing initial SVG
    expect(result.current.svg).toBe(initialSvg);

    act(() => vi.advanceTimersByTime(300));

    expect(result.current.svg).toContain("BackendB");
    vi.useRealTimers();
  });

  it("retains previous valid svg when updated source has errors", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ src }) => useSystemView(src, "", []), {
      initialProps: { src: SOURCE_A },
    });
    act(() => vi.advanceTimersByTime(300));
    const validSvg = result.current.svg;

    rerender({ src: INVALID_SOURCE });
    act(() => vi.advanceTimersByTime(300));

    expect(result.current.svg).toBe(validSvg);
    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(true);
    vi.useRealTimers();
  });
});
