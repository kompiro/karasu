import { describe, expect, it } from "vitest";
import { Parser } from "../parser/parser.js";
import { extractView } from "../view/view-extract.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { layout } from "./layout.js";
import { render } from "./svg-renderer.js";
import "./shapes.js";
import type { LayoutNode, LayoutResult, Rect } from "./layout-types.js";

/**
 * #2422 end to end: what the shapes declare has to survive the routing chain.
 * Every candidate pass re-anchors the edges it reroutes, so these run through
 * the whole `layout()` rather than the port pass alone.
 */

const MODEL = `system S {
  user Customer [human] { label "Customer" description "buys things" }
  service Shop { label "Shop" description "sells things" }
  service Billing { label "Billing" description "charges cards" }
  database Db { label "Orders" table t }
  storage Media { label "Media" bucket b }
  queue Events { label "Events" queue-item e }
  Customer -> Shop "buy"
  Customer -> Billing "pay"
  Shop -> Db "read"
  Shop -> Media "store"
  Shop -> Events "publish"
  Billing -> Db "write"
  Db -> Customer "notify"
}`;

function layoutOf(source: string, withStyles = true): LayoutResult {
  const parsed = Parser.parse(source);
  const styles = resolveStyles(parsed.value.systems, [getBuiltinStyleSheet()]);
  const slice = extractView(parsed.value.systems, []);
  return layout(slice, {
    shapeForNode: withStyles
      ? (id) => {
          const style = styles.nodes.get(id) ?? styles.defaultNodeStyle;
          return typeof style.shape === "string" ? style.shape : style.shape.url;
        }
      : undefined,
  });
}

/** Every endpoint, with the node it lands on. */
function endpoints(res: LayoutResult): { node: LayoutNode; point: { x: number; y: number } }[] {
  const out: { node: LayoutNode; point: { x: number; y: number } }[] = [];
  for (const edge of res.edges) {
    if (edge.ghost || edge.cyclic) continue;
    const from = res.nodes.get(edge.from);
    const to = res.nodes.get(edge.to);
    if (from) out.push({ node: from, point: edge.fromPoint });
    if (to) out.push({ node: to, point: edge.toPoint });
  }
  return out;
}

function inside(rect: Rect, p: { x: number; y: number }): boolean {
  return p.x > rect.x && p.x < rect.x + rect.width && p.y > rect.y && p.y < rect.y + rect.height;
}

describe("ports land on the drawn outline", () => {
  it("pulls a cloud endpoint off the bounding box and into the blob", () => {
    const res = layoutOf(MODEL);
    const media = res.nodes.get("Media")!;
    const arrivals = endpoints(res).filter((e) => e.node.id === "Media");
    expect(arrivals.length).toBeGreaterThan(0);
    for (const { point } of arrivals) {
      // The bbox top is empty canvas above the blob: the endpoint must be below it.
      expect(point.y).toBeGreaterThan(media.y + 1);
      expect(point.y).toBeLessThan(media.y + media.height - 1);
    }
  });

  it("puts a cylinder endpoint on the rim rather than above it", () => {
    const res = layoutOf(MODEL);
    const db = res.nodes.get("Db")!;
    const ry = Math.min(db.height * 0.12, 15);
    const offBody = endpoints(res)
      .filter((e) => e.node.id === "Db")
      .filter(({ point }) => {
        const onSide =
          Math.abs(point.x - db.x) < 0.5 || Math.abs(point.x - (db.x + db.width)) < 0.5;
        if (onSide) {
          // A side port belongs to the straight body between the two rims.
          return point.y < db.y + ry - 0.5 || point.y > db.y + db.height - ry + 0.5;
        }
        // A top/bottom port lies on (or inside) the rim ellipse.
        const cy = point.y < db.y + db.height / 2 ? db.y + ry : db.y + db.height - ry;
        const u = (point.x - (db.x + db.width / 2)) / (db.width / 2);
        const v = (point.y - cy) / ry;
        return u * u + v * v > 1 + 1e-6;
      });
    expect(offBody).toEqual([]);
  });

  it("keeps a user card's endpoints off the medallion strip", () => {
    const res = layoutOf(MODEL);
    const user = res.nodes.get("Customer")!;
    const medR = Math.min(13, user.height * 0.18);
    const underMedallion = endpoints(res)
      .filter((e) => e.node.id === "Customer")
      .filter(({ point }) => Math.abs(point.y - user.y) < medR + 0.5)
      .filter(({ point }) => Math.abs(point.x - (user.x + user.width / 2)) < medR - 0.5);
    expect(underMedallion).toEqual([]);
  });

  it("leaves a diagram of plain boxes exactly where it was", () => {
    const boxes = `system S {
  service A { label "A" }
  service B { label "B" }
  service C { label "C" }
  A -> B "x"
  A -> C "y"
}`;
    const framed = layoutOf(boxes);
    const bare = layoutOf(boxes, false);
    expect(framed.edges.map((e) => [e.fromPoint, e.toPoint])).toEqual(
      bare.edges.map((e) => [e.fromPoint, e.toPoint]),
    );
  });
});

/**
 * #2385: an actor's edges left the bounding box while its figure was drawn 30%
 * narrower, so a side-anchored edge began 67px clear of the actor, floating in
 * blank canvas. Both ends of that gap have since moved — the figure became a
 * full-width card (#2412) and the ports moved onto the declared outline
 * (#2422) — which is exactly why the guard has to read the SVG. Measuring the
 * endpoints against the bounding box would pass whether or not the drawing
 * agrees with it; these read the `rect` the renderer emitted.
 */
describe("an actor's ports agree with the figure it draws", () => {
  /** An actor with a target on each side (the client-mcp shape) and one below. */
  const ACTOR = `system S {
  user Agent [ai] { label "Agent" }
  service Core { label "Core" }
  service Left [external] { label "Left" }
  service Right [external] { label "Right" }
  Agent -> Left "tool-use"
  Agent -> Right "tool-use"
  Agent -> Core "use"
}`;

  function svgOf(source: string): string {
    const parsed = Parser.parse(source);
    const styles = resolveStyles(parsed.value.systems, [getBuiltinStyleSheet()]);
    return render(extractView(parsed.value.systems, []), styles);
  }

  // `\b` would let `width` match inside `stroke-width`, which reads the right
  // number today only because `width` happens to be emitted first.
  function num(tag: string, name: string): number {
    const m = new RegExp(`(?:^|\\s)${name}="(-?[\\d.]+)"`).exec(tag);
    if (!m) throw new Error(`no ${name} in ${tag}`);
    return Number(m[1]);
  }

  /** The markup of one node's group, up to wherever the next node starts. */
  function nodeGroup(svg: string, id: string): string {
    const start = svg.indexOf(`data-node-id="${id}"`);
    expect(start, `no node group for ${id}`).toBeGreaterThan(-1);
    const next = svg.indexOf("data-node-id=", start + 1);
    return svg.slice(start, next === -1 ? undefined : next);
  }

  function firstTag(group: string, name: string): string {
    const m = new RegExp(`<${name} [^>]*>`).exec(group);
    if (!m) throw new Error(`no <${name}> drawn`);
    return m[0];
  }

  /** Endpoints of the drawn connectors that terminate on `id`. */
  function drawnEndpointsOn(svg: string, id: string): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    const re =
      /data-edge-from="([^"]+)" data-edge-to="([^"]+)"[^>]*>(<line [^>]*>|<polyline [^>]*>)/g;
    for (const [, from, to, shape] of svg.matchAll(re)) {
      const ends = shape.startsWith("<line")
        ? [
            { x: num(shape, "x1"), y: num(shape, "y1") },
            { x: num(shape, "x2"), y: num(shape, "y2") },
          ]
        : (() => {
            const pts = /points="([^"]+)"/
              .exec(shape)![1]
              .split(" ")
              .map((p) => {
                const [x, y] = p.split(",").map(Number);
                return { x, y };
              });
            return [pts[0], pts[pts.length - 1]];
          })();
      if (from === id) out.push(ends[0]);
      if (to === id) out.push(ends[1]);
    }
    return out;
  }

  it("starts every edge on the drawn card, never in the empty strip around it", () => {
    const svg = svgOf(ACTOR);
    const group = nodeGroup(svg, "Agent");
    const card = firstTag(group, "rect");
    const rect = {
      x: num(card, "x"),
      y: num(card, "y"),
      width: num(card, "width"),
      height: num(card, "height"),
    };

    const eps = 0.5;
    const ends = drawnEndpointsOn(svg, "Agent");
    expect(ends).toHaveLength(3);
    for (const p of ends) {
      const onSide = Math.abs(p.x - rect.x) < eps || Math.abs(p.x - (rect.x + rect.width)) < eps;
      const onCap = Math.abs(p.y - rect.y) < eps || Math.abs(p.y - (rect.y + rect.height)) < eps;
      const withinX = p.x >= rect.x - eps && p.x <= rect.x + rect.width + eps;
      const withinY = p.y >= rect.y - eps && p.y <= rect.y + rect.height + eps;
      expect(
        (onSide && withinY) || (onCap && withinX),
        `port at ${p.x},${p.y} is off the card drawn at ${rect.x},${rect.y} ${rect.width}x${rect.height}`,
      ).toBe(true);
    }
    // The reported case: a target to the side, entered from the card's border.
    expect(ends.filter((p) => Math.abs(p.x - rect.x) < eps)).toHaveLength(1);
    expect(ends.filter((p) => Math.abs(p.x - (rect.x + rect.width)) < eps)).toHaveLength(1);

    // Landing on the card is a stronger claim than landing on the bounding box
    // only while the two differ, so the difference is measured rather than
    // assumed: the drawn card stays inside the box and is strictly smaller
    // somewhere. A figure that grows to fill its box would leave the assertions
    // above passing as the bbox test they exist to replace, and fails here.
    const box = layoutOf(ACTOR).nodes.get("Agent")!;
    expect(rect.x).toBeGreaterThanOrEqual(box.x - eps);
    expect(rect.y).toBeGreaterThanOrEqual(box.y - eps);
    expect(rect.x + rect.width).toBeLessThanOrEqual(box.x + box.width + eps);
    expect(rect.y + rect.height).toBeLessThanOrEqual(box.y + box.height + eps);
    expect(
      rect.x > box.x + eps ||
        rect.y > box.y + eps ||
        rect.width < box.width - eps ||
        rect.height < box.height - eps,
      `the card fills its bounding box (${box.x},${box.y} ${box.width}x${box.height}), so the ports above were only checked against the box`,
    ).toBe(true);
  });
});

describe("ports keep out of the card's own chrome", () => {
  // Found by eye on the guide diagrams: a lone vertical edge came out slanted
  // because its port slid sideways for a chip. The clearance is worth a few
  // pixels, not a diagonal in a diagram whose language is right angles.
  it("does not tilt a lone straight edge to clear a chip", () => {
    const pair = `system S {
  service Up { label "Up" }
  service Down { label "Down" }
  Up -> Down "x"
}`;
    const parsed = Parser.parse(pair);
    const styles = resolveStyles(parsed.value.systems, [getBuiltinStyleSheet()]);
    const slice = extractView(parsed.value.systems, []);
    const res = layout(slice, {
      shapeForNode: (id) => {
        const style = styles.nodes.get(id) ?? styles.defaultNodeStyle;
        return typeof style.shape === "string" ? style.shape : style.shape.url;
      },
      // A lane wide enough to cover the middle of the top edge, which is where
      // this edge lands.
      chipZoneFor: (node) => ({
        x: node.x + node.width * 0.25,
        y: node.y,
        width: node.width * 0.75,
        height: 24,
      }),
    });
    const edge = res.edges[0];
    expect(edge.waypoints ?? []).toHaveLength(0);
    expect(edge.fromPoint.x).toBeCloseTo(edge.toPoint.x, 6);
  });

  // A fan-in puts ports across the whole top edge, including the corner the
  // chip and the buttons occupy — without a keep-out the rightmost lands there.
  const FAN_IN = `system S {
  service A { label "A" }
  service B { label "B" }
  service C { label "C" }
  service D { label "D" }
  database Store { label "Store" table t }
  A -> Store "w"
  B -> Store "w"
  C -> Store "w"
  D -> Store "w"
}`;

  it("never lands inside a corner lane", () => {
    const parsed = Parser.parse(FAN_IN);
    const styles = resolveStyles(parsed.value.systems, [getBuiltinStyleSheet()]);
    const slice = extractView(parsed.value.systems, []);
    // A generous lane: the whole right half of every card's top band. Ports
    // must move out of it, which is what the renderer's real (narrower) zone
    // asks for too. Stated as a function of the card, because `layout` shifts
    // every coordinate at the end — a rectangle captured while it ran would
    // describe a place the finished diagram does not have.
    const laneOf = (node: LayoutNode): Rect => ({
      x: node.x + node.width / 2,
      y: node.y,
      width: node.width / 2,
      height: 24,
    });
    const res = layout(slice, {
      shapeForNode: (id) => {
        const style = styles.nodes.get(id) ?? styles.defaultNodeStyle;
        return typeof style.shape === "string" ? style.shape : style.shape.url;
      },
      chipZoneFor: laneOf,
    });

    const arrivals = endpoints(res).filter((e) => e.node.id === "Store");
    expect(arrivals).toHaveLength(4);
    for (const { node, point } of endpoints(res)) {
      expect(
        inside(laneOf(node), point),
        `${node.id} port at ${point.x},${point.y} is under the lane`,
      ).toBe(false);
    }
  });
});

describe("the multi-system root view seats ports too (#2515)", () => {
  // #2452 gave every card outline-seated endpoints, but `layoutMultipleSystems`
  // passed no port resolver, so the root view kept bbox anchors while the same
  // system's drill-down view got the outline (TPL-219: a view state that
  // behaves differently across surfaces). Two arrivals per store, because a
  // lone endpoint lands at the horizontal centre where the rim touches the
  // bbox edge anyway and so cannot tell the two apart.
  const TWO_SYSTEMS = `
system Shop {
  service Orders { label "Orders" }
  service Catalog { label "Catalog" }
  database ShopDb { label "Shop DB" table t }
  Orders -> ShopDb "persists"
  Catalog -> ShopDb "reads"
}
system Billing {
  service Invoicing { label "Invoicing" }
  service Ledger { label "Ledger" }
  database BillingDb { label "Billing DB" table t }
  Invoicing -> BillingDb "persists"
  Ledger -> BillingDb "posts"
}`;

  it("puts cylinder endpoints on the rim in the root view", () => {
    const res = layoutOf(TWO_SYSTEMS);
    // Two systems, so this is the multi-system path.
    expect(res.containers.filter((c) => !c.ghost).length).toBe(2);

    for (const dbId of ["ShopDb", "BillingDb"]) {
      const db = res.nodes.get(dbId)!;
      const arrivals = endpoints(res).filter((e) => e.node.id === dbId);
      expect(arrivals.length, `${dbId} arrivals`).toBe(2);
      const ry = Math.min(db.height * 0.12, 15);
      const cx = db.x + db.width / 2;
      for (const { point } of arrivals) {
        // Off-centre arrivals sat on the flat bbox edge before the resolver
        // reached this path; the rim dips below it away from the centre.
        expect(point.y, `${dbId} port off the bbox edge`).toBeGreaterThan(db.y + 0.25);
        // And it lands on the rim, not past it.
        const u = (point.x - cx) / (db.width / 2);
        const v = (point.y - (db.y + ry)) / ry;
        expect(u * u + v * v, `${dbId} port on the rim`).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
  });
});
