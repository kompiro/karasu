import { describe, expect, it } from "vitest";
import type { KrsEdge, KrsNode } from "../types/ast.js";
import type { SourceRange } from "../types/tokens.js";
import type { ContainerRect, LayoutNode } from "./layout-types.js";
import { placeExternalServicesOnSides } from "./external-columns.js";

const loc: SourceRange = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 2, offset: 1 },
};

const edge = (from: string, to: string): KrsEdge => ({ from, to, kind: "sync", tags: [], loc });

const service = (id: string, external = false): KrsNode =>
  ({
    kind: "service",
    id,
    tags: external ? ["external"] : [],
    annotations: [],
    properties: {},
    children: [],
    edges: [],
    loc,
  }) as unknown as KrsNode;

const card = (id: string, x: number, y: number, height = 100): LayoutNode => ({
  kind: "service",
  id,
  label: id,
  properties: { links: [] },
  linkCount: 0,
  hasChildren: false,
  hasDescription: false,
  x,
  y,
  width: 200,
  height,
});

/** Two hubs so the side placement engages (#1728), and `count` externals. */
function scenario(count: number, contentHeight: number) {
  const sourceNodes = [
    service("Web"),
    service("Api"),
    ...Array.from({ length: count }, (_e, i) => service(`X${i}`, true)),
  ];
  const layoutNodes = new Map<string, LayoutNode>([
    ["Web", card("Web", 100, 0)],
    ["Api", card("Api", 400, contentHeight - 100)],
    ...Array.from({ length: count }, (_e, i): [string, LayoutNode] => [
      `X${i}`,
      card(`X${i}`, 400, 0),
    ]),
  ]);
  const containers: ContainerRect[] = [
    { id: "S", label: "S", x: 0, y: 0, width: 700, height: contentHeight, ghost: false },
  ];
  const edges = [
    edge("Web", "Api"),
    ...Array.from({ length: count }, (_e, i) => edge(i % 2 === 0 ? "Web" : "Api", `X${i}`)),
  ];
  placeExternalServicesOnSides(sourceNodes, new Set(["S"]), layoutNodes, containers, edges);
  return { layoutNodes, containers };
}

const columnsOf = (layoutNodes: Map<string, LayoutNode>) => {
  const byX = new Map<number, LayoutNode[]>();
  for (const node of layoutNodes.values()) {
    if (!node.id.startsWith("X")) continue;
    const key = Math.round(node.x);
    if (!byX.has(key)) byX.set(key, []);
    byX.get(key)!.push(node);
  }
  return [...byX.values()].map((column) => column.sort((a, b) => a.y - b.y));
};

describe("placeExternalServicesOnSides > vertical clearance (#2593 follow-up)", () => {
  it("never overlaps two cards, however many the column holds", () => {
    // The column divided the content span into `count + 1` equal steps, which
    // stops fitting once the cards outgrow the span and then folds them into
    // each other: dify's root view stacked 14 externals 25px deep.
    for (const count of [4, 8, 14, 20]) {
      const { layoutNodes } = scenario(count, 600);
      for (const column of columnsOf(layoutNodes)) {
        for (let i = 1; i < column.length; i++) {
          const gap = column[i].y - (column[i - 1].y + column[i - 1].height);
          expect(gap).toBeGreaterThanOrEqual(24);
        }
      }
    }
  });

  it("grows the system frame to wrap a column that outgrew the content", () => {
    // A stacked column reaches past the band it hugs, so the frame has to
    // follow it or its own members are drawn outside it.
    const { layoutNodes, containers } = scenario(14, 600);
    const frame = containers[0];

    expect(frame.height).toBeGreaterThan(600);
    for (const node of layoutNodes.values()) {
      expect(node.y).toBeGreaterThanOrEqual(frame.y);
      expect(node.y + node.height).toBeLessThanOrEqual(frame.y + frame.height);
    }
  });

  it("leaves a column with room to spare on the equal-step spread", () => {
    // Two externals in a 600px span are nowhere near crowded, so the placement
    // that has always been used must still be the one applied.
    const { layoutNodes, containers } = scenario(2, 600);
    for (const column of columnsOf(layoutNodes)) {
      if (column.length < 2) continue;
      const spacing = column[1].y - column[0].y;
      expect(spacing).toBeGreaterThan(124);
    }
    expect(containers[0].height).toBe(600);
  });

  it("is deterministic", () => {
    const positions = () =>
      [...scenario(14, 600).layoutNodes.values()].map((n) => [n.id, n.x, n.y]);
    expect(positions()).toEqual(positions());
  });
});
