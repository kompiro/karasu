/**
 * Focus canvas (#3022, spike): a second canvas, opened over the preview, that
 * shows one edge or one node's neighbourhood with nothing left out.
 *
 * The main canvas truncates labels and withholds the ones it cannot seat. This
 * is the tier that discloses them: it has only the cards in question on it, so
 * it has room to draw every label in full, wrapped, next to its own line.
 *
 * - **Edge.** Clicking an edge opens its two cards side by side, with every
 *   edge between that pair (both directions) on a lane of its own.
 * - **Node.** The pill that appears on a hovered card opens that node with the
 *   nodes its edges connect to: the ones that depend on it on one side, the
 *   ones it depends on on the other, one lane per edge.
 *
 * Everything is read from the SVG already on screen: the cards are clones of
 * the `[data-node-id]` groups, and the edges come from `data-edge-from` /
 * `data-edge-to` / `data-edge-label` (ADR-1554). Core is not asked to render
 * anything, and the scope is the level the reader is looking at.
 *
 * Plain DOM, like `edge-disclosure.ts`, so the spike report can attach the
 * same behaviour to a diagram outside the app.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

const PAD = 28;
const LABEL_WIDTH = 300;
const LABEL_FONT = 12;
const LINE_HEIGHT = 16;
/** Label block to its own line, and lane to lane. */
const LANE_PAD = 10;
const ROW_GAP = 18;
/** Card edge to the start of the label. */
const NEAR = 18;
/** Room for a lane to ease onto a card port that is not level with it. */
const EASE = 40;
/** Two lanes meeting the same side of a card stay at least this far apart. */
const PORT_GAP = 12;
/** Room for the lanes to fan into the centre card's side. */
const FAN = 84;
/** Below this the text is too small to read, so the panel scrolls instead. */
const MIN_SCALE = 0.8;
const CLICK_THRESHOLD = 4;

export type FocusLayout = "columns" | "spine";

export interface FocusCanvasOptions {
  /**
   * `columns`: dependents on the left, the node in the middle, dependencies on
   * the right. `spine`: every neighbour in one column, the node beside it.
   * Default: `columns` when the container is wide enough to show it at
   * `MIN_SCALE`, otherwise `spine`.
   */
  layout?: FocusLayout;
}

interface Edge {
  from: string;
  to: string;
  label: string;
  stroke: string;
  dash: string | null;
  textFill: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Size {
  w: number;
  h: number;
}

type Focus = { kind: "edge"; from: string; to: string } | { kind: "node"; id: string };

interface Lane {
  edge: Edge;
  lines: string[];
  /** Height of the lane: its label block, the line under it, and padding. */
  h: number;
}

/** One neighbour, with every edge between it and the focused node in one direction. */
interface Row {
  id: string;
  lanes: Lane[];
  h: number;
  size: Size;
}

interface Frame {
  root: SVGSVGElement;
  markerFor: (stroke: string) => string;
}

function el<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Greedy word wrap. A token wider than the line (a path, unspaced Japanese) is cut by character. */
function wrap(text: string, width: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const joined = line ? `${line} ${token}` : token;
    if (measure(joined) <= width) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    let rest = token;
    while (measure(rest) > width) {
      let n = rest.length - 1;
      while (n > 1 && measure(rest.slice(0, n)) > width) n--;
      lines.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

/** `n` points spread evenly along a side that starts at `start`. */
const spread = (start: number, length: number, n: number): number[] =>
  Array.from({ length: n }, (_, i) => start + ((i + 1) * length) / (n + 1));

/**
 * Where lanes meet a card's side, for lanes stacked top to bottom. A lane that
 * is level with the card leaves it straight; one that is not takes the nearest
 * point on the side, kept `PORT_GAP` from its neighbours.
 */
function cardPorts(cardY: number, cardH: number, lineYs: number[]): number[] {
  const lo = cardY + 10;
  const hi = cardY + cardH - 10;
  if ((lineYs.length - 1) * PORT_GAP > hi - lo) return spread(cardY, cardH, lineYs.length);
  const ports = lineYs.map((y) => Math.min(hi, Math.max(lo, y)));
  for (let i = 1; i < ports.length; i++) ports[i] = Math.max(ports[i], ports[i - 1] + PORT_GAP);
  for (let i = ports.length - 1; i >= 0; i--) {
    ports[i] = Math.min(ports[i], i === ports.length - 1 ? hi : ports[i + 1] - PORT_GAP);
  }
  return ports;
}

const lanesHeight = (lanes: Lane[]) => lanes.reduce((sum, l) => sum + l.h, 0);
const laneCount = (rows: Row[]) => rows.reduce((sum, r) => sum + r.lanes.length, 0);
const stackHeight = (rows: Row[]) =>
  rows.reduce((sum, r) => sum + r.h, 0) + Math.max(0, rows.length - 1) * ROW_GAP;
const columnWidth = (rows: Row[]) => Math.max(0, ...rows.map((r) => r.size.w));

/** The top of each lane and the y of its line, for lanes stacked from `top`. */
function stackLanes(lanes: Lane[], top: number): { top: number; y: number }[] {
  let t = top;
  return lanes.map((lane) => {
    const placed = { top: t, y: t + lane.h - LANE_PAD };
    t += lane.h;
    return placed;
  });
}

const ZONE = NEAR + LABEL_WIDTH + FAN;

function columnsWidth(centre: Size, ins: Row[], outs: Row[]): number {
  return (
    PAD * 2 +
    centre.w +
    (ins.length > 0 ? columnWidth(ins) + ZONE : 0) +
    (outs.length > 0 ? columnWidth(outs) + ZONE : 0)
  );
}

export function attachFocusCanvas(
  container: HTMLElement,
  options: FocusCanvasOptions = {},
): () => void {
  const doc = container.ownerDocument;
  const ctx = doc.createElement("canvas").getContext("2d");
  if (ctx) ctx.font = `${LABEL_FONT}px sans-serif`;
  const measure = (s: string) => (ctx ? ctx.measureText(s).width : s.length * LABEL_FONT * 0.55);

  const mainSvg = (): SVGSVGElement | null =>
    container.querySelector<SVGSVGElement>("svg:not(.focus-canvas__svg)");
  const cardOf = (svg: SVGSVGElement, id: string): SVGGraphicsElement | null =>
    svg.querySelector<SVGGraphicsElement>(`[data-node-id="${CSS.escape(id)}"]`);
  const nameOf = (svg: SVGSVGElement, id: string): string =>
    cardOf(svg, id)?.querySelector("text")?.textContent ?? id;
  const sizeOf = (svg: SVGSVGElement, id: string): Size => {
    const box = cardOf(svg, id)?.getBBox();
    return box ? { w: box.width, h: box.height } : { w: 0, h: 0 };
  };

  function readEdges(svg: SVGSVGElement): Edge[] {
    return [...svg.querySelectorAll(".krs-edge[data-edge-from][data-edge-to]")].map((g) => {
      const line = g.querySelector(":scope > :is(path, line, polyline):not(.krs-edge__hitline)");
      const text = g.querySelector(":scope > text");
      const stroke = line?.getAttribute("stroke") ?? "#94A3B8";
      return {
        from: g.getAttribute("data-edge-from") ?? "",
        to: g.getAttribute("data-edge-to") ?? "",
        // A synthetic label (`W`, `N domain edges`) is not on the group as an
        // attribute; what the canvas drew is all there is.
        label: g.getAttribute("data-edge-label") ?? text?.textContent ?? "",
        stroke,
        dash: line?.getAttribute("stroke-dasharray") ?? null,
        textFill: text?.getAttribute("fill") ?? stroke,
      };
    });
  }

  const laneOf = (edge: Edge): Lane => {
    const lines = edge.label ? wrap(edge.label, LABEL_WIDTH, measure) : [];
    return { edge, lines, h: lines.length * LINE_HEIGHT + LANE_PAD * 2 };
  };

  function rowsOf(svg: SVGSVGElement, edges: Edge[], neighbour: (e: Edge) => string): Row[] {
    const rows = new Map<string, Row>();
    for (const edge of edges) {
      const id = neighbour(edge);
      const row = rows.get(id) ?? { id, lanes: [], h: 0, size: sizeOf(svg, id) };
      row.lanes.push(laneOf(edge));
      rows.set(id, row);
    }
    for (const row of rows.values()) row.h = Math.max(row.size.h, lanesHeight(row.lanes));
    return [...rows.values()];
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  let nextId = 0;

  function frame(svg: SVGSVGElement, width: number, height: number): Frame {
    const root = el(doc, "svg", {
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      class: "focus-canvas__svg",
    });
    root.style.minWidth = `${Math.round(width * MIN_SCALE)}px`;
    const defs = el(doc, "defs");
    // Whatever the cards reference (icons, gradients).
    for (const d of svg.querySelectorAll(":scope > defs > *")) defs.appendChild(d.cloneNode(true));
    root.appendChild(defs);
    const background = svg.querySelector(":scope > rect")?.getAttribute("fill");
    root.appendChild(el(doc, "rect", { width, height, fill: background ?? "transparent" }));
    // One arrowhead per line colour.
    const markers = new Map<string, string>();
    const markerFor = (stroke: string): string => {
      let id = markers.get(stroke);
      if (!id) {
        id = `focus-canvas-arrow-${nextId++}`;
        markers.set(stroke, id);
        const marker = el(doc, "marker", {
          id,
          viewBox: "0 0 10 10",
          refX: 10,
          refY: 5,
          markerWidth: 8,
          markerHeight: 8,
          orient: "auto-start-reverse",
        });
        marker.appendChild(el(doc, "path", { d: "M 0 0 L 10 5 L 0 10 z", fill: stroke }));
        defs.appendChild(marker);
      }
      return id;
    };
    return { root, markerFor };
  }

  /** A card of the main canvas, cloned and moved to `(x, y)`. */
  function placeCard(svg: SVGSVGElement, out: SVGElement, id: string, x: number, y: number): void {
    const card = cardOf(svg, id);
    if (!card) return;
    const box = card.getBBox();
    const g = el(doc, "g", {
      transform: `translate(${x - box.x} ${y - box.y})`,
      class: "focus-canvas__card",
      "data-focus-node": id,
    });
    const clone = card.cloneNode(true) as Element;
    // The clone is a picture of the card, not a second node of the diagram.
    for (const name of ["data-node-id", "data-node-path", "data-has-children"]) {
      clone.removeAttribute(name);
    }
    g.appendChild(clone);
    out.appendChild(g);
  }

  /** One edge: its line, and its label in full above the level part of the line. */
  function drawLane(f: Frame, lane: Lane, d: string, labelX: number, top: number): void {
    const { edge } = lane;
    const g = el(doc, "g", {
      class: "focus-canvas__lane",
      "data-focus-from": edge.from,
      "data-focus-to": edge.to,
    });
    const path = el(doc, "path", {
      d,
      fill: "none",
      stroke: edge.stroke,
      "stroke-width": 1.5,
      "marker-end": `url(#${f.markerFor(edge.stroke)})`,
    });
    if (edge.dash) path.setAttribute("stroke-dasharray", edge.dash);
    g.appendChild(path);
    const text = el(doc, "text", {
      x: labelX,
      y: top + LANE_PAD - 4,
      fill: edge.textFill,
      "font-size": `${LABEL_FONT}px`,
      "font-family": "sans-serif",
      class: "focus-canvas__label",
    });
    lane.lines.forEach((line, i) => {
      const span = el(doc, "tspan", { x: labelX, dy: i === 0 ? LINE_HEIGHT - 4 : LINE_HEIGHT });
      span.textContent = line;
      text.appendChild(span);
    });
    g.appendChild(text);
    f.root.appendChild(g);
  }

  /** Two cards, and every edge between them on a lane of its own. */
  function drawEdge(svg: SVGSVGElement, edges: Edge[], from: string, to: string): SVGSVGElement {
    const between = edges.filter(
      (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from),
    );
    // The clicked direction first.
    between.sort((a, b) => Number(b.from === from) - Number(a.from === from));
    const lanes = between.map(laneOf);
    const a = sizeOf(svg, from);
    const b = sizeOf(svg, to);
    const height = Math.max(a.h, b.h, lanesHeight(lanes)) + PAD * 2;
    const zone = EASE * 2 + LABEL_WIDTH;
    const f = frame(svg, PAD * 2 + a.w + zone + b.w, height);

    const ay = (height - a.h) / 2;
    const by = (height - b.h) / 2;
    const x0 = PAD + a.w;
    const x1 = x0 + zone;
    const h0 = x0 + EASE;
    const h1 = x1 - EASE;
    const placed = stackLanes(lanes, (height - lanesHeight(lanes)) / 2);
    const ys = placed.map((p) => p.y);
    const aPorts = cardPorts(ay, a.h, ys);
    const bPorts = cardPorts(by, b.h, ys);
    lanes.forEach((lane, i) => {
      const y = ys[i];
      const pa = aPorts[i];
      const pb = bPorts[i];
      const d =
        lane.edge.from === from
          ? `M ${x0} ${pa} C ${h0} ${pa} ${x0} ${y} ${h0} ${y} L ${h1} ${y} C ${x1} ${y} ${h1} ${pb} ${x1} ${pb}`
          : `M ${x1} ${pb} C ${h1} ${pb} ${x1} ${y} ${h1} ${y} L ${h0} ${y} C ${x0} ${y} ${h0} ${pa} ${x0} ${pa}`;
      drawLane(f, lane, d, h0, placed[i].top);
    });
    placeCard(svg, f.root, from, PAD, ay);
    placeCard(svg, f.root, to, x1, by);
    return f.root;
  }

  /**
   * One side of the `columns` layout: neighbours stacked in a column, each lane
   * running level across the label zone and then fanning into the node's side.
   */
  function drawColumn(
    svg: SVGSVGElement,
    f: Frame,
    rows: Row[],
    side: "in" | "out",
    columnX: number,
    top: number,
    centre: Box,
  ): void {
    const width = columnWidth(rows);
    const centrePorts = spread(centre.y, centre.h, laneCount(rows));
    let port = 0;
    let y = top;
    for (const row of rows) {
      // Cards sit against the label zone: right-aligned on the left, left-aligned on the right.
      const x = side === "in" ? columnX + width - row.size.w : columnX;
      const cardY = y + (row.h - row.size.h) / 2;
      const placed = stackLanes(row.lanes, y + (row.h - lanesHeight(row.lanes)) / 2);
      const ownPorts = cardPorts(
        cardY,
        row.size.h,
        placed.map((p) => p.y),
      );
      row.lanes.forEach((lane, i) => {
        const ly = placed[i].y;
        const own = ownPorts[i];
        const p = centrePorts[port++];
        if (side === "in") {
          const x0 = x + row.size.w;
          const h0 = x0 + NEAR;
          const h1 = centre.x - FAN;
          const mid = (h1 + centre.x) / 2;
          drawLane(
            f,
            lane,
            `M ${x0} ${own} C ${h0} ${own} ${x0} ${ly} ${h0} ${ly} L ${h1} ${ly} C ${mid} ${ly} ${mid} ${p} ${centre.x} ${p}`,
            h0,
            placed[i].top,
          );
        } else {
          const x0 = centre.x + centre.w;
          const h0 = x0 + FAN;
          const h1 = x - NEAR;
          const mid = (x0 + h0) / 2;
          drawLane(
            f,
            lane,
            `M ${x0} ${p} C ${mid} ${p} ${mid} ${ly} ${h0} ${ly} L ${h1} ${ly} C ${x} ${ly} ${h1} ${own} ${x} ${own}`,
            h0,
            placed[i].top,
          );
        }
      });
      placeCard(svg, f.root, row.id, x, cardY);
      y += row.h + ROW_GAP;
    }
  }

  /** Dependents on the left, the node in the middle, dependencies on the right. */
  function drawColumns(svg: SVGSVGElement, id: string, ins: Row[], outs: Row[]): SVGSVGElement {
    const c = sizeOf(svg, id);
    const height = Math.max(stackHeight(ins), stackHeight(outs), c.h) + PAD * 2;
    const f = frame(svg, columnsWidth(c, ins, outs), height);
    const inWidth = ins.length > 0 ? columnWidth(ins) + ZONE : 0;
    const centre: Box = { x: PAD + inWidth, y: (height - c.h) / 2, w: c.w, h: c.h };
    drawColumn(svg, f, ins, "in", PAD, (height - stackHeight(ins)) / 2, centre);
    drawColumn(
      svg,
      f,
      outs,
      "out",
      centre.x + c.w + ZONE,
      (height - stackHeight(outs)) / 2,
      centre,
    );
    placeCard(svg, f.root, id, centre.x, centre.y);
    return f.root;
  }

  /**
   * Every neighbour in one column, the node beside it: dependents above, their
   * lanes turning down into the node's top; dependencies below, leaving from
   * its bottom. Roughly half the width of `columns`, and it grows downward,
   * which a panel scrolls naturally.
   */
  function drawSpine(svg: SVGSVGElement, id: string, ins: Row[], outs: Row[]): SVGSVGElement {
    const c = sizeOf(svg, id);
    const width = columnWidth([...ins, ...outs]);
    const centreX = PAD + width + NEAR + LABEL_WIDTH + NEAR;
    const centreY = PAD + stackHeight(ins) + (ins.length > 0 ? ROW_GAP * 2 : 0);
    const outTop = centreY + c.h + (outs.length > 0 ? ROW_GAP * 2 : 0);
    const f = frame(svg, centreX + c.w + PAD, outTop + stackHeight(outs) + PAD);
    const TURN = 10;

    const block = (rows: Row[], top: number, side: "in" | "out") => {
      // Nest the turns so no two lanes cross: the row furthest from the node
      // turns at the far side of the card.
      const turns = spread(centreX, c.w, laneCount(rows));
      if (side === "in") turns.reverse();
      let port = 0;
      let y = top;
      for (const row of rows) {
        const x = PAD + width - row.size.w;
        const cardY = y + (row.h - row.size.h) / 2;
        const placed = stackLanes(row.lanes, y + (row.h - lanesHeight(row.lanes)) / 2);
        const ownPorts = cardPorts(
          cardY,
          row.size.h,
          placed.map((p) => p.y),
        );
        row.lanes.forEach((lane, i) => {
          const ly = placed[i].y;
          const own = ownPorts[i];
          const px = turns[port++];
          const x0 = x + row.size.w;
          const h0 = x0 + NEAR;
          const d =
            side === "in"
              ? `M ${x0} ${own} C ${h0} ${own} ${x0} ${ly} ${h0} ${ly} L ${px - TURN} ${ly} Q ${px} ${ly} ${px} ${ly + TURN} L ${px} ${centreY}`
              : `M ${px} ${centreY + c.h} L ${px} ${ly - TURN} Q ${px} ${ly} ${px - TURN} ${ly} L ${h0} ${ly} C ${x0} ${ly} ${h0} ${own} ${x0} ${own}`;
          drawLane(f, lane, d, h0, placed[i].top);
        });
        placeCard(svg, f.root, row.id, x, cardY);
        y += row.h + ROW_GAP;
      }
    };
    block(ins, PAD, "in");
    block(outs, outTop, "out");
    placeCard(svg, f.root, id, centreX, centreY);
    return f.root;
  }

  // ── The panel ──────────────────────────────────────────────────────────────

  const overlay = doc.createElement("div");
  overlay.className = "focus-canvas";
  overlay.hidden = true;
  overlay.innerHTML =
    `<div class="focus-canvas__panel" role="dialog">` +
    `<div class="focus-canvas__bar">` +
    `<button type="button" class="focus-canvas__back">← Back</button>` +
    `<span class="focus-canvas__title"></span><span class="focus-canvas__count"></span>` +
    `<button type="button" class="focus-canvas__close">✕ Close</button>` +
    `</div><div class="focus-canvas__body"></div></div>`;
  container.appendChild(overlay);
  const panel = overlay.querySelector<HTMLElement>(".focus-canvas__panel")!;
  const body = overlay.querySelector<HTMLElement>(".focus-canvas__body")!;
  const title = overlay.querySelector<HTMLElement>(".focus-canvas__title")!;
  const count = overlay.querySelector<HTMLElement>(".focus-canvas__count")!;
  const back = overlay.querySelector<HTMLButtonElement>(".focus-canvas__back")!;

  const pill = doc.createElement("button");
  pill.type = "button";
  pill.className = "focus-canvas__pill";
  pill.hidden = true;
  container.appendChild(pill);
  let pillNode: string | null = null;

  /** What the panel has shown, so `Back` can return to it. */
  const trail: Focus[] = [];

  function close(): void {
    trail.length = 0;
    overlay.hidden = true;
    body.replaceChildren();
  }

  function render(): void {
    const svg = mainSvg();
    const focus = trail.at(-1);
    if (!svg || !focus) {
      close();
      return;
    }
    const edges = readEdges(svg);
    let drawn: SVGSVGElement;
    if (focus.kind === "edge") {
      drawn = drawEdge(svg, edges, focus.from, focus.to);
      title.textContent = `${nameOf(svg, focus.from)} → ${nameOf(svg, focus.to)}`;
      count.textContent = "";
      panel.setAttribute("data-focus", "edge");
      panel.removeAttribute("data-focus-layout");
    } else {
      const { id } = focus;
      const ins = rowsOf(
        svg,
        edges.filter((e) => e.to === id && e.from !== id),
        (e) => e.from,
      );
      const outs = rowsOf(
        svg,
        edges.filter((e) => e.from === id && e.to !== id),
        (e) => e.to,
      );
      const wide = columnsWidth(sizeOf(svg, id), ins, outs);
      const layout =
        options.layout ?? (container.clientWidth - 48 >= wide * MIN_SCALE ? "columns" : "spine");
      drawn = (layout === "columns" ? drawColumns : drawSpine)(svg, id, ins, outs);
      title.textContent = nameOf(svg, id);
      count.textContent = `${laneCount(ins)} in · ${laneCount(outs)} out`;
      panel.setAttribute("data-focus", "node");
      panel.setAttribute("data-focus-layout", layout);
    }
    body.replaceChildren(drawn);
    back.hidden = trail.length < 2;
    overlay.hidden = false;
    pill.hidden = true;
    // The tooltip of the tier before this one would otherwise stay up under the panel.
    container.querySelector<HTMLElement>(".edge-label-tip")?.setAttribute("hidden", "");
    // A canvas taller than the panel opens on the node it is about, not on its
    // first neighbour.
    const centre =
      focus.kind === "node"
        ? drawn.querySelector(`[data-focus-node="${CSS.escape(focus.id)}"]`)
        : null;
    if (centre) {
      const card = centre.getBoundingClientRect();
      const view = body.getBoundingClientRect();
      body.scrollTop += card.top - view.top - (view.height - card.height) / 2;
    } else {
      body.scrollTop = 0;
    }
  }

  function open(focus: Focus): void {
    trail.push(focus);
    render();
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────

  let down: { x: number; y: number } | null = null;
  const onDown = (e: MouseEvent) => {
    down = { x: e.clientX, y: e.clientY };
  };
  /** A click, not the end of a pan: the diagram follows the pointer, so a pan also ends in `click`. */
  const isClick = (e: MouseEvent) =>
    down !== null &&
    Math.abs(e.clientX - down.x) <= CLICK_THRESHOLD &&
    Math.abs(e.clientY - down.y) <= CLICK_THRESHOLD;

  const onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target?.closest || !isClick(e)) return;
    const edge = target.closest(".krs-edge[data-edge-from][data-edge-to]");
    // An edge that already opens a detail panel keeps it.
    if (!edge || edge.matches("[data-domain-edges], [data-edge-description], [data-edge-links]")) {
      return;
    }
    open({
      kind: "edge",
      from: edge.getAttribute("data-edge-from") ?? "",
      to: edge.getAttribute("data-edge-to") ?? "",
    });
  };

  const onOver = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target?.closest || target === pill) return;
    const svg = mainSvg();
    const node = target.closest(".krs-edge") ? null : target.closest("[data-node-id]");
    const id = node?.getAttribute("data-node-id");
    const n =
      svg && id && e.buttons === 0
        ? readEdges(svg).filter((x) => x.from === id || x.to === id).length
        : 0;
    if (!node || !id || n === 0) {
      pill.hidden = true;
      return;
    }
    pillNode = id;
    pill.textContent = `⇄ Relations ${n}`;
    pill.hidden = false;
    // Straddling the card's top edge at the right: reachable from the card
    // without crossing anything else, and clear of the card's own text.
    const card = node.getBoundingClientRect();
    const host = container.getBoundingClientRect();
    pill.style.left = `${card.right - host.left - pill.offsetWidth - 8}px`;
    pill.style.top = `${card.top - host.top - pill.offsetHeight / 2}px`;
  };
  const onLeave = () => {
    pill.hidden = true;
  };

  const onPill = (e: MouseEvent) => {
    e.stopPropagation();
    if (pillNode) open({ kind: "node", id: pillNode });
  };

  const onOverlayClick = (e: MouseEvent) => {
    e.stopPropagation();
    const target = e.target as Element;
    if (target === overlay || target.closest(".focus-canvas__close")) {
      close();
      return;
    }
    if (target.closest(".focus-canvas__back")) {
      trail.pop();
      render();
      return;
    }
    const current = trail.at(-1);
    const card = target.closest("[data-focus-node]")?.getAttribute("data-focus-node");
    if (card) {
      if (!(current?.kind === "node" && current.id === card)) open({ kind: "node", id: card });
      return;
    }
    const lane = target.closest("[data-focus-from]");
    if (lane && current?.kind === "node") {
      open({
        kind: "edge",
        from: lane.getAttribute("data-focus-from") ?? "",
        to: lane.getAttribute("data-focus-to") ?? "",
      });
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !overlay.hidden) close();
  };

  const stop = (e: Event) => e.stopPropagation();
  // Neither the pill nor the panel is part of the diagram: a press on them
  // must not pan it, zoom it or open what is under them.
  const SHIELDED = ["mousedown", "mouseup", "wheel", "contextmenu", "dblclick"];
  for (const type of SHIELDED) {
    overlay.addEventListener(type, stop);
    pill.addEventListener(type, stop);
  }
  overlay.addEventListener("mouseover", stop);
  overlay.addEventListener("click", onOverlayClick);
  pill.addEventListener("click", onPill);
  container.addEventListener("mousedown", onDown, true);
  container.addEventListener("click", onClick);
  container.addEventListener("mouseover", onOver);
  container.addEventListener("mouseleave", onLeave);
  doc.addEventListener("keydown", onKey);

  return () => {
    container.removeEventListener("mousedown", onDown, true);
    container.removeEventListener("click", onClick);
    container.removeEventListener("mouseover", onOver);
    container.removeEventListener("mouseleave", onLeave);
    doc.removeEventListener("keydown", onKey);
    overlay.remove();
    pill.remove();
  };
}
