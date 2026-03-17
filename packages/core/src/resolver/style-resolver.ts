import type { KrsNode, KrsEdge } from "../types/ast.js";
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

const KIND_STYLE_OVERRIDES: Partial<
  Record<string, Partial<ResolvedNodeStyle>>
> = {
  resource: {
    shape: "cylinder",
    backgroundColor: "#1E3A5F",
    borderColor: "#3B82F6",
  },
};

const DEFAULT_EDGE_STYLE: ResolvedEdgeStyle = {
  color: "#94A3B8",
  strokeWidth: 1.5,
  fontSize: 11,
  strokeStyle: "solid",
};

const SHAPE_KEYWORDS = new Set<string>([
  "box",
  "person",
  "cylinder",
  "queue",
  "hexagon",
  "cloud",
]);

export function resolveStyles(
  systems: KrsNode[],
  sheets: StyleSheet[]
): ResolvedStyles {
  const allRules = sheets.flatMap((s) => s.rules);
  const nodeStyles = new Map<string, ResolvedNodeStyle>();
  const edgeStyles = new Map<string, ResolvedEdgeStyle>();

  function processNodes(nodes: KrsNode[]): void {
    for (const node of nodes) {
      const key = node.id ?? node.label;
      nodeStyles.set(key, resolveNodeStyle(node, allRules, node.kind));
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

  return {
    nodes: nodeStyles,
    edges: edgeStyles,
    defaultNodeStyle: { ...DEFAULT_NODE_STYLE },
    defaultEdgeStyle: { ...DEFAULT_EDGE_STYLE },
  };
}

function collectEdges(node: KrsNode): KrsEdge[] {
  const edges: KrsEdge[] = [...node.edges];
  for (const child of node.children) {
    edges.push(...collectEdges(child));
  }
  return edges;
}

function resolveNodeStyle(
  node: KrsNode,
  rules: StyleRule[],
  kind: string
): ResolvedNodeStyle {
  const matching = rules.filter((rule) =>
    nodeSelectorMatches(node, rule.selector)
  );
  matching.sort(
    (a, b) => a.specificity - b.specificity || a.sourceIndex - b.sourceIndex
  );

  const merged: Record<string, string> = {};
  for (const rule of matching) {
    Object.assign(merged, rule.properties);
  }

  return toResolvedNodeStyle(merged, kind);
}

function resolveEdgeStyle(
  edge: KrsEdge,
  rules: StyleRule[]
): ResolvedEdgeStyle {
  const matching = rules.filter((rule) =>
    edgeSelectorMatches(edge, rule.selector)
  );
  matching.sort(
    (a, b) => a.specificity - b.specificity || a.sourceIndex - b.sourceIndex
  );

  const merged: Record<string, string> = {};
  for (const rule of matching) {
    Object.assign(merged, rule.properties);
  }

  return toResolvedEdgeStyle(merged, edge);
}

function nodeSelectorMatches(
  node: KrsNode,
  selector: StyleSelector
): boolean {
  if (selector.id) return node.id === selector.id;
  if (selector.nodeType === "edge") return false;
  if (selector.nodeType && selector.nodeType !== node.kind) return false;
  if (selector.tags.length > 0) {
    if (!selector.tags.every((t) => node.tags.includes(t))) return false;
  }
  if (selector.annotations.length > 0) {
    if (!selector.annotations.every((a) => node.annotations.includes(a)))
      return false;
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

function edgeSelectorMatches(
  edge: KrsEdge,
  selector: StyleSelector
): boolean {
  if (selector.nodeType !== "edge" && selector.nodeType !== undefined)
    return false;
  if (selector.nodeType !== "edge") return false;
  if (selector.tags.length > 0) {
    const edgeTags = [...edge.tags];
    if (edge.kind === "async") edgeTags.push("async");
    if (edge.kind === "sync") edgeTags.push("sync");
    if (!selector.tags.every((t) => edgeTags.includes(t))) return false;
  }
  return true;
}

function toResolvedNodeStyle(
  props: Record<string, string>,
  kind?: string
): ResolvedNodeStyle {
  const kindOverride = kind ? KIND_STYLE_OVERRIDES[kind] : undefined;
  const style = { ...DEFAULT_NODE_STYLE, ...kindOverride };

  if (props["background-color"]) style.backgroundColor = props["background-color"];
  if (props["color"]) style.color = props["color"];
  if (props["border-color"]) style.borderColor = props["border-color"];
  if (props["border-width"]) style.borderWidth = parseFloat(props["border-width"]);
  if (props["border-style"])
    style.borderStyle = props["border-style"] as "solid" | "dashed" | "dotted";
  if (props["border-radius"]) style.borderRadius = parseFloat(props["border-radius"]);
  if (props["font-size"]) style.fontSize = parseFloat(props["font-size"]);
  if (props["font-weight"])
    style.fontWeight = props["font-weight"] as "normal" | "bold";
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

function toResolvedEdgeStyle(
  props: Record<string, string>,
  edge: KrsEdge
): ResolvedEdgeStyle {
  const style = { ...DEFAULT_EDGE_STYLE };

  if (props["color"]) style.color = props["color"];
  if (props["stroke-width"]) style.strokeWidth = parseFloat(props["stroke-width"]);
  if (props["font-size"]) style.fontSize = parseFloat(props["font-size"]);
  if (props["border-style"])
    style.strokeStyle = props["border-style"] as "solid" | "dashed";

  // Async edges default to dashed
  if (edge.kind === "async" && !props["border-style"]) {
    style.strokeStyle = "dashed";
  }

  return style;
}

function stripQuotes(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}
