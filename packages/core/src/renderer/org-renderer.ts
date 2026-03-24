import type { ResolvedNodeStyle } from "../types/style.js";
import type { OrgViewSlice } from "../view/org-view-extract.js";
import type { TeamNode, MemberNode } from "../types/ast.js";
import { el, escapeXml } from "./svg-builder.js";

const CARD_WIDTH = 220;
const CARD_HEIGHT = 120;
const CARD_GAP = 20;
const CARDS_PER_ROW = 3;
const PADDING = 40;
const HEADER_HEIGHT = 36;
const BG_COLOR = "#0F172A";

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

function renderTeamCard(team: TeamNode, x: number, y: number, style: ResolvedNodeStyle): string {
  const id = escapeXml(team.id);
  const label = escapeXml(team.label ?? team.id);
  const hasChildren = team.members.length > 0 || team.teams.length > 0;

  const ownsList = team.properties.owns.slice(0, 3).join(", ");
  const ownsMore = team.properties.owns.length > 3 ? ` +${team.properties.owns.length - 3}` : "";
  const ownsText = team.properties.owns.length > 0 ? `owns: ${ownsList}${ownsMore}` : "";

  const countText = [
    team.members.length > 0
      ? `${team.members.length} member${team.members.length > 1 ? "s" : ""}`
      : "",
    team.teams.length > 0 ? `${team.teams.length} sub-team${team.teams.length > 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

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

  if (ownsText) {
    parts.push(
      el(
        "text",
        {
          x: CARD_WIDTH / 2,
          y: HEADER_HEIGHT + 22,
          ...subLabelStyle(style),
        },
        escapeXml(ownsText),
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

  return el("g", { transform: `translate(${x},${y})`, "data-node-id": id }, ...parts);
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

export function renderOrgView(
  slice: OrgViewSlice,
  styleMap: Map<string, ResolvedNodeStyle>,
  defaultStyle: ResolvedNodeStyle,
): string {
  const teamStyle: ResolvedNodeStyle = { ...defaultStyle };
  const memberStyle: ResolvedNodeStyle = { ...defaultStyle };

  if (slice.focusedTeam === null) {
    // Top-level: show all teams
    const teams = slice.teams;

    if (teams.length === 0) {
      return el(
        "svg",
        { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 200 100" },
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
      const style = styleMap.get(team.id) ?? teamStyle;
      const { x, y } = cardPos(i);
      return renderTeamCard(team, x, y, style);
    });

    return el(
      "svg",
      { xmlns: "http://www.w3.org/2000/svg", viewBox: `0 0 ${totalWidth} ${totalHeight}` },
      el("rect", { width: totalWidth, height: totalHeight, fill: BG_COLOR }),
      ...cards,
    );
  }

  // Drill-down: show members + sub-teams of focusedTeam
  const focused = slice.focusedTeam;
  const items: Array<{ id: string; render: (x: number, y: number) => string }> = [
    ...focused.members.map((m) => ({
      id: m.id,
      render: (x: number, y: number) =>
        renderMemberCard(m, x, y, styleMap.get(m.id) ?? memberStyle),
    })),
    ...focused.teams.map((t) => ({
      id: t.id,
      render: (x: number, y: number) => renderTeamCard(t, x, y, styleMap.get(t.id) ?? teamStyle),
    })),
  ];

  if (items.length === 0) {
    const totalWidth = CARD_WIDTH + PADDING * 2;
    const totalHeight = 100;
    return el(
      "svg",
      { xmlns: "http://www.w3.org/2000/svg", viewBox: `0 0 ${totalWidth} ${totalHeight}` },
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
    { xmlns: "http://www.w3.org/2000/svg", viewBox: `0 0 ${totalWidth} ${totalHeight}` },
    el("rect", { width: totalWidth, height: totalHeight, fill: BG_COLOR }),
    ...renderedItems,
  );
}
