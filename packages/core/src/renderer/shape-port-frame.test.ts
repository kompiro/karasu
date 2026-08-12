import { describe, expect, it } from "vitest";
import { getShapePortFrame } from "../shapes/shape-registry.js";
import "./shapes.js"; // auto-registers builtin shapes
import { portPoint, type Side } from "./port-frame.js";

/**
 * #2422: a shape says where its outline actually is, so an edge stops on the
 * drawn body instead of on the bounding box. The fence is geometric — for each
 * builtin, sample ports along every side and check the point against the
 * shape's own equations — because the numbers in the frame are only correct
 * relative to the render function they mirror.
 */

const W = 200;
const H = 100;
const BOX = { x: 0, y: 0, width: W, height: H };
const SIDES: Side[] = ["top", "right", "bottom", "left"];
/** Sample positions along a side. Endpoints included: corners are where it breaks. */
const TS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
/** Ports may sit on the outline, so containment is checked with a tolerance. */
const EPS = 0.5;

function portsOf(shape: string, side: Side): { x: number; y: number }[] {
  const frame = getShapePortFrame(shape)!(W, H);
  return TS.map((t) => portPoint(BOX, side, t, frame));
}

describe("builtin port frames", () => {
  it("declares one for every non-rectangular builtin, and none for box", () => {
    expect(getShapePortFrame("box")).toBeUndefined();
    for (const name of ["user", "cylinder", "queue", "hexagon", "cloud"]) {
      expect(getShapePortFrame(name)).toBeDefined();
    }
  });

  describe("user", () => {
    // The card starts a medallion radius below the box top, and the medallion
    // straddles that border at the centre — the two facts that put the #2366
    // P10 arrowheads in empty space.
    const medR = Math.min(13, H * 0.18);

    it("attaches on the card's top border, never under the medallion", () => {
      for (const p of portsOf("user", "top")) {
        expect(p.y).toBeCloseTo(medR, 6);
        expect(Math.abs(p.x - W / 2)).toBeGreaterThanOrEqual(medR - EPS);
      }
    });

    it("keeps the side attachments below the card's top border", () => {
      for (const side of ["left", "right"] as Side[]) {
        for (const p of portsOf("user", side)) {
          expect(p.y).toBeGreaterThanOrEqual(medR - EPS);
        }
      }
    });

    it("leaves the bottom edge alone — the card reaches it", () => {
      for (const p of portsOf("user", "bottom")) expect(p.y).toBeCloseTo(H, 6);
    });
  });

  describe("cylinder", () => {
    const ry = Math.min(H * 0.12, 15);

    it("follows the rim: on the box at the centre, a full radius in at the ends", () => {
      const top = portsOf("cylinder", "top");
      expect(top[Math.floor(TS.length / 2)].y).toBeCloseTo(0, 6);
      expect(top[0].y).toBeCloseTo(ry, 6);
      expect(top.at(-1)!.y).toBeCloseTo(ry, 6);
    });

    it("puts every top port on or inside the rim ellipse", () => {
      for (const p of portsOf("cylinder", "top")) {
        // Ellipse centred at (W/2, ry) with radii (W/2, ry).
        const u = (p.x - W / 2) / (W / 2);
        const v = (p.y - ry) / ry;
        expect(u * u + v * v).toBeLessThanOrEqual(1 + 1e-6);
      }
    });

    it("keeps the straight body's sides between the two rims", () => {
      for (const side of ["left", "right"] as Side[]) {
        for (const p of portsOf("cylinder", side)) {
          expect(p.y).toBeGreaterThanOrEqual(ry - EPS);
          expect(p.y).toBeLessThanOrEqual(H - ry + EPS);
        }
      }
    });
  });

  describe("queue", () => {
    const rx = Math.min(W * 0.1, 15);

    it("keeps the flat top and bottom between the caps", () => {
      for (const side of ["top", "bottom"] as Side[]) {
        for (const p of portsOf("queue", side)) {
          expect(p.x).toBeGreaterThanOrEqual(rx - EPS);
          expect(p.x).toBeLessThanOrEqual(W - rx + EPS);
        }
      }
    });

    it("follows the convex right cap", () => {
      const right = portsOf("queue", "right");
      expect(right[Math.floor(TS.length / 2)].x).toBeCloseTo(W, 6);
      expect(right[0].x).toBeCloseTo(W - rx, 6);
    });

    it("follows the concave left arc, which bulges into the body", () => {
      const left = portsOf("queue", "left");
      // Deepest at mid-height (2 * rx in), shallowest at the corners (rx).
      expect(left[Math.floor(TS.length / 2)].x).toBeCloseTo(2 * rx, 6);
      expect(left[0].x).toBeCloseTo(rx, 6);
    });
  });

  describe("hexagon", () => {
    const notch = W * 0.2;

    it("uses the flat spans only, skipping the cut corners", () => {
      for (const side of ["top", "bottom"] as Side[]) {
        for (const p of portsOf("hexagon", side)) {
          expect(p.x).toBeGreaterThanOrEqual(notch - EPS);
          expect(p.x).toBeLessThanOrEqual(W - notch + EPS);
        }
      }
    });

    it("collapses each side to its vertex", () => {
      for (const p of portsOf("hexagon", "left")) {
        expect(p).toEqual({ x: 0, y: H / 2 });
      }
      for (const p of portsOf("hexagon", "right")) {
        expect(p).toEqual({ x: W, y: H / 2 });
      }
    });

    it("puts every port on the drawn polygon", () => {
      const vertices = [
        [notch, 0],
        [W - notch, 0],
        [W, H / 2],
        [W - notch, H],
        [notch, H],
        [0, H / 2],
      ];
      const onEdge = (p: { x: number; y: number }): boolean =>
        vertices.some((a, i) => {
          const b = vertices[(i + 1) % vertices.length];
          const cross = (b[0] - a[0]) * (p.y - a[1]) - (b[1] - a[1]) * (p.x - a[0]);
          if (Math.abs(cross) > 1) return false;
          const dot = (p.x - a[0]) * (b[0] - a[0]) + (p.y - a[1]) * (b[1] - a[1]);
          const len = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
          return dot >= -1 && dot <= len + 1;
        });
      const off = SIDES.flatMap((side) => portsOf("hexagon", side)).filter((p) => !onEdge(p));
      expect(off).toEqual([]);
    });
  });

  describe("cloud", () => {
    // The one shape whose ports sit inside the outline rather than on it: the
    // blob is wavy and non-convex, so a side has no single boundary to land on.
    it("pulls every port into the content-safe box", () => {
      for (const side of SIDES) {
        for (const p of portsOf("cloud", side)) {
          expect(p.x).toBeGreaterThanOrEqual(W * 0.2 - EPS);
          expect(p.x).toBeLessThanOrEqual(W * (1 - 0.16) + EPS);
          expect(p.y).toBeGreaterThanOrEqual(H * 0.26 - EPS);
          expect(p.y).toBeLessThanOrEqual(H * (1 - 0.2) + EPS);
        }
      }
    });
  });
});
