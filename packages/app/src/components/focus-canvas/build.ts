/**
 * The focus canvas (#3022 slice B, #3031): a second canvas, opened over the
 * preview, that shows one edge or one node's neighbourhood with every label in
 * full.
 *
 * The main canvas truncates labels and leaves off the ones it cannot seat
 * (slice A). This is the tier that discloses them: only the cards in question
 * are on it, so every label fits, wrapped, beside its own line.
 *
 * Everything here is a pure function of the SVG already on screen. Cards are
 * copies of the `[data-node-id]` groups; edges come from the edge groups'
 * `data-edge-from` / `data-edge-to` / `data-edge-label` (ADR-1554). Core renders
 * nothing new, and the scope is the level the reader is looking at (TPL-1223).
 *
 * Sizes come from attributes and `estimateTextWidth`, never from `getBBox()` or
 * a canvas `measureText()`: the same input lays out the same way in every
 * runtime, and the unit tests can count collisions on what they get back.
 */

import { estimateTextWidth } from "@karasu-tools/core";

const PAD = 28;
/** Width the label text wraps at. */
const LABEL_WIDTH = 300;
const LABEL_FONT = 12;
/** Width per character for {@link estimateTextWidth}, as core measures edge labels. */
const LABEL_CHAR_WIDTH = LABEL_FONT * 0.6;
const LINE_HEIGHT = 16;
/** A lane is its label block plus this much above it and below its line. */
const LANE_PAD = 10;
/** Label block top, below the lane top. */
const LABEL_TOP = 4;
const ROW_GAP = 18;
/** Card side to the start of a label. */
const NEAR = 18;
/** Room for a lane to ease onto a card port that is not level with it. */
const EASE = 40;
/** Room for lanes to fan into the centre card's side. */
const FAN = 84;
/** Two lanes meeting the same side of a card stay at least this far apart. */
const PORT_GAP = 12;
/** A port stays this far inside a card's corner. */
const PORT_INSET = 10;
/** Radius of a spine lane's turn into the centre card. */
const TURN = 10;
/**
 * `columns` is chosen only when it fits the pane at this scale or larger.
 * Below it 12px text drops under ~10px, so the narrower `spine` is used and
 * scrolls instead.
 */
export const MIN_SCALE = 0.8;

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A card of the main canvas, ready to be placed on a focus canvas. */
interface FocusCard {
  id: string;
  /** What the card says first: its label. */
  name: string;
  /** The card's `<g>`, serialized, with the attributes that make it a node of the main canvas removed. */
  markup: string;
  /** The card's extent in the main canvas: its frame, and any text it draws below the frame. */
  box: Box;
}

export interface FocusEdge {
  from: string;
  to: string;
  /** The authored label in full, or the drawn text of a synthetic one. Empty when unlabelled. */
  label: string;
  stroke: string;
  dash: string | null;
  textFill: string;
}

export interface FocusSource {
  cards: ReadonlyMap<string, FocusCard>;
  edges: readonly FocusEdge[];
  /** The main canvas's background fill. */
  background: string | null;
}

export type Focus = { kind: "edge"; from: string; to: string } | { kind: "node"; id: string };

export type FocusLayout = "columns" | "spine";

/** One edge as drawn on a focus canvas. */
interface DrawnLane {
  from: string;
  to: string;
  /** The label block, or null for an unlabelled edge. */
  label: Box | null;
  lines: string[];
  /** The line, sampled densely enough to test what it passes through. */
  points: Point[];
}

export interface FocusDrawing {
  svg: string;
  width: number;
  height: number;
  layout: FocusLayout | null;
  cards: { id: string; box: Box }[];
  lanes: DrawnLane[];
  /** Edges into the focused node, and out of it. Both 0 for an edge focus. */
  incoming: number;
  outgoing: number;
}

// ── Reading the main canvas ──────────────────────────────────────────────────

/**
 * Strips what makes a copy answer as part of the main canvas: every `data-*`
 * attribute (the card's id and path, and its controls such as
 * `data-info-button`), and the classes the pane toggles on cards. Queries that
 * find cards or controls by attribute then find only the originals.
 */
function stripIdentity(el: Element): void {
  for (const node of [el, ...el.querySelectorAll("*")]) {
    for (const name of node.getAttributeNames()) {
      if (name.startsWith("data-")) node.removeAttribute(name);
    }
  }
  el.removeAttribute("class");
}

const num = (el: Element, name: string): number => Number(el.getAttribute(name) ?? 0);

/**
 * Reads the cards and edges of a rendered diagram. Returns an empty source for
 * markup that is not an SVG diagram.
 */
export function readFocusSource(svgMarkup: string): FocusSource {
  const empty: FocusSource = { cards: new Map(), edges: [], background: null };
  if (!svgMarkup.trimStart().startsWith("<svg")) return empty;
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const root = doc.documentElement;
  if (root.nodeName !== "svg") return empty;
  const serializer = new XMLSerializer();

  const cards = new Map<string, FocusCard>();
  for (const g of root.querySelectorAll("[data-node-id]")) {
    const id = g.getAttribute("data-node-id");
    // A bare id can name two cards on a multi-system root (#2917). Edges name
    // their ends by the same bare id, so the first card is the one they meet.
    if (!id || cards.has(id)) continue;
    const frame = g.querySelector(":scope > rect");
    if (!frame) continue;
    const x = num(frame, "x");
    const y = num(frame, "y");
    const width = num(frame, "width");
    let bottom = y + num(frame, "height");
    // A caption under the frame (a deploy unit's name) belongs to the card.
    for (const text of g.querySelectorAll(":scope > text")) {
      const ty = num(text, "y");
      if (ty > bottom) bottom = ty + 4;
    }
    const copy = g.cloneNode(true) as Element;
    stripIdentity(copy);
    cards.set(id, {
      id,
      name: g.querySelector("text")?.textContent?.trim() || id,
      markup: serializer.serializeToString(copy),
      box: { x, y, width, height: bottom - y },
    });
  }

  const edges: FocusEdge[] = [];
  for (const g of root.querySelectorAll(".krs-edge[data-edge-from][data-edge-to]")) {
    const line = g.querySelector(":scope > :is(path, line, polyline):not(.krs-edge__hitline)");
    const text = g.querySelector(":scope > text");
    const stroke = line?.getAttribute("stroke") ?? "#94A3B8";
    edges.push({
      from: g.getAttribute("data-edge-from") ?? "",
      to: g.getAttribute("data-edge-to") ?? "",
      // A synthetic label (`W`, `N domain edges`) is not on the group as an
      // attribute (ADR-1554); what the canvas drew is all there is.
      label: g.getAttribute("data-edge-label") ?? text?.textContent ?? "",
      stroke,
      dash: line?.getAttribute("stroke-dasharray") ?? null,
      textFill: text?.getAttribute("fill") ?? stroke,
    });
  }

  const background = root.querySelector(":scope > rect")?.getAttribute("fill") ?? null;
  return { cards, edges, background };
}

/** Whether `focus` can be drawn from `source`: every card it needs is there. */
export function canFocus(source: FocusSource, focus: Focus): boolean {
  if (focus.kind === "node") return source.cards.has(focus.id);
  return (
    focus.from !== focus.to &&
    source.cards.has(focus.from) &&
    source.cards.has(focus.to) &&
    source.edges.some((e) => e.from === focus.from && e.to === focus.to)
  );
}

/** The edges a node focus draws: every edge into or out of `id`, self-loops aside. */
export function edgesOf(
  source: FocusSource,
  id: string,
): { incoming: FocusEdge[]; outgoing: FocusEdge[] } {
  const usable = source.edges.filter(
    (e) => e.from !== e.to && source.cards.has(e.from) && source.cards.has(e.to),
  );
  return {
    incoming: usable.filter((e) => e.to === id),
    outgoing: usable.filter((e) => e.from === id),
  };
}

// ── Measuring ────────────────────────────────────────────────────────────────

export const labelTextWidth = (text: string): number => estimateTextWidth(text, LABEL_CHAR_WIDTH);

/**
 * Greedy word wrap at {@link LABEL_WIDTH}. A token wider than the line (a
 * path, a sentence written without spaces) is cut by code point.
 */
export function wrapLabel(text: string, width = LABEL_WIDTH): string[] {
  const lines: string[] = [];
  let line = "";
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const joined = line ? `${line} ${token}` : token;
    if (labelTextWidth(joined) <= width) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    let rest = Array.from(token);
    while (rest.length > 1 && labelTextWidth(rest.join("")) > width) {
      let n = rest.length - 1;
      while (n > 1 && labelTextWidth(rest.slice(0, n).join("")) > width) n--;
      lines.push(rest.slice(0, n).join(""));
      rest = rest.slice(n);
    }
    line = rest.join("");
  }
  if (line) lines.push(line);
  return lines;
}

interface Lane {
  edge: FocusEdge;
  lines: string[];
  height: number;
}

const laneOf = (edge: FocusEdge): Lane => {
  const lines = edge.label ? wrapLabel(edge.label) : [];
  return { edge, lines, height: lines.length * LINE_HEIGHT + LANE_PAD * 2 };
};

/** One neighbour, with every edge between it and the focused node in one direction. */
interface Row {
  id: string;
  lanes: Lane[];
  height: number;
  size: { width: number; height: number };
}

const lanesHeight = (lanes: Lane[]) => lanes.reduce((sum, l) => sum + l.height, 0);
const laneCount = (rows: Row[]) => rows.reduce((sum, r) => sum + r.lanes.length, 0);
const stackHeight = (rows: Row[]) =>
  rows.reduce((sum, r) => sum + r.height, 0) + Math.max(0, rows.length - 1) * ROW_GAP;
const columnWidth = (rows: Row[]) => Math.max(0, ...rows.map((r) => r.size.width));

function rowsOf(
  source: FocusSource,
  edges: FocusEdge[],
  neighbour: (e: FocusEdge) => string,
): Row[] {
  const rows = new Map<string, Row>();
  for (const edge of edges) {
    const id = neighbour(edge);
    const box = source.cards.get(id)!.box;
    const row = rows.get(id) ?? {
      id,
      lanes: [],
      height: 0,
      size: { width: box.width, height: box.height },
    };
    row.lanes.push(laneOf(edge));
    rows.set(id, row);
  }
  for (const row of rows.values()) row.height = Math.max(row.size.height, lanesHeight(row.lanes));
  return [...rows.values()];
}

/** The top of each lane and the y of its line, for lanes stacked from `top`. */
function stackLanes(lanes: Lane[], top: number): { top: number; y: number }[] {
  let t = top;
  return lanes.map((lane) => {
    const placed = { top: t, y: t + lane.height - LANE_PAD };
    t += lane.height;
    return placed;
  });
}

/** `n` points spread evenly along a side that starts at `start`. */
const spread = (start: number, length: number, n: number): number[] =>
  Array.from({ length: n }, (_, i) => start + ((i + 1) * length) / (n + 1));

/**
 * Where lanes stacked top to bottom meet a card's side. A lane level with the
 * card leaves it straight; one that is not takes the nearest point on the
 * side, kept {@link PORT_GAP} from its neighbours.
 */
function cardPorts(cardY: number, cardHeight: number, lineYs: number[]): number[] {
  const lo = cardY + PORT_INSET;
  const hi = cardY + cardHeight - PORT_INSET;
  if ((lineYs.length - 1) * PORT_GAP > hi - lo) return spread(cardY, cardHeight, lineYs.length);
  const ports = lineYs.map((y) => Math.min(hi, Math.max(lo, y)));
  for (let i = 1; i < ports.length; i++) ports[i] = Math.max(ports[i], ports[i - 1] + PORT_GAP);
  for (let i = ports.length - 1; i >= 0; i--) {
    ports[i] = Math.min(ports[i], i === ports.length - 1 ? hi : ports[i + 1] - PORT_GAP);
  }
  return ports;
}

// ── Paths ────────────────────────────────────────────────────────────────────

type Segment =
  | { kind: "L"; to: Point }
  | { kind: "C"; c1: Point; c2: Point; to: Point }
  | { kind: "Q"; c: Point; to: Point };

/** A path: its `d`, and the line sampled for collision tests. */
function path(start: Point, segments: Segment[]): { d: string; points: Point[] } {
  const f = (n: number) => Math.round(n * 100) / 100;
  const p = (pt: Point) => `${f(pt.x)} ${f(pt.y)}`;
  let d = `M ${p(start)}`;
  const points: Point[] = [start];
  let at = start;
  for (const s of segments) {
    const steps = 12;
    if (s.kind === "L") {
      d += ` L ${p(s.to)}`;
      const length = Math.hypot(s.to.x - at.x, s.to.y - at.y);
      const n = Math.max(1, Math.ceil(length / 3));
      for (let i = 1; i <= n; i++) {
        points.push({ x: at.x + ((s.to.x - at.x) * i) / n, y: at.y + ((s.to.y - at.y) * i) / n });
      }
    } else if (s.kind === "C") {
      d += ` C ${p(s.c1)} ${p(s.c2)} ${p(s.to)}`;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        const k = (a: number, b: number, c: number, e: number) =>
          u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * e;
        points.push({ x: k(at.x, s.c1.x, s.c2.x, s.to.x), y: k(at.y, s.c1.y, s.c2.y, s.to.y) });
      }
    } else {
      d += ` Q ${p(s.c)} ${p(s.to)}`;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        const k = (a: number, b: number, e: number) => u * u * a + 2 * u * t * b + t * t * e;
        points.push({ x: k(at.x, s.c.x, s.to.x), y: k(at.y, s.c.y, s.to.y) });
      }
    }
    at = s.to;
  }
  return { d, points };
}

/** A lane that runs level from `x0` to `x1` at `y`, easing from and to card ports. */
function levelLane(
  start: Point,
  enter: { x: number; ease: number },
  y: number,
  leave: { x: number; ease: number },
  end: Point,
): { d: string; points: Point[] } {
  const towards = Math.sign(end.x - start.x) || 1;
  const h0 = enter.x;
  const h1 = leave.x;
  return path(start, [
    {
      kind: "C",
      c1: { x: start.x + towards * enter.ease, y: start.y },
      c2: { x: h0 - towards * enter.ease, y },
      to: { x: h0, y },
    },
    { kind: "L", to: { x: h1, y } },
    {
      kind: "C",
      c1: { x: h1 + towards * leave.ease, y },
      c2: { x: end.x - towards * leave.ease, y: end.y },
      to: end,
    },
  ]);
}

// ── Drawing ──────────────────────────────────────────────────────────────────

const escapeXml = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

class Canvas {
  readonly parts: string[] = [];
  readonly cards: { id: string; box: Box }[] = [];
  readonly lanes: DrawnLane[] = [];
  private readonly markers = new Map<string, string>();

  constructor(
    private readonly source: FocusSource,
    private readonly idPrefix: string,
  ) {}

  card(id: string, x: number, y: number): void {
    const card = this.source.cards.get(id)!;
    const box = { x, y, width: card.box.width, height: card.box.height };
    this.cards.push({ id, box });
    this.parts.push(
      `<g class="focus-canvas__card" data-focus-node="${escapeXml(id)}" transform="translate(${x - card.box.x} ${y - card.box.y})">${card.markup}</g>`,
    );
  }

  lane(lane: Lane, line: { d: string; points: Point[] }, labelX: number, top: number): void {
    const { edge, lines } = lane;
    const marker = this.marker(edge.stroke);
    const dash = edge.dash ? ` stroke-dasharray="${escapeXml(edge.dash)}"` : "";
    let text = "";
    let label: Box | null = null;
    if (lines.length > 0) {
      const blockTop = top + LABEL_TOP;
      label = {
        x: labelX,
        y: blockTop,
        width: Math.max(...lines.map(labelTextWidth)),
        height: lines.length * LINE_HEIGHT,
      };
      const spans = lines
        .map(
          (l, i) =>
            `<tspan x="${labelX}" y="${blockTop + (i + 1) * LINE_HEIGHT - 4}">${escapeXml(l)}</tspan>`,
        )
        .join("");
      text = `<text class="focus-canvas__label" fill="${escapeXml(edge.textFill)}" font-size="${LABEL_FONT}px" font-family="sans-serif">${spans}</text>`;
    }
    this.lanes.push({ from: edge.from, to: edge.to, label, lines, points: line.points });
    this.parts.push(
      `<g class="focus-canvas__lane" data-focus-from="${escapeXml(edge.from)}" data-focus-to="${escapeXml(edge.to)}">` +
        `<path d="${line.d}" fill="none" stroke="${escapeXml(edge.stroke)}" stroke-width="1.5"${dash} marker-end="url(#${marker})"/>` +
        `${text}</g>`,
    );
  }

  /** One arrowhead per line colour. */
  private marker(stroke: string): string {
    let id = this.markers.get(stroke);
    if (!id) {
      id = `${this.idPrefix}arrow-${this.markers.size}`;
      this.markers.set(stroke, id);
    }
    return id;
  }

  finish(
    width: number,
    height: number,
    layout: FocusLayout | null,
    incoming: number,
    outgoing: number,
  ): FocusDrawing {
    const defs = [...this.markers]
      .map(
        ([stroke, id]) =>
          `<marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${escapeXml(stroke)}"/></marker>`,
      )
      .join("");
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    const background = this.source.background ?? "transparent";
    const svg =
      // Shrinks to the panel down to MIN_SCALE, then the panel scrolls.
      `<svg xmlns="http://www.w3.org/2000/svg" class="focus-canvas__svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="min-width:${Math.round(w * MIN_SCALE)}px">` +
      `<defs>${defs}</defs><rect width="${w}" height="${h}" fill="${escapeXml(background)}"/>` +
      this.parts.join("") +
      `</svg>`;
    return {
      svg,
      width: w,
      height: h,
      layout,
      cards: this.cards,
      lanes: this.lanes,
      incoming,
      outgoing,
    };
  }
}

/** Two cards side by side, and every edge between them on a lane of its own. */
function drawEdge(source: FocusSource, from: string, to: string, idPrefix: string): FocusDrawing {
  const between = source.edges.filter(
    (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from),
  );
  // The clicked direction first.
  between.sort((a, b) => Number(b.from === from) - Number(a.from === from));
  const lanes = between.map(laneOf);
  const a = source.cards.get(from)!.box;
  const b = source.cards.get(to)!.box;
  const zone = EASE * 2 + LABEL_WIDTH;
  const height = Math.max(a.height, b.height, lanesHeight(lanes)) + PAD * 2;
  const canvas = new Canvas(source, idPrefix);

  const ay = (height - a.height) / 2;
  const by = (height - b.height) / 2;
  const x0 = PAD + a.width;
  const x1 = x0 + zone;
  const placed = stackLanes(lanes, (height - lanesHeight(lanes)) / 2);
  const ys = placed.map((p) => p.y);
  const aPorts = cardPorts(ay, a.height, ys);
  const bPorts = cardPorts(by, b.height, ys);
  lanes.forEach((lane, i) => {
    const forward = lane.edge.from === from;
    const left = { x: x0, y: aPorts[i] };
    const right = { x: x1, y: bPorts[i] };
    const line = forward
      ? levelLane(
          left,
          { x: x0 + EASE, ease: EASE / 2 },
          ys[i],
          { x: x1 - EASE, ease: EASE / 2 },
          right,
        )
      : levelLane(
          right,
          { x: x1 - EASE, ease: EASE / 2 },
          ys[i],
          { x: x0 + EASE, ease: EASE / 2 },
          left,
        );
    canvas.lane(lane, line, x0 + EASE, placed[i].top);
  });
  canvas.card(from, PAD, ay);
  canvas.card(to, x1, by);
  return canvas.finish(PAD * 2 + a.width + zone + b.width, height, null, 0, 0);
}

const ZONE = NEAR + LABEL_WIDTH + FAN;

/** The width of the `columns` layout for these rows. */
function columnsWidth(centre: Box, ins: Row[], outs: Row[]): number {
  return (
    PAD * 2 +
    centre.width +
    (ins.length > 0 ? columnWidth(ins) + ZONE : 0) +
    (outs.length > 0 ? columnWidth(outs) + ZONE : 0)
  );
}

/**
 * One side of `columns`: neighbours stacked in a column against the label
 * zone, each lane running level under its label and then fanning into the
 * centre card's side.
 */
function drawColumn(
  canvas: Canvas,
  rows: Row[],
  side: "in" | "out",
  columnX: number,
  top: number,
  centre: Box,
): void {
  const width = columnWidth(rows);
  const centrePorts = spread(centre.y, centre.height, laneCount(rows));
  let port = 0;
  let y = top;
  for (const row of rows) {
    const x = side === "in" ? columnX + width - row.size.width : columnX;
    const cardY = y + (row.height - row.size.height) / 2;
    const placed = stackLanes(row.lanes, y + (row.height - lanesHeight(row.lanes)) / 2);
    const own = cardPorts(
      cardY,
      row.size.height,
      placed.map((p) => p.y),
    );
    row.lanes.forEach((lane, i) => {
      const ly = placed[i].y;
      const p = centrePorts[port++];
      if (side === "in") {
        const x0 = x + row.size.width;
        const fanFrom = centre.x - FAN;
        const line = levelLane(
          { x: x0, y: own[i] },
          { x: x0 + NEAR, ease: NEAR / 2 },
          ly,
          { x: fanFrom, ease: FAN / 2 },
          { x: centre.x, y: p },
        );
        canvas.lane(lane, line, x0 + NEAR, placed[i].top);
      } else {
        const x0 = centre.x + centre.width;
        const line = levelLane(
          { x: x0, y: p },
          { x: x0 + FAN, ease: FAN / 2 },
          ly,
          { x: x - NEAR, ease: NEAR / 2 },
          { x, y: own[i] },
        );
        canvas.lane(lane, line, x0 + FAN, placed[i].top);
      }
    });
    canvas.card(row.id, x, cardY);
    y += row.height + ROW_GAP;
  }
}

/** Dependents on the left, the node in the middle, dependencies on the right. */
function drawColumns(
  source: FocusSource,
  id: string,
  ins: Row[],
  outs: Row[],
  idPrefix: string,
): FocusDrawing {
  const c = source.cards.get(id)!.box;
  const height = Math.max(stackHeight(ins), stackHeight(outs), c.height) + PAD * 2;
  const canvas = new Canvas(source, idPrefix);
  const inWidth = ins.length > 0 ? columnWidth(ins) + ZONE : 0;
  const centre: Box = {
    x: PAD + inWidth,
    y: (height - c.height) / 2,
    width: c.width,
    height: c.height,
  };
  drawColumn(canvas, ins, "in", PAD, (height - stackHeight(ins)) / 2, centre);
  drawColumn(
    canvas,
    outs,
    "out",
    centre.x + c.width + ZONE,
    (height - stackHeight(outs)) / 2,
    centre,
  );
  canvas.card(id, centre.x, centre.y);
  return canvas.finish(
    columnsWidth(c, ins, outs),
    height,
    "columns",
    laneCount(ins),
    laneCount(outs),
  );
}

/**
 * Every neighbour in one column, the node beside it: dependents above, their
 * lanes turning down into the node's top; dependencies below, leaving from its
 * bottom. About half the width of `columns`; it grows downward instead.
 */
function drawSpine(
  source: FocusSource,
  id: string,
  ins: Row[],
  outs: Row[],
  idPrefix: string,
): FocusDrawing {
  const c = source.cards.get(id)!.box;
  const width = columnWidth([...ins, ...outs]);
  const centreX = PAD + width + NEAR + LABEL_WIDTH + NEAR;
  const centreY = PAD + stackHeight(ins) + (ins.length > 0 ? ROW_GAP * 2 : 0);
  const outTop = centreY + c.height + (outs.length > 0 ? ROW_GAP * 2 : 0);
  const canvas = new Canvas(source, idPrefix);

  const block = (rows: Row[], top: number, side: "in" | "out") => {
    // Nest the turns so no two lanes cross: the row furthest from the node
    // turns at the far side of its edge of the card.
    const turns = spread(centreX, c.width, laneCount(rows));
    if (side === "in") turns.reverse();
    let port = 0;
    let y = top;
    for (const row of rows) {
      const x = PAD + width - row.size.width;
      const cardY = y + (row.height - row.size.height) / 2;
      const placed = stackLanes(row.lanes, y + (row.height - lanesHeight(row.lanes)) / 2);
      const own = cardPorts(
        cardY,
        row.size.height,
        placed.map((p) => p.y),
      );
      row.lanes.forEach((lane, i) => {
        const ly = placed[i].y;
        const px = turns[port++];
        const x0 = x + row.size.width;
        const h0 = x0 + NEAR;
        const easeIn = {
          kind: "C" as const,
          c1: { x: x0 + NEAR / 2, y: own[i] },
          c2: { x: h0 - NEAR / 2, y: ly },
          to: { x: h0, y: ly },
        };
        const line =
          side === "in"
            ? path({ x: x0, y: own[i] }, [
                easeIn,
                { kind: "L", to: { x: px - TURN, y: ly } },
                { kind: "Q", c: { x: px, y: ly }, to: { x: px, y: ly + TURN } },
                { kind: "L", to: { x: px, y: centreY } },
              ])
            : path({ x: px, y: centreY + c.height }, [
                { kind: "L", to: { x: px, y: ly - TURN } },
                { kind: "Q", c: { x: px, y: ly }, to: { x: px - TURN, y: ly } },
                { kind: "L", to: { x: h0, y: ly } },
                {
                  kind: "C",
                  c1: { x: h0 - NEAR / 2, y: ly },
                  c2: { x: x0 + NEAR / 2, y: own[i] },
                  to: { x: x0, y: own[i] },
                },
              ]);
        canvas.lane(lane, line, h0, placed[i].top);
      });
      canvas.card(row.id, x, cardY);
      y += row.height + ROW_GAP;
    }
  };
  block(ins, PAD, "in");
  block(outs, outTop, "out");
  canvas.card(id, centreX, centreY);
  const height = outTop + stackHeight(outs) + PAD;
  return canvas.finish(centreX + c.width + PAD, height, "spine", laneCount(ins), laneCount(outs));
}

function nodeRows(source: FocusSource, id: string): { ins: Row[]; outs: Row[] } {
  const { incoming, outgoing } = edgesOf(source, id);
  return {
    ins: rowsOf(source, incoming, (e) => e.from),
    outs: rowsOf(source, outgoing, (e) => e.to),
  };
}

/**
 * The layout for a node focus in a pane `availableWidth` wide: `columns` when
 * it fits at {@link MIN_SCALE} or larger, otherwise `spine`.
 */
export function chooseLayout(source: FocusSource, id: string, availableWidth: number): FocusLayout {
  const { ins, outs } = nodeRows(source, id);
  const width = columnsWidth(source.cards.get(id)!.box, ins, outs);
  return availableWidth >= width * MIN_SCALE ? "columns" : "spine";
}

/**
 * Draws `focus` from `source`. The caller checks {@link canFocus} first.
 * `idPrefix` keeps the arrowhead ids of two drawings in one document apart.
 */
export function buildFocusCanvas(
  source: FocusSource,
  focus: Focus,
  layout: FocusLayout = "columns",
  idPrefix = "focus-canvas-",
): FocusDrawing {
  if (focus.kind === "edge") return drawEdge(source, focus.from, focus.to, idPrefix);
  const { ins, outs } = nodeRows(source, focus.id);
  return (layout === "columns" ? drawColumns : drawSpine)(source, focus.id, ins, outs, idPrefix);
}
