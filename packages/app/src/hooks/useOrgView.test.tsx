// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useOrgView } from "./useOrgView.js";

afterEach(cleanup);

// Source with org structure that renders visible team nodes
const ORG_SOURCE_A = `organization OrgA {
  team TeamA {
    label "Alpha"
  }
  team TeamB {
    label "Beta"
  }
}`;
// Structurally different: three teams instead of two produces different SVG
const ORG_SOURCE_B = `organization OrgB {
  team TeamC {
    label "Gamma"
  }
  team TeamD {
    label "Delta"
  }
  team TeamE {
    label "Epsilon"
  }
}`;
const INVALID_SOURCE = "!!! invalid krs !!!";

describe("useOrgView", () => {
  it("source changes are debounced by 300ms", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ src }) => useOrgView(src, "", []), {
      initialProps: { src: ORG_SOURCE_A },
    });
    act(() => vi.advanceTimersByTime(300));
    const initialSvg = result.current.orgSvg;

    rerender({ src: ORG_SOURCE_B });

    // Not yet updated
    expect(result.current.orgSvg).toBe(initialSvg);

    act(() => vi.advanceTimersByTime(300));

    expect(result.current.orgSvg).not.toBe(initialSvg);
    vi.useRealTimers();
  });

  it("retains previous valid orgSvg when updated source has errors", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ src }) => useOrgView(src, "", []), {
      initialProps: { src: ORG_SOURCE_A },
    });
    act(() => vi.advanceTimersByTime(300));
    const validSvg = result.current.orgSvg;

    rerender({ src: INVALID_SOURCE });
    act(() => vi.advanceTimersByTime(300));

    expect(result.current.orgSvg).toBe(validSvg);
    expect(result.current.orgDiagnostics.some((d) => d.severity === "error")).toBe(true);
    vi.useRealTimers();
  });
});
