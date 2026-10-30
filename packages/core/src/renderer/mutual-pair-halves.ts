// SPIKE (#3027): draw a same-kind mutual pair (`A -> B` + `B -> A`) as one line split in
// halves. Each edge draws only the half of the shared route that ends at its own target.
// Not for merge: no style key, constant hop clearance, one pass instead of the fixpoint
// loop the design doc describes. The mode comes from `globalThis.__karasuPairCue`, which the
// spike app sets from `?pairCue=off|position|arrow`.
import type { LayoutEdge } from "./layout-types.js";

type Pt = { x: number; y: number };
export type PairCue = "off" | "position" | "arrow";

const HOP_CLEAR = 14;
const CORNER_CLEAR = 10;
/** The split may slide this fraction of the length away from the middle (1/3 = middle two-thirds). */
const SPLIT_WINDOW = 1 / 3;
const ARROWS = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];

function pairCue(): PairCue {
  const v = (globalThis as { __karasuPairCue?: string }).__karasuPairCue;
  // Off unless a host opts in, so the existing tests and outputs stay as they are.
  return v === "position" || v === "arrow" ? v : "off";
}

const pts = (e: LayoutEdge): Pt[] => [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function segCross(a: Pt, b: Pt, c: Pt, d: Pt): Pt | undefined {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-9) return undefined;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return undefined;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

function crossingsAlong(line: Pt[], others: Pt[][]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    for (const o of others)
      for (let j = 0; j + 1 < o.length; j++) {
        const p = segCross(line[i], line[i + 1], o[j], o[j + 1]);
        if (p) out.push(acc + dist(line[i], p));
      }
    acc += dist(line[i], line[i + 1]);
  }
  return out;
}

function chooseSplit(line: Pt[], others: Pt[][]): number | undefined {
  const lengths = line.slice(1).map((p, i) => dist(line[i], p));
  const total = lengths.reduce((a, b) => a + b, 0);
  const corners: number[] = [];
  let acc = 0;
  for (const l of lengths.slice(0, -1)) corners.push((acc += l));
  const cross = crossingsAlong(line, others);
  const ok = (s: number) =>
    cross.every((c) => Math.abs(c - s) >= HOP_CLEAR) &&
    corners.every((c) => Math.abs(c - s) >= CORNER_CLEAR);
  for (let d = 0; d <= total * SPLIT_WINDOW; d += 1) {
    if (ok(total / 2 - d)) return total / 2 - d;
    if (ok(total / 2 + d)) return total / 2 + d;
  }
  return undefined;
}

function splitAt(line: Pt[], s: number): [Pt[], Pt[]] {
  let acc = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const len = dist(line[i], line[i + 1]);
    if (acc + len >= s) {
      const t = (s - acc) / len;
      const m = {
        x: line[i].x + t * (line[i + 1].x - line[i].x),
        y: line[i].y + t * (line[i + 1].y - line[i].y),
      };
      return [
        [...line.slice(0, i + 1), m],
        [m, ...line.slice(i + 1)],
      ];
    }
    acc += len;
  }
  return [line, [line[line.length - 1]]];
}

function setPolyline(e: LayoutEdge, line: Pt[]) {
  e.fromPoint = line[0];
  e.toPoint = line[line.length - 1];
  e.waypoints = line.slice(1, -1);
}

/**
 * The segment a paired edge's label sits on: the longest segment of its own half that does not
 * touch the split (segment 0 starts at the split). `undefined` for a one-segment half, whose
 * default anchor (the segment's midpoint) is already the half's length midpoint.
 */
export function pairLabelSegment(edge: LayoutEdge): number | undefined {
  const line = pts(edge);
  if (line.length <= 2) return undefined;
  let best = 1;
  let bestLen = -1;
  for (let i = 1; i + 1 < line.length; i++) {
    const len = dist(line[i], line[i + 1]);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  return best;
}

function glyphFor(edge: LayoutEdge): string {
  const line = pts(edge);
  const i = pairLabelSegment(edge) ?? 0;
  const a = line[i];
  const b = line[i + 1];
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return ARROWS[((Math.round(deg / 45) % 8) + 8) % 8];
}

const endKey = (e: LayoutEdge, end: "from" | "to") =>
  end === "from" ? (e.fromKey ?? e.from) : (e.toKey ?? e.to);

/** Rewrites each eligible mutual pair in place. Returns the number of pairs drawn as one line. */
export function applyMutualPairHalves(edges: LayoutEdge[], cue: PairCue = pairCue()): number {
  if (cue === "off") return 0;
  const eligible = (e: LayoutEdge) =>
    !e.ghost &&
    !e.cyclic &&
    !e.groupBackward &&
    e.trunkId === undefined &&
    e.outTrunkId === undefined &&
    e.bundleSize === undefined;
  const pairs: [number, number][] = [];
  const used = new Set<number>();
  for (let i = 0; i < edges.length; i++) {
    if (used.has(i) || !eligible(edges[i])) continue;
    const a = edges[i];
    const j = edges.findIndex(
      (b, k) =>
        k > i &&
        !used.has(k) &&
        eligible(b) &&
        endKey(b, "from") === endKey(a, "to") &&
        endKey(b, "to") === endKey(a, "from") &&
        b.kind === a.kind,
    );
    if (j < 0) continue;
    used.add(i);
    used.add(j);
    pairs.push([i, j]);
  }
  if (pairs.length === 0) return 0;
  // Choose every split against the routes that will remain (the discarded ones removed).
  const discarded = new Set(pairs.map(([, j]) => j));
  const remaining = edges.map((e, k) => (discarded.has(k) ? undefined : pts(e)));
  let merged = 0;
  for (const [i, j] of pairs) {
    const shared = pts(edges[i]);
    const others = remaining.filter((p, k): p is Pt[] => p !== undefined && k !== i);
    const s = chooseSplit(shared, others);
    if (s === undefined) continue;
    const [fromHalf, toHalf] = splitAt(shared, s);
    setPolyline(edges[i], toHalf); // split -> a.to
    setPolyline(edges[j], [...fromHalf].reverse()); // split -> a.from (= b.to)
    for (const e of [edges[i], edges[j]]) {
      e.pairHalf = true;
      if (cue === "arrow") e.pairGlyph = glyphFor(e);
    }
    merged++;
  }
  return merged;
}
