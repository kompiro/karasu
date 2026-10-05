// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "@karasu-tools/core";
import {
  buildFocusCanvas,
  canFocus,
  edgesOf,
  labelTextWidth,
  readFocusSource,
  wrapLabel,
  type Box,
  type FocusDrawing,
  type Point,
} from "./build.js";

// The dense canvas slice A was measured on: 10 domains, 41 labelled edges,
// 27 pairs, 14 of them with edges in both directions.
const dense = readFileSync(
  resolve(__dirname, "../../../../core/src/renderer/fixtures/dense-domain-canvas.krs"),
  "utf8",
);
const denseSvg = compile(dense, { viewPath: ["Umami", "UmamiApp"] }).svg;

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width - 0.5 &&
  b.x < a.x + a.width - 0.5 &&
  a.y < b.y + b.height - 0.5 &&
  b.y < a.y + a.height - 0.5;
const inside = (p: Point, b: Box, pad: number) =>
  p.x > b.x + pad && p.x < b.x + b.width - pad && p.y > b.y + pad && p.y < b.y + b.height - pad;

/**
 * What the focus canvas exists to avoid, counted the way the slice A fence
 * counts the main canvas (TPL-2048): label on a card, label on a label, a line
 * through a label (its own included), a line through the inside of a card.
 * Lines end on a card's border, so "inside" starts 2px in.
 */
function collisions(d: FocusDrawing): string[] {
  const found: string[] = [];
  const labels = d.lanes.flatMap((l) => (l.label ? [{ lane: l, box: l.label }] : []));
  labels.forEach(({ lane, box }, i) => {
    for (const c of d.cards) {
      if (overlaps(box, c.box)) found.push(`label ${lane.from}->${lane.to} on card ${c.id}`);
    }
    for (const other of labels.slice(i + 1)) {
      if (overlaps(box, other.box)) {
        found.push(`label ${lane.from}->${lane.to} on label ${other.lane.from}->${other.lane.to}`);
      }
    }
  });
  for (const lane of d.lanes) {
    for (const { lane: owner, box } of labels) {
      if (lane.points.some((p) => inside(p, box, 0))) {
        found.push(`line ${lane.from}->${lane.to} through label ${owner.from}->${owner.to}`);
      }
    }
    for (const c of d.cards) {
      if (lane.points.some((p) => inside(p, c.box, 2))) {
        found.push(`line ${lane.from}->${lane.to} through card ${c.id}`);
      }
    }
  }
  return found;
}

describe("readFocusSource", () => {
  const source = readFocusSource(denseSvg);

  it("reads every card and every edge of the canvas", () => {
    expect(source.cards.size).toBe(10);
    expect(source.edges).toHaveLength(41);
    expect(source.background).not.toBeNull();
  });

  it("keeps the authored label in full, whatever the canvas drew", () => {
    // The canvas truncates or leaves off most of these (slice A); the focus
    // canvas reads `data-edge-label`, not the drawn text.
    const long = source.edges.filter((e) => Array.from(e.label).length > 48);
    expect(long.length).toBeGreaterThan(10);
    for (const e of long)
      expect(denseSvg).toContain(`data-edge-label="${e.label.replaceAll("&", "&amp;")}`);
  });

  it("copies a card without what makes it a node of the main canvas", () => {
    const card = source.cards.get("Identity")!;
    expect(card.name).toBe("Identity & access");
    // A copy that kept these would answer the pane's drill-down and highlight
    // queries as if it were the card itself.
    expect(card.markup).not.toMatch(/data-[a-z-]+=/);
    expect(card.box.width).toBeGreaterThan(0);
  });

  it("returns an empty source for markup that is not a diagram", () => {
    expect(readFocusSource("").cards.size).toBe(0);
    expect(readFocusSource("<div>no diagram</div>").edges).toEqual([]);
  });
});

describe("buildFocusCanvas on the dense canvas", () => {
  const source = readFocusSource(denseSvg);
  const ids = [...source.cards.keys()];
  const pairs = [
    ...new Map(source.edges.map((e) => [[e.from, e.to].sort().join("|"), e] as const)).values(),
  ];

  it("draws every node with nothing colliding", () => {
    for (const id of ids) {
      const d = buildFocusCanvas(source, { kind: "node", id });
      expect({ id, collisions: collisions(d) }).toEqual({ id, collisions: [] });
      const { incoming, outgoing } = edgesOf(source, id);
      // One lane per edge, one card per neighbour plus the node itself.
      expect(d.lanes).toHaveLength(incoming.length + outgoing.length);
      const neighbours = new Set([...incoming.map((e) => e.from), ...outgoing.map((e) => e.to)]);
      // A neighbour that is both a dependent and a dependency appears on both sides.
      const sides =
        new Set(incoming.map((e) => e.from)).size + new Set(outgoing.map((e) => e.to)).size;
      expect(d.cards).toHaveLength(sides + 1);
      expect(neighbours.size).toBeLessThanOrEqual(sides);
    }
  });

  it("draws every pair with nothing colliding, both directions on lanes of their own", () => {
    expect(pairs).toHaveLength(27);
    let mutual = 0;
    for (const e of pairs) {
      const d = buildFocusCanvas(source, { kind: "edge", from: e.from, to: e.to });
      expect({ pair: `${e.from}->${e.to}`, collisions: collisions(d) }).toEqual({
        pair: `${e.from}->${e.to}`,
        collisions: [],
      });
      const between = source.edges.filter(
        (x) => (x.from === e.from && x.to === e.to) || (x.from === e.to && x.to === e.from),
      );
      expect(d.lanes).toHaveLength(between.length);
      if (between.length > 1) mutual++;
      expect(d.cards.map((c) => c.id)).toEqual([e.from, e.to]);
    }
    expect(mutual).toBe(14);
  });

  it("puts the clicked direction on the first lane", () => {
    const back = source.edges.find((e) =>
      source.edges.some((x) => x.from === e.to && x.to === e.from),
    )!;
    const d = buildFocusCanvas(source, { kind: "edge", from: back.to, to: back.from });
    expect([d.lanes[0].from, d.lanes[0].to]).toEqual([back.to, back.from]);
  });

  it("draws every label in full, however short the canvas budget is", () => {
    const tight = readFocusSource(
      compile(dense, {
        viewPath: ["Umami", "UmamiApp"],
        styleSource: "edge { label-max-chars: 8; }",
      }).svg,
    );
    const d = buildFocusCanvas(tight, { kind: "node", id: "Identity" });
    const { incoming, outgoing } = edgesOf(tight, "Identity");
    const authored = [...incoming, ...outgoing].map((e) => e.label);
    expect(d.lanes.map((l) => l.lines.join(" "))).toEqual(
      authored.map((l) => l.split(/\s+/).join(" ")),
    );
  });

  it("separates dependents from dependencies", () => {
    const d = buildFocusCanvas(source, { kind: "node", id: "Identity" });
    const centre = d.cards.find((c) => c.id === "Identity")!.box;
    // Into the node: the lane starts left of it. Out of it: on its right side.
    const into = d.lanes.filter((l) => l.to === "Identity").map((l) => l.points[0].x);
    const outOf = d.lanes.filter((l) => l.from === "Identity").map((l) => l.points[0].x);
    expect(into.every((x) => x < centre.x)).toBe(true);
    expect(outOf.every((x) => Math.abs(x - (centre.x + centre.width)) < 1e-6)).toBe(true);
    expect(into).toHaveLength(edgesOf(source, "Identity").incoming.length);
    expect(outOf).toHaveLength(edgesOf(source, "Identity").outgoing.length);
    expect([d.incoming, d.outgoing]).toEqual([into.length, outOf.length]);
  });

  it("is the same drawing every time", () => {
    const focus = { kind: "node", id: "TrackedEntities" } as const;
    expect(buildFocusCanvas(source, focus).svg).toBe(buildFocusCanvas(source, focus).svg);
  });

  it("keeps arrowhead ids apart under different prefixes", () => {
    const d = buildFocusCanvas(source, { kind: "node", id: "Identity" }, "x-");
    expect(d.svg).toContain('id="x-arrow-0"');
    expect(d.svg).not.toContain('id="focus-canvas-arrow-0"');
  });
});

describe("cards that are not boxes (#3031)", () => {
  // A database is a cylinder <path>, a queue a path with arcs, a cloud a
  // curve: none of them has a <rect> frame. An edge to one must still be drawn.
  const example = readFileSync(
    resolve(__dirname, "../../../../../examples/en/feature-samples/boundary-clusters.krs"),
    "utf8",
  );
  const source = readFocusSource(compile(example).svg);

  it("reads a database card and draws the edge to it", () => {
    const db = source.cards.get("OrderDB")!;
    expect(db).toBeDefined();
    expect(db.markup).toMatch(/^<g[^>]*>\s*<path/);
    expect(db.box.width).toBeGreaterThan(0);
    expect(db.box.height).toBeGreaterThan(0);
    const d = buildFocusCanvas(source, { kind: "node", id: "Checkout" });
    expect(d.lanes.map((l) => l.to)).toContain("OrderDB");
    expect(collisions(d)).toEqual([]);
  });

  it("reads every card of every builtin shape, so no edge is dropped", () => {
    const shapes = `system S {
  service Api { label "Api" }
  database Main { label "Main" }
  queue Jobs { label "Jobs" }
  Api -> Main "reads and writes"
  Api -> Jobs "enqueues"
}`;
    const svg = compile(shapes).svg;
    const s2 = readFocusSource(svg);
    const ids = [...svg.matchAll(/<g data-node-id="([^"]*)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual(["Api", "Main", "Jobs"]);
    for (const id of ids) expect(s2.cards.has(id)).toBe(true);
    const d = buildFocusCanvas(s2, { kind: "node", id: "Api" });
    expect(d.lanes.map((l) => l.to).sort()).toEqual(["Jobs", "Main"]);
    expect(collisions(d)).toEqual([]);
  });

  it("measures a cylinder from its path and ellipse, not from a missing rect", () => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg">` +
      `<g data-node-id="Db"><path d="M10 25 L10 75 A50 15 0 0 0 110 75 L110 25 A50 15 0 0 1 10 25"/>` +
      `<ellipse cx="60" cy="25" rx="50" ry="15"/><text x="60" y="50">Db</text></g></svg>`;
    expect(readFocusSource(svg).cards.get("Db")!.box).toEqual({
      x: 10,
      y: 10,
      width: 100,
      height: 80,
    });
  });
});

describe("canFocus", () => {
  const source = readFocusSource(denseSvg);
  const edge = source.edges[0];

  it("needs both cards and the edge itself", () => {
    expect(canFocus(source, { kind: "edge", from: edge.from, to: edge.to })).toBe(true);
    expect(canFocus(source, { kind: "edge", from: edge.from, to: "Nowhere" })).toBe(false);
    expect(canFocus(source, { kind: "node", id: "Identity" })).toBe(true);
    expect(canFocus(source, { kind: "node", id: "Nowhere" })).toBe(false);
  });

  it("does not focus a self-loop", () => {
    expect(canFocus(source, { kind: "edge", from: edge.from, to: edge.from })).toBe(false);
  });
});

describe("wrapLabel", () => {
  it("wraps between words within the width", () => {
    const lines = wrapLabel(
      "authorizes every request via @/permissions (canViewWebsiteSection, canViewReport) and parseRequest/checkAuth",
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(labelTextWidth(line)).toBeLessThanOrEqual(300);
  });

  it("cuts a token wider than the line by code point", () => {
    const lines = wrapLabel(
      "リクエストごとに権限を確認し認証トークンを検証してから処理を委譲する".repeat(2),
      120,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(labelTextWidth(line)).toBeLessThanOrEqual(120);
    expect(lines.join("")).toBe(
      "リクエストごとに権限を確認し認証トークンを検証してから処理を委譲する".repeat(2),
    );
  });

  it("returns nothing for an empty label", () => {
    expect(wrapLabel("")).toEqual([]);
  });
});
