import type { KrsNode, KrsEdge, DeployNode, OrganizationBlock, TeamNode } from "../types/ast.js";
import { hasShape } from "../renderer/shape-registry.js";
import type {
  StyleSheet,
  StyleRule,
  StyleSelector,
  ResolvedNodeStyle,
  ResolvedEdgeStyle,
  ResolvedStyles,
  ShapeKind,
} from "../types/style.js";

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

const DEFAULT_EDGE_STYLE: ResolvedEdgeStyle = {
  color: "#94A3B8",
  strokeWidth: 1.5,
  fontSize: 11,
  strokeStyle: "solid",
};

const SHAPE_KEYWORDS = new Set<string>(["box", "user", "cylinder", "queue", "hexagon", "cloud"]);

export function resolveStyles(
  systems: KrsNode[],
  sheets: StyleSheet[],
  deployNodes?: DeployNode[],
  organizations?: OrganizationBlock[],
  extraNodes?: KrsNode[],
): ResolvedStyles {
  // Clone rules with globally renumbered sourceIndex to preserve cascade order across sheets.
  // This avoids mutating cached sheets (e.g. the builtin singleton).
  let globalIndex = 0;
  const allRules: StyleRule[] = [];
  for (const sheet of sheets) {
    for (const rule of sheet.rules) {
      allRules.push({ ...rule, sourceIndex: globalIndex++ });
    }
  }
  const nodeStyles = new Map<string, ResolvedNodeStyle>();
  const edgeStyles = new Map<string, ResolvedEdgeStyle>();

  function processNodes(nodes: KrsNode[]): void {
    for (const node of nodes) {
      const key = node.id;
      nodeStyles.set(key, resolveNodeStyle(node, allRules));
      processNodes(node.children);
    }
  }

  for (const system of systems) {
    processNodes([system]);
    for (const edge of collectEdges(system)) {
      const key = `${edge.from}->${edge.to}`;
      edgeStyles.set(key, resolveEdgeStyle(edge, allRules));
    }
  }

  if (extraNodes) {
    processNodes(extraNodes);
  }

  if (deployNodes) {
    for (const unit of deployNodes) {
      nodeStyles.set(unit.id, resolveDeployNodeStyle(unit, allRules));
    }
  }

  if (organizations) {
    for (const node of collectOrgNodes(organizations)) {
      nodeStyles.set(node.id, resolveOrgNodeStyle(node, allRules));
    }
  }

  return {
    nodes: nodeStyles,
    edges: edgeStyles,
    defaultNodeStyle: { ...DEFAULT_NODE_STYLE },
    defaultEdgeStyle: resolveDefaultEdgeStyle(allRules),
  };
}

function resolveDefaultEdgeStyle(rules: StyleRule[]): ResolvedEdgeStyle {
  const matching = rules.filter(
    (rule) => rule.selector.nodeType === "edge" && rule.selector.tags.length === 0,
  );
  matching.sort((a, b) => a.specificity - b.specificity || a.sourceIndex - b.sourceIndex);
  const merged: Record<string, string> = {};
  for (const rule of matching) {
    Object.assign(merged, rule.properties);
  }
  return toResolvedEdgeStyle(merged);
}

function collectEdges(node: KrsNode): KrsEdge[] {
  const edges: KrsEdge[] = [...node.edges];
  for (const child of node.children) {
    edges.push(...collectEdges(child));
  }
  return edges;
}

function resolveNodeStyle(node: KrsNode, rules: StyleRule[]): ResolvedNodeStyle {
  const matching = rules.filter((rule) => nodeSelectorMatches(node, rule.selector));
  matching.sort((a, b) => a.specificity - b.specificity || a.sourceIndex - b.sourceIndex);

  const merged: Record<string, string> = {};
  for (const rule of matching) {
    Object.assign(merged, rule.properties);
  }

  return toResolvedNodeStyle(merged);
}

function resolveEdgeStyle(edge: KrsEdge, rules: StyleRule[]): ResolvedEdgeStyle {
  const matching = rules.filter((rule) => edgeSelectorMatches(edge, rule.selector));
  matching.sort((a, b) => a.specificity - b.specificity || a.sourceIndex - b.sourceIndex);

  const merged: Record<string, string> = {};
  for (const rule of matching) {
    Object.assign(merged, rule.properties);
  }

  return toResolvedEdgeStyle(merged);
}

function resolveDeployNodeStyle(unit: DeployNode, rules: StyleRule[]): ResolvedNodeStyle {
  const matching = rules.filter((rule) => {
    const sel = rule.selector;
    if (sel.id) return sel.id === unit.id;
    if (sel.nodeType === "edge") return false;
    if (sel.nodeType && sel.nodeType !== unit.kind) return false;
    if (sel.tags.length > 0) return false;
    if (sel.annotations.length > 0) return false;
    if (!sel.nodeType && !sel.id) return false;
    return true;
  });
  matching.sort((a, b) => a.specificity - b.specificity || a.sourceIndex - b.sourceIndex);

  const merged: Record<string, string> = {};
  for (const rule of matching) {
    Object.assign(merged, rule.properties);
  }

  return toResolvedNodeStyle(merged);
}

interface OrgNodeDescriptor {
  id: string;
  kind: "team" | "member";
}

function collectOrgNodes(organizations: OrganizationBlock[]): OrgNodeDescriptor[] {
  const nodes: OrgNodeDescriptor[] = [];

  function walk(team: TeamNode): void {
    nodes.push({ id: team.id, kind: "team" });
    for (const child of team.children) {
      if (child.kind === "member") {
        nodes.push({ id: child.id, kind: "member" });
      } else {
        walk(child);
      }
    }
  }

  for (const org of organizations) {
    for (const team of org.teams) {
      walk(team);
    }
  }

  return nodes;
}

function resolveOrgNodeStyle(node: OrgNodeDescriptor, rules: StyleRule[]): ResolvedNodeStyle {
  const matching = rules.filter((rule) => {
    const sel = rule.selector;
    if (sel.id) return sel.id === node.id;
    if (sel.nodeType === "edge") return false;
    if (sel.nodeType && sel.nodeType !== node.kind) return false;
    if (sel.tags.length > 0) return false;
    if (sel.annotations.length > 0) return false;
    if (!sel.nodeType && !sel.id) return false;
    return true;
  });
  matching.sort((a, b) => a.specificity - b.specificity || a.sourceIndex - b.sourceIndex);

  const merged: Record<string, string> = {};
  for (const rule of matching) {
    Object.assign(merged, rule.properties);
  }

  return toResolvedNodeStyle(merged);
}

function nodeSelectorMatches(node: KrsNode, selector: StyleSelector): boolean {
  if (selector.id) return node.id === selector.id;
  if (selector.nodeType === "edge") return false;
  if (selector.nodeType && selector.nodeType !== node.kind) return false;
  if (selector.tags.length > 0) {
    if (!selector.tags.every((t) => node.tags.includes(t))) return false;
  }
  if (selector.annotations.length > 0) {
    if (!selector.annotations.every((a) => node.annotations.includes(a))) return false;
  }
  // A bare selector with no type, tags, annotations, or id shouldn't match anything
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

function edgeSelectorMatches(edge: KrsEdge, selector: StyleSelector): boolean {
  if (selector.nodeType !== "edge" && selector.nodeType !== undefined) return false;
  if (selector.nodeType !== "edge") return false;
  if (selector.tags.length > 0) {
    const edgeTags = [...edge.tags];
    if (edge.kind === "async") edgeTags.push("async");
    if (edge.kind === "sync") edgeTags.push("sync");
    if (edge.cyclic) edgeTags.push("cyclic");
    if (!selector.tags.every((t) => edgeTags.includes(t))) return false;
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
  if (props["badge-icon"]) style.badgeIcon = stripQuotes(props["badge-icon"]);
  if (props["badge-label"]) style.badgeLabel = stripQuotes(props["badge-label"]);

  return style;
}

function toResolvedEdgeStyle(props: Record<string, string>): ResolvedEdgeStyle {
  const style = { ...DEFAULT_EDGE_STYLE };

  if (props["color"]) style.color = props["color"];
  if (props["stroke-width"]) style.strokeWidth = parseFloat(props["stroke-width"]);
  if (props["font-size"]) style.fontSize = parseFloat(props["font-size"]);
  if (props["border-style"]) style.strokeStyle = props["border-style"] as "solid" | "dashed";

  return style;
}

function stripQuotes(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}
