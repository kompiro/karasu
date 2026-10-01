// Reads one rendered surface back and measures what a reader sees (Issue #3022):
// how wide the drawn labels are, how often a label lands on a node card, on
// another label or on a foreign edge line, and how many edge lines run under a
// card that is not one of their endpoints.
//
// Measured from the SVG on purpose, not from the layout result: the question is
// about the picture, and the same reader works on output from `main`.
// The collision tests are the renderer's own (`label-placement.ts`, TPL-1927),
// so "collision" here means exactly what the auto placement pass means by it.

import {
  countLabelLinePenetrations,
  countLabelOverlaps,
  countLabelPenetrations,
  edgeLine,
  labelBox,
} from "../../packages/core/src/renderer/label-placement.ts";
import { countPolylinePenetrations } from "../../packages/core/src/renderer/edge-geometry.ts";
import { estimateTextWidth } from "../../packages/core/src/renderer/rendering-constants.ts";

/** The renderer's own width estimate for an edge label (`edgeLabelWidth`). */
const labelWidth = (content: string, fontSize: number): number =>
  estimateTextWidth(content, fontSize * 0.6);

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

export interface MeasuredEdge {
  from: string;
  to: string;
  /** The authored label, from `data-edge-label`. */
  label?: string;
  points: Pt[];
  /** The label text the canvas draws, if it draws one. */
  drawn?: { x: number; y: number; fontSize: number; content: string };
  truncated: boolean;
  /** Drawn in the dimmed `ghost-edges` group: context, not part of this surface's own structure. */
  ghost: boolean;
}

export interface Metrics {
  nodes: number;
  edges: number;
  labelsDrawn: number;
  labelsTruncated: number;
  charsMedian: number;
  charsMax: number;
  widthMedianPx: number;
  widthMaxPx: number;
  canvas: string;
  /** Sum of drawn label boxes over the canvas area. */
  labelInkRatio: number;
  labelNodePenetrations: number;
  labelLabelOverlaps: number;
  labelLinePenetrations: number;
  /** Labels crossed by a dimmed ghost line. The pass leaves these alone by design (#2360). */
  labelGhostLinePenetrations: number;
  /** Edges whose line crosses at least one foreign node card. */
  edgesUnderForeignCard: number;
  bytes: number;
}

const decode = (s: string): string =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** The markup of the `<g>` opening at `start`, up to and including its matching `</g>`. */
function groupAt(svg: string, start: number): string {
  const token = /<g\b|<\/g>/g;
  token.lastIndex = start;
  let depth = 0;
  for (let m = token.exec(svg); m; m = token.exec(svg)) {
    depth += m[0] === "</g>" ? -1 : 1;
    if (depth === 0) return svg.slice(start, m.index + 4);
  }
  return svg.slice(start);
}

export function readSurface(svg: string): { nodes: (Rect & { id: string })[]; edges: MeasuredEdge[]; viewBox: number[] } {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)![1].split(/\s+/).map(Number);

  const nodes: (Rect & { id: string })[] = [];
  const nodeRe =
    /<g[^>]*data-node-id="([^"]+)"[^>]*>\s*<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g;
  for (const m of svg.matchAll(nodeRe)) {
    nodes.push({ id: m[1], x: +m[2], y: +m[3], width: +m[4], height: +m[5] });
  }

  const ghostAt = svg.indexOf('<g class="ghost-edges"');
  const ghostEnd = ghostAt === -1 ? -1 : ghostAt + groupAt(svg, ghostAt).length;
  const edges: MeasuredEdge[] = [];
  for (const m of svg.matchAll(/<g data-edge-from="([^"]+)" data-edge-to="([^"]+)"([^>]*)>/g)) {
    const body = groupAt(svg, m.index);
    const label = /data-edge-label="([^"]*)"/.exec(m[3])?.[1];

    let points: Pt[] = [];
    const line = /<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"(?![^>]*hitline)[^>]*>/.exec(body);
    const poly = /<polyline points="([^"]+)"(?![^>]*hitline)[^>]*>/.exec(body);
    const path = /<path d="([^"]+)"(?![^>]*hitline)[^>]*>/.exec(body);
    if (line) {
      points = [
        { x: +line[1], y: +line[2] },
        { x: +line[3], y: +line[4] },
      ];
    } else if (poly) {
      points = poly[1]
        .trim()
        .split(/\s+/)
        .map((p) => {
          const [x, y] = p.split(",").map(Number);
          return { x, y };
        });
    } else if (path) {
      for (const pm of path[1].matchAll(/[ML]\s*([\d.-]+)[ ,]([\d.-]+)/g)) {
        points.push({ x: +pm[1], y: +pm[2] });
      }
    }

    const tm = /<text x="([\d.-]+)" y="([\d.-]+)"([^>]*)>([^<]*)/.exec(body);
    const t = tm
      ? {
          x: +tm[1],
          y: +tm[2],
          fontSize: +(/font-size="([\d.]+)px"/.exec(tm[3])?.[1] ?? "11"),
          content: decode(tm[4]),
        }
      : undefined;
    edges.push({
      from: decode(m[1]),
      to: decode(m[2]),
      label: label === undefined ? undefined : decode(label),
      points,
      drawn: t,
      truncated: /data-edge-label-withheld="truncated"/.test(m[3]),
      ghost: m.index > ghostAt && m.index < ghostEnd,
    });
  }
  return { nodes, edges, viewBox };
}

const quantile = (sorted: number[], p: number): number =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

export function measureSvg(svg: string): Metrics {
  const { nodes, edges, viewBox } = readSurface(svg);
  const nodeRects: Rect[] = nodes.map(({ x, y, width, height }) => ({ x, y, width, height }));

  const drawn = edges.map((e, index) => ({ e, index })).filter(({ e }) => e.drawn !== undefined);
  const boxes = drawn.map(({ e }) => {
    const d = e.drawn!;
    // `renderEdge` draws the text 6px above its anchor; `labelBox` takes the anchor.
    return labelBox({ x: d.x, y: d.y + 6 }, labelWidth(d.content, d.fontSize), d.fontSize);
  });
  const lines = edges.map((e, i) => edgeLine(i, e.points, 1.5));
  const realLines = lines.filter((l) => !edges[l.index].ghost);
  const ghostLines = lines.filter((l) => edges[l.index].ghost);
  const indexed = boxes.map((box, k) => ({ index: drawn[k].index, box }));

  let edgesUnderForeignCard = 0;
  for (const e of edges) {
    const foreign = nodes
      .filter((n) => n.id !== e.from && n.id !== e.to)
      .map(({ x, y, width, height }) => ({ x, y, width, height }));
    if (countPolylinePenetrations(e.points, foreign) > 0) edgesUnderForeignCard++;
  }

  const chars = drawn.map(({ e }) => e.drawn!.content.length).sort((a, b) => a - b);
  const widths = boxes.map((b) => b.width).sort((a, b) => a - b);
  const ink = boxes.reduce((sum, b) => sum + b.width * b.height, 0);

  return {
    nodes: nodes.length,
    edges: edges.length,
    labelsDrawn: drawn.length,
    labelsTruncated: edges.filter((e) => e.truncated).length,
    charsMedian: quantile(chars, 0.5),
    charsMax: chars.at(-1) ?? 0,
    widthMedianPx: Math.round(quantile(widths, 0.5)),
    widthMaxPx: Math.round(widths.at(-1) ?? 0),
    canvas: `${viewBox[2]}×${viewBox[3]}`,
    labelInkRatio: +(ink / (viewBox[2] * viewBox[3])).toFixed(3),
    labelNodePenetrations: countLabelPenetrations(boxes, nodeRects),
    labelLabelOverlaps: countLabelOverlaps(boxes),
    labelLinePenetrations: countLabelLinePenetrations(indexed, realLines),
    labelGhostLinePenetrations: countLabelLinePenetrations(indexed, ghostLines),
    edgesUnderForeignCard,
    bytes: svg.length,
  };
}

export interface FocusMetrics {
  /** Labels a reader sees while one node is focused: the ones drawn on its own edges. */
  labelsMedian: number;
  labelsMax: number;
  /** Collisions among those labels, their cards and their own node's lines; worst node and total. */
  collisionsWorstNode: number;
  collisionsTotal: number;
  /** Nodes whose focus view is collision-free. */
  cleanNodes: number;
  nodes: number;
}

/**
 * The node-focus tier: for each node, the labels of its incident edges (peers
 * are dimmed), measured against each other, every card, and the incident lines.
 */
export function measureFocus(svg: string): FocusMetrics {
  const { nodes, edges } = readSurface(svg);
  const nodeRects: Rect[] = nodes.map(({ x, y, width, height }) => ({ x, y, width, height }));
  const perNode = nodes.map((n) => {
    const incident = edges.map((e, index) => ({ e, index })).filter(({ e }) => e.from === n.id || e.to === n.id);
    const shown = incident.filter(({ e }) => e.drawn !== undefined);
    const boxes = shown.map(({ e }) => {
      const d = e.drawn!;
      return labelBox({ x: d.x, y: d.y + 6 }, labelWidth(d.content, d.fontSize), d.fontSize);
    });
    const lines = incident.map(({ e, index }) => edgeLine(index, e.points, 1.5));
    const collisions =
      countLabelPenetrations(boxes, nodeRects) +
      countLabelOverlaps(boxes) +
      countLabelLinePenetrations(
        boxes.map((box, k) => ({ index: shown[k].index, box })),
        lines,
      );
    return { labels: shown.length, collisions };
  });
  const labels = perNode.map((p) => p.labels).sort((a, b) => a - b);
  return {
    labelsMedian: quantile(labels, 0.5),
    labelsMax: labels.at(-1) ?? 0,
    collisionsWorstNode: Math.max(0, ...perNode.map((p) => p.collisions)),
    collisionsTotal: perNode.reduce((sum, p) => sum + p.collisions, 0),
    cleanNodes: perNode.filter((p) => p.collisions === 0).length,
    nodes: nodes.length,
  };
}
