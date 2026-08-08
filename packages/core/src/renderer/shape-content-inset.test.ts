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

  it("mirrors each shape's drawn geometry", () => {
    expect(getShapeContentInset("user")!(200, 100)).toEqual({
      top: 13,
      right: 0,
      bottom: 0,
      left: 0,
    });
    // cylinder: ry = min(100 * 0.12, 15) = 12 → top ellipse spans 24
    expect(getShapeContentInset("cylinder")!(200, 100)).toEqual({
      top: 24,
      right: 0,
      bottom: 12,
      left: 0,
    });
    // queue: rx = min(200 * 0.1, 15) = 15 → end cap spans 30
    expect(getShapeContentInset("queue")!(200, 100)).toEqual({
      top: 0,
      right: 30,
      bottom: 0,
      left: 15,
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

  it("user cards keep their size (medallion inset stays within padding)", () => {
    expect(widthOf("user")).toBe(widthOf("box"));
  });
});
