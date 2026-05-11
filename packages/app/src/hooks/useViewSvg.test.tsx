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
