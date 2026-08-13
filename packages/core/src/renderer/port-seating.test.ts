import { describe, expect, it } from "vitest";
import { Parser } from "../parser/parser.js";
import { extractView } from "../view/view-extract.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { layout } from "./layout.js";
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
