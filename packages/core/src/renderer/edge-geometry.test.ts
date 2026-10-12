import { describe, it, expect } from "vitest";
import { countPolylineCrossings } from "./edge-geometry.js";

describe("countPolylineCrossings (#3026)", () => {
  const cross = [
    { x: 0, y: 5 },
    { x: 10, y: 5 },
  ];

  it("counts a segment that crosses another at an interior point", () => {
    const vertical = [
      { x: 5, y: 0 },
      { x: 5, y: 10 },
    ];
    expect(countPolylineCrossings(cross, [vertical])).toBe(1);
  });

  it("counts every crossing pair across every other polyline", () => {
    const u = [
      { x: 2, y: 0 },
      { x: 2, y: 10 },
      { x: 8, y: 10 },
      { x: 8, y: 0 },
    ];
    expect(countPolylineCrossings(cross, [u, u])).toBe(4);
  });

  it("does not count a touch, a shared end or a collinear overlap", () => {
    const touching = [
      { x: 5, y: 5 },
      { x: 5, y: 10 },
    ];
    const sharedEnd = [
      { x: 10, y: 5 },
      { x: 10, y: 0 },
    ];
    const collinear = [
      { x: 3, y: 5 },
      { x: 12, y: 5 },
    ];
    expect(countPolylineCrossings(cross, [touching, sharedEnd, collinear])).toBe(0);
  });
});
