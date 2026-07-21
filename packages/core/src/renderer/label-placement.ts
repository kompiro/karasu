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
 * capped candidate set) that clears every node rect and every already-placed
 * label. A label that already sits clear at its default anchor is left untouched
 * — so non-colliding diagrams stay byte-identical (ADR-1184's compatibility
 * promise, now conditional on "no collision"). Author-positioned labels are not
 * eligible to move; author intent wins (ADR-1184 precedence). They still act as
 * obstacles so auto labels route around them.
 *
 * Overlap is *measured*, not eyeballed: `countLabelPenetrations` /
 * `countLabelOverlaps` give the numeric guards the tests assert on
 * (TPL-20260711-02, the label analogue of the edge-routing penetration guards).
 */
import type { Point, Rect } from "./edge-geometry.js";
import type { LayoutEdge, LayoutNode } from "./layout-types.js";
import type { ResolvedEdgeStyle } from "../types/style.js";
import { estimateTextWidth } from "./rendering-constants.js";
import { labelAnchor, resolveLabelPosition } from "./edge-routing.js";

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
  /** Edge chord direction `to - from`; the nudge axis is perpendicular to it. */
  dir: Point;
  /** Estimated rendered width of the label text in px. */
  width: number;
  /** Label font size in px (drives box height and the nudge step). */
  fontSize: number;
  /** Whether this label may move. `false` for author-positioned labels (obstacle only). */
  eligible: boolean;
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
 * author positioned it) plus the node-card obstacle rects. Shared by the
 * renderer and its tests so both measure the exact same geometry.
 */
export function buildLabelInputs(
  edges: LayoutEdge[],
  nodes: Map<string, LayoutNode>,
  styleFor: (edge: LayoutEdge, index: number) => ResolvedEdgeStyle,
): { inputs: LabelInput[]; nodeRects: Rect[] } {
  const nodeRects: Rect[] = [...nodes.values()].map((n) => ({
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
  }));
  const inputs: LabelInput[] = [];
  edges.forEach((edge, index) => {
    if (!edge.label) return;
    const style = styleFor(edge, index);
    const points: Point[] = [edge.fromPoint, ...(edge.waypoints ?? []), edge.toPoint];
    const anchor = labelAnchor(
      points,
      resolveLabelPosition(edge, style),
      style.labelOffsetX,
      style.labelOffsetY,
    );
    inputs.push({
      index,
      anchor,
      dir: {
        x: edge.toPoint.x - edge.fromPoint.x,
        y: edge.toPoint.y - edge.fromPoint.y,
      },
      width: edgeLabelWidth(edge.label, style.fontSize),
      fontSize: style.fontSize,
      // Author-positioned labels (non-default label-position/offset) are not
      // eligible to move — author intent wins (ADR-1184 precedence).
      eligible: style.labelPosition === 0.5 && style.labelOffsetX === 0 && style.labelOffsetY === 0,
    });
  });
  return { inputs, nodeRects };
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
    const perp = perpendicular(label.dir);

    // Candidate offsets along the perpendicular: 0, +1, -1, +2, -2, ... The
    // default (0) is tried first so a clear label is never moved.
    const magnitudes: number[] = [0];
    for (let k = 1; k <= maxSteps; k++) {
      magnitudes.push(k * step, -k * step);
    }

    let bestAnchor = label.anchor;
    let bestBox = labelBox(label.anchor, label.width, label.fontSize);
    let bestCost = Number.POSITIVE_INFINITY;
    let bestMag = 0;
    for (const mag of magnitudes) {
      const anchor: Point = { x: label.anchor.x + perp.x * mag, y: label.anchor.y + perp.y * mag };
      const box = labelBox(anchor, label.width, label.fontSize);
      let cost = 0;
      for (const o of nodeRects) if (rectsOverlap(box, o)) cost++;
      for (const p of placed) if (rectsOverlap(box, p)) cost++;
      if (cost === 0) {
        // First clear candidate wins (0 is checked first, so a clear default stays put).
        bestAnchor = anchor;
        bestBox = box;
        bestCost = 0;
        bestMag = mag;
        break;
      }
      // Best-effort tiebreak: fewer collisions, then smaller shift.
      if (cost < bestCost || (cost === bestCost && Math.abs(mag) < Math.abs(bestMag))) {
        bestCost = cost;
        bestAnchor = anchor;
        bestBox = box;
        bestMag = mag;
      }
    }

    placed.push(bestBox);
    if (bestMag !== 0) overrides.set(label.index, bestAnchor);
  }

  return overrides;
}
