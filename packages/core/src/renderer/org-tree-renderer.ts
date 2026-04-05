/**
 * Org Tree View renderer — left-right tree layout with Bezier connectors.
 *
 * Each top-level team is a root node. Sub-teams appear as children to the right.
 * When a team is "expanded", its members appear as a 3-column grid leaf node
 * further to the right. Multiple teams can be expanded simultaneously.
 *
 * For SVG export, pass forExport:true to render all teams fully expanded.
 */

import type { OrganizationBlock, TeamNode, MemberNode } from "../types/ast.js";
import type { ResolvedStyles, ResolvedNodeStyle, ResolvedEdgeStyle } from "../types/style.js";
import { el, escapeXml } from "./svg-builder.js";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const BG_COLOR = "#0F172A";
const TEAM_W = 180;
const TEAM_H = 64;
const MEMBER_W = 140;
const MEMBER_H = 52;
const H_GAP = 60; // horizontal gap between parent and children
const V_GAP = 16; // vertical gap between sibling nodes
const MEMBER_COL_GAP = 12;
const MEMBER_ROW_GAP = 10;
const MEMBERS_PER_ROW = 3;
const CANVAS_PADDING = 32;

// ---------------------------------------------------------------------------
// Layout types
// ---------------------------------------------------------------------------

interface TreeNode {
  team: TeamNode;
  x: number;
  y: number;
  /** Vertical span of this subtree (including children and member grid if expanded) */
  subtreeHeight: number;
  children: TreeNode[];
  /** Member grid node if team is expanded and has members */
  memberGrid: MemberGridNode | null;
}

interface MemberGridNode {
  x: number;
  y: number;
  width: number;
  height: number;
  members: MemberNode[];
}

// ---------------------------------------------------------------------------
// Subtree height calculation
// ---------------------------------------------------------------------------

function memberGridHeight(count: number): number {
  const rows = Math.ceil(count / MEMBERS_PER_ROW);
  return rows * MEMBER_H + Math.max(0, rows - 1) * MEMBER_ROW_GAP;
}

function memberGridWidth(count: number): number {
  const cols = Math.min(count, MEMBERS_PER_ROW);
  return cols * MEMBER_W + Math.max(0, cols - 1) * MEMBER_COL_GAP;
}

function calcSubtreeHeight(team: TeamNode, expandedIds: ReadonlySet<string>): number {
  const subTeams = team.children.filter((c): c is TeamNode => c.kind === "team");
  const members = team.children.filter((c): c is MemberNode => c.kind === "member");

  const isExpanded = expandedIds.has(team.id);

  let childrenBlockHeight = 0;

  if (subTeams.length > 0) {
    childrenBlockHeight = subTeams.reduce((sum, st, i) => {
      return sum + calcSubtreeHeight(st, expandedIds) + (i < subTeams.length - 1 ? V_GAP : 0);
    }, 0);
  }

  if (isExpanded && members.length > 0) {
    const mh = memberGridHeight(members.length);
    if (subTeams.length > 0) {
      childrenBlockHeight += V_GAP + mh;
    } else {
      childrenBlockHeight = mh;
    }
  }

  return Math.max(TEAM_H, childrenBlockHeight);
}

// ---------------------------------------------------------------------------
// Tree layout — assign (x, y) to each node
// ---------------------------------------------------------------------------

function layoutTree(
  team: TeamNode,
  x: number,
  topY: number,
  expandedIds: ReadonlySet<string>,
): TreeNode {
  const subtreeHeight = calcSubtreeHeight(team, expandedIds);
  const teamY = topY + (subtreeHeight - TEAM_H) / 2;

  const subTeams = team.children.filter((c): c is TeamNode => c.kind === "team");
  const members = team.children.filter((c): c is MemberNode => c.kind === "member");
  const isExpanded = expandedIds.has(team.id);

  const childX = x + TEAM_W + H_GAP;
  const children: TreeNode[] = [];
  let memberGrid: MemberGridNode | null = null;

  let curY = topY;

  for (let i = 0; i < subTeams.length; i++) {
    const child = layoutTree(subTeams[i], childX, curY, expandedIds);
    children.push(child);
    curY += child.subtreeHeight + (i < subTeams.length - 1 ? V_GAP : 0);
  }

  if (isExpanded && members.length > 0) {
    const mh = memberGridHeight(members.length);
    const mw = memberGridWidth(members.length);
    const gridY = subTeams.length > 0 ? curY + V_GAP : topY + (subtreeHeight - mh) / 2;
    memberGrid = { x: childX, y: gridY, width: mw, height: mh, members };
  }

  return { team, x, y: teamY, subtreeHeight, children, memberGrid };
}

// ---------------------------------------------------------------------------
// Bounding box of entire tree
// ---------------------------------------------------------------------------

function treeBounds(nodes: TreeNode[]): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;

  function walk(node: TreeNode) {
    maxX = Math.max(maxX, node.x + TEAM_W);
    maxY = Math.max(maxY, node.y + TEAM_H);
    if (node.memberGrid) {
      maxX = Math.max(maxX, node.memberGrid.x + node.memberGrid.width);
      maxY = Math.max(maxY, node.memberGrid.y + node.memberGrid.height);
    }
    for (const child of node.children) walk(child);
  }

  for (const root of nodes) walk(root);
  return { width: maxX, height: maxY };
}

// ---------------------------------------------------------------------------
// SVG rendering helpers
// ---------------------------------------------------------------------------

const DEFAULT_TEAM_FILL = "#1E293B";
const DEFAULT_TEAM_STROKE = "#475569";
const DEFAULT_MEMBER_FILL = "#0F172A";
const DEFAULT_MEMBER_STROKE = "#334155";
const TEXT_COLOR = "#E2E8F0";
const SUB_TEXT_COLOR = "#94A3B8";
const FONT = "system-ui, sans-serif";
const DEFAULT_EDGE_STROKE = DEFAULT_TEAM_STROKE;
const DEFAULT_EDGE_WIDTH = 1.5;

// ---------------------------------------------------------------------------
// Style resolution helpers
// ---------------------------------------------------------------------------

function resolveTeamStyle(
  teamId: string,
  styles: ResolvedStyles | undefined,
): ResolvedNodeStyle | null {
  return styles ? (styles.nodes.get(teamId) ?? styles.defaultNodeStyle) : null;
}

function resolveMemberStyle(
  memberId: string,
  styles: ResolvedStyles | undefined,
): ResolvedNodeStyle | null {
  return styles ? (styles.nodes.get(memberId) ?? styles.defaultNodeStyle) : null;
}

function resolveEdgeStyle(styles: ResolvedStyles | undefined): ResolvedEdgeStyle | null {
  return styles ? styles.defaultEdgeStyle : null;
}

function renderTreeTeamCard(
  node: TreeNode,
  isExpanded: boolean,
  styles: ResolvedStyles | undefined,
): string {
  const { team, x, y } = node;
  const label = escapeXml(team.label ?? team.id);
  const members = team.children.filter((c): c is MemberNode => c.kind === "member");
  const memberCount = members.length;
  const countLabel = memberCount > 0 ? `${memberCount} member${memberCount !== 1 ? "s" : ""}` : "";

  const s = resolveTeamStyle(team.id, styles);
  const fill = s?.backgroundColor ?? DEFAULT_TEAM_FILL;
  const stroke = s?.borderColor ?? DEFAULT_TEAM_STROKE;
  const strokeWidth = s?.borderWidth ?? 1.5;
  const rx = s?.borderRadius ?? 8;
  const textColor = s?.color ?? TEXT_COLOR;
  const fontFamily = s?.fontFamily ?? FONT;
  const fontSize = s?.fontSize ?? 13;
  const fontWeight = s?.fontWeight ?? "600";

  const parts: string[] = [
    el("rect", {
      width: TEAM_W,
      height: TEAM_H,
      fill,
      stroke,
      "stroke-width": strokeWidth,
      rx,
    }),
    el(
      "text",
      {
        x: TEAM_W / 2,
        y: memberCount > 0 ? 24 : 36,
        "text-anchor": "middle",
        fill: textColor,
        "font-family": fontFamily,
        "font-size": fontSize,
        "font-weight": fontWeight,
      },
      label,
    ),
  ];

  if (countLabel) {
    // Show expand/collapse indicator
    const indicator = isExpanded ? "▴" : "▾";
    parts.push(
      el(
        "text",
        {
          x: TEAM_W / 2,
          y: 44,
          "text-anchor": "middle",
          fill: SUB_TEXT_COLOR,
          "font-family": fontFamily,
          "font-size": 11,
        },
        `${countLabel} ${indicator}`,
      ),
    );
  }

  return el(
    "g",
    {
      transform: `translate(${x},${y})`,
      "data-team-id": escapeXml(team.id),
      style: memberCount > 0 ? "cursor: pointer" : undefined,
    },
    ...parts,
  );
}

function renderTreeMemberCard(
  member: MemberNode,
  x: number,
  y: number,
  styles: ResolvedStyles | undefined,
): string {
  const label = escapeXml(member.label ?? member.id);
  const details = [member.properties.slack, member.properties.github].filter(Boolean).join(" · ");

  const s = resolveMemberStyle(member.id, styles);
  const fill = s?.backgroundColor ?? DEFAULT_MEMBER_FILL;
  const stroke = s?.borderColor ?? DEFAULT_MEMBER_STROKE;
  const strokeWidth = s?.borderWidth ?? 1;
  const rx = s?.borderRadius ?? 6;
  const textColor = s?.color ?? TEXT_COLOR;
  const fontFamily = s?.fontFamily ?? FONT;
  const fontSize = s?.fontSize ?? 12;

  const parts: string[] = [
    el("rect", {
      width: MEMBER_W,
      height: MEMBER_H,
      fill,
      stroke,
      "stroke-width": strokeWidth,
      rx,
    }),
    el(
      "text",
      {
        x: MEMBER_W / 2,
        y: details ? 20 : 30,
        "text-anchor": "middle",
        fill: textColor,
        "font-family": fontFamily,
        "font-size": fontSize,
        "font-weight": s?.fontWeight ?? 500,
      },
      label,
    ),
  ];

  if (details) {
    parts.push(
      el(
        "text",
        {
          x: MEMBER_W / 2,
          y: 38,
          "text-anchor": "middle",
          fill: SUB_TEXT_COLOR,
          "font-family": fontFamily,
          "font-size": 10,
        },
        escapeXml(details),
      ),
    );
  }

  return el(
    "g",
    { transform: `translate(${x},${y})`, "data-node-id": escapeXml(member.id) },
    ...parts,
  );
}

function renderMemberGrid(grid: MemberGridNode, styles: ResolvedStyles | undefined): string {
  const cards = grid.members.map((member, i) => {
    const col = i % MEMBERS_PER_ROW;
    const row = Math.floor(i / MEMBERS_PER_ROW);
    const mx = grid.x + col * (MEMBER_W + MEMBER_COL_GAP);
    const my = grid.y + row * (MEMBER_H + MEMBER_ROW_GAP);
    return renderTreeMemberCard(member, mx, my, styles);
  });
  return cards.join("");
}

function bezierConnector(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  styles: ResolvedStyles | undefined,
): string {
  const e = resolveEdgeStyle(styles);
  const midX = (x1 + x2) / 2;
  return el("path", {
    d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
    fill: "none",
    stroke: e?.color ?? DEFAULT_EDGE_STROKE,
    "stroke-width": e?.strokeWidth ?? DEFAULT_EDGE_WIDTH,
  });
}

// ---------------------------------------------------------------------------
// Recursive SVG generation
// ---------------------------------------------------------------------------

function renderTreeNode(
  node: TreeNode,
  expandedIds: ReadonlySet<string>,
  elements: string[],
  styles: ResolvedStyles | undefined,
): void {
  const isExpanded = expandedIds.has(node.team.id);

  // Connectors to sub-team children
  for (const child of node.children) {
    const x1 = node.x + TEAM_W;
    const y1 = node.y + TEAM_H / 2;
    const x2 = child.x;
    const y2 = child.y + TEAM_H / 2;
    elements.push(bezierConnector(x1, y1, x2, y2, styles));
  }

  // Connector to member grid
  if (node.memberGrid) {
    const x1 = node.x + TEAM_W;
    const y1 = node.y + TEAM_H / 2;
    const x2 = node.memberGrid.x;
    const y2 = node.memberGrid.y + node.memberGrid.height / 2;
    elements.push(bezierConnector(x1, y1, x2, y2, styles));
  }

  // Team card
  elements.push(renderTreeTeamCard(node, isExpanded, styles));

  // Member grid
  if (node.memberGrid) {
    elements.push(renderMemberGrid(node.memberGrid, styles));
  }

  // Recurse into sub-teams
  for (const child of node.children) {
    renderTreeNode(child, expandedIds, elements, styles);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Collect all team IDs recursively (for forExport mode). */
export function collectAllTeamIds(organizations: OrganizationBlock[]): string[] {
  const ids: string[] = [];
  function walk(team: TeamNode) {
    ids.push(team.id);
    for (const child of team.children) {
      if (child.kind === "team") walk(child);
    }
  }
  for (const org of organizations) {
    for (const team of org.teams) walk(team);
  }
  return ids;
}

export interface RenderOrgTreeOptions {
  /** When true, strip interactive data attributes (for static SVG export). */
  forExport?: boolean;
  /**
   * Resolved styles from .krs.style files.
   * When provided, team and member cards use the resolved node styles
   * (background-color, color, border-color, etc.) instead of hardcoded defaults.
   * The `team` and `member` selectors in .krs.style apply to tree view nodes.
   */
  styles?: ResolvedStyles;
}

/**
 * Render the full org hierarchy as a left-right tree SVG.
 *
 * @param organizations - Parsed organization blocks
 * @param expandedTeamIds - Set of team IDs whose members are currently expanded
 * @param styles - Resolved node styles
 * @param options - Rendering options
 */
export function renderOrgTreeView(
  organizations: OrganizationBlock[],
  expandedTeamIds: ReadonlySet<string>,
  options: RenderOrgTreeOptions = {},
): string {
  const { styles } = options;
  // Collect all top-level teams across all organization blocks
  const allTopTeams: TeamNode[] = organizations.flatMap((org) => org.teams);

  if (allTopTeams.length === 0) {
    return el(
      "svg",
      { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 200 100", width: 200, height: 100 },
      el("rect", { width: 200, height: 100, fill: BG_COLOR }),
      el(
        "text",
        {
          x: 100,
          y: 50,
          "text-anchor": "middle",
          fill: "#9CA3AF",
          "font-family": FONT,
          "font-size": 13,
        },
        "No teams defined",
      ),
    );
  }

  // Layout each top-level team as an independent tree root, stacked vertically
  const roots: TreeNode[] = [];
  let curY = CANVAS_PADDING;
  for (let i = 0; i < allTopTeams.length; i++) {
    const root = layoutTree(allTopTeams[i], CANVAS_PADDING, curY, expandedTeamIds);
    roots.push(root);
    curY += root.subtreeHeight + (i < allTopTeams.length - 1 ? V_GAP * 3 : 0);
  }

  const bounds = treeBounds(roots);
  const totalWidth = bounds.width + CANVAS_PADDING;
  const totalHeight = curY + CANVAS_PADDING;

  const elements: string[] = [
    el("rect", { width: totalWidth, height: totalHeight, fill: BG_COLOR }),
  ];

  // Render the effective expandedIds (for export, treat all as expanded)
  const effectiveExpandedIds = options.forExport
    ? new Set(collectAllTeamIds(organizations))
    : expandedTeamIds;

  // Re-layout with effective expanded IDs (needed for forExport to show all members)
  if (options.forExport) {
    roots.length = 0;
    let exportY = CANVAS_PADDING;
    for (let i = 0; i < allTopTeams.length; i++) {
      const root = layoutTree(allTopTeams[i], CANVAS_PADDING, exportY, effectiveExpandedIds);
      roots.push(root);
      exportY += root.subtreeHeight + (i < allTopTeams.length - 1 ? V_GAP * 3 : 0);
    }
    const exportBounds = treeBounds(roots);
    const exportWidth = exportBounds.width + CANVAS_PADDING;
    const exportHeight = exportY + CANVAS_PADDING;

    const exportElements: string[] = [
      el("rect", { width: exportWidth, height: exportHeight, fill: BG_COLOR }),
    ];
    for (const root of roots) {
      renderTreeNode(root, effectiveExpandedIds, exportElements, styles);
    }

    return el(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: `0 0 ${exportWidth} ${exportHeight}`,
        width: exportWidth,
        height: exportHeight,
      },
      ...exportElements,
    );
  }

  for (const root of roots) {
    renderTreeNode(root, expandedTeamIds, elements, styles);
  }

  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${totalWidth} ${totalHeight}`,
      width: totalWidth,
      height: totalHeight,
    },
    ...elements,
  );
}
