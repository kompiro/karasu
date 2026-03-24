import type { OrganizationBlock, TeamNode } from "../types/ast.js";
import type { StyleSheet, StyleRule, ResolvedNodeStyle, ShapeKind } from "../types/style.js";
import { hasShape } from "../renderer/shape-registry.js";

const DEFAULT_NODE_STYLE: ResolvedNodeStyle = {
  backgroundColor: "#374151",
  color: "#F9FAFB",
  borderColor: "#4B5563",
  borderWidth: 2,
  borderStyle: "solid",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: "bold",
  fontFamily: "sans-serif",
  opacity: 1.0,
  shape: "box",
};

const SHAPE_KEYWORDS = new Set<string>(["box", "user", "cylinder", "queue", "hexagon", "cloud"]);

interface OrgNodeDescriptor {
  id: string;
  kind: "team" | "member";
}

function selectorMatchesOrgNode(node: OrgNodeDescriptor, selector: StyleRule["selector"]): boolean {
  if (selector.id) return node.id === selector.id;
  if (selector.nodeType === "edge") return false;
  if (selector.nodeType && selector.nodeType !== node.kind) return false;
  if (selector.tags.length > 0) return false; // org nodes have no tags
  if (selector.annotations.length > 0) return false; // org nodes have no annotations
  if (
    !selector.nodeType &&
    selector.tags.length === 0 &&
    selector.annotations.length === 0 &&
    !selector.id
  ) {
    return false;
  }
  return true;
}

function toResolvedNodeStyle(props: Record<string, string>): ResolvedNodeStyle {
  const style = { ...DEFAULT_NODE_STYLE };

  if (props["background-color"]) style.backgroundColor = props["background-color"];
  if (props["color"]) style.color = props["color"];
  if (props["border-color"]) style.borderColor = props["border-color"];
  if (props["border-width"]) style.borderWidth = parseFloat(props["border-width"]);
  if (props["border-style"])
    style.borderStyle = props["border-style"] as "solid" | "dashed" | "dotted";
  if (props["border-radius"]) style.borderRadius = parseFloat(props["border-radius"]);
  if (props["font-size"]) style.fontSize = parseFloat(props["font-size"]);
  if (props["font-weight"]) style.fontWeight = props["font-weight"] as "normal" | "bold";
  if (props["font-family"]) style.fontFamily = props["font-family"];
  if (props["opacity"]) style.opacity = parseFloat(props["opacity"]);
  if (props["shape"]) {
    const shapeVal = props["shape"];
    if (shapeVal.startsWith("url(")) {
      const match = shapeVal.match(/url\("(.+?)"\)/);
      style.shape = match ? { url: match[1] } : "box";
    } else if (SHAPE_KEYWORDS.has(shapeVal)) {
      style.shape = shapeVal as ShapeKind;
    } else if (hasShape(shapeVal)) {
      style.shape = { url: shapeVal };
    }
  }
  if (props["badge-color"]) style.badgeColor = props["badge-color"];
  if (props["badge-icon"]) {
    const v = props["badge-icon"];
    style.badgeIcon = v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
  }
  if (props["badge-label"]) {
    const v = props["badge-label"];
    style.badgeLabel = v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
  }

  return style;
}

function resolveOrgNodeStyle(node: OrgNodeDescriptor, allRules: StyleRule[]): ResolvedNodeStyle {
  const matching = allRules.filter((rule) => selectorMatchesOrgNode(node, rule.selector));
  matching.sort((a, b) => a.specificity - b.specificity || a.sourceIndex - b.sourceIndex);

  const merged: Record<string, string> = {};
  for (const rule of matching) {
    Object.assign(merged, rule.properties);
  }

  return toResolvedNodeStyle(merged);
}

function collectOrgNodes(organizations: OrganizationBlock[]): OrgNodeDescriptor[] {
  const nodes: OrgNodeDescriptor[] = [];

  function collectTeams(teams: TeamNode[]): void {
    for (const team of teams) {
      nodes.push({ id: team.id, kind: "team" });
      for (const member of team.members) {
        nodes.push({ id: member.id, kind: "member" });
      }
      collectTeams(team.teams);
    }
  }

  for (const org of organizations) {
    collectTeams(org.teams);
  }

  return nodes;
}

export function resolveOrgStyles(
  organizations: OrganizationBlock[],
  sheets: StyleSheet[],
): Map<string, ResolvedNodeStyle> {
  let globalIndex = 0;
  const allRules: StyleRule[] = [];
  for (const sheet of sheets) {
    for (const rule of sheet.rules) {
      allRules.push({ ...rule, sourceIndex: globalIndex++ });
    }
  }

  const result = new Map<string, ResolvedNodeStyle>();
  const nodes = collectOrgNodes(organizations);

  for (const node of nodes) {
    result.set(node.id, resolveOrgNodeStyle(node, allRules));
  }

  return result;
}

export { DEFAULT_NODE_STYLE as DEFAULT_ORG_NODE_STYLE };
