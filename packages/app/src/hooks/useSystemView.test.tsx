// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { useSystemView } from "./useSystemView.js";

afterEach(cleanup);

const ENTRY = "/project/index.krs";

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

// Duplicate domain ID across services — triggers a semantic error (not a parse error).
// Both services parse successfully, but the duplicate domain ID is flagged as an error
// in buildNodePathIndex, added in feat(core): domain-to-domain dependency edges (#451).
const SOURCE_DUPLICATE_DOMAIN = `system SysA {
  service SvcB {
    label "ServiceB"
    domain DomD {}
  }
  service SvcC {
    label "ServiceC"
    domain DomD {}
  }
}`;

function makeFs(source: string) {
  const fs = new InMemoryFileSystemProvider();
  fs.writeFile(ENTRY, source);
  return fs;
}

describe("useSystemView", () => {
  it("compiles after debounce on mount", async () => {
    vi.useFakeTimers();
    const fs = makeFs(SOURCE_A);
    const { result } = renderHook(() => useSystemView(ENTRY, fs, []));

    expect(result.current.svg).toBe("");

    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(result.current.svg).not.toBe("");
    expect(result.current.svg).toContain("FrontendA");
    vi.useRealTimers();
  });

  it("source changes are debounced by 300ms", async () => {
    vi.useFakeTimers();
    const fs = makeFs(SOURCE_A);
    const { result } = renderHook(() => useSystemView(ENTRY, fs, []));
    await act(() => vi.advanceTimersByTimeAsync(300));
    const svgA = result.current.svg;
    expect(svgA).toContain("FrontendA");

    await act(async () => {
      await fs.writeFile(ENTRY, SOURCE_B);
      result.current.recompile();
    });

    // Not yet updated — still showing previous SVG
    expect(result.current.svg).toBe(svgA);

    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(result.current.svg).toContain("BackendB");
    vi.useRealTimers();
  });

  it("retains previous valid svg when updated source has errors", async () => {
    vi.useFakeTimers();
    const fs = makeFs(SOURCE_A);
    const { result } = renderHook(() => useSystemView(ENTRY, fs, []));
    await act(() => vi.advanceTimersByTimeAsync(300));
    const validSvg = result.current.svg;

    await act(async () => {
      await fs.writeFile(ENTRY, INVALID_SOURCE);
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(result.current.svg).toBe(validSvg);
    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(true);
    vi.useRealTimers();
  });

  it("restores diagram after transitioning from semantic error (duplicate domain) back to valid", async () => {
    vi.useFakeTimers();
    const fs = makeFs(SOURCE_A);
    const { result } = renderHook(() => useSystemView(ENTRY, fs, []));
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(result.current.svg).not.toBe("");
    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(false);

    // Step 1: introduce semantic error (duplicate domain ID)
    await act(async () => {
      await fs.writeFile(ENTRY, SOURCE_DUPLICATE_DOMAIN);
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(true);

    // Step 2: fix the error — revert to valid content
    await act(async () => {
      await fs.writeFile(ENTRY, SOURCE_B);
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));

    // Diagram should show and no errors should remain
    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(false);
    expect(result.current.svg).not.toBe("");
    expect(result.current.svg).toContain("BackendB");
    vi.useRealTimers();
  });
});
