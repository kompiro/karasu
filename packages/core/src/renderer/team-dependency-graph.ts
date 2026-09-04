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
// Nothing here decides anything about the graph it draws. Karasu observes
// cycles without judging them (`docs/concepts.md`), and the organizational
// projection of a cycle is a pair of teams that depend on each other — which
// this draws as two edges and leaves at that.
// ---------------------------------------------------------------------------

import type { TeamDependency, TeamDependencyReport } from "../view/team-dependency-extract.js";
import { el, escapeXml, truncateToWidth, DY_CENTER } from "./svg-builder.js";
import { DEFAULT_EMPTY_STATE_LABELS, type EmptyStateLabels } from "./empty-state-labels.js";
import { type DiagramPalette, type DiagramTheme, resolvePalette } from "./palette.js";

export interface TeamDependencyGraphOptions {
  theme?: DiagramTheme;
  emptyStateLabels?: EmptyStateLabels;
}

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const NODE_W = 168;
const NODE_H = 52;
const H_GAP = 88;
const V_GAP = 24;
const PADDING = 32;
const FOOTER_LINE_H = 18;
const CHAR_W = 6.6;

/** Marker id, namespaced so the SVG can be inlined beside other diagrams. */
const ARROW_SYNC = "krs-teamdep-arrow";
const ARROW_MUTED = "krs-teamdep-arrow-muted";

interface Placed {
  id: string;
  label: string;
  x: number;
  y: number;
}

/**
 * Layer each team by the longest dependency chain reaching it.
 *
 * Relaxation rather than a topological sort, because the graph can be cyclic
 * and a sort would have to reject or arbitrarily cut one. Capping each layer at
 * `teams.length - 1` is what makes a cycle terminate: the members of a cycle
 * push each other rightward until they hit the cap, which lands them in
 * adjacent columns with one edge routed backwards — visibly a cycle, and drawn
 * rather than dropped.
 */
function assignLayers(
  teamIds: readonly string[],
  deps: readonly TeamDependency[],
): Map<string, number> {
  const layer = new Map<string, number>(teamIds.map((id) => [id, 0]));
  const cap = Math.max(0, teamIds.length - 1);
  for (let round = 0; round <= teamIds.length; round++) {
    let changed = false;
    for (const dep of deps) {
      const from = layer.get(dep.fromTeam);
      const to = layer.get(dep.toTeam);
      if (from === undefined || to === undefined) continue;
      const want = Math.min(from + 1, cap);
      if (want > to) {
        layer.set(dep.toTeam, want);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layer;
}

function placeTeams(report: TeamDependencyReport): {
  placed: Placed[];
  width: number;
  height: number;
} {
  const ids = report.teams.map((t) => t.id);
  const layer = assignLayers(ids, report.dependencies);

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

  const width =
    PADDING * 2 +
    (layerIndices.length > 0 ? layerIndices[layerIndices.length - 1] : 0) * (NODE_W + H_GAP) +
    NODE_W;
  const height = PADDING * 2 + tallest * NODE_H + Math.max(0, tallest - 1) * V_GAP;
  return { placed, width, height };
}

function edgePath(from: Placed, to: Placed): string {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  if (x2 >= x1) {
    const dx = Math.max(32, (x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }
  // A backwards edge (a cycle, or a dependency onto an earlier column) leaves
  // and arrives on the same sides, so it needs a detour wide enough not to be
  // read as a straight line through the cards in between.
  const bulge = 56;
  return `M ${x1} ${y1} C ${x1 + bulge} ${y1 - bulge}, ${x2 - bulge} ${y2 - bulge}, ${x2} ${y2}`;
}

function emptySvg(palette: DiagramPalette, message: string): string {
  return el(
    "svg",
    { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 320 100", width: 320, height: 100 },
    el("rect", { width: 320, height: 100, fill: palette.canvasBg }),
    el(
      "text",
      {
        x: 160,
        y: 50,
        "text-anchor": "middle",
        fill: palette.emptyStateText,
        "font-family": FONT,
        "font-size": 13,
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
 * the org tree draws.
 *
 * The unowned remainder is written into the footer rather than left out. The
 * derivation is only as complete as `owns`, and a graph that quietly omitted
 * the endpoints it could not resolve would present a partial join as the whole
 * model (TPL-2075).
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

  const { placed, width, height } = placeTeams(report);
  const byId = new Map(placed.map((p) => [p.id, p]));

  const footer: string[] = [];
  if (report.dependencies.length === 0) {
    footer.push(labels.teamDependencyNone ?? DEFAULT_EMPTY_STATE_LABELS.teamDependencyNone);
  }
  if (report.unowned.length > 0) {
    const template =
      labels.teamDependencyUnowned ?? DEFAULT_EMPTY_STATE_LABELS.teamDependencyUnowned;
    footer.push(template.replace("{count}", String(report.unowned.length)));
  }

  const totalHeight =
    height + (footer.length > 0 ? footer.length * FOOTER_LINE_H + PADDING / 2 : 0);

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

  const edges = report.dependencies.flatMap((dep) => {
    const from = byId.get(dep.fromTeam);
    const to = byId.get(dep.toTeam);
    // A dependency naming a team the org no longer declares cannot be placed;
    // it also cannot happen, since both come from the same report.
    if (!from || !to) return [];
    const muted = dep.relation === "nested";
    const stroke = muted ? palette.textSubtle : palette.textPrimary;
    const midX = (from.x + NODE_W + to.x) / 2;
    const midY = (from.y + to.y) / 2 + NODE_H / 2;
    return [
      el(
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
          d: edgePath(from, to),
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
                x: midX,
                y: midY - 8,
                "text-anchor": "middle",
                fill: palette.textSubtle,
                "font-family": FONT,
                "font-size": 10,
              },
              String(dep.via.length),
            )
          : "",
      ),
    ];
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
          "font-size": 13,
        },
        escapeXml(truncateToWidth(p.label, NODE_W - 20, CHAR_W)),
      ),
    ),
  );

  const footerText = footer.map((line, i) =>
    el(
      "text",
      {
        x: PADDING,
        y: height + PADDING / 4 + i * FOOTER_LINE_H,
        dy: DY_CENTER,
        fill: palette.textSubtle,
        "font-family": FONT,
        "font-size": 11,
      },
      escapeXml(line),
    ),
  );

  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${width} ${totalHeight}`,
      width,
      height: totalHeight,
      "data-view": "team-dependencies",
    },
    el("rect", { width, height: totalHeight, fill: palette.canvasBg }),
    defs,
    ...edges,
    ...nodes,
    ...footerText,
  );
}
