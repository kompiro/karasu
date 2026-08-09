/**
 * Auto collision-avoidance for edge labels (#2048).
 *
 * Edge labels are drawn by `renderEdge` at each edge's midpoint with no
 * awareness of neighbouring labels or node rectangles, so on dense diagrams two
 * adjacent labels overlap (system-top) or a short edge's centred label clips
 * into an adjacent node card (drill-down). ADR-1184 deferred this "auto
 * collision detection" while shipping the manual `label-position` /
 * `label-offset` lever; this module implements the deferred auto pass.
 *
 * The pass is a **bounded, deterministic** post-pass: it nudges only labels that
 * collide, perpendicular to the edge, choosing the first offset (out of a small
 * capped candidate set) that clears every node rect, every already-placed label
 * and every *foreign* edge polyline. A label that already sits clear at its
 * default anchor is left untouched — so non-colliding diagrams stay
 * byte-identical (ADR-1184's compatibility promise, now conditional on "no
 * collision"). Author-positioned labels are not eligible to move; author intent
 * wins (ADR-1184 precedence). They still act as obstacles so auto labels route
 * around them.
 *
 * Edge polylines joined the obstacle set in #2360: the original pass knew only
 * about node cards and sibling labels, so it could lift a label off a card and
 * drop it squarely onto another edge's line — and a label that never touched a
 * card was never examined at all. An edge's *own* polyline is exempt: a label is
 * supposed to sit on the line it names.
 *
 * Overlap is *measured*, not eyeballed: `countLabelPenetrations` /
 * `countLabelOverlaps` / `countLabelLinePenetrations` give the numeric guards
 * the tests assert on (TPL-1927, the label analogue of the edge-routing
 * penetration guards).
 */
import type { Point, Rect } from "./edge-geometry.js";
import type { LayoutEdge, LayoutNode } from "./layout-types.js";
import type { ResolvedEdgeStyle } from "../types/style.js";
import { estimateTextWidth } from "./rendering-constants.js";
import { labelAnchorWithSegment, resolveLabelPosition } from "./edge-routing.js";
import { segmentCrossesAnyRect } from "./edge-geometry.js";

/**
 * One edge label offered to the placement pass. `anchor` is the label's default
 * draw position (already including any parallel-bundle slide, ADR-1185), i.e.
 * exactly where `renderEdge` would place it absent this pass.
 */
export interface LabelInput {
  /** Edge index — the key of the returned override map, matching `layoutResult.edges`. */
  index: number;
  /** Default anchor (bundle slide applied), before any auto nudge. */
  anchor: Point;
  /** Direction of the local polyline segment the anchor sits on; the nudge axis is perpendicular to it. */
  dir: Point;
  /** Estimated rendered width of the label text in px. */
  width: number;
  /** Label font size in px (drives box height and the nudge step). */
  fontSize: number;
  /** Whether this label may move. `false` for author-positioned labels (obstacle only). */
  eligible: boolean;
}

/**
 * One edge polyline offered to the placement pass as an obstacle (#2360). A
 * label never treats the line of its *own* edge as an obstacle, so `index` is
 * carried through to be matched against `LabelInput.index`.
 */
export interface EdgeLine {
  /** Edge index — the same key space as `LabelInput.index` and `layoutResult.edges`. */
  index: number;
  /** from → waypoints → to, exactly the polyline `renderEdge` strokes. */
  points: Point[];
  /**
   * Axis-aligned bounds of `points`. The candidate loop runs every label box
   * against every foreign line, so a cheap bounds reject keeps the segment math
   * off the (large) majority of pairs that cannot possibly touch.
   */
  bounds: Rect;
}

interface LabelPlacementOptions {
  /** Max nudge steps to try on each side of the edge (candidates = 2·maxSteps + 1). */
  maxSteps?: number;
}

// Cap on nudge steps per side. The resolver stops at the first (smallest) clear
// offset, so this is only the search bound — easy labels clear at 1–2 steps; the
// higher cap lets a wide label in a dense cluster still find open space
// (≈ 6·step ≈ 90px), rather than being left clipping a node.
const DEFAULT_MAX_STEPS = 6;

/**
 * Sans-serif glyphs render at roughly 0.6× the font size wide. `estimateTextWidth`
 * takes an absolute per-char width, so callers pass `fontSize * this`.
 */
const EDGE_LABEL_CHAR_WIDTH_RATIO = 0.6;

/** Estimated width of an edge label text, matching what the placement pass measures. */
function edgeLabelWidth(label: string, fontSize: number): number {
  return estimateTextWidth(label, fontSize * EDGE_LABEL_CHAR_WIDTH_RATIO);
}

/**
 * Build the placement pass inputs from a laid-out view: one `LabelInput` per
 * labelled edge (default anchor + chord + estimated box, eligible unless the
 * author positioned it), the node-card obstacle rects, and one `EdgeLine` per
 * drawn edge. Shared by the renderer and its tests so both measure the exact
 * same geometry.
 *
 * `edgeLines` covers **every** non-ghost/cyclic edge, labelled or not: an
 * unlabelled edge's stroke obscures label text just as thoroughly as a labelled
 * one's (#2360).
 */
export function buildLabelInputs(
  edges: LayoutEdge[],
  nodes: Map<string, LayoutNode>,
  styleFor: (edge: LayoutEdge, index: number) => ResolvedEdgeStyle,
): { inputs: LabelInput[]; nodeRects: Rect[]; edgeLines: EdgeLine[] } {
  const nodeRects: Rect[] = [...nodes.values()].map((n) => ({
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
  }));
  const inputs: LabelInput[] = [];
  const edgeLines: EdgeLine[] = [];
  edges.forEach((edge, index) => {
    // Ghost/cyclic edges are peripheral (dimmed / back-arc styled) and sit
    // outside the "real" geometry every other renderer pass reasons about —
    // crossing-marks, port fan-out, channel/group routing and bundle nudging
    // all skip them (ADR-968). Excluding them here keeps a barely-visible ghost
    // label from being moved or from pushing a real label off its default spot,
    // and keeps a dimmed ghost line from displacing a real label.
    if (edge.ghost || edge.cyclic) return;
    const points: Point[] = [edge.fromPoint, ...(edge.waypoints ?? []), edge.toPoint];
    edgeLines.push(edgeLine(index, points));
    if (!edge.label) return;
    const style = styleFor(edge, index);
    const { anchor, segDir } = labelAnchorWithSegment(
      points,
      resolveLabelPosition(edge, style),
      style.labelOffsetX,
      style.labelOffsetY,
    );
    inputs.push({
      index,
      anchor,
      // Nudge perpendicular to the *local* segment the anchor sits on, not the
      // overall from→to chord — otherwise a bent / waypoint route's label would
      // be shifted at a skewed angle relative to the line it labels (#2048).
      dir: segDir,
      width: edgeLabelWidth(edge.label, style.fontSize),
      fontSize: style.fontSize,
      // Author-positioned labels (non-default label-position/offset) are not
      // eligible to move — author intent wins (ADR-1184 precedence).
      eligible: style.labelPosition === 0.5 && style.labelOffsetX === 0 && style.labelOffsetY === 0,
    });
  });
  return { inputs, nodeRects, edgeLines };
}

/**
 * Package a polyline as a placement obstacle, precomputing its bounds. The one
 * construction site for `EdgeLine`, so the renderer and the tests cannot end up
 * measuring against differently-built bounds.
 */
export function edgeLine(index: number, points: Point[]): EdgeLine {
  return { index, points, bounds: polylineBounds(points) };
}

/** Axis-aligned bounds of a polyline. Degenerate (zero width or height) for an axis-parallel run. */
function polylineBounds(points: Point[]): Rect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Axis-aligned bounding box of a label drawn at `anchor`. Mirrors how
 * `renderEdge` emits the text: `text-anchor="middle"` (centred on `anchor.x`)
 * with the baseline at `anchor.y - 6`. The box spans the ascender height above
 * the baseline plus a small descender/padding below, and a little horizontal
 * padding so touching-but-legible cases still read as "clear".
 */
export function labelBox(anchor: Point, width: number, fontSize: number): Rect {
  const padX = 2;
  const baseline = anchor.y - 6;
  const top = baseline - fontSize;
  return {
    x: anchor.x - width / 2 - padX,
    y: top,
    width: width + padX * 2,
    height: fontSize + 4,
  };
}

/** True if two axis-aligned rectangles share positive-area interior overlap (touching does not count). */
function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width - 1e-6 &&
    a.x + a.width > b.x + 1e-6 &&
    a.y < b.y + b.height - 1e-6 &&
    a.y + a.height > b.y + 1e-6
  );
}

/** Count of `boxes` entries that overlap at least one obstacle rect (label↔node penetrations). */
export function countLabelPenetrations(boxes: Rect[], obstacles: Rect[]): number {
  let n = 0;
  for (const box of boxes) {
    if (obstacles.some((o) => rectsOverlap(box, o))) n++;
  }
  return n;
}

/**
 * Inclusive AABB intersection, used only as a cheap reject before the exact
 * segment test. Inclusive (not strict-interior like `rectsOverlap`) because an
 * axis-parallel polyline's bounds are degenerate — a horizontal line has zero
 * height, and a strict test would reject every one of them.
 */
function boundsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}

/**
 * True if any segment of `line` crosses the interior of `box` — a label drawn
 * there would have the stroke running through its text. Uses the same
 * strict-interior `segmentCrossesRect` the routers decide routes with, so the
 * pass and the tests that assert zero can never disagree (TPL-1927).
 */
function boxCrossedByLine(box: Rect, line: EdgeLine): boolean {
  if (!boundsIntersect(box, line.bounds)) return false;
  for (let i = 0; i < line.points.length - 1; i++) {
    if (segmentCrossesAnyRect(line.points[i], line.points[i + 1], [box])) return true;
  }
  return false;
}

/**
 * Count of labels whose box is crossed by at least one **foreign** edge
 * polyline (label↔line penetrations, #2360). A label sitting on its own edge's
 * line is not counted — that is where it belongs. Counted per label, matching
 * how `countLabelPenetrations` counts.
 */
export function countLabelLinePenetrations(
  boxes: { index: number; box: Rect }[],
  lines: EdgeLine[],
): number {
  let n = 0;
  for (const { index, box } of boxes) {
    if (lines.some((line) => line.index !== index && boxCrossedByLine(box, line))) n++;
  }
  return n;
}

/** Count of unordered label-pair overlaps (label↔label collisions). */
export function countLabelOverlaps(boxes: Rect[]): number {
  let n = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (rectsOverlap(boxes[i], boxes[j])) n++;
    }
  }
  return n;
}

/** Unit vector perpendicular to `dir`. Falls back to straight up for a zero-length chord (self-loop). */
function perpendicular(dir: Point): Point {
  const len = Math.hypot(dir.x, dir.y);
  if (len < 1e-6) return { x: 0, y: -1 };
  // Rotate the chord 90°: (dx, dy) -> (-dy, dx), then normalise.
  return { x: -dir.y / len, y: dir.x / len };
}

/**
 * Resolve auto label positions. Returns a map `edgeIndex -> anchor` containing
 * **only** labels that were nudged off their default; edges absent from the map
 * keep their default anchor (byte-stable). Deterministic: candidates are tried
 * in a fixed order and labels processed by ascending index.
 */
export function resolveLabelPlacements(
  labels: LabelInput[],
  nodeRects: Rect[],
  edgeLines: EdgeLine[] = [],
  options: LabelPlacementOptions = {},
): Map<number, Point> {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const overrides = new Map<number, Point>();

  // Obstacles that a moving label must avoid: node cards, plus the boxes of
  // labels already committed (fixed author labels first, then earlier auto ones).
  const placed: Rect[] = [];

  // Fixed (author-positioned) labels are immovable obstacles — commit them first
  // so eligible labels route around them, regardless of index order.
  const byIndex = [...labels].sort((a, b) => a.index - b.index);
  for (const label of byIndex) {
    if (!label.eligible) {
      placed.push(labelBox(label.anchor, label.width, label.fontSize));
    }
  }

  for (const label of byIndex) {
    if (!label.eligible) continue;
    const step = label.fontSize + 4;
    // Two search axes: `perp` lifts the label off its edge; `tang` slides it
    // *along* the edge to a clear stretch. A single perpendicular axis is not
    // enough — for a vertical edge boxed in by side-by-side nodes the only
    // escape is along the edge, not across it (#2048). The default (0,0) is
    // always the first candidate, so a clear label is never moved (byte-stable).
    const perp = perpendicular(label.dir);
    const tang = normalize(label.dir);
    const candidates = candidateOffsets(maxSteps);
    // Every drawn line except this label's own: a label is meant to sit on the
    // line it names, so its own polyline must not push it away (#2360).
    const foreignLines = edgeLines.filter((line) => line.index !== label.index);

    let bestAnchor = label.anchor;
    let bestBox = labelBox(label.anchor, label.width, label.fontSize);
    let bestCost = Number.POSITIVE_INFINITY;
    let bestDist = 0;
    for (const [i, j] of candidates) {
      const dp = i * step;
      const dt = j * step;
      const anchor: Point = {
        x: label.anchor.x + perp.x * dp + tang.x * dt,
        y: label.anchor.y + perp.y * dp + tang.y * dt,
      };
      const box = labelBox(anchor, label.width, label.fontSize);
      let cost = 0;
      for (const o of nodeRects) if (rectsOverlap(box, o)) cost++;
      for (const p of placed) if (rectsOverlap(box, p)) cost++;
      // A stroke through the text is as unreadable as a card behind it, so a
      // crossed foreign line weighs the same as a node penetration (#2360).
      for (const line of foreignLines) if (boxCrossedByLine(box, line)) cost++;
      if (cost === 0) {
        // Candidates are ordered by increasing displacement, so the first clear
        // one is the smallest move (and (0,0) is first → a clear default stays put).
        bestAnchor = anchor;
        bestBox = box;
        bestCost = 0;
        bestDist = i * i + j * j;
        break;
      }
      // Best-effort tiebreak: fewer collisions, then smaller displacement.
      const dist = i * i + j * j;
      if (cost < bestCost || (cost === bestCost && dist < bestDist)) {
        bestCost = cost;
        bestAnchor = anchor;
        bestBox = box;
        bestDist = dist;
      }
    }

    placed.push(bestBox);
    if (bestDist !== 0) overrides.set(label.index, bestAnchor);
  }

  return overrides;
}

/**
 * Integer (perp, tang) step offsets to try, ordered by increasing Euclidean
 * displacement (so the first clearing candidate is the smallest move) with a
 * deterministic tie-break. `[0, 0]` is always first. Cached per `maxSteps`.
 */
const candidateCache = new Map<number, [number, number][]>();
function candidateOffsets(maxSteps: number): [number, number][] {
  const cached = candidateCache.get(maxSteps);
  if (cached) return cached;
  const offsets: [number, number][] = [];
  for (let i = -maxSteps; i <= maxSteps; i++) {
    for (let j = -maxSteps; j <= maxSteps; j++) offsets.push([i, j]);
  }
  offsets.sort((a, b) => {
    const da = a[0] * a[0] + a[1] * a[1];
    const db = b[0] * b[0] + b[1] * b[1];
    if (da !== db) return da - db;
    // Prefer a perpendicular lift over an along-edge slide at equal distance
    // (keeps the label nearer its midpoint), then a fully deterministic order.
    if (Math.abs(a[1]) !== Math.abs(b[1])) return Math.abs(a[1]) - Math.abs(b[1]);
    if (a[0] !== b[0]) return a[0] - b[0];
    return a[1] - b[1];
  });
  candidateCache.set(maxSteps, offsets);
  return offsets;
}

/** Unit vector along `dir`. Falls back to horizontal for a zero-length chord. */
function normalize(dir: Point): Point {
  const len = Math.hypot(dir.x, dir.y);
  if (len < 1e-6) return { x: 1, y: 0 };
  return { x: dir.x / len, y: dir.y / len };
}
