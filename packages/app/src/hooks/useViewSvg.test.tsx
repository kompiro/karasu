// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import {
  buildAllLayersSvg,
  buildAllLayersSvgOrg,
  buildAllViewsSvg,
  buildDrillDownSvg,
  buildDrillDownSvgOrg,
  renderEntityView,
} from "@karasu-tools/core";
import { useViewSvg } from "./useViewSvg.js";
import { useEmptyStateLabels } from "../i18n/use-empty-state-labels.js";
import { useAnnotationBadgeLabels } from "../i18n/use-annotation-badge-labels.js";

// Wrap the model-walking builders in spies so the debounce tests (#2758, at
// the bottom of this file) can assert how often, and with which content, they
// run. `vi.fn(original)` keeps the real implementation, so every other test
// here sees exactly the output it saw before.
vi.mock("@karasu-tools/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@karasu-tools/core")>();
  return {
    ...core,
    buildDrillDownSvg: vi.fn<typeof core.buildDrillDownSvg>(core.buildDrillDownSvg),
    buildDrillDownSvgOrg: vi.fn<typeof core.buildDrillDownSvgOrg>(core.buildDrillDownSvgOrg),
    buildAllLayersSvg: vi.fn<typeof core.buildAllLayersSvg>(core.buildAllLayersSvg),
    buildAllLayersSvgOrg: vi.fn<typeof core.buildAllLayersSvgOrg>(core.buildAllLayersSvgOrg),
    buildAllViewsSvg: vi.fn<typeof core.buildAllViewsSvg>(core.buildAllViewsSvg),
    renderEntityView: vi.fn<typeof core.renderEntityView>(core.renderEntityView),
  };
});

afterEach(cleanup);

/**
 * `useViewSvg` with the All-layers panel open, so `allLayersSvg` is built:
 * every bundle is on demand otherwise (#2758), and these suites read the
 * bundles as values.
 */
function useViewSvgOpen(...args: Parameters<typeof useViewSvg>) {
  const [content, mode, style, theme, groupBy, viewPath, facets] = args;
  return useViewSvg(content, mode, style, theme, groupBy, viewPath, facets, {
    allLayersOpen: true,
  });
}

// Source must have at least one child node so the All Layers SVG renders
// something. `displayMode: "icon"` switches `service` (and other kinds) to
// an icon shape via the appended icon-theme stylesheet; in shape mode the
// node uses the default geometric shape. The two outputs must differ —
// regression #183 was the bug where `useFullViewSvg` / `useViewSvg` failed
// to forward `displayMode` to `buildAllLayersSvg`, leaving Full View stuck
// in shape mode regardless of the toolbar toggle.
// See TPL-1001 and Issue #1245.
const SOURCE = `system EC {
  service Frontend {
    label "Frontend"
  }
}`;

describe("useViewSvg > displayMode threading to Full View / All Layers", () => {
  it("returns an All Layers SVG that differs between icon and shape modes (regression for #183)", () => {
    const { result: iconResult } = renderHook(() => useViewSvgOpen(SOURCE, "icon"));
    const { result: shapeResult } = renderHook(() => useViewSvgOpen(SOURCE, "shape"));

    expect(iconResult.current.allLayersSvg).toBeDefined();
    expect(shapeResult.current.allLayersSvg).toBeDefined();
    expect(iconResult.current.allLayersSvg).not.toBe(shapeResult.current.allLayersSvg);
  });

  it("draws the fixed icon card in All Layers SVG, and a measured card in shape mode", () => {
    // Icon mode sizes every card to the fixed icon card (160×56 without a
    // description); shape mode measures the card from its text. Reading the
    // card back from the emitted SVG keeps the marker on what is drawn
    // (TPL-2385). The card frame itself no longer tells the modes apart —
    // since #2696 a `url()` icon paints its declared frame in both.
    const { result: icon } = renderHook(() => useViewSvgOpen(SOURCE, "icon"));
    const { result: shape } = renderHook(() => useViewSvgOpen(SOURCE, "shape"));

    const cardOf = (svg: string): { width: number; height: number } => {
      const group = svg.indexOf('data-node-id="Frontend"');
      expect(group).toBeGreaterThan(-1);
      const rect = /<rect\s[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/.exec(svg.slice(group));
      expect(rect).not.toBeNull();
      return { width: Number(rect![1]), height: Number(rect![2]) };
    };

    const iconCard = cardOf(icon.current.allLayersSvg!);
    expect(iconCard).toEqual({ width: 160, height: 56 });
    expect(cardOf(shape.current.allLayersSvg!)).not.toEqual(iconCard);
  });

  it("reactively re-renders All Layers SVG when displayMode flips", () => {
    const { result, rerender } = renderHook(
      ({ mode }: { mode: "icon" | "shape" }) => useViewSvgOpen(SOURCE, mode),
      { initialProps: { mode: "shape" as "icon" | "shape" } },
    );

    const shapeSvg = result.current.allLayersSvg;
    expect(shapeSvg).toBeDefined();

    rerender({ mode: "icon" });

    const iconSvg = result.current.allLayersSvg;
    expect(iconSvg).toBeDefined();
    expect(iconSvg).not.toBe(shapeSvg);
  });

  it("forwards displayMode to the system drill-down view as well (cross-surface parity)", () => {
    // TPL-1001 enumerates "all surfaces consuming displayMode" —
    // useViewSvg covers drill-down, all-layers, and org variants. Cover
    // both system surfaces here so a future refactor that drops
    // displayMode from one but not the other is caught.
    const { result: icon } = renderHook(() => useViewSvgOpen(SOURCE, "icon"));
    const { result: shape } = renderHook(() => useViewSvgOpen(SOURCE, "shape"));

    expect(icon.current.getDrillDownSvg()).toBeDefined();
    expect(shape.current.getDrillDownSvg()).toBeDefined();
    expect(icon.current.getDrillDownSvg()).not.toBe(shape.current.getDrillDownSvg());
  });
});

// A two-team system so `groupBy: "team"` produces boundary frames on the
// root system band of the export SVGs.
const GROUPED_SOURCE = `system Shop {
  service Billing { label "Billing" }
  service Search { label "Search" }
  Billing -> Search "read"
}

organization Org {
  team "payments" { label "Payments" owns Billing }
  team "catalog" { label "Catalog" owns Search }
}`;

describe("useViewSvg > groupBy threading to export SVGs (#1879)", () => {
  it("threads groupBy: team into the All Layers / drill-down / all-views SVGs", () => {
    const { result: plain } = renderHook(() => useViewSvgOpen(GROUPED_SOURCE, "shape"));
    const { result: grouped } = renderHook(() =>
      useViewSvgOpen(GROUPED_SOURCE, "shape", undefined, undefined, "team"),
    );

    // Without groupBy the exports carry no team frames…
    expect(plain.current.allLayersSvg).not.toContain('data-group="true"');
    expect(plain.current.getDrillDownSvg()).not.toContain('data-group="true"');
    expect(plain.current.getAllViewsSvg()).not.toContain('data-group="true"');

    // …and with groupBy: team every system-view export surface gains them.
    expect(grouped.current.allLayersSvg).toContain('data-group="true"');
    expect(grouped.current.getDrillDownSvg()).toContain('data-group="true"');
    expect(grouped.current.getAllViewsSvg()).toContain('data-group="true"');
  });

  it("reactively re-renders the export SVGs when groupBy flips", () => {
    const { result, rerender } = renderHook(
      ({ g }: { g?: "team" }) => useViewSvgOpen(GROUPED_SOURCE, "shape", undefined, undefined, g),
      { initialProps: { g: undefined as "team" | undefined } },
    );

    expect(result.current.allLayersSvg).not.toContain('data-group="true"');
    rerender({ g: "team" });
    expect(result.current.allLayersSvg).toContain('data-group="true"');
  });

  it("threads groupBy: boundary into the export SVGs (#2033)", () => {
    // The boundary axis must reach the same export surfaces as team — the
    // AppShell pass-through once hardcoded `=== "team"` and dropped it.
    const BOUNDARY_SOURCE = `system Shop {
  service Billing { label "Billing" }
  service Search { label "Search" }
  Billing -> Search "read"
}

boundary money {
  label "Money"
  contains Billing
}`;
    const { result: plain } = renderHook(() => useViewSvgOpen(BOUNDARY_SOURCE, "shape"));
    const { result: grouped } = renderHook(() =>
      useViewSvgOpen(BOUNDARY_SOURCE, "shape", undefined, undefined, "boundary"),
    );

    expect(plain.current.allLayersSvg).not.toContain('data-group="true"');
    expect(grouped.current.allLayersSvg).toContain('data-container-id="__group_money__"');
    expect(grouped.current.getDrillDownSvg()).toContain('data-container-id="__group_money__"');
    expect(grouped.current.getAllViewsSvg()).toContain('data-container-id="__group_money__"');
  });

  it("threads groupBy into the live entity view of the drilled domain (#1983)", () => {
    // The entity view is a render surface like any other: with a boundary
    // grouping entity members, the drilled domain's live entity view draws
    // the frame once groupBy is set (TPL-219 — every call site).
    const ENTITY_SOURCE = `system Shop {
  service Orders {
    domain OrderDomain {
      entity Order {}
      entity Invoice {}
    }
  }
}
boundary cluster {
  label "Cluster"
  contains Order
}`;
    const path = ["Shop", "Orders", "OrderDomain"];
    const { result: plain } = renderHook(() =>
      useViewSvgOpen(ENTITY_SOURCE, "shape", undefined, undefined, undefined, path),
    );
    const { result: grouped } = renderHook(() =>
      useViewSvgOpen(ENTITY_SOURCE, "shape", undefined, undefined, "boundary", path),
    );

    expect(plain.current.hasEntityView).toBe(true);
    expect(plain.current.entityViewSvg).not.toContain('data-group="true"');
    expect(grouped.current.entityViewSvg).toContain('data-container-id="__group_cluster__"');
  });

  it("reactively re-renders the live entity view when groupBy flips (#1983)", () => {
    // The two-mount comparison above only proves the value is correct on
    // initial render, which would pass even if `groupBy` were missing from
    // `entityViewResult`'s useMemo deps (React always computes on mount
    // regardless of the deps array). A `rerender` on one live hook — the
    // shape a user's Group-by selector flip actually takes while the entity
    // view is already open — is the one that pins the deps-array wiring
    // itself.
    const ENTITY_SOURCE = `system Shop {
  service Orders {
    domain OrderDomain {
      entity Order {}
      entity Invoice {}
    }
  }
}
boundary cluster {
  label "Cluster"
  contains Order
}`;
    const path = ["Shop", "Orders", "OrderDomain"];
    const { result, rerender } = renderHook(
      ({ g }: { g?: "boundary" }) =>
        useViewSvgOpen(ENTITY_SOURCE, "shape", undefined, undefined, g, path),
      { initialProps: { g: undefined as "boundary" | undefined } },
    );

    expect(result.current.hasEntityView).toBe(true);
    expect(result.current.entityViewSvg).not.toContain('data-group="true"');

    rerender({ g: "boundary" });
    expect(result.current.entityViewSvg).toContain('data-container-id="__group_cluster__"');
  });
});

// ---------------------------------------------------------------------------
// #2758: the export bundles are built on demand, from settled content
// ---------------------------------------------------------------------------

// Edits of one model that differ only in a label, so each builds a different
// SVG and "which edit was built" is visible in the output.
const EDIT_A = `system EC {
  service Frontend { label "Frontend A" }
}`;
const EDIT_B = EDIT_A.replace("Frontend A", "Frontend B");
const EDIT_C = EDIT_A.replace("Frontend A", "Frontend C");

/** The five whole-model export builders: drill-down, all-layers, org all-layers, org drill-down, all-views. */
const EXPORT_BUILDERS = [
  buildDrillDownSvg,
  buildAllLayersSvg,
  buildAllLayersSvgOrg,
  buildDrillDownSvgOrg,
  buildAllViewsSvg,
] as const;

/** Call count of each export builder since the last `vi.clearAllMocks()`. */
function exportBuildCounts(): number[] {
  return EXPORT_BUILDERS.map((builder) => vi.mocked(builder).mock.calls.length);
}

/** Every `.krs` source any export builder was handed since the last clear. */
function builtSources(): string[] {
  return EXPORT_BUILDERS.flatMap((builder) => vi.mocked(builder).mock.calls.map((call) => call[0]));
}

/**
 * A fresh `buildAllViewsSvg` of `source`, with the labels the hook itself
 * passes (the i18n hooks fall back to English outside a provider, exactly as
 * `useViewSvg` does in these tests). The expectation every export is
 * compared against.
 */
function freshAllViewsSvg(source: string, displayMode: "icon" | "shape" = "shape"): string {
  const { result: empty } = renderHook(() => useEmptyStateLabels());
  const { result: badge } = renderHook(() => useAnnotationBadgeLabels());
  return buildAllViewsSvg(source, undefined, displayMode, empty.current, undefined, badge.current)
    .svg;
}

describe("useViewSvg > export bundles are built on demand, from settled content (#2758)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("builds nothing on mount and nothing while typing: a getter is the only trigger (TC-A)", () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    const { result, rerender } = renderHook(
      ({ content }: { content: string }) => useViewSvg(content, "shape"),
      { initialProps: { content: EDIT_A } },
    );
    expect(result.current.exportAvailable).toBe(true);
    expect(result.current.allLayersSvg).toBeUndefined(); // the panel is closed
    expect(exportBuildCounts()).toEqual([0, 0, 0, 0, 0]);

    const edits = Array.from({ length: 8 }, (_, i) =>
      EDIT_A.replace("Frontend A", `Frontend ${i}`),
    );
    for (const content of edits) {
      rerender({ content });
      act(() => vi.advanceTimersByTime(50)); // 50 ms apart: every edit lands inside the window
    }
    act(() => vi.advanceTimersByTime(300)); // and the window settles
    expect(exportBuildCounts()).toEqual([0, 0, 0, 0, 0]);
  });

  it("a getter builds its own bundle once and hands the same result back afterwards (TC-B)", () => {
    const fromA = freshAllViewsSvg(EDIT_A);
    vi.useFakeTimers();
    vi.clearAllMocks();
    const { result } = renderHook(() => useViewSvg(EDIT_A, "shape"));

    expect(result.current.getAllViewsSvg()).toBe(fromA);
    expect(result.current.getAllViewsSvg()).toBe(fromA);
    // Only the bundle that was asked for, once.
    expect(exportBuildCounts()).toEqual([0, 0, 0, 0, 1]);
    expect(result.current.getDrillDownSvg()).toBeDefined();
    expect(result.current.getOrgDrillDownSvg()).toBeDefined();
    expect(exportBuildCounts()).toEqual([1, 0, 0, 1, 1]);
  });

  it("serves the settled edit: the previous export while typing, the last edit after the window, never the intermediate one (TC-C)", () => {
    const fromA = freshAllViewsSvg(EDIT_A);
    const fromB = freshAllViewsSvg(EDIT_B);
    const fromC = freshAllViewsSvg(EDIT_C);
    expect(new Set([fromA, fromB, fromC]).size).toBe(3); // the edits are distinguishable
    vi.useFakeTimers();
    vi.clearAllMocks();
    const { result, rerender } = renderHook(
      ({ content }: { content: string }) => useViewSvg(content, "shape"),
      { initialProps: { content: EDIT_A } },
    );
    expect(result.current.getAllViewsSvg()).toBe(fromA);

    // Two keystrokes inside one window.
    rerender({ content: EDIT_B });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.getAllViewsSvg()).toBe(fromA);
    rerender({ content: EDIT_C });
    act(() => vi.advanceTimersByTime(299));
    // C has not been still for a whole window yet: still A, and never B.
    expect(result.current.getAllViewsSvg()).toBe(fromA);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.getAllViewsSvg()).toBe(fromC);
    expect(builtSources()).not.toContain(EDIT_B);
  });

  it("applies a display-mode flip without waiting for the window (TPL-219 parity) (TC-D)", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ mode }: { mode: "icon" | "shape" }) => useViewSvg(EDIT_A, mode),
      { initialProps: { mode: "shape" as "icon" | "shape" } },
    );
    const shape = result.current.getAllViewsSvg();

    rerender({ mode: "icon" });
    // No timer advance: a cheap toggle reaches the export on the same render,
    // so the export shows what the screen shows.
    expect(result.current.getAllViewsSvg()).not.toBe(shape);
    expect(result.current.getAllViewsSvg()).toBe(freshAllViewsSvg(EDIT_A, "icon"));
  });

  it("builds the All-layers SVG only while the panel is open, from the settled content (TC-E)", () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    const allLayers = vi.mocked(buildAllLayersSvg);
    const { result, rerender } = renderHook(
      ({ content, open }: { content: string; open: boolean }) =>
        useViewSvg(content, "shape", undefined, undefined, undefined, undefined, undefined, {
          allLayersOpen: open,
        }),
      { initialProps: { content: EDIT_A, open: false } },
    );
    expect(result.current.allLayersSvg).toBeUndefined();
    expect(allLayers).not.toHaveBeenCalled();

    rerender({ content: EDIT_A, open: true });
    expect(result.current.allLayersSvg).toBeDefined();
    expect(allLayers).toHaveBeenCalledTimes(1);

    // Typing while the panel is open: rebuilt once, after the window, from the last edit.
    rerender({ content: EDIT_B, open: true });
    act(() => vi.advanceTimersByTime(100));
    rerender({ content: EDIT_C, open: true });
    act(() => vi.advanceTimersByTime(299));
    expect(allLayers).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(allLayers).toHaveBeenCalledTimes(2);
    expect(allLayers.mock.calls[1][0]).toBe(EDIT_C);

    rerender({ content: EDIT_C, open: false });
    expect(result.current.allLayersSvg).toBeUndefined();
  });

  it("feeds the live entity view the settled content, so the screen and the exports stay in step (TC-F)", () => {
    const ENTITY_A = `system Shop {
  service Orders {
    domain OrderDomain {
      entity Order {}
    }
  }
}`;
    const ENTITY_B = ENTITY_A.replace(
      "entity Order {}",
      "entity Order {}\n      entity Invoice {}",
    );
    const path = ["Shop", "Orders", "OrderDomain"];
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ content }: { content: string }) =>
        useViewSvg(content, "shape", undefined, undefined, undefined, path),
      { initialProps: { content: ENTITY_A } },
    );
    expect(result.current.hasEntityView).toBe(true);
    const fromA = result.current.entityViewSvg;
    expect(fromA).not.toContain("Invoice");
    vi.clearAllMocks();

    rerender({ content: ENTITY_B });
    act(() => vi.advanceTimersByTime(299));
    expect(vi.mocked(renderEntityView)).not.toHaveBeenCalled();
    expect(result.current.entityViewSvg).toBe(fromA);

    act(() => vi.advanceTimersByTime(1));
    expect(vi.mocked(renderEntityView)).toHaveBeenCalledTimes(1);
    expect(result.current.entityViewSvg).toContain("Invoice");
  });
});
