import type {
  KrsNode,
  KrsEdge,
  EdgeKind,
  DeployNode,
  OrganizationBlock,
  TeamNode,
} from "../types/ast.js";
import { hasShape } from "../shapes/shape-registry.js";
import { CLIENT_SUBTYPE_TAGS, type ClientSubtypeTag } from "../builtins/icon-theme.js";
import type {
  StyleSheet,
  StyleRule,
  StyleSelector,
  ResolvedNodeStyle,
  ResolvedEdgeStyle,
  ResolvedStyles,
  ResolvedLayoutHints,
  ResolvedStyleWarning,
  LayoutColumn,
  ShapeKind,
} from "../types/style.js";

const VALID_COLUMN_VALUES: ReadonlySet<string> = new Set<LayoutColumn>(["left", "center", "right"]);

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
  direction: "auto",
  labelPosition: 0.5,
  labelOffsetX: 0,
  labelOffsetY: 0,
};

const EDGE_DIRECTION_VALUES = new Set<string>(["auto", "up", "down", "left", "right"]);

const LABEL_POSITION_KEYWORDS: Record<string, number> = {
  start: 0,
  middle: 0.5,
  end: 1,
};

const SHAPE_KEYWORDS = new Set<string>(["box", "user", "cylinder", "queue", "hexagon", "cloud"]);

/** Infra block kinds whose sub-resources can have a tag inferred from their kind. */
const INFRA_KINDS = new Set(["database", "queue", "storage"]);
/** Maps infra sub-resource AST kind → the style tag used in resource[tag] selectors. */
const INFRA_SUB_KIND_TO_TAG: Record<string, string> = {
  table: "table",
  "queue-item": "queue",
  bucket: "storage",
};

/**
 * Build a map from dot-notation resource IDs (e.g. "OrderDB.OrderTable") to the inferred
 * style tag derived from the referenced infra sub-resource kind. Only covers sub-resources
 * that are direct children of a system-level infra node.
 */
function buildInferredTagMap(systems: KrsNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const system of systems) {
    for (const node of system.children) {
      if (!INFRA_KINDS.has(node.kind)) continue;
      for (const sub of node.children) {
        const tag = INFRA_SUB_KIND_TO_TAG[sub.kind];
        if (tag) map.set(`${node.id}.${sub.id}`, tag);
      }
    }
  }
  return map;
}

export function resolveStyles(
  systems: KrsNode[],
  sheets: StyleSheet[],
  deployNodes?: DeployNode[],
  organizations?: OrganizationBlock[],
  extraNodes?: KrsNode[],
  extraEdges?: KrsEdge[],
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
  const layoutHints = new Map<string, ResolvedLayoutHints>();
  const resolvedStyleWarnings: ResolvedStyleWarning[] = [];

  // Build inferred tag map so that dot-notation resource nodes (e.g. "OrderDB.OrderTable")
  // automatically match resource[table] / resource[queue] / resource[storage] selectors
  // even when no explicit tags are declared in the .krs source.
  const inferredTagMap = buildInferredTagMap(systems);

  // Recursively process nodes carrying down the nearest annotated ancestor's
  // annotations (`parentAnnotations`). When a node has no annotations of its
  // own, it renders as if it carried the parent's — see
  // docs/design/inherit-service-annotations.md. Explicit annotations always
  // win, and a child with its own annotations becomes the new propagation
  // root for its own subtree.
  function processNodes(nodes: KrsNode[], parentAnnotations: string[]): void {
    for (const node of nodes) {
      // Inject inferred tag for dot-notation resource nodes with no explicit tags.
      let resolvedNode = node;
      if (
        node.kind === "resource" &&
        node.tags.length === 0 &&
        node.ref &&
        inferredTagMap.has(node.id)
      ) {
        resolvedNode = { ...node, tags: [inferredTagMap.get(node.id)!] };
      }
      // Apply annotation inheritance: empty own annotations fall back to the parent's.
      if (resolvedNode.annotations.length === 0 && parentAnnotations.length > 0) {
        resolvedNode = { ...resolvedNode, annotations: parentAnnotations };
      }
      const merged = mergeMatchingProperties(resolvedNode, allRules);
      const hints = finalizeLayoutHints(resolvedNode.id, merged, resolvedStyleWarnings);
      // applyClientSubtypeFirstMatch mutates `merged` (shape-related only — does
      // not touch `column`), so it must run after the layout-hint read.
      applyClientSubtypeFirstMatch(resolvedNode, merged);
      const style = toResolvedNodeStyle(merged);
      // Always store under the simple ID key for backward-compat lookups (e.g., container
      // rendering uses container.id directly).
      nodeStyles.set(node.id, style);
      if (hints) layoutHints.set(node.id, hints);
      // Also store under the annotation-qualified key so that two nodes sharing the same
      // ID but carrying different annotations (migration coexistence) each get their own
      // distinct style entry.  The renderer prefers the qualified key and falls back to
      // the simple key, so both single-annotated and collision scenarios are handled.
      const qualifiedKey = nodeStyleKey(node.id, resolvedNode.annotations);
      if (qualifiedKey !== node.id) {
        nodeStyles.set(qualifiedKey, style);
      }
      // Inheritance only starts at `service`. A `system` carrying annotations
      // does not propagate them to its services (YAGNI).
      const downAnnotations =
        node.kind === "system"
          ? []
          : node.kind === "service"
            ? node.annotations
            : resolvedNode.annotations;
      processNodes(node.children, downAnnotations);
    }
  }

  for (const system of systems) {
    processNodes([system], []);
    for (const edge of collectEdges(system)) {
      const style = resolveEdgeStyle(edge, allRules);
      // Kind-qualified key (preferred by the renderer) so parallel sync/async
      // edges keep distinct styles; bare key as a fallback for synthetic edges.
      edgeStyles.set(edgeStyleKey(edge.from, edge.to, edge.kind), style);
      edgeStyles.set(`${edge.from}->${edge.to}`, style);
    }
  }

  if (extraNodes) {
    processNodes(extraNodes, []);
  }

  if (extraEdges) {
    for (const edge of extraEdges) {
      const qualifiedKey = edgeStyleKey(edge.from, edge.to, edge.kind);
      if (!edgeStyles.has(qualifiedKey)) {
        const style = resolveEdgeStyle(edge, allRules);
        edgeStyles.set(qualifiedKey, style);
        if (!edgeStyles.has(`${edge.from}->${edge.to}`)) {
          edgeStyles.set(`${edge.from}->${edge.to}`, style);
        }
      }
    }
  }

  if (deployNodes) {
    for (const unit of deployNodes) {
      const merged = mergeMatchingPropertiesForDeploy(unit, allRules);
      // Surface layout hints that target deploy nodes so authors are warned
      // they have no effect there (and so typo'd values still produce
      // `style-column-invalid-value` rather than vanishing). The hints are
      // not stored — `layoutHints` remains a system-view-only signal.
      const hint = finalizeLayoutHints(unit.id, merged, resolvedStyleWarnings);
      if (hint?.column) {
        resolvedStyleWarnings.push({
          kind: "style-column-ignored-non-system-view",
          nodeId: unit.id,
          viewType: "deploy",
        });
      }
      nodeStyles.set(unit.id, toResolvedNodeStyle(merged));
    }
  }

  if (organizations) {
    for (const node of collectOrgNodes(organizations)) {
      const merged = mergeMatchingPropertiesForOrg(node, allRules);
      const hint = finalizeLayoutHints(node.id, merged, resolvedStyleWarnings);
      if (hint?.column) {
        resolvedStyleWarnings.push({
          kind: "style-column-ignored-non-system-view",
          nodeId: node.id,
          viewType: "org",
        });
      }
      nodeStyles.set(node.id, toResolvedNodeStyle(merged));
    }
  }

  return {
    nodes: nodeStyles,
    edges: edgeStyles,
    defaultNodeStyle: { ...DEFAULT_NODE_STYLE },
    defaultEdgeStyle: resolveDefaultEdgeStyle(allRules),
    layoutHints,
    warnings: resolvedStyleWarnings,
  };
}

/**
 * Read `column` (and any future layout hint) from a merged property map and
 * return the resolved hint, or `null` when no hint resolved. Invalid values
 * (`column: foo`) push a `style-column-invalid-value` warning and produce
 * `null` so the caller can skip storing an empty map entry. Unknown hint
 * properties are ignored to stay forward-compatible.
 *
 * Callers are expected to share `merged` with the visual-style resolver so
 * the cascade runs once per node.
 */
function finalizeLayoutHints(
  nodeId: string,
  merged: Record<string, string>,
  warnings: ResolvedStyleWarning[],
): ResolvedLayoutHints | null {
  const raw = merged["column"];
  if (raw === undefined) return null;
  if (!VALID_COLUMN_VALUES.has(raw)) {
    warnings.push({ kind: "style-column-invalid-value", nodeId, value: raw });
    return null;
  }
  return { column: raw as LayoutColumn };
}

// NOTE: the legend resolver in renderer/svg-builder.ts uses an identical
// per-property cascade merge (see `resolveLegendRefColor`). When tweaking
// the cascade semantics here, mirror the change there to keep node colors
// and legend swatches consistent (Issue #1001).
function mergeMatchingProperties(node: KrsNode, rules: StyleRule[]): Record<string, string> {
  const matching = rules.filter((rule) => nodeSelectorMatches(node, rule.selector));
  matching.sort((a, b) => a.specificity - b.specificity || a.sourceIndex - b.sourceIndex);
  const merged: Record<string, string> = {};
  for (const rule of matching) Object.assign(merged, rule.properties);
  return merged;
}

function mergeMatchingPropertiesForDeploy(
  unit: DeployNode,
  rules: StyleRule[],
): Record<string, string> {
  const matching = rules.filter((rule) => deployNodeSelectorMatches(unit, rule.selector));
  matching.sort((a, b) => a.specificity - b.specificity || a.sourceIndex - b.sourceIndex);
  const merged: Record<string, string> = {};
  for (const rule of matching) Object.assign(merged, rule.properties);
  return merged;
}

function mergeMatchingPropertiesForOrg(
  node: OrgNodeDescriptor,
  rules: StyleRule[],
): Record<string, string> {
  const matching = rules.filter((rule) => orgNodeSelectorMatches(node, rule.selector));
  matching.sort((a, b) => a.specificity - b.specificity || a.sourceIndex - b.sourceIndex);
  const merged: Record<string, string> = {};
  for (const rule of matching) Object.assign(merged, rule.properties);
  return merged;
}

function orgNodeSelectorMatches(node: OrgNodeDescriptor, sel: StyleSelector): boolean {
  if (sel.id) return sel.id === node.id;
  if (sel.nodeType === "edge") return false;
  if (sel.nodeType && sel.nodeType !== node.kind) return false;
  // Org nodes carry no tags, so tag selectors never match.
  if (sel.tags.length > 0) return false;
  // Annotation selectors (e.g. the default-style `@migration_target` / `@deprecated`
  // badge rules) match a team carrying every required annotation — same semantics
  // as nodeSelectorMatches, so org teams get migration/deprecation badges too (#1583).
  if (sel.annotations.length > 0) {
    if (!sel.annotations.every((a) => node.annotations.includes(a))) return false;
  }
  if (!sel.nodeType && !sel.id && sel.annotations.length === 0) return false;
  return true;
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

/**
 * No-op for everything except multi-subtype client nodes.
 *
 * When a client node has more than one of {@link CLIENT_SUBTYPE_TAGS}, CSS
 * cascade alone would resolve to the rule declared latest in the icon theme;
 * that contradicts the intuition that the *first* tag the user wrote should
 * win. This helper rewrites the resolved shape so `client X [mobile] [desktop]`
 * picks `client-mobile`. Single-tag and zero-tag clients are handled correctly
 * by the cascade and untouched here. User-defined shape overrides (anything
 * that is not a `client-<subtype>` icon URL) are left alone too.
 */
const CLIENT_SUBTYPE_SHAPE_RE = new RegExp(
  String.raw`^url\("client-(?:${CLIENT_SUBTYPE_TAGS.join("|")})"\)$`,
);

function applyClientSubtypeFirstMatch(node: KrsNode, merged: Record<string, string>): void {
  if (node.kind !== "client") return;
  const subtypes: ClientSubtypeTag[] = node.tags.filter((t): t is ClientSubtypeTag =>
    (CLIENT_SUBTYPE_TAGS as readonly string[]).includes(t),
  );
  if (subtypes.length < 2) return;
  const currentShape = merged["shape"];
  if (!currentShape || !CLIENT_SUBTYPE_SHAPE_RE.test(currentShape)) return;
  merged["shape"] = `url("client-${subtypes[0]}")`;
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

function deployNodeSelectorMatches(unit: DeployNode, sel: StyleSelector): boolean {
  if (sel.id) return sel.id === unit.id;
  if (sel.nodeType === "edge") return false;
  if (sel.nodeType && sel.nodeType !== unit.kind) return false;
  if (sel.tags.length > 0) return false;
  if (sel.annotations.length > 0) return false;
  if (!sel.nodeType && !sel.id) return false;
  return true;
}

interface OrgNodeDescriptor {
  id: string;
  kind: "team" | "member";
  annotations: string[];
}

function collectOrgNodes(organizations: OrganizationBlock[]): OrgNodeDescriptor[] {
  const nodes: OrgNodeDescriptor[] = [];

  function walk(team: TeamNode): void {
    nodes.push({ id: team.id, kind: "team", annotations: team.annotations });
    for (const child of team.children) {
      if (child.kind === "member") {
        nodes.push({ id: child.id, kind: "member", annotations: [] });
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
  // Edge selectors require the explicit `edge` type; tag-only selectors
  // (nodeType === undefined) never match edges.
  if (selector.nodeType !== "edge") return false;
  if (selector.edgeId !== undefined) {
    if (edge.canonicalId === undefined) return false;
    if (edge.canonicalId !== selector.edgeId) return false;
  }
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

const EDGE_STROKE_STYLES = new Set<ResolvedEdgeStyle["strokeStyle"]>(["solid", "dashed", "dotted"]);

function toResolvedEdgeStyle(props: Record<string, string>): ResolvedEdgeStyle {
  const style = { ...DEFAULT_EDGE_STYLE };

  if (props["color"]) style.color = props["color"];
  if (props["stroke-width"]) style.strokeWidth = parseFloat(props["stroke-width"]);
  if (props["font-size"]) style.fontSize = parseFloat(props["font-size"]);
  if (props["border-style"]) {
    const value = props["border-style"] as ResolvedEdgeStyle["strokeStyle"];
    if (EDGE_STROKE_STYLES.has(value)) style.strokeStyle = value;
  }
  // `stroke-style` is the canonical edge-side name (ADR-20260610-01);
  // `border-style` stays supported for back-compat. When both are
  // declared, the canonical name wins regardless of declaration order.
  if (props["stroke-style"]) {
    const value = props["stroke-style"] as ResolvedEdgeStyle["strokeStyle"];
    if (EDGE_STROKE_STYLES.has(value)) style.strokeStyle = value;
  }
  if (props["direction"]) {
    const value = props["direction"];
    if (EDGE_DIRECTION_VALUES.has(value)) {
      style.direction = value as ResolvedEdgeStyle["direction"];
    }
  }
  if (props["label-position"]) {
    const raw = props["label-position"];
    if (raw in LABEL_POSITION_KEYWORDS) {
      style.labelPosition = LABEL_POSITION_KEYWORDS[raw];
    } else {
      const numeric = parseFloat(raw);
      if (Number.isFinite(numeric)) {
        style.labelPosition = Math.min(1, Math.max(0, numeric));
      }
    }
  }
  if (props["label-offset"]) {
    // CSS-like shorthand:
    //   "8px"       → x=0, y=8
    //   "4px 8px"   → x=4, y=8
    // The two-token form mirrors `padding`/`margin` and lets a global
    // rule like `edge { label-offset: 0 8px; }` shift every label by
    // the same screen-axis amount, regardless of edge slope.
    const tokens = props["label-offset"].trim().split(/\s+/);
    if (tokens.length === 1) {
      const dy = parseFloat(tokens[0]);
      if (Number.isFinite(dy)) {
        style.labelOffsetX = 0;
        style.labelOffsetY = dy;
      }
    } else if (tokens.length >= 2) {
      const dx = parseFloat(tokens[0]);
      const dy = parseFloat(tokens[1]);
      if (Number.isFinite(dx) && Number.isFinite(dy)) {
        style.labelOffsetX = dx;
        style.labelOffsetY = dy;
      }
    }
  }

  return style;
}

function stripQuotes(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

/**
 * Build the style-map key for a node.
 * When the node has annotations, append them (sorted) to the ID so that
 * nodes with the same ID but different annotations (migration coexistence)
 * each get their own style entry and do not clobber one another.
 *
 * Examples:
 *   nodeStyleKey("Contract", [])                    → "Contract"
 *   nodeStyleKey("Contract", ["deprecated"])         → "Contract@deprecated"
 *   nodeStyleKey("Contract", ["migration_target"])   → "Contract@migration_target"
 */
export function nodeStyleKey(id: string, annotations: string[] | undefined): string {
  if (!annotations || annotations.length === 0) return id;
  return `${id}@${[...annotations].sort().join(",")}`;
}

/**
 * Build the style-map key for an edge.
 *
 * Parallel edges between the same `(from, to)` pair (e.g. a sync `A -> B` and an
 * async `A --> B`) must each keep their own resolved style — `kind` drives the
 * stroke style, so keying the map by `from->to` alone makes the last edge clobber
 * the others. Appending the kind disambiguates them. Synthetic layout-only edges
 * (delivers, owns, ghosts, aggregated domain edges) pass `kind === undefined` and
 * fall back to the bare `from->to` key, which the resolver also registers.
 *
 * Examples:
 *   edgeStyleKey("A", "B", undefined) → "A->B"
 *   edgeStyleKey("A", "B", "sync")    → "A->B#sync"
 *   edgeStyleKey("A", "B", "async")   → "A->B#async"
 */
export function edgeStyleKey(from: string, to: string, kind: EdgeKind | undefined): string {
  return kind === undefined ? `${from}->${to}` : `${from}->${to}#${kind}`;
}
