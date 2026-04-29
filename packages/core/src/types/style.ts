export interface StyleSelector {
  nodeType?: string;
  tags: string[];
  annotations: string[];
  id?: string;
}

export interface StyleRule {
  selector: StyleSelector;
  properties: Record<string, string>;
  specificity: number;
  sourceIndex: number;
}

export interface StyleSheet {
  rules: StyleRule[];
}

export type ShapeKind = "box" | "user" | "cylinder" | "queue" | "hexagon" | "cloud";

export interface ResolvedNodeStyle {
  backgroundColor: string;
  color: string;
  borderColor: string;
  borderWidth: number;
  borderStyle: "solid" | "dashed" | "dotted";
  borderRadius: number;
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontFamily: string;
  opacity: number;
  shape: ShapeKind | { url: string };
  badgeColor?: string;
  badgeIcon?: string;
  badgeLabel?: string;
}

export interface ResolvedEdgeStyle {
  color: string;
  strokeWidth: number;
  fontSize: number;
  strokeStyle: "solid" | "dashed";
}

/**
 * Layout hint values for the `column` property in `.krs.style`.
 *
 * Buckets a node into one of three columns within its layer in system view.
 * Bucket order is left → unspecified (center) → right; bucket-internal order
 * preserves the existing ordering (declaration order for forced system
 * layouts, barycenter elsewhere).
 *
 * Honored only by the system view. Deploy / org views emit a
 * `style-column-ignored-non-system-view` warning when a column hint
 * resolves on one of their nodes.
 */
export type LayoutColumn = "left" | "center" | "right";

export interface ResolvedLayoutHints {
  column?: LayoutColumn;
}

export interface ResolvedStyles {
  nodes: Map<string, ResolvedNodeStyle>;
  edges: Map<string, ResolvedEdgeStyle>;
  defaultNodeStyle: ResolvedNodeStyle;
  defaultEdgeStyle: ResolvedEdgeStyle;
  /**
   * Per-node layout hints (e.g. `column`). Only nodes that resolved at
   * least one hint property are present. Empty when no `.krs.style` rule
   * produced a recognized layout hint.
   */
  layoutHints: Map<string, ResolvedLayoutHints>;
  /**
   * Warnings produced during style resolution itself — e.g. an invalid
   * `column` value. These are surfaced separately from the schema-level
   * warnings produced by `analyze()` so the compile pipeline can merge
   * both into a single user-facing warning list.
   */
  warnings: ResolvedStyleWarning[];
}

/** Plain warning objects emitted by the resolver, kept structural to avoid
 * circular imports with the `Warning` discriminated union. The compile
 * pipeline widens these into the canonical `Warning` shape. */
export type ResolvedStyleWarning =
  | { kind: "style-column-invalid-value"; nodeId: string; value: string }
  | {
      kind: "style-column-ignored-non-system-view";
      nodeId: string;
      viewType: "deploy" | "org";
    };
