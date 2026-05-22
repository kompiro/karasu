// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import * as core from "@karasu-tools/core";
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

// Duplicate node ID under the same parent — triggers a semantic error (not a
// parse error). Both services parse successfully, but the duplicate service ID
// under one system is flagged as an error in buildNodePathIndex.
// (A duplicate *domain* ID across services is no longer an error — it is an
// informational `domain-dispersal` diagnostic per ADR-20260514-02 — so this
// fixture uses a duplicate service ID, which still errors.)
const SOURCE_DUPLICATE_NODE_ID = `system SysA {
  service SvcB {
    label "ServiceB"
    domain DomD {}
  }
  service SvcB {
    label "ServiceB again"
    domain DomE {}
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

  it("threads the theme into the rendered system-view SVG (Issue #1479)", async () => {
    // Regression: the system view is the default preview surface. Its hook
    // must forward `theme` into compileProject, or switching the app theme
    // re-skins the chrome but leaves the diagram dark.
    vi.useFakeTimers();
    const fs = makeFs(SOURCE_A);
    const dark = renderHook(() => useSystemView(ENTRY, fs, [], "shape", null, null, "dark"));
    const light = renderHook(() => useSystemView(ENTRY, fs, [], "shape", null, null, "light"));
    await act(() => vi.advanceTimersByTimeAsync(300));

    const darkSvg = dark.result.current.svg;
    const lightSvg = light.result.current.svg;
    expect(darkSvg).not.toBe("");
    expect(lightSvg).not.toBe("");
    // The canvas background rect follows the theme palette.
    expect(darkSvg).toContain("#0F172A");
    expect(lightSvg).toContain("#FFFFFF");
    expect(lightSvg).not.toBe(darkSvg);
    vi.useRealTimers();
  });

  it("hasOrgDiagram tracks the source's organization blocks (Issue #923)", async () => {
    vi.useFakeTimers();
    // Start with a source that has an organization block. After the editor is
    // edited to a source without one, hasOrgDiagram must flip to false in the
    // SAME tick that the system result settles. Without this single source of
    // truth, useAutoSwitchToOrg would race a stale orgCompile result and
    // wrongly switch tabs.
    const SOURCE_WITH_ORG = `system Sys {
  service Svc { label "Svc" }
}
organization Acme {
  team Backend { label "Backend" }
}`;
    const SOURCE_WITHOUT_ORG = `service Svc { label "Svc" }`;
    const fs = makeFs(SOURCE_WITH_ORG);
    const { result } = renderHook(() => useSystemView(ENTRY, fs, []));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.hasOrgDiagram).toBe(true);

    await act(async () => {
      await fs.writeFile(ENTRY, SOURCE_WITHOUT_ORG);
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.hasOrgDiagram).toBe(false);
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

  it("clears diagnostics when errors are fixed and SVG reverts to same last-valid content", async () => {
    vi.useFakeTimers();
    const fs = makeFs(SOURCE_A);
    const { result } = renderHook(() => useSystemView(ENTRY, fs, []));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.svg).toContain("FrontendA");
    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(false);

    // Introduce an error
    await act(async () => {
      await fs.writeFile(ENTRY, INVALID_SOURCE);
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(true);

    // Fix the error by reverting to the exact same source — SVG will be identical to lastValidSvg
    await act(async () => {
      await fs.writeFile(ENTRY, SOURCE_A);
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));

    // Diagnostics must be cleared even though SVG bytes didn't change
    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(false);
    expect(result.current.svg).toContain("FrontendA");
    vi.useRealTimers();
  });

  it("clears a warning after the source is fixed even when SVG topology is identical", async () => {
    vi.useFakeTimers();
    // Phase 4 introduced an `unresolved-handles` warning. The bug fixed by
    // Issue #891: when the user repairs the typo, the rendered SVG topology
    // is the same as the broken version (both render the same nodes /
    // edges), so the previous svg-only equality check would short-circuit
    // setState and leave the stale warning visible.
    const WITH_TYPO = `system S {
  client WebApp [web] { handles Ordr }
  service Backend { domain Order {} }
  WebApp -> Backend
}`;
    const FIXED = `system S {
  client WebApp [web] { handles Order }
  service Backend { domain Order {} }
  WebApp -> Backend
}`;
    const fs = makeFs(WITH_TYPO);
    const { result } = renderHook(() => useSystemView(ENTRY, fs, []));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.warnings.some((w) => w.kind === "unresolved-handles")).toBe(true);

    await act(async () => {
      await fs.writeFile(ENTRY, FIXED);
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(result.current.warnings.some((w) => w.kind === "unresolved-handles")).toBe(false);
    vi.useRealTimers();
  });

  it("surfaces a new warning when one is introduced after a clean compile", async () => {
    vi.useFakeTimers();
    const CLEAN = `system S {
  client WebApp [web] { handles Order }
  service Backend { domain Order {} }
  WebApp -> Backend
}`;
    const WITH_TYPO = `system S {
  client WebApp [web] { handles Ordr }
  service Backend { domain Order {} }
  WebApp -> Backend
}`;
    const fs = makeFs(CLEAN);
    const { result } = renderHook(() => useSystemView(ENTRY, fs, []));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.warnings.some((w) => w.kind === "unresolved-handles")).toBe(false);

    await act(async () => {
      await fs.writeFile(ENTRY, WITH_TYPO);
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(result.current.warnings.some((w) => w.kind === "unresolved-handles")).toBe(true);
    vi.useRealTimers();
  });

  it("skips setState when recompile produces the same SVG", async () => {
    vi.useFakeTimers();
    const fs = makeFs(SOURCE_A);

    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return useSystemView(ENTRY, fs, []);
    });
    await act(() => vi.advanceTimersByTimeAsync(300));

    const svgAfterFirstCompile = result.current.svg;
    expect(svgAfterFirstCompile).not.toBe("");

    // Recompile without changing the source — SVG should be identical
    const renderCountBefore = renderCount;
    await act(async () => {
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));

    // SVG is still the same — no unnecessary re-render from compile result
    expect(result.current.svg).toBe(svgAfterFirstCompile);
    // Only 1 re-render from recompile()'s setState, not 2 (compile result setState is skipped)
    expect(renderCount - renderCountBefore).toBe(1);
    vi.useRealTimers();
  });

  it("shows empty svg when navigating to a different viewPath while errors exist", async () => {
    vi.useFakeTimers();
    const fs = makeFs(SOURCE_A);
    // Compile at root viewPath first to establish a lastValidSvg
    const { result, rerender } = renderHook(
      ({ vp }: { vp: string[] }) => useSystemView(ENTRY, fs, vp),
      { initialProps: { vp: [] as string[] } },
    );
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.svg).toContain("FrontendA");

    // Introduce an error while still at viewPath=[]
    await act(async () => {
      await fs.writeFile(ENTRY, INVALID_SOURCE);
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    // Still at viewPath=[] — last valid SVG for this path is shown
    expect(result.current.svg).not.toBe("");
    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(true);

    // Navigate to a different viewPath (simulate drilling down) while errors remain
    rerender({ vp: ["SomeService"] });
    await act(() => vi.advanceTimersByTimeAsync(300));

    // No valid SVG has ever been compiled for viewPath=["SomeService"], so svg should be ""
    expect(result.current.svg).toBe("");
    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(true);
    vi.useRealTimers();
  });

  it("restores diagram after transitioning from semantic error (duplicate node id) back to valid", async () => {
    vi.useFakeTimers();
    const fs = makeFs(SOURCE_A);
    const { result } = renderHook(() => useSystemView(ENTRY, fs, []));
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(result.current.svg).not.toBe("");
    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(false);

    // Step 1: introduce semantic error (duplicate service ID)
    await act(async () => {
      await fs.writeFile(ENTRY, SOURCE_DUPLICATE_NODE_ID);
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

  it("clears diagnostics when compile exception is resolved", async () => {
    vi.useFakeTimers();
    const fs = makeFs(SOURCE_A);
    const { result } = renderHook(() => useSystemView(ENTRY, fs, []));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.svg).toContain("FrontendA");

    // Simulate a compile-time exception via the catch block
    const spy = vi.spyOn(core, "compileProject").mockRejectedValueOnce(new Error("render crash"));
    await act(async () => {
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(true);
    spy.mockRestore();

    // Fix: next compile succeeds — diagnostics must clear even though SVG is identical to lastValidSvg
    await act(async () => {
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(result.current.diagnostics.some((d) => d.severity === "error")).toBe(false);
    expect(result.current.svg).toContain("FrontendA");
    vi.useRealTimers();
  });

  // TPL-20260510-08 checklist item 5 — cross-surface timing alignment.
  // After one source edit + one recompile cycle, every surface derived
  // from the source must reflect the new shape in the same React tick:
  // none of `svg`, `warnings`, `nodeMetadata`, `systems`, `hasOrgDiagram`
  // is allowed to stay on the old value. Generalizes #891 (warnings-only)
  // to every surface the publish path feeds.
  //
  // If a future refactor splits the single `setState({...})` in
  // useSystemView's compile callback into multiple effects (or drops one
  // field from the payload), the assertion against that surface fails on
  // the very same recompile that updates the others — surfacing the skew
  // before users see a half-stale UI.
  it("publishes svg / warnings / nodeMetadata / systems / hasOrgDiagram together in one recompile (TPL-08 item 5)", async () => {
    vi.useFakeTimers();

    // BEFORE: a clean system with one service, no warnings, no
    // organization block.
    const BEFORE = `system Shop {
  service Catalog { label "Catalog" }
}`;
    // AFTER: same file path, but every observed surface should change in
    // one go — new service node (svg + nodeMetadata + systems), typo'd
    // handles ref (warnings), new organization block (hasOrgDiagram).
    const AFTER = `system Shop {
  service Catalog { label "Catalog" }
  client WebApp [web] { handles Ordr }
  WebApp -> Catalog
}
organization Acme {
  team Backend { label "Backend" }
}`;

    const fs = makeFs(BEFORE);
    const { result } = renderHook(() => useSystemView(ENTRY, fs, []));
    await act(() => vi.advanceTimersByTimeAsync(300));

    // Sanity: BEFORE shape on every surface
    expect(result.current.svg).toContain("Catalog");
    expect(result.current.svg).not.toContain("WebApp");
    expect(result.current.warnings.some((w) => w.kind === "unresolved-handles")).toBe(false);
    expect(result.current.nodeMetadata.has("WebApp")).toBe(false);
    expect(result.current.hasOrgDiagram).toBe(false);

    // Single source edit, single recompile.
    await act(async () => {
      await fs.writeFile(ENTRY, AFTER);
      result.current.recompile();
    });
    await act(() => vi.advanceTimersByTimeAsync(300));

    // AFTER shape must be reflected on EVERY surface — not just one of them.
    // If a future change publishes one field on a separate tick / drops it,
    // the corresponding assertion below catches the skew.
    expect(result.current.svg).toContain("WebApp");
    expect(result.current.warnings.some((w) => w.kind === "unresolved-handles")).toBe(true);
    expect(result.current.nodeMetadata.has("WebApp")).toBe(true);
    expect(result.current.systems.some((s) => s.id === "Shop")).toBe(true);
    expect(result.current.hasOrgDiagram).toBe(true);

    vi.useRealTimers();
  });
});
