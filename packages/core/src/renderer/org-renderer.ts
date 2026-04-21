import type { ResolvedNodeStyle, ResolvedStyles } from "../types/style.js";
import type { OrgViewSlice } from "../view/org-view-extract.js";
import type { TeamNode, MemberNode } from "../types/ast.js";
import type { DisplayMode } from "./layout.js";
import { el, escapeXml, truncateToWidth, renderIconCard, diffStateAttr } from "./svg-builder.js";
import { getIconDef } from "./shape-registry.js";
import { ownsEdgeKey } from "../diff/org-view-diff.js";
import {
  ICON_LABEL_CHAR_WIDTH,
  ICON_DESC_CHAR_WIDTH,
  ICON_DESC_MAX_WIDTH,
} from "./rendering-constants.js";

interface RenderOrgOptions {
  /** Diff state per team / member id. */
  nodeDiffState?: Map<string, string>;
  /** Diff state per `ownsEdgeKey(teamId, serviceId)`. */
  edgeDiffState?: Map<string, string>;
}

// Shape mode constants
const CARD_WIDTH = 220;
const CARD_HEIGHT = 120;
const CARD_GAP = 20;
const CARDS_PER_ROW = 3;
const PADDING = 40;
const HEADER_HEIGHT = 36;
const BG_COLOR = "#0F172A";

// Icon mode constants
const ICON_CARD_WIDTH = 160;
const ICON_TITLE_HEIGHT = 28;
const ICON_CARD_HEIGHT_SHORT = 56;
const ICON_CARD_HEIGHT_LONG = 100;
const ICON_LABEL_MAX_WIDTH = 116; // effective text budget = 116 - 7.5(ellipsis) = 108.5px

function cardStyle(style: ResolvedNodeStyle): Record<string, unknown> {
  return {
    fill: style.backgroundColor,
    stroke: style.borderColor,
    "stroke-width": style.borderWidth,
    rx: 8,
  };
}

function labelStyle(style: ResolvedNodeStyle): Record<string, unknown> {
  return {
    fill: style.color,
    "font-family": style.fontFamily,
    "font-size": style.fontSize,
    "font-weight": style.fontWeight,
    "text-anchor": "middle",
  };
}

function subLabelStyle(style: ResolvedNodeStyle): Record<string, unknown> {
  return {
    fill: style.color,
    "font-family": style.fontFamily,
    "font-size": Math.max(10, style.fontSize - 2),
    opacity: 0.75,
    "text-anchor": "middle",
  };
}

function renderPictogramGroup(iconName: string, color: string): string {
  const def = getIconDef(iconName);
  if (!def?.pictogramBody) return "";
  let body = def.pictogramBody;
  if (def.builtIn) {
    body = body.replace(/\{\{color\}\}/g, color);
  }
  return el("g", { transform: "translate(6, 4)" }, body);
}

function iconCardHeight(hasDesc: boolean): number {
  return hasDesc ? ICON_CARD_HEIGHT_LONG : ICON_CARD_HEIGHT_SHORT;
}

function iconGridLayout(heights: number[]): {
  positions: Array<{ x: number; y: number }>;
  totalWidth: number;
  totalHeight: number;
} {
  const positions: Array<{ x: number; y: number }> = [];
  const rows = Math.ceil(heights.length / CARDS_PER_ROW);
  const cols = Math.min(heights.length, CARDS_PER_ROW);

  let curY = PADDING;
  for (let r = 0; r < rows; r++) {
    const rowStart = r * CARDS_PER_ROW;
    const rowHeights = heights.slice(rowStart, rowStart + CARDS_PER_ROW);
    const rowMaxH = Math.max(...rowHeights);
    for (let c = 0; c < rowHeights.length; c++) {
      positions.push({ x: PADDING + c * (ICON_CARD_WIDTH + CARD_GAP), y: curY });
    }
    curY += rowMaxH + (r < rows - 1 ? CARD_GAP : 0);
  }

  return {
    positions,
    totalWidth: cols * ICON_CARD_WIDTH + (cols - 1) * CARD_GAP + PADDING * 2,
    totalHeight: curY + PADDING,
  };
}

function extractTeamCounts(team: TeamNode): { memberCount: number; subTeamCount: number } {
  return {
    memberCount: team.children.filter((c) => c.kind === "member").length,
    subTeamCount: team.children.filter((c) => c.kind === "team").length,
  };
}

function formatTeamCountText(memberCount: number, subTeamCount: number): string {
  return [
    memberCount > 0 ? `${memberCount} member${memberCount > 1 ? "s" : ""}` : "",
    subTeamCount > 0 ? `${subTeamCount} sub-team${subTeamCount > 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function renderOrgIconCardCommon(
  node: TeamNode | MemberNode,
  x: number,
  y: number,
  style: ResolvedNodeStyle,
  opts: {
    iconName: string;
    descText: string;
    wrapperAttrs?: Record<string, string | number | undefined | null | false>;
  },
): string {
  const cardHeight = iconCardHeight(opts.descText.length > 0);

  return renderIconCard({
    x,
    y,
    nodeId: node.id,
    wrapperAttrs: opts.wrapperAttrs,
    width: ICON_CARD_WIDTH,
    height: cardHeight,
    rectFill: style.backgroundColor,
    rectStroke: style.borderColor,
    rectStrokeWidth: style.borderWidth,
    rectRx: 8,
    pictogram: renderPictogramGroup(opts.iconName, style.color) || undefined,
    titleText: truncateToWidth(node.label ?? node.id, ICON_LABEL_MAX_WIDTH, ICON_LABEL_CHAR_WIDTH),
    titleX: 30,
    titleY: 19,
    titleAttrs: {
      fill: style.color,
      "font-family": style.fontFamily,
      "font-size": 13,
      "font-weight": style.fontWeight,
      "text-anchor": "start",
    },
    descText: opts.descText
      ? truncateToWidth(opts.descText, ICON_DESC_MAX_WIDTH, ICON_DESC_CHAR_WIDTH)
      : undefined,
    descX: 8,
    descY: ICON_TITLE_HEIGHT + 22,
    descAttrs: {
      fill: style.color,
      "font-family": style.fontFamily,
      "font-size": 11,
      opacity: 0.7,
      "text-anchor": "start",
    },
  });
}

function renderTeamCard(
  team: TeamNode,
  x: number,
  y: number,
  style: ResolvedNodeStyle,
  options?: RenderOrgOptions,
): string {
  const id = escapeXml(team.id);
  const label = escapeXml(team.label ?? team.id);
  const teamDiff = options?.nodeDiffState?.get(team.id);
  const { memberCount, subTeamCount } = extractTeamCounts(team);
  const hasChildren = team.children.length > 0;

  const countText = formatTeamCountText(memberCount, subTeamCount);

  // When overflow label (+N more) and countText both appear, cap visible owns at 2
  // so that overflow sits at y=90 and countText at y=106 with no overlap.
  const hasCountText = countText.length > 0;
  const MAX_VISIBLE_OWNS = team.properties.owns.length > 3 && hasCountText ? 2 : 3;
  const visibleOwns = team.properties.owns.slice(0, MAX_VISIBLE_OWNS);
  const ownsOverflow =
    team.properties.owns.length > MAX_VISIBLE_OWNS
      ? team.properties.owns.length - MAX_VISIBLE_OWNS
      : 0;

  const parts: string[] = [
    el("rect", { width: CARD_WIDTH, height: CARD_HEIGHT, ...cardStyle(style) }),
    el(
      "text",
      {
        x: CARD_WIDTH / 2,
        y: HEADER_HEIGHT,
        ...labelStyle(style),
      },
      label,
    ),
  ];

  visibleOwns.forEach((serviceId, i) => {
    const ownsDiff = options?.edgeDiffState?.get(ownsEdgeKey(team.id, serviceId));
    parts.push(
      el(
        "g",
        {
          "data-owned-service-button": serviceId,
          style: "cursor: pointer",
          "pointer-events": "all",
          ...diffStateAttr(ownsDiff),
        },
        el(
          "text",
          {
            x: CARD_WIDTH / 2,
            y: HEADER_HEIGHT + 22 + i * 16,
            ...subLabelStyle(style),
          },
          escapeXml(`→ ${serviceId}`),
        ),
      ),
    );
  });

  if (ownsOverflow > 0) {
    const overflowY = HEADER_HEIGHT + 22 + visibleOwns.length * 16;
    parts.push(
      el(
        "g",
        { "data-noop": "true" },
        el("rect", {
          x: 0,
          y: overflowY - 12,
          width: CARD_WIDTH,
          height: 16,
          fill: "transparent",
          "pointer-events": "all",
        }),
        el(
          "text",
          {
            x: CARD_WIDTH / 2,
            y: overflowY,
            ...subLabelStyle(style),
            "pointer-events": "none",
          },
          escapeXml(`+${ownsOverflow} more`),
        ),
      ),
    );
  }

  if (countText) {
    parts.push(
      el(
        "text",
        {
          x: CARD_WIDTH / 2,
          y: CARD_HEIGHT - 14,
          ...subLabelStyle(style),
        },
        escapeXml(countText),
      ),
    );
  }

  return el(
    "g",
    {
      transform: `translate(${x},${y})`,
      "data-node-id": id,
      ...(hasChildren ? { "data-has-children": "true" } : {}),
      ...diffStateAttr(teamDiff),
      style: "cursor: pointer",
    },
    ...parts,
  );
}

function renderMemberCard(
  member: MemberNode,
  x: number,
  y: number,
  style: ResolvedNodeStyle,
  options?: RenderOrgOptions,
): string {
  const id = escapeXml(member.id);
  const label = escapeXml(member.label ?? member.id);

  const details = [member.properties.slack, member.properties.github].filter(Boolean).join(" · ");

  const parts: string[] = [
    el("rect", { width: CARD_WIDTH, height: CARD_HEIGHT, ...cardStyle(style) }),
    el(
      "text",
      {
        x: CARD_WIDTH / 2,
        y: HEADER_HEIGHT,
        ...labelStyle(style),
      },
      label,
    ),
  ];

  if (details) {
    parts.push(
      el(
        "text",
        {
          x: CARD_WIDTH / 2,
          y: HEADER_HEIGHT + 22,
          ...subLabelStyle(style),
        },
        escapeXml(details),
      ),
    );
  }

  if (member.properties.description) {
    const desc = member.properties.description.slice(0, 40);
    parts.push(
      el(
        "text",
        {
          x: CARD_WIDTH / 2,
          y: CARD_HEIGHT - 14,
          ...subLabelStyle(style),
        },
        escapeXml(desc),
      ),
    );
  }

  const memberDiff = options?.nodeDiffState?.get(member.id);
  return el(
    "g",
    { transform: `translate(${x},${y})`, "data-node-id": id, ...diffStateAttr(memberDiff) },
    ...parts,
  );
}

function renderTeamIconCard(
  team: TeamNode,
  x: number,
  y: number,
  style: ResolvedNodeStyle,
  options?: RenderOrgOptions,
): string {
  const { memberCount, subTeamCount } = extractTeamCounts(team);
  const hasChildren = team.children.length > 0;
  const descText = formatTeamCountText(memberCount, subTeamCount);

  const teamDiff = options?.nodeDiffState?.get(team.id);
  return renderOrgIconCardCommon(team, x, y, style, {
    iconName: "team",
    descText,
    wrapperAttrs: {
      ...(hasChildren ? { "data-has-children": "true" } : {}),
      ...diffStateAttr(teamDiff),
      style: "cursor: pointer",
    },
  });
}

function renderMemberIconCard(
  member: MemberNode,
  x: number,
  y: number,
  style: ResolvedNodeStyle,
  options?: RenderOrgOptions,
): string {
  const details = [member.properties.slack, member.properties.github].filter(Boolean).join(" · ");
  const descText =
    details ||
    truncateToWidth(member.properties.description ?? "", ICON_DESC_MAX_WIDTH, ICON_DESC_CHAR_WIDTH);

  const memberDiff = options?.nodeDiffState?.get(member.id);
  return renderOrgIconCardCommon(member, x, y, style, {
    iconName: "member",
    descText,
    wrapperAttrs: diffStateAttr(memberDiff),
  });
}

function gridLayout(count: number): { totalWidth: number; totalHeight: number } {
  const cols = Math.min(count, CARDS_PER_ROW);
  const rows = Math.ceil(count / CARDS_PER_ROW);
  return {
    totalWidth: cols * CARD_WIDTH + (cols - 1) * CARD_GAP + PADDING * 2,
    totalHeight: rows * CARD_HEIGHT + (rows - 1) * CARD_GAP + PADDING * 2,
  };
}

function cardPos(index: number): { x: number; y: number } {
  const col = index % CARDS_PER_ROW;
  const row = Math.floor(index / CARDS_PER_ROW);
  return {
    x: PADDING + col * (CARD_WIDTH + CARD_GAP),
    y: PADDING + row * (CARD_HEIGHT + CARD_GAP),
  };
}

type OrgIconItem =
  | { type: "team"; node: TeamNode; style: ResolvedNodeStyle; height: number }
  | { type: "member"; node: MemberNode; style: ResolvedNodeStyle; height: number };

function renderOrgViewIconMode(
  slice: OrgViewSlice,
  styles: ResolvedStyles,
  childLevelLinks?: Map<string, string>,
  options?: RenderOrgOptions,
): string {
  if (slice.focusedTeam === null) {
    const teams = slice.teams;

    if (teams.length === 0) {
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
            "font-family": "sans-serif",
          },
          "No teams defined",
        ),
      );
    }

    const items: OrgIconItem[] = teams.map((team) => {
      const style = styles.nodes.get(team.id) ?? styles.defaultNodeStyle;
      const hasDesc = team.children.length > 0;
      return { type: "team", node: team, style, height: iconCardHeight(hasDesc) };
    });

    const { positions, totalWidth, totalHeight } = iconGridLayout(items.map((i) => i.height));
    const cards = items.map((item, i) => {
      if (item.type === "team") {
        const card = renderTeamIconCard(
          item.node,
          positions[i].x,
          positions[i].y,
          item.style,
          options,
        );
        const linkId = childLevelLinks?.get(item.node.id);
        return linkId ? el("a", { href: `#${linkId}` }, card) : card;
      }
      return renderMemberIconCard(item.node, positions[i].x, positions[i].y, item.style, options);
    });

    return el(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: `0 0 ${totalWidth} ${totalHeight}`,
        width: totalWidth,
        height: totalHeight,
      },
      el("rect", { width: totalWidth, height: totalHeight, fill: BG_COLOR }),
      ...cards,
    );
  }

  // Drill-down: show members + sub-teams of focusedTeam
  const focused = slice.focusedTeam;

  const items: OrgIconItem[] = focused.children.map((child): OrgIconItem => {
    if (child.kind === "member") {
      const style = styles.nodes.get(child.id) ?? styles.defaultNodeStyle;
      const details = [child.properties.slack, child.properties.github].filter(Boolean).join(" · ");
      const hasDesc = !!(details || child.properties.description);
      return { type: "member", node: child, style, height: iconCardHeight(hasDesc) };
    }
    const style = styles.nodes.get(child.id) ?? styles.defaultNodeStyle;
    const hasDesc = child.children.length > 0;
    return { type: "team", node: child, style, height: iconCardHeight(hasDesc) };
  });

  if (items.length === 0) {
    const totalWidth = ICON_CARD_WIDTH + PADDING * 2;
    const totalHeight = 100;
    return el(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: `0 0 ${totalWidth} ${totalHeight}`,
        width: totalWidth,
        height: totalHeight,
      },
      el("rect", { width: totalWidth, height: totalHeight, fill: BG_COLOR }),
      el(
        "text",
        {
          x: totalWidth / 2,
          y: 50,
          "text-anchor": "middle",
          fill: "#9CA3AF",
          "font-family": "sans-serif",
        },
        "No members",
      ),
    );
  }

  const { positions, totalWidth, totalHeight } = iconGridLayout(items.map((i) => i.height));
  const cards = items.map((item, i) => {
    if (item.type === "member") {
      return renderMemberIconCard(item.node, positions[i].x, positions[i].y, item.style, options);
    }
    const card = renderTeamIconCard(item.node, positions[i].x, positions[i].y, item.style, options);
    const linkId = childLevelLinks?.get(item.node.id);
    return linkId ? el("a", { href: `#${linkId}` }, card) : card;
  });

  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${totalWidth} ${totalHeight}`,
      width: totalWidth,
      height: totalHeight,
    },
    el("rect", { width: totalWidth, height: totalHeight, fill: BG_COLOR }),
    ...cards,
  );
}

export function renderOrgView(
  slice: OrgViewSlice,
  styles: ResolvedStyles,
  displayMode?: DisplayMode,
  childLevelLinks?: Map<string, string>,
  options?: RenderOrgOptions,
): string {
  if (displayMode === "icon") {
    return renderOrgViewIconMode(slice, styles, childLevelLinks, options);
  }

  if (slice.focusedTeam === null) {
    // Top-level: show all teams
    const teams = slice.teams;

    if (teams.length === 0) {
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
            "font-family": "sans-serif",
          },
          "No teams defined",
        ),
      );
    }

    const { totalWidth, totalHeight } = gridLayout(teams.length);
    const cards = teams.map((team, i) => {
      const style = styles.nodes.get(team.id) ?? styles.defaultNodeStyle;
      const { x, y } = cardPos(i);
      const card = renderTeamCard(team, x, y, style, options);
      const linkId = childLevelLinks?.get(team.id);
      return linkId ? el("a", { href: `#${linkId}` }, card) : card;
    });

    return el(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: `0 0 ${totalWidth} ${totalHeight}`,
        width: totalWidth,
        height: totalHeight,
      },
      el("rect", { width: totalWidth, height: totalHeight, fill: BG_COLOR }),
      ...cards,
    );
  }

  // Drill-down: show members + sub-teams of focusedTeam
  const focused = slice.focusedTeam;
  const items: Array<{ id: string; render: (x: number, y: number) => string }> =
    focused.children.map((child) => {
      if (child.kind === "member") {
        return {
          id: child.id,
          render: (x: number, y: number) =>
            renderMemberCard(
              child,
              x,
              y,
              styles.nodes.get(child.id) ?? styles.defaultNodeStyle,
              options,
            ),
        };
      }
      return {
        id: child.id,
        render: (x: number, y: number) => {
          const card = renderTeamCard(
            child,
            x,
            y,
            styles.nodes.get(child.id) ?? styles.defaultNodeStyle,
            options,
          );
          const linkId = childLevelLinks?.get(child.id);
          return linkId ? el("a", { href: `#${linkId}` }, card) : card;
        },
      };
    });

  if (items.length === 0) {
    const totalWidth = CARD_WIDTH + PADDING * 2;
    const totalHeight = 100;
    return el(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: `0 0 ${totalWidth} ${totalHeight}`,
        width: totalWidth,
        height: totalHeight,
      },
      el("rect", { width: totalWidth, height: totalHeight, fill: BG_COLOR }),
      el(
        "text",
        {
          x: totalWidth / 2,
          y: 50,
          "text-anchor": "middle",
          fill: "#9CA3AF",
          "font-family": "sans-serif",
        },
        "No members",
      ),
    );
  }

  const { totalWidth, totalHeight } = gridLayout(items.length);
  const renderedItems = items.map((item, i) => {
    const { x, y } = cardPos(i);
    return item.render(x, y);
  });

  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${totalWidth} ${totalHeight}`,
      width: totalWidth,
      height: totalHeight,
    },
    el("rect", { width: totalWidth, height: totalHeight, fill: BG_COLOR }),
    ...renderedItems,
  );
}
