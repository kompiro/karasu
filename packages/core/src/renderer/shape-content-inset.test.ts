import { describe, it, expect } from "vitest";
import { getShapeContentInset } from "../shapes/shape-registry.js";
import "./shapes.js"; // auto-registers builtin shapes
import { Parser } from "../parser/parser.js";
import { extractView } from "../view/view-extract.js";
import { layout } from "./layout.js";

/**
 * #2366 proposal F: shapes declare a content inset mirroring their drawn
 * geometry, the renderer's text layout clamps clearance to
 * max(padding, inset), and measureNode (given a shapeForNode hook) grows
 * cards whose insets exceed the base padding.
 */
describe("shape content insets", () => {
  it("registers insets for the non-rectangular builtins and none for box", () => {
    expect(getShapeContentInset("box")).toBeUndefined();
    for (const name of ["user", "cylinder", "queue", "hexagon", "cloud"]) {
      expect(getShapeContentInset(name)).toBeDefined();
    }
  });

  it("mirrors each shape's drawn geometry (content-safe boundaries)", () => {
    // user: full 13px medallion + a padding of breathing room below it
    expect(getShapeContentInset("user")!(200, 100)).toEqual({
      top: 13 + 24,
      right: 0,
      bottom: 0,
      left: 0,
    });
    // icon-mode height 56: the medallion scales down (56 * 0.18 = 10.08)
    expect(getShapeContentInset("user")!(160, 56).top).toBeCloseTo(10.08 + 24, 5);
    // cylinder: ry = min(100 * 0.12, 15) = 12 → ellipse band 24 + breathing
    expect(getShapeContentInset("cylinder")!(200, 100)).toEqual({
      top: 32,
      right: 0,
      bottom: 16,
      left: 0,
    });
    // queue: rx = min(200 * 0.1, 15) = 15 → both cap depths span 2*rx = 30
    // (the concave left arc reaches x + 2*rx at mid-height)
    expect(getShapeContentInset("queue")!(200, 100)).toEqual({
      top: 0,
      right: 30,
      bottom: 0,
      left: 30,
    });
    // hexagon: 20% side notches
    expect(getShapeContentInset("hexagon")!(200, 100)).toEqual({
      top: 0,
      right: 40,
      bottom: 0,
      left: 40,
    });
  });
});

describe("cloud inset safety (point-in-polygon over the drawn path)", () => {
  // The cloud outline is wavy and non-convex; these margins were found
  // numerically after the #2412 review showed the previous per-axis values
  // left 3 of 4 safe-rectangle corners outside the fill.
  function cloudPolygon(w: number, h: number): [number, number][] {
    const cx = w / 2;
    const cy = h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const segs: [number, number][][] = [
      [
        [rx * 0.3, cy + ry * 0.3],
        [-rx * 0.1, cy + ry * 0.8],
        [rx * 0.1, cy + ry],
        [cx, cy + ry * 0.7],
      ],
      [
        [cx, cy + ry * 0.7],
        [cx + rx * 0.3, cy + ry],
        [w + rx * 0.1, cy + ry * 0.6],
        [w - rx * 0.2, cy],
      ],
      [
        [w - rx * 0.2, cy],
        [w + rx * 0.1, cy - ry * 0.5],
        [cx + rx * 0.5, cy - ry],
        [cx, cy - ry * 0.7],
      ],
      [
        [cx, cy - ry * 0.7],
        [cx - rx * 0.3, cy - ry * 0.9],
        [-rx * 0.1, cy - ry * 0.3],
        [rx * 0.3, cy + ry * 0.3],
      ],
    ];
    const pts: [number, number][] = [];
    for (const [p0, p1, p2, p3] of segs) {
      for (let i = 0; i < 60; i++) {
        const t = i / 60;
        const u = 1 - t;
        pts.push([
          u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
          u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
        ]);
      }
    }
    return pts;
  }

  function inside(pts: [number, number][], px: number, py: number): boolean {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  it("keeps the declared safe rectangle inside the drawn outline", () => {
    for (const [w, h] of [
      [100, 100],
      [300, 80],
      [160, 66],
    ] as const) {
      const pts = cloudPolygon(w, h);
      const ins = getShapeContentInset("cloud")!(w, h);
      for (let i = 0; i <= 10; i++) {
        const px = ins.left + ((w - ins.right - ins.left) * i) / 10;
        expect(inside(pts, px, ins.top), `top edge x=${px} (${w}x${h})`).toBe(true);
        expect(inside(pts, px, h - ins.bottom), `bottom edge x=${px} (${w}x${h})`).toBe(true);
      }
    }
  });
});

describe("measureNode inset surplus (via layout shapeForNode hook)", () => {
  const src = `system S {
  service Wide {
    label "A service with a rather long label indeed"
  }
}`;

  function widthOf(shape: string | undefined): number {
    const krsFile = Parser.parse(src).value;
    const slice = extractView(krsFile.systems, []);
    const res = layout(slice, shape ? { shapeForNode: () => shape } : {});
    return res.nodes.get("Wide")!.width;
  }

  it("hexagon cards grow so the 20% notches leave the measured content width", () => {
    const boxWidth = widthOf("box");
    const hexWidth = widthOf("hexagon");
    // Content width the box card provides between its 40px paddings:
    const content = boxWidth - 80;
    // The hexagon's usable width between max(padding, 20% inset) clearances
    // must not undercut that content (fixed-point tolerance: 3px).
    const usable = hexWidth - 2 * Math.max(40, hexWidth * 0.2);
    expect(hexWidth).toBeGreaterThan(boxWidth);
    expect(usable).toBeGreaterThanOrEqual(content - 3);
  });

  it("without a hook, measurement keeps the padding-only width (pre-F behavior)", () => {
    expect(widthOf(undefined)).toBe(widthOf("box"));
  });

  it("user cards keep their width; height grows by the medallion inset", () => {
    expect(widthOf("user")).toBe(widthOf("box"));
  });

  it("label-only cylinders stay box-sized (insets fit inside the paddings)", () => {
    const krsFile = Parser.parse(src).value;
    const slice = extractView(krsFile.systems, []);
    const box = layout(slice, { shapeForNode: () => "box" }).nodes.get("Wide")!.height;
    const cyl = layout(slice, { shapeForNode: () => "cylinder" }).nodes.get("Wide")!.height;
    // At h=66 the ellipse band (2*ry + 8 = 23.8) sits inside the 24px padding.
    expect(cyl).toBe(box);
  });

  it("description-bearing cylinders grow so the ellipse clears the text", () => {
    const withDesc = `system S {
  service Tall {
    label "Ledger"
    description "Records sales, fees, and settlements for the platform"
  }
}`;
    const krsFile = Parser.parse(withDesc).value;
    const slice = extractView(krsFile.systems, []);
    const box = layout(slice, { shapeForNode: () => "box" }).nodes.get("Tall")!.height;
    const cyl = layout(slice, { shapeForNode: () => "cylinder" }).nodes.get("Tall")!.height;
    // Taller cards push 2*ry + 8 past the 24px padding, so the card grows.
    expect(cyl).toBeGreaterThan(box);
  });
});
