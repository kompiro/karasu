import type { ContainerRect, LayoutNode, LayoutResult } from "../../renderer/layout.js";
import type { MemberNode, OrganizationBlock, TeamNode } from "../../types/ast.js";

/**
 * Simple nested-container layout for organizations, produced specifically for
 * the draw.io exporter (the main SVG renderer has its own tree renderer).
 *
 * Each organization becomes an outer container; each team a nested container;
 * each member a leaf node. Teams are laid out top-to-bottom inside their
 * parent, members left-to-right within a team. Sizes are rough — the draw.io
 * user is expected to reposition anyway.
 */
const MEMBER_WIDTH = 140;
const MEMBER_HEIGHT = 56;
const MEMBER_GAP = 12;
const TEAM_PADDING_X = 16;
const TEAM_PADDING_Y = 36; // space for team label at the top
const TEAM_GAP = 20;
const ORG_PADDING_X = 24;
const ORG_PADDING_Y = 40;

interface PlacedTeam {
  container: ContainerRect;
  nodes: LayoutNode[];
  subContainers: ContainerRect[];
}

export function layoutOrganization(org: OrganizationBlock): LayoutResult {
  const nodes = new Map<string, LayoutNode>();
  const containers: ContainerRect[] = [];

  const teams = org.teams;

  // Place each top-level team as a vertical stack.
  const placed: PlacedTeam[] = [];
  let cursorY = ORG_PADDING_Y;
  let maxInnerWidth = 0;

  for (const team of teams) {
    const result = placeTeam(team, ORG_PADDING_X, cursorY);
    placed.push(result);
    const w = result.container.x + result.container.width - ORG_PADDING_X;
    if (w > maxInnerWidth) maxInnerWidth = w;
    cursorY = result.container.y + result.container.height + TEAM_GAP;
  }

  const orgWidth = Math.max(320, maxInnerWidth + ORG_PADDING_X * 2);
  const orgHeight = cursorY - TEAM_GAP + ORG_PADDING_Y;

  containers.push({
    id: org.id,
    label: org.label ?? org.id,
    x: 0,
    y: 0,
    width: orgWidth,
    height: orgHeight,
    ghost: false,
  });

  for (const p of placed) {
    containers.push(p.container);
    containers.push(...p.subContainers);
    for (const n of p.nodes) nodes.set(n.id, n);
  }

  return {
    nodes,
    edges: [],
    containers,
    width: orgWidth + ORG_PADDING_X,
    height: orgHeight + ORG_PADDING_Y,
  };
}

function placeTeam(team: TeamNode, x: number, y: number): PlacedTeam {
  const members: MemberNode[] = team.children.filter(isMember);
  const subTeams: TeamNode[] = team.children.filter(isTeam);

  const nodes: LayoutNode[] = [];
  const subContainers: ContainerRect[] = [];

  // Layout members in rows of up to 4.
  const innerX = x + TEAM_PADDING_X;
  let innerCursorY = y + TEAM_PADDING_Y;
  const membersPerRow = 4;
  let maxMemberRowWidth = 0;

  for (let i = 0; i < members.length; i += membersPerRow) {
    const row = members.slice(i, i + membersPerRow);
    row.forEach((m, idx) => {
      nodes.push({
        kind: "member" as unknown as LayoutNode["kind"],
        id: m.id,
        label: m.label ?? m.id,
        properties: { description: undefined, links: [] },
        linkCount: 0,
        hasChildren: false,
        hasDescription: false,
        x: innerX + idx * (MEMBER_WIDTH + MEMBER_GAP),
        y: innerCursorY,
        width: MEMBER_WIDTH,
        height: MEMBER_HEIGHT,
      });
    });
    const rowWidth = row.length * MEMBER_WIDTH + (row.length - 1) * MEMBER_GAP;
    if (rowWidth > maxMemberRowWidth) maxMemberRowWidth = rowWidth;
    innerCursorY += MEMBER_HEIGHT + MEMBER_GAP;
  }

  if (members.length > 0) innerCursorY += TEAM_GAP / 2;

  // Layout sub-teams vertically.
  let maxSubTeamWidth = 0;
  for (const sub of subTeams) {
    const placedSub = placeTeam(sub, innerX, innerCursorY);
    subContainers.push(placedSub.container, ...placedSub.subContainers);
    nodes.push(...placedSub.nodes);
    const subW = placedSub.container.width;
    if (subW > maxSubTeamWidth) maxSubTeamWidth = subW;
    innerCursorY = placedSub.container.y + placedSub.container.height + TEAM_GAP;
  }

  const innerWidth = Math.max(maxMemberRowWidth, maxSubTeamWidth, 180);
  const containerWidth = innerWidth + TEAM_PADDING_X * 2;
  const containerHeight = innerCursorY - y - (subTeams.length > 0 ? TEAM_GAP : 0) + TEAM_PADDING_X;

  const container: ContainerRect = {
    id: team.id,
    label: team.label ?? team.id,
    x,
    y,
    width: containerWidth,
    height: Math.max(containerHeight, TEAM_PADDING_Y + MEMBER_HEIGHT + TEAM_PADDING_X),
    ghost: false,
  };

  return { container, nodes, subContainers };
}

function isMember(n: MemberNode | TeamNode): n is MemberNode {
  return n.kind === "member";
}

function isTeam(n: MemberNode | TeamNode): n is TeamNode {
  return n.kind === "team";
}
