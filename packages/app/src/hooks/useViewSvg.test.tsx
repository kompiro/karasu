// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useViewSvg } from "./useViewSvg.js";

afterEach(cleanup);

// Source must have at least one child node so the All Layers SVG renders
// something. `displayMode: "icon"` switches `service` (and other kinds) to
// an icon shape via the appended icon-theme stylesheet; in shape mode the
// node uses the default geometric shape. The two outputs must differ —
// regression #183 was the bug where `useFullViewSvg` / `useViewSvg` failed
// to forward `displayMode` to `buildAllLayersSvg`, leaving Full View stuck
// in shape mode regardless of the toolbar toggle.
// See TPL-20260510-06 and Issue #1245.
const SOURCE = `system EC {
  service Frontend {
    label "Frontend"
  }
}`;

describe("useViewSvg > displayMode threading to Full View / All Layers", () => {
  it("returns an All Layers SVG that differs between icon and shape modes (regression for #183)", () => {
    const { result: iconResult } = renderHook(() => useViewSvg(SOURCE, "icon"));
    const { result: shapeResult } = renderHook(() => useViewSvg(SOURCE, "shape"));

    expect(iconResult.current.allLayersSvg).toBeDefined();
    expect(shapeResult.current.allLayersSvg).toBeDefined();
    expect(iconResult.current.allLayersSvg).not.toBe(shapeResult.current.allLayersSvg);
  });

  it("emits the icon-mode card frame in All Layers SVG (extra <rect> before the shape body)", () => {
    // In icon mode, svg-renderer prepends a card-frame `<rect>` before
    // the shape's own rect (see `packages/core/src/renderer/svg-renderer.ts`
    // around the `displayMode === "icon" && isIconShape` branch). For a
    // default service node (no custom icon registered) this surfaces as
    // two consecutive identical `<rect>` elements inside the node group —
    // a marker that does not appear in shape mode.
    const { result: icon } = renderHook(() => useViewSvg(SOURCE, "icon"));
    const { result: shape } = renderHook(() => useViewSvg(SOURCE, "shape"));

    const iconSvg = icon.current.allLayersSvg!;
    const shapeSvg = shape.current.allLayersSvg!;

    // Count <rect> occurrences inside the .nodes group. The structural
    // diff between modes is a single extra rect per icon-shape node.
    const iconRects = (iconSvg.match(/<rect /g) ?? []).length;
    const shapeRects = (shapeSvg.match(/<rect /g) ?? []).length;
    expect(iconRects).toBeGreaterThan(shapeRects);
  });

  it("reactively re-renders All Layers SVG when displayMode flips", () => {
    const { result, rerender } = renderHook(
      ({ mode }: { mode: "icon" | "shape" }) => useViewSvg(SOURCE, mode),
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
    // TPL-20260510-06 enumerates "all surfaces consuming displayMode" —
    // useViewSvg covers drill-down, all-layers, and org variants. Cover
    // both system surfaces here so a future refactor that drops
    // displayMode from one but not the other is caught.
    const { result: icon } = renderHook(() => useViewSvg(SOURCE, "icon"));
    const { result: shape } = renderHook(() => useViewSvg(SOURCE, "shape"));

    expect(icon.current.drillDownSvg).toBeDefined();
    expect(shape.current.drillDownSvg).toBeDefined();
    expect(icon.current.drillDownSvg).not.toBe(shape.current.drillDownSvg);
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
    const { result: plain } = renderHook(() => useViewSvg(GROUPED_SOURCE, "shape"));
    const { result: grouped } = renderHook(() =>
      useViewSvg(GROUPED_SOURCE, "shape", undefined, undefined, "team"),
    );

    // Without groupBy the exports carry no team frames…
    expect(plain.current.allLayersSvg).not.toContain('data-group="true"');
    expect(plain.current.drillDownSvg).not.toContain('data-group="true"');
    expect(plain.current.allViewsSvg).not.toContain('data-group="true"');

    // …and with groupBy: team every system-view export surface gains them.
    expect(grouped.current.allLayersSvg).toContain('data-group="true"');
    expect(grouped.current.drillDownSvg).toContain('data-group="true"');
    expect(grouped.current.allViewsSvg).toContain('data-group="true"');
  });

  it("reactively re-renders the export SVGs when groupBy flips", () => {
    const { result, rerender } = renderHook(
      ({ g }: { g?: "team" }) => useViewSvg(GROUPED_SOURCE, "shape", undefined, undefined, g),
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

boundary money "Money" {
  contains Billing
}`;
    const { result: plain } = renderHook(() => useViewSvg(BOUNDARY_SOURCE, "shape"));
    const { result: grouped } = renderHook(() =>
      useViewSvg(BOUNDARY_SOURCE, "shape", undefined, undefined, "boundary"),
    );

    expect(plain.current.allLayersSvg).not.toContain('data-group="true"');
    expect(grouped.current.allLayersSvg).toContain('data-container-id="__group_money__"');
    expect(grouped.current.drillDownSvg).toContain('data-container-id="__group_money__"');
    expect(grouped.current.allViewsSvg).toContain('data-container-id="__group_money__"');
  });

  it("threads groupBy into the live entity view of the drilled domain (#1983)", () => {
    // The entity view is a render surface like any other: with a boundary
    // grouping entity members, the drilled domain's live entity view draws
    // the frame once groupBy is set (TPL-20260510-11 — every call site).
    const ENTITY_SOURCE = `system Shop {
  service Orders {
    domain OrderDomain {
      entity Order {}
      entity Invoice {}
    }
  }
}
boundary cluster "Cluster" {
  contains Order
}`;
    const path = ["Shop", "Orders", "OrderDomain"];
    const { result: plain } = renderHook(() =>
      useViewSvg(ENTITY_SOURCE, "shape", undefined, undefined, undefined, path),
    );
    const { result: grouped } = renderHook(() =>
      useViewSvg(ENTITY_SOURCE, "shape", undefined, undefined, "boundary", path),
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
boundary cluster "Cluster" {
  contains Order
}`;
    const path = ["Shop", "Orders", "OrderDomain"];
    const { result, rerender } = renderHook(
      ({ g }: { g?: "boundary" }) =>
        useViewSvg(ENTITY_SOURCE, "shape", undefined, undefined, g, path),
      { initialProps: { g: undefined as "boundary" | undefined } },
    );

    expect(result.current.hasEntityView).toBe(true);
    expect(result.current.entityViewSvg).not.toContain('data-group="true"');

    rerender({ g: "boundary" });
    expect(result.current.entityViewSvg).toContain('data-container-id="__group_cluster__"');
  });
});
