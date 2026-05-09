import type { SourceRange, Trivia } from "./tokens.js";

/**
 * Trivia attached to a single declaration. `leading` is everything that
 * precedes the property name on a line of its own (or starts with a blank
 * line); `trailing` is comments that share the same line as the closing
 * `;` (or the property if `;` was omitted).
 */
export interface DeclarationTrivia {
  leading: Trivia[];
  trailing: Trivia[];
}

export interface StyleSelector {
  nodeType?: string;
  tags: string[];
  annotations: string[];
  id?: string;
  /**
   * Edge canonical id targeted by an `edge#<id>` selector. Compared against
   * `KrsEdge.canonicalId` (set by the canonical-id pass after view extract).
   * Either an author-supplied identifier (`#criticalWrite`) or a base form
   * (`#A->B` / `#A-->B`). See `docs/design/edge-id-selector.md`.
   */
  edgeId?: string;
  loc: SourceRange;
}

export interface StyleRule {
  selector: StyleSelector;
  properties: Record<string, string>;
  specificity: number;
  sourceIndex: number;
  /** Range from `{` through `}`. */
  loc: SourceRange;
  /** Range covering each property declaration (name through trailing `;` if present). */
  declarationLocs: Record<string, SourceRange>;
  /**
   * Identifier of the originating sheet — typically a `.krs.style` file path,
   * or a sentinel like `"<builtin>"` for `BUILTIN_STYLE_SOURCE` and
   * `"<anonymous>"` when callers parse without specifying a path.
   */
  sheetId: string;
  /**
   * Comments / blank lines that immediately precede this rule on lines of
   * their own. Optional so consumers that build rules in code (test
   * fixtures, builtin sheets) can omit it; the parser always sets it.
   */
  leadingTrivia?: Trivia[];
  /**
   * Trivia on the same line as the closing `}` (typically a trailing
   * inline comment). Multi-line trivia after the rule lives in the
   * following construct's `leadingTrivia` instead.
   */
  trailingTrivia?: Trivia[];
  /**
   * Per-declaration leading / trailing trivia keyed by property name.
   * Only present for declarations the parser observed; missing keys
   * mean "no trivia attached". The Tidy formatter reads this to keep
   * comments glued to their declarations across reordering.
   */
  declarationTrivia?: Record<string, DeclarationTrivia>;
}

export interface StyleSheet {
  rules: StyleRule[];
  /**
   * Identifier of this sheet, attached by the parser. Optional on the
   * `StyleSheet` envelope (test fixtures often build rules directly), but
   * required on each `StyleRule`. The resolver propagates the rule-level
   * `sheetId` and ignores any envelope-level value.
   */
  sheetId?: string;
  /**
   * Trivia after the last rule (and after EOF if the file ends with
   * comments / blank lines). Used by the Tidy formatter to preserve
   * trailing notes / footer comments.
   */
  trailingTrivia?: Trivia[];
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

/**
 * Direction hint for the `direction` edge property in `.krs.style`.
 *
 * Hints the layout engine toward routing the edge in the given visual
 * direction. The engine treats it as advisory and may override when
 * honoring it would create a cycle. `auto` (default) leaves the engine
 * free to choose.
 *
 * NOTE: in the current MVP the value is parsed and surfaces in
 * `ResolvedEdgeStyle.direction`, but the karasu layout engine does not
 * yet bias routing on it. Tracked separately — see
 * `docs/design/edge-direction-style.md`.
 */
export type EdgeDirection = "auto" | "up" | "down" | "left" | "right";

/**
 * Position of an edge's label along the edge's path.
 *
 * Stored as a normalized fraction in `[0, 1]` after resolution: `0`
 * places the label at the source end, `1` at the target end, `0.5` at
 * the midpoint. The keyword forms `start | middle | end` are accepted in
 * `.krs.style` and translated to `0`, `0.5`, `1` respectively. Values
 * outside `[0, 1]` are clamped.
 *
 * Default: `0.5` (matches the historical midpoint behaviour).
 */
export type LabelPosition = number;

export interface ResolvedEdgeStyle {
  color: string;
  strokeWidth: number;
  fontSize: number;
  strokeStyle: "solid" | "dashed" | "dotted";
  direction: EdgeDirection;
  /**
   * Where along the edge the label anchor sits, normalised to `[0, 1]`.
   * `0` = source end, `1` = target end. See `LabelPosition`.
   */
  labelPosition: LabelPosition;
  /**
   * Screen-axis x-offset of the label relative to its computed anchor,
   * in pixels. Positive shifts right, negative shifts left.
   *
   * In `.krs.style` users write a CSS-like shorthand:
   *   `label-offset: <dy>px`           → x=0, y=<dy>
   *   `label-offset: <dx>px <dy>px`    → x=<dx>, y=<dy>
   *
   * Screen-axis (not edge-perpendicular) is intentional: a global rule
   * `edge { label-offset: 0 8px; }` should shift every label down by
   * the same visual amount regardless of each edge's slope.
   */
  labelOffsetX: number;
  /**
   * Screen-axis y-offset of the label relative to its computed anchor,
   * in pixels. Positive shifts down, negative shifts up. Independent of
   * the existing `-6px` typographic lift the renderer applies above the
   * anchor — that lift stays in place so the offset adds on top.
   */
  labelOffsetY: number;
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
