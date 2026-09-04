// ---------------------------------------------------------------------------
// Team dependency graph renderer (#2597 slice B / #2636).
//
// The visual surface for the derivation slice A built. It is new drawing code
// rather than a reuse of `org-tree-renderer.ts` because the two draw different
// shapes: the org tree is a tree (one parent per node, no back edges), while
// derived dependencies form a general directed graph that may well be cyclic —
// a mutual dependency between two teams is a fact worth seeing, not an error
// to reject.
//
// Cycles are therefore the load-bearing case, not the edge case, and they are
// what the layering has to be built around: `longestPathLayers` in
// `group-layout.ts` leans on bounded relaxation, which is fine where a stray
// extra column costs nothing, but here every column is drawn and an empty one
// is visible. So this DAG-ifies first (drop back edges), lays out the DAG, and
// draws the dropped edges as explicit return curves.
//
// Nothing here decides anything about the graph it draws. Karasu observes
// cycles without judging them (`docs/concepts.md`), and the organizational
// projection of a cycle is a pair of teams that depend on each other — which
// this draws as two arcs and leaves at that.
// ---------------------------------------------------------------------------

import type { TeamDependency, TeamDependencyReport } from "../view/team-dependency-extract.js";
import { el, escapeXml, truncateToWidth, DY_CENTER } from "./svg-builder.js";
import { DEFAULT_EMPTY_STATE_LABELS, type EmptyStateLabels } from "./empty-state-labels.js";
import { type DiagramPalette, type DiagramTheme, resolvePalette } from "./palette.js";
import {
  CHROME_FONT_STACK,
  ICON_LABEL_CHAR_WIDTH,
  ICON_LABEL_CJK_WIDTH,
  charDisplayWidth,
} from "./rendering-constants.js";

export interface TeamDependencyGraphOptions {
  theme?: DiagramTheme;
  emptyStateLabels?: EmptyStateLabels;
}

const FONT = CHROME_FONT_STACK;
const NODE_W = 168;
const NODE_H = 52;
const H_GAP = 88;
const V_GAP = 24;
const PADDING = 32;
const FOOTER_LINE_H = 18;
const FOOTER_FONT_SIZE = 11;
const LABEL_FONT_SIZE = 13;
/** Perpendicular separation between two edges that share one team pair. */
const EDGE_FAN = 14;

/** Marker id, namespaced so the SVG can be inlined beside other diagrams. */
const ARROW_SYNC = "krs-teamdep-arrow";
const ARROW_MUTED = "krs-teamdep-arrow-muted";

interface Placed {
  id: string;
  label: string;
  x: number;
  y: number;
}

/** Width of `text` at `fontSize`, using the shared glyph heuristic. */
function textWidth(text: string, fontSize: number): number {
  const base = ICON_LABEL_CHAR_WIDTH * (fontSize / LABEL_FONT_SIZE);
  const cjk = ICON_LABEL_CJK_WIDTH * (fontSize / LABEL_FONT_SIZE);
  let width = 0;
  for (const ch of text) width += charDisplayWidth(ch, base, cjk);
  return Math.ceil(width);
}

/**
 * Edges whose target already sits on the DFS stack — the ones that close a
 * cycle. Removing them leaves a DAG that can be layered without a cap.
 *
 * Which edge of a cycle gets called the back edge depends on where the walk
 * starts, so the teams are visited in declaration order: the answer is then a
 * function of the model rather than of `Map` iteration order.
 */
function findBackEdges(
  teamIds: readonly string[],
  deps: readonly TeamDependency[],
): ReadonlySet<TeamDependency> {
  const outgoing = new Map<string, TeamDependency[]>();
  for (const dep of deps) {
    const list = outgoing.get(dep.fromTeam);
    if (list === undefined) outgoing.set(dep.fromTeam, [dep]);
    else list.push(dep);
  }

  const back = new Set<TeamDependency>();
  const done = new Set<string>();
  const onStack = new Set<string>();

  const visit = (id: string): void => {
    onStack.add(id);
    for (const dep of outgoing.get(id) ?? []) {
      if (onStack.has(dep.toTeam)) {
        back.add(dep);
        continue;
      }
      if (!done.has(dep.toTeam)) visit(dep.toTeam);
    }
    onStack.delete(id);
    done.add(id);
  };
  for (const id of teamIds) if (!done.has(id)) visit(id);
  return back;
}

/**
 * Longest-path layering over the DAG that remains once back edges are removed,
 * with the occupied layers compacted to consecutive indices.
 *
 * Compaction is what keeps the canvas honest: layer numbers come out of a
 * relaxation that can skip values, and an unused index would be drawn as a
 * column of blank canvas the reader has to account for.
 */
function assignLayers(
  teamIds: readonly string[],
  deps: readonly TeamDependency[],
  backEdges: ReadonlySet<TeamDependency>,
): Map<string, number> {
  const layer = new Map<string, number>(teamIds.map((id) => [id, 0]));
  const forward = deps.filter((d) => !backEdges.has(d));
  for (let round = 0; round <= teamIds.length; round++) {
    let changed = false;
    for (const dep of forward) {
      const from = layer.get(dep.fromTeam);
      const to = layer.get(dep.toTeam);
      if (from === undefined || to === undefined) continue;
      if (from + 1 > to) {
        layer.set(dep.toTeam, from + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const used = [...new Set(layer.values())].sort((a, b) => a - b);
  const compact = new Map(used.map((value, index) => [value, index]));
  for (const [id, value] of layer) layer.set(id, compact.get(value) ?? 0);
  return layer;
}

interface Layout {
  placed: Placed[];
  gridWidth: number;
  gridHeight: number;
}

function placeTeams(report: TeamDependencyReport, backEdges: ReadonlySet<TeamDependency>): Layout {
  const ids = report.teams.map((t) => t.id);
  const layer = assignLayers(ids, report.dependencies, backEdges);

  const columns = new Map<number, string[]>();
  // Declaration order inside a column, so the graph and the org tree list the
  // same teams in the same order.
  for (const team of report.teams) {
    const l = layer.get(team.id) ?? 0;
    const column = columns.get(l);
    if (column === undefined) columns.set(l, [team.id]);
    else column.push(team.id);
  }

  const labelOf = new Map(report.teams.map((t) => [t.id, t.label ?? t.id]));
  const placed: Placed[] = [];
  const layerIndices = [...columns.keys()].sort((a, b) => a - b);
  const tallest = Math.max(1, ...[...columns.values()].map((c) => c.length));

  for (const l of layerIndices) {
    const column = columns.get(l)!;
    const x = PADDING + l * (NODE_W + H_GAP);
    // Columns are centred against the tallest one so short columns do not all
    // hug the top edge, which reads as an accidental alignment.
    const offset = ((tallest - column.length) * (NODE_H + V_GAP)) / 2;
    column.forEach((id, i) => {
      placed.push({
        id,
        label: labelOf.get(id) ?? id,
        x,
        y: PADDING + offset + i * (NODE_H + V_GAP),
      });
    });
  }

  const lastLayer = layerIndices.length > 0 ? layerIndices[layerIndices.length - 1] : 0;
  return {
    placed,
    gridWidth: PADDING * 2 + lastLayer * (NODE_W + H_GAP) + NODE_W,
    gridHeight: PADDING * 2 + tallest * NODE_H + Math.max(0, tallest - 1) * V_GAP,
  };
}

/**
 * A cubic Bézier, kept as points so the midpoint can be computed for the label
 * and so the canvas can be sized around the curve.
 *
 * `points` is every control point: a cubic lies inside their convex hull, so
 * their extent is a safe (if slightly generous) bound on where the curve goes.
 */
interface Curve {
  d: string;
  midX: number;
  midY: number;
  points: readonly { x: number; y: number }[];
}

function cubic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): Curve {
  return {
    d: `M ${x0} ${y0} C ${x1} ${y1}, ${x2} ${y2}, ${x3} ${y3}`,
    // De Casteljau at t = 0.5, so a count label sits on the line it belongs to
    // rather than on the straight line between the endpoints.
    midX: (x0 + 3 * x1 + 3 * x2 + x3) / 8,
    midY: (y0 + 3 * y1 + 3 * y2 + y3) / 8,
    points: [
      { x: x0, y: y0 },
      { x: x1, y: y1 },
      { x: x2, y: y2 },
      { x: x3, y: y3 },
    ],
  };
}

/**
 * Route one edge, fanned by `rank` so edges sharing a team pair stay apart.
 *
 * Three routes, chosen by how far apart the two columns are. The rule behind
 * all of them is one thing: **a curve must never cross a card**. Cards are
 * opaque and painted after the edges, so a line that runs under one is not
 * merely ugly — that stretch of it is invisible, and the reader sees two short
 * arrows where there is really one long dependency.
 *
 * - **Adjacent** (nothing in between): side to side, the reading direction.
 * - **Skip-level** (at least one column in between): out of the bottom and
 *   back up into the bottom, dipping below the row it would otherwise cross.
 * - **Back edge** (a cycle, or a dependency onto an earlier column): the same
 *   detour above the row. Above and below are used for opposite directions so
 *   the two cases stay distinguishable at a glance.
 */
function edgeCurve(from: Placed, to: Placed, rank: number): Curve {
  const fan = rank * EDGE_FAN;
  const gap = to.x - (from.x + NODE_W);
  if (gap >= 0 && gap <= H_GAP) {
    const x0 = from.x + NODE_W;
    const y0 = from.y + NODE_H / 2 + fan;
    const x3 = to.x;
    const y3 = to.y + NODE_H / 2 + fan;
    const dx = Math.max(32, (x3 - x0) / 2);
    return cubic(x0, y0, x0 + dx, y0, x3 - dx, y3, x3, y3);
  }

  const forward = gap > H_GAP;
  const x0 = from.x + NODE_W / 2;
  const x3 = to.x + NODE_W / 2;
  const detour = NODE_H + V_GAP + fan;
  if (forward) {
    const y0 = from.y + NODE_H;
    const y3 = to.y + NODE_H;
    return cubic(x0, y0, x0, y0 + detour, x3, y3 + detour, x3, y3);
  }
  const y0 = from.y;
  const y3 = to.y;
  return cubic(x0, y0, x0, y0 - detour, x3, y3 - detour, x3, y3);
}

function emptySvg(palette: DiagramPalette, message: string): string {
  const width = Math.max(320, PADDING * 2 + textWidth(message, LABEL_FONT_SIZE));
  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${width} 100`,
      width,
      height: 100,
      "data-view": "team-dependencies",
    },
    el("rect", { width, height: 100, fill: palette.canvasBg }),
    el(
      "text",
      {
        x: width / 2,
        y: 50,
        "text-anchor": "middle",
        fill: palette.emptyStateText,
        "font-family": FONT,
        "font-size": LABEL_FONT_SIZE,
      },
      escapeXml(message),
    ),
  );
}

/**
 * Render the derived team dependencies as a directed graph.
 *
 * `sync` is drawn solid and `async` dashed, the distinction slice A refuses to
 * fold (an async dependency is deliberate loose coupling). A `nested` pair —
 * one team inside the other in the org tree — keeps its arrow but is muted,
 * because the coordination it implies is already covered by the reporting line
 * the org tree draws. A pair coupled both ways gets two curves, fanned apart:
 * drawn on one path the solid stroke would hide the dashed one and the very
 * distinction this view exists to show would be invisible.
 *
 * The unowned remainder and the structural-overlap count are written into the
 * footer rather than left out. The derivation is only as complete as `owns`,
 * and a graph that quietly omitted the endpoints it could not resolve would
 * present a partial join as the whole model (TPL-2075).
 */
export function renderTeamDependencyGraph(
  report: TeamDependencyReport,
  options: TeamDependencyGraphOptions = {},
): string {
  const palette = resolvePalette(options.theme);
  const labels = { ...DEFAULT_EMPTY_STATE_LABELS, ...options.emptyStateLabels };

  if (report.teams.length === 0) {
    return emptySvg(palette, labels.orgNoTeams);
  }

  const backEdges = findBackEdges(
    report.teams.map((t) => t.id),
    report.dependencies,
  );
  const { placed, gridWidth, gridHeight } = placeTeams(report, backEdges);
  const byId = new Map(placed.map((p) => [p.id, p]));

  // Geometry before markup: a detour route leaves the node grid, so the canvas
  // has to be sized around the curves rather than around the cards alone. A
  // viewBox that covers only the grid clips the detour, and the reader is left
  // with two dangling fragments and no way to tell which teams they joined.
  //
  // Rank within a team pair, so `sync` and `async` between the same two teams
  // are fanned onto separate curves instead of one hiding the other.
  const rankOfPair = new Map<string, number>();
  const routed = report.dependencies.flatMap((dep) => {
    const from = byId.get(dep.fromTeam);
    const to = byId.get(dep.toTeam);
    // A dependency naming a team the org no longer declares cannot be placed;
    // it also cannot happen, since both come from the same report.
    if (!from || !to) return [];
    const pair = JSON.stringify([dep.fromTeam, dep.toTeam]);
    const rank = rankOfPair.get(pair) ?? 0;
    rankOfPair.set(pair, rank + 1);
    return [{ dep, curve: edgeCurve(from, to, rank) }];
  });

  const footer: string[] = [];
  if (report.dependencies.length === 0) {
    footer.push(labels.teamDependencyNone ?? DEFAULT_EMPTY_STATE_LABELS.teamDependencyNone);
  }
  if (report.unowned.length > 0) {
    const template =
      labels.teamDependencyUnowned ?? DEFAULT_EMPTY_STATE_LABELS.teamDependencyUnowned;
    footer.push(template.replace("{count}", String(report.unowned.length)));
  }
  // Structural overlap is a containment fact, so there is no line on this
  // canvas that could carry it. Counting it in the footer is the honest
  // minimum: the graph says what it is not showing instead of leaving the
  // stronger inverse-Conway signal invisible here (#2637).
  if (report.overlaps.length > 0) {
    const template =
      labels.teamDependencyOverlap ?? DEFAULT_EMPTY_STATE_LABELS.teamDependencyOverlap;
    footer.push(template.replace("{count}", String(report.overlaps.length)));
  }

  let minX = 0;
  let minY = 0;
  let maxX = gridWidth;
  let maxY = gridHeight;
  for (const { curve } of routed) {
    for (const point of curve.points) {
      minX = Math.min(minX, point.x - PADDING);
      minY = Math.min(minY, point.y - PADDING);
      maxX = Math.max(maxX, point.x + PADDING);
      maxY = Math.max(maxY, point.y + PADDING);
    }
  }

  // The footer sits under everything drawn, detours included, and the canvas is
  // wide enough for it: it is localized, so it can outrun a narrow grid — most
  // obviously in the no-dependency case, which is both the narrowest grid and
  // the one that always has a footer.
  const footerTop = maxY;
  for (const line of footer) {
    maxX = Math.max(maxX, minX + PADDING * 2 + textWidth(line, FOOTER_FONT_SIZE));
  }
  if (footer.length > 0) maxY = footerTop + footer.length * FOOTER_LINE_H + PADDING / 2;

  const width = maxX - minX;
  const height = maxY - minY;

  const defs = el(
    "defs",
    {},
    ...[
      { id: ARROW_SYNC, fill: palette.textPrimary },
      { id: ARROW_MUTED, fill: palette.textSubtle },
    ].map((m) =>
      el(
        "marker",
        {
          id: m.id,
          viewBox: "0 0 10 10",
          refX: 9,
          refY: 5,
          markerWidth: 7,
          markerHeight: 7,
          orient: "auto-start-reverse",
        },
        el("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: m.fill }),
      ),
    ),
  );

  const edges = routed.map(({ dep, curve }) => {
    const muted = dep.relation === "nested";
    const stroke = muted ? palette.textSubtle : palette.textPrimary;
    return el(
      "g",
      {
        // Two attributes rather than one `a->b` string: an arrow in an
        // attribute value is XML-escaped, so a selector would have to match
        // `-&gt;` and every reader would have to know that.
        "data-team-from": dep.fromTeam,
        "data-team-to": dep.toTeam,
        "data-edge-kind": dep.kind,
        "data-relation": dep.relation,
      },
      el("path", {
        d: curve.d,
        fill: "none",
        stroke,
        "stroke-width": muted ? 1 : 1.5,
        "stroke-dasharray": dep.kind === "async" ? "6 4" : undefined,
        "marker-end": `url(#${muted ? ARROW_MUTED : ARROW_SYNC})`,
      }),
      // The inducing-edge count is the one number worth putting on the line:
      // it says how much of the model stands behind this pair without
      // ranking the pairs against each other.
      dep.via.length > 1
        ? el(
            "text",
            {
              x: curve.midX,
              y: curve.midY - 6,
              "text-anchor": "middle",
              fill: palette.textSubtle,
              "font-family": FONT,
              "font-size": 10,
            },
            String(dep.via.length),
          )
        : "",
    );
  });

  const nodes = placed.map((p) =>
    el(
      "g",
      { "data-team-node": p.id },
      el("rect", {
        x: p.x,
        y: p.y,
        width: NODE_W,
        height: NODE_H,
        rx: 8,
        fill: palette.surfaceBg,
        stroke: palette.mutedBorder,
        "stroke-width": 1,
      }),
      el(
        "text",
        {
          x: p.x + NODE_W / 2,
          y: p.y + NODE_H / 2,
          dy: DY_CENTER,
          "text-anchor": "middle",
          fill: palette.textPrimary,
          "font-family": FONT,
          "font-size": LABEL_FONT_SIZE,
        },
        escapeXml(
          truncateToWidth(p.label, NODE_W - 20, ICON_LABEL_CHAR_WIDTH, ICON_LABEL_CJK_WIDTH),
        ),
      ),
    ),
  );

  const footerText = footer.map((line, i) =>
    el(
      "text",
      {
        x: minX + PADDING,
        y: footerTop + PADDING / 4 + i * FOOTER_LINE_H,
        dy: DY_CENTER,
        fill: palette.textSubtle,
        "font-family": FONT,
        "font-size": FOOTER_FONT_SIZE,
      },
      escapeXml(line),
    ),
  );

  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `${minX} ${minY} ${width} ${height}`,
      width,
      height,
      "data-view": "team-dependencies",
    },
    el("rect", { x: minX, y: minY, width, height, fill: palette.canvasBg }),
    defs,
    ...edges,
    ...nodes,
    ...footerText,
  );
}
