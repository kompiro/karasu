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
   * Half the edge's `stroke-width`. `points` is the *centreline*, but what
   * obscures the text is the painted stroke, which extends this far either side
   * of it. Tests inflate the label box by this much, so a thick edge whose
   * centreline just misses the box still reads as a collision.
   */
  halfStroke: number;
  /**
   * Axis-aligned bounds of `points`, already grown by `halfStroke`. The
   * candidate loop runs every label box against every foreign line, so a cheap
   * bounds reject keeps the segment math off the (large) majority of pairs that
   * cannot possibly touch.
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
 * Cost weights for a candidate placement. A collision hides the text outright;
 * ambiguity leaves it readable but attached to the wrong line by eye. Two-to-one
 * makes any clear spot beat any colliding one, while still steering the search
 * towards clear spots that stay nearest their own edge. See `candidateCost`.
 */
const COLLISION_COST = 2;
const AMBIGUITY_COST = 1;

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
    const style = styleFor(edge, index);
    edgeLines.push(edgeLine(index, points, style.strokeWidth));
    if (!edge.label) return;
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
 * Package a polyline as a placement obstacle, precomputing the half-stroke and
 * the grown bounds. The one construction site for `EdgeLine`, so the renderer
 * and the tests cannot end up measuring against differently-built geometry.
 */
export function edgeLine(index: number, points: Point[], strokeWidth: number): EdgeLine {
  const halfStroke = strokeWidth / 2;
  return { index, points, halfStroke, bounds: polylineBounds(points, halfStroke) };
}

/**
 * Axis-aligned bounds of a polyline, grown by `pad` on every side. Degenerate
 * (zero width or height) for an axis-parallel run at `pad === 0`.
 */
function polylineBounds(points: Point[], pad: number): Rect {
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
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
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
 * True if any segment of `line`'s painted stroke crosses the interior of `box`
 * — a label drawn there would have the stroke running through its text. Uses
 * the same strict-interior `segmentCrossesRect` the routers decide routes with,
 * so the pass and the tests that assert zero can never disagree (TPL-1927).
 *
 * The stroke is tested by growing the label box by the line's half-width rather
 * than by thickening the line: a segment-vs-rect test is exact, and inflating
 * the rect is the same predicate with none of the capsule geometry. (Corners
 * are then square rather than round, which over-reports by a fraction of the
 * stroke width diagonally — the safe direction for a legibility guard.)
 */
function boxCrossedByLine(box: Rect, line: EdgeLine): boolean {
  if (!boundsIntersect(box, line.bounds)) return false;
  const grown =
    line.halfStroke === 0
      ? box
      : {
          x: box.x - line.halfStroke,
          y: box.y - line.halfStroke,
          width: box.width + line.halfStroke * 2,
          height: box.height + line.halfStroke * 2,
        };
  for (let i = 0; i < line.points.length - 1; i++) {
    if (segmentCrossesAnyRect(line.points[i], line.points[i + 1], [grown])) return true;
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

/**
 * The lines a label's bounded search can possibly be affected by, so the
 * candidate loop scans a handful instead of the whole diagram.
 *
 * `maxShift` is the largest displacement along either search axis, so every
 * candidate anchor lies within `maxShift·√2` of the default one, and every
 * candidate *box* within that plus its own half-diagonal. A line farther than
 * that from the default anchor can never be crossed. The ambiguity term needs a
 * wider radius: an eligible label's default anchor sits *on* its own line, so at
 * any candidate the own-line distance is at most `maxShift·√2`, and a foreign
 * line that beats it must lie within that of the candidate — hence within twice
 * that of the default anchor. The wider of the two radii is used for both, which
 * keeps the prune exact rather than merely close.
 */
function reachableLines(edgeLines: EdgeLine[], label: LabelInput, maxShift: number): EdgeLine[] {
  if (edgeLines.length === 0) return edgeLines;
  const box = labelBox(label.anchor, label.width, label.fontSize);
  const halfDiagonal = Math.hypot(box.width, box.height) / 2;
  const reach = 2 * maxShift * Math.SQRT2 + halfDiagonal;
  return edgeLines.filter(
    (line) => line.index === label.index || pointToRectDistance(label.anchor, line.bounds) <= reach,
  );
}

/**
 * What a candidate placement costs, in units where a **collision** (node card,
 * committed label, or foreign stroke through the text) is 2 and **ambiguity**
 * (some other edge's line is nearer than the one this label names) is 1.
 *
 * The two are weighted rather than summed flat because they are different kinds
 * of unreadable and one is strictly worse: a label buried under a card or a
 * stroke cannot be read at all, while an ambiguous one is legible but attached
 * to the wrong line by eye. Weighting collisions at 2 makes the resolver prefer
 * *any* clear spot over a colliding one, and among clear spots prefer the ones
 * that still read as belonging to their own edge. Without the ambiguity term the
 * search happily parks a label on the far side of a neighbouring edge, which is
 * how #2360's fix could have traded an unreadable label for a mislabelled one.
 *
 * Collision counting stops as soon as `cap` (the best cost so far) is reached —
 * on dense diagrams that is the difference between rescanning every line for
 * every one of the ~169 candidates and bailing after two hits. The caller makes
 * *two* comparisons, and the early return is safe for both only because a capped
 * return is always `>= cap > 0`: it can neither beat `bestCost` nor be mistaken
 * for the `cost === 0` fast path that accepts a candidate outright. A returned
 * `0` therefore always means genuinely clear and unambiguous.
 *
 * The ambiguity term is deliberately **not** capped. Reaching it already implies
 * `cost < cap` (every collision early-return fires at `cost >= cap`), and it
 * cannot be skipped on the grounds that it might only tie: a candidate sitting
 * at `cap - 1` still wins if it turns out to be unambiguous, so its true value
 * has to be known. Capping it here is what made an ambiguous candidate report
 * `0` and short-circuit the search onto a mislabelled placement (#2413 review).
 */
function candidateCost(
  box: Rect,
  anchor: Point,
  label: LabelInput,
  nodeRects: Rect[],
  placed: Rect[],
  edgeLines: EdgeLine[],
  ownLine: EdgeLine | undefined,
  cap: number,
): number {
  let cost = 0;
  for (const o of nodeRects) {
    if (rectsOverlap(box, o)) {
      cost += COLLISION_COST;
      if (cost >= cap) return cost;
    }
  }
  for (const p of placed) {
    if (rectsOverlap(box, p)) {
      cost += COLLISION_COST;
      if (cost >= cap) return cost;
    }
  }
  for (const line of edgeLines) {
    // A label is meant to sit on the line it names, so its own polyline is never
    // an obstacle (#2360). Skipped inline rather than by pre-filtering the array
    // — the filter allocated a copy of every line for every label.
    if (line.index === label.index) continue;
    if (boxCrossedByLine(box, line)) {
      cost += COLLISION_COST;
      if (cost >= cap) return cost;
    }
  }
  if (ownLine !== undefined && nearestLineIsForeign(anchor, label.index, edgeLines, ownLine)) {
    cost += AMBIGUITY_COST;
  }
  return cost;
}

/**
 * True if some other edge's line runs nearer to `anchor` than the label's own
 * line does — i.e. a reader tracing from the text to the closest stroke lands on
 * the wrong edge. Distances are measured from the anchor rather than the box
 * because the anchor is where the text is centred and where the eye starts.
 */
function nearestLineIsForeign(
  anchor: Point,
  ownIndex: number,
  edgeLines: EdgeLine[],
  ownLine: EdgeLine,
): boolean {
  const ownDist = pointToPolylineDistance(anchor, ownLine);
  for (const line of edgeLines) {
    if (line.index === ownIndex) continue;
    // Cheap reject: nothing inside `line`'s bounds can be nearer than the gap to
    // those bounds, so a line whose bounds are already farther cannot win.
    if (pointToRectDistance(anchor, line.bounds) >= ownDist) continue;
    if (pointToPolylineDistance(anchor, line) < ownDist) return true;
  }
  return false;
}

/** Shortest distance from `p` to any point of the polyline's painted stroke. */
function pointToPolylineDistance(p: Point, line: EdgeLine): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.points.length - 1; i++) {
    const d = pointToSegmentDistance(p, line.points[i], line.points[i + 1]);
    if (d < best) best = d;
  }
  return Math.max(0, best - line.halfStroke);
}

/** Shortest distance from `p` to the segment `a`–`b` (not the infinite line). */
function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  // Project p onto the segment, clamped to its ends.
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Shortest distance from `p` to a rectangle; 0 when `p` is inside it. */
function pointToRectDistance(p: Point, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
  return Math.hypot(dx, dy);
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
    // The label's own line, which must not push it away (a label is meant to sit
    // on the line it names) and which it must stay nearest to (#2360).
    const ownLine = edgeLines.find((line) => line.index === label.index);
    // Only lines the bounded search can actually reach. Without this every one
    // of the ~169 candidates rescans every line in the diagram, which is
    // quadratic in edge count on a dense graph. See `searchReach`.
    const reachable = reachableLines(edgeLines, label, maxSteps * step);

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
      const cost = candidateCost(
        box,
        anchor,
        label,
        nodeRects,
        placed,
        reachable,
        ownLine,
        bestCost,
      );
      if (cost === 0) {
        // Candidates are ordered by increasing displacement, so the first clear
        // one is the smallest move (and (0,0) is first → a clear default stays put).
        bestAnchor = anchor;
        bestBox = box;
        bestCost = 0;
        bestDist = i * i + j * j;
        break;
      }
      // Best-effort tiebreak: strictly fewer collisions wins. Equal cost never
      // wins because `dist` is exactly the key `candidateOffsets` sorts by, so a
      // later candidate is never nearer — which is also what lets
      // `candidateCost` stop counting at `bestCost` without changing the result.
      const dist = i * i + j * j;
      if (cost < bestCost) {
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
