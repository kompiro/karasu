import type { EdgeDirection, ResolvedNodeStyle, ResolvedStyles } from "../types/style.js";
import type { ViewSlice } from "../view/view-extract.js";
import { layout } from "./layout.js";
import type { GroupLabelIndex } from "./group-labels.js";
import { CATEGORY_STUB_TAG, categoryOf, type CategoryId } from "./category-collapse.js";
import type {
  ContainerRect,
  CrossingMarks,
  DisplayMode,
  HopMark,
  LayoutNode,
  LayoutResult,
  Rect,
} from "./layout-types.js";
import { renderShape } from "./shapes.js";
import { renderEdge, renderArrowMarker } from "./edge-routing.js";
import { resolveLabelPlacements, buildLabelInputs } from "./label-placement.js";
import { HOP_RADIUS, JUNCTION_RADIUS } from "./crossing-marks.js";
import { badgeChildren } from "./badge.js";
import { buildLegendFooter, el, escapeXml, truncateToWidth, wrapToWidth } from "./svg-builder.js";
import { getIconDef, type SvgIconDef } from "../shapes/shape-registry.js";
import {
  CHAR_WIDTH,
  estimateTextWidth,
  ICON_LABEL_CHAR_WIDTH,
  ICON_DESC_CHAR_WIDTH,
  ICON_DESC_MAX_WIDTH,
  teamChipText,
} from "./rendering-constants.js";
import { edgeStyleKey, nodeStyleKey } from "../resolver/style-resolver.js";
import type { NodeDiffMeta } from "../diff/view-diff.js";
import { DEFAULT_EMPTY_STATE_LABELS, type EmptyStateLabels } from "./empty-state-labels.js";
import { DEPLOY_AFFORDANCE_KIND_SET } from "../types/ast.js";
import type { Diagnostic, LegendBlock, LegendViewScope } from "../types/ast.js";
import type { LegendUsage } from "../legend/usage.js";
import type { StyleSheet } from "../types/style.js";
import { type DiagramPalette, type DiagramTheme, resolvePalette } from "./palette.js";

const GHOST_OPACITY = 0.3;

// Ratio of the description font size (and its estimated char width) to the
// node's base font size in the *rendered* SVG. NOTE: this is intentionally
// 0.8, not layout.ts's DESCRIPTION_FONT_RATIO (0.85) — layout width
// estimation and rendered font size have historically used different ratios,
// and unifying them would change output geometry (see Issue #2014, point 3).
const RENDERED_DESC_FONT_RATIO = 0.8;

// Icon-mode text layout constants (from design doc)
const ICON_LABEL_MAX_WIDTH = 122; // px available for title text
const ICON_DESC_MAX_LINES = 3;
const ICON_DESC_LINE_HEIGHT = 14; // px

/**
 * Sanitizes a node ID for use in a CSS fragment identifier (e.g. href="#krs-view-X").
 * Replaces characters that are not alphanumeric, hyphen, or underscore with underscores.
 */
export function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Canonical deep-link anchor id for a drillable structural element / view level.
 *
 * Both surfaces that address such an element by URL fragment route through this
 * one function so the grammar can't drift (TPL-219 / TPL-1827):
 *   - the static drill-down SVG (`<g id="…">` + `:target` CSS, this package)
 *   - the SPA history hash for the drillable system/org views (`buildHash` in
 *     `packages/app`, `#krs-…`) — parity-tested
 *
 * Shape: `krs-<viewPrefix>-<sanitizeId(nodeId)>`. `nodeId` is the author-given
 * `id` (never a label — TPL-2167) or the literal `"root"` for a view's
 * top level. `sanitizeId` is idempotent, so passing an already-sanitized
 * segment is safe.
 *
 * Not every fragment is an element anchor: the SPA's single-level whole-view
 * tabs (deploy/matrix) use a bare `#krs-<view>` token and org Tree View is a
 * mode (`#krs-org-tree`); those are intentionally outside this grammar. Full
 * contract: `docs/spec/permalink.md`.
 */
export function anchorId(viewPrefix: string, nodeId: string): string {
  return `krs-${viewPrefix}-${sanitizeId(nodeId)}`;
}

export interface RenderOptions {
  /** Diff state per node id (and per edge key `from->to`) for diff-mode rendering. */
  nodeDiffState?: Map<string, string>;
  edgeDiffState?: Map<string, string>;
  /**
   * Full node diff metadata. When provided, the renderer derives the node's
   * `data-diff-state` from `meta.state` (preferred over `nodeDiffState`) and
   * decorates annotation badges with their own per-badge diff state
   * (Issue #738 / design doc D-2).
   */
  nodeDiffMeta?: Map<string, NodeDiffMeta>;
  /**
   * Diff state per container keyed by container id (deploy: `serviceId`). When
   * present, the matching `<g data-container-id>` emits `data-diff-state` so
   * CSS can highlight whole-container additions/removals (Issue #750).
   */
  containerDiffState?: Map<string, string>;
  /**
   * Localized labels for the empty-state placeholder rendered when the
   * layout has no nodes or containers. When omitted, English fallbacks
   * from `DEFAULT_EMPTY_STATE_LABELS` are used.
   */
  emptyLabels?: EmptyStateLabels;
  /**
   * Legend blocks declared in the source `.krs`. The renderer paints a
   * footer band below the diagram for every block that targets the
   * current view scope (or omits scope). Pair with `styleSheets` so
   * `ref` entries can resolve to swatch colors via the style cascade.
   */
  legends?: LegendBlock[];
  /** Resolved style sheets, used by the legend footer to color `ref` entries. */
  styleSheets?: StyleSheet[];
  /**
   * Tag/annotation/id/kind usage from the file. Lets the legend footer
   * fall back to a neutral swatch for refs that are in use on real nodes
   * but not painted by any style rule (e.g. `[human]`).
   */
  legendUsage?: LegendUsage;
  /**
   * Which view this render produces. Drives the legend's scope filter so
   * a `legend deploy "..."` block does not leak into the system view.
   */
  viewScope?: LegendViewScope;
  /**
   * Diagram theme. Drives the chrome palette (canvas background, legend
   * band, empty-state text, diff indicators, …). Defaults to `"dark"` so
   * existing output is unchanged. The matching built-in `.krs.style`
   * variant is selected by the caller (see `index.ts`).
   */
  theme?: DiagramTheme;
  /**
   * System-view node categories the viewer has collapsed (Issue #1821).
   * Each collapsed category's nodes are replaced by a single ⊕ stub before
   * layout, so the diagram reflows and edges to the hidden nodes drop. Omit
   * (or empty) for the default fully-expanded render. Only meaningful on the
   * system view; see `docs/design/layer-toggles.md`.
   */
  collapsedCategories?: ReadonlySet<CategoryId>;
  /**
   * When true, draw the interactive category controls (the ⊖ collapse buttons
   * and hover extent frames) for the live preview (Issue #1821). Defaults to
   * false so static outputs — SVG export, `/render`, CLI, guide diagrams — stay
   * clean. The ⊕ stub of an already-collapsed category is always drawn (it is
   * content, not chrome).
   */
  interactive?: boolean;
  /**
   * System-view grouping axis. `"team"` (#1858, P2a) bands each node's owning
   * team; `"boundary"` (#1822, P2b) bands by declared `boundary`. Omit for the
   * default un-grouped kind-tier layout.
   */
  groupBy?: "team" | "boundary";
  /**
   * Declared-boundary axis (node id → every boundary it is declared in, #2178).
   * Sourced from `krsFile.boundaryMembership`; consumed by layout only when
   * `groupBy === "boundary"`, which bands each node by its primary membership.
   */
  boundaryMembership?: Map<string, string[]>;
  /**
   * `krsFile.scopedBoundaryMembership` — membership from `boundary` blocks
   * declared inside a node block (#2036). Layout picks the entry for the canvas
   * it is drawing, so these frame their own level only.
   */
  scopedBoundaryMembership?: Map<string, Map<string, string[]>>;
  /**
   * Group ids the model declares on the active axis, in declaration order
   * (`declaredGroupOrder`). Keeps a declared-but-unplaceable group in the group
   * order instead of letting the axis map decide which groups exist (#2178).
   */
  declaredGroupOrder?: readonly string[];
  /**
   * Declared group labels for the active axis (#2133), from
   * `buildGroupLabelIndex(krsFile, groupBy)`; layout resolves them per canvas.
   * Titles the group frames; omitted → frames fall back to the group id.
   */
  groupLabels?: GroupLabelIndex;
  /**
   * Team id → declared `label`, from `buildTeamLabelIndex(krsFile)`. Supplies
   * the owner chip's display string on every axis; omitted → the chip falls
   * back to the team id (Issue #2157).
   */
  teamLabels?: ReadonlyMap<string, string>;
  collapsedGroups?: ReadonlySet<string>;
  /**
   * Whether the in-place expansion ⊕/⊖ controls may be drawn (Issue #1921).
   * `render()` sets it from the slice's system count so the affordance only
   * appears on the single-system root, where expansion is actually derived.
   * Internal — set by `render()`, not a public compile option.
   */
  expandable?: boolean;
  /**
   * Where `render` reports the diagnostics only a laid-out view can state
   * (#2179) — today, `boundary-membership-not-drawn`. Whether a boundary's frame
   * can reach a card depends on where the cards landed, so the parser cannot
   * know it and the compile pipeline cannot derive it without laying out.
   *
   * A sink rather than a return value because `render` returns the SVG string,
   * and it is called from surfaces that render *many* views into one artifact
   * (the drill-down and all-layers bundles call it once per level); collecting
   * into a caller-owned array is what lets those accumulate. This mirrors how
   * `ResolvedStyles.warnings` is collected.
   *
   * **Every surface that passes `groupBy` should pass this too** — the `◇` tab
   * is drawn from the layout on all of them, so a surface that omits the sink
   * draws the fallback while its diagnostics list stays silent, which is the
   * split TPL-1983 rules out. Entries are deduplicated on push, so a membership
   * that degrades at several levels of one bundle is stated once.
   */
  diagnosticSink?: Diagnostic[];
}

/**
 * Derives the legend render scope for a logical-view slice (Issue #1513).
 *
 * - The root view (`slice.systems` populated — the system list) is scope
 *   `system`.
 * - Drill-down levels take the scope named after their root node's kind:
 *   `service` / `domain`.
 * - Other drill roots (a system frame, a usecase, …) have no scope keyword
 *   in the legend vocabulary — `undefined` suppresses the footer there.
 */
export function legendScopeForLogicalSlice(slice: ViewSlice): LegendViewScope | undefined {
  if (slice.systems.length > 0) return "system";
  const kind = slice.containerNode?.kind;
  if (kind === "service") return "service";
  if (kind === "domain") return "domain";
  return undefined;
}

export function render(
  viewSlice: ViewSlice,
  styles: ResolvedStyles,
  serviceIdsWithDeploy?: Set<string>,
  ownerIndex?: Map<string, string>,
  displayMode?: DisplayMode,
  childLevelLinks?: Map<string, string>,
  options?: RenderOptions,
): string {
  const edgeDirections = new Map<string, EdgeDirection>();
  for (const [key, edgeStyle] of styles.edges) {
    if (edgeStyle.direction !== "auto") edgeDirections.set(key, edgeStyle.direction);
  }
  const layoutResult = layout(viewSlice, {
    ownerIndex,
    teamLabels: options?.teamLabels,
    boundaryMembership: options?.boundaryMembership,
    scopedBoundaryMembership: options?.scopedBoundaryMembership,
    declaredGroupOrder: options?.declaredGroupOrder,
    groupLabels: options?.groupLabels,
    displayMode,
    layoutHints: styles.layoutHints,
    edgeDirections,
    collapsedCategories: options?.collapsedCategories,
    groupBy: options?.groupBy,
    collapsedGroups: options?.collapsedGroups,
    edgeDiffState: options?.edgeDiffState,
    // Diff state reaches the layout so a removed node cannot be claimed by a
    // band-less boundary (#2176); it must stay in the frame ADR-1886 returns it to.
    nodeDiffState: options?.nodeDiffState,
  });
  const sink = options?.diagnosticSink;
  if (sink) {
    for (const { nodeId, boundaryId } of layoutResult.degradedMemberships ?? []) {
      // The drill-down and all-layers bundles render every level into one
      // artifact through this same call, and a membership can degrade on more
      // than one of them. The fact is the same fact, so state it once.
      const already = sink.some(
        (d) =>
          d.code === "boundary-membership-not-drawn" &&
          d.params.nodeId === nodeId &&
          d.params.boundaryId === boundaryId,
      );
      if (already) continue;
      sink.push({
        severity: "info",
        code: "boundary-membership-not-drawn",
        params: { nodeId, boundaryId },
      });
    }
  }
  const title =
    layoutResult.containers.length === 0 && viewSlice.containerNode
      ? (viewSlice.containerNode.label ?? viewSlice.containerNode.id)
      : undefined;
  return renderFromLayout(
    layoutResult,
    styles,
    title,
    serviceIdsWithDeploy,
    displayMode,
    childLevelLinks,
    // Expansion controls only make sense on the single-system root, where view
    // extraction actually derives expansion (#1921). Drill-down levels have an
    // empty `systems` list and no service nodes, so they never draw one either.
    { ...options, expandable: viewSlice.systems.length <= 1 },
  );
}

export function renderFromLayout(
  layoutResult: LayoutResult,
  styles: ResolvedStyles,
  title?: string,
  serviceIdsWithDeploy?: Set<string>,
  displayMode?: DisplayMode,
  childLevelLinks?: Map<string, string>,
  options?: RenderOptions,
): string {
  const palette = resolvePalette(options?.theme);
  if (layoutResult.nodes.size === 0 && layoutResult.containers.length === 0) {
    return el(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        width: "100%",
        height: "100%",
        viewBox: "0 0 200 100",
      },
      el(
        "text",
        {
          x: 100,
          y: 50,
          "text-anchor": "middle",
          fill: palette.emptyStateText,
          "font-family": "sans-serif",
        },
        escapeXml(options?.emptyLabels?.systemNoNodes ?? DEFAULT_EMPTY_STATE_LABELS.systemNoNodes),
      ),
    );
  }

  const padding = 40;
  const width = layoutResult.width + padding;
  const height = layoutResult.height + padding;

  const parts: string[] = [];

  // Defs: arrow markers
  const defParts: string[] = [];
  const defaultEdgeColor = styles.defaultEdgeStyle.color;
  defParts.push(renderArrowMarker("arrow-default", defaultEdgeColor));

  const edgeColors = new Set<string>();
  for (const [, style] of styles.edges) {
    edgeColors.add(style.color);
  }
  let markerIdx = 0;
  const colorToMarkerId = new Map<string, string>();
  colorToMarkerId.set(defaultEdgeColor, "arrow-default");
  for (const color of edgeColors) {
    if (!colorToMarkerId.has(color)) {
      const id = `arrow-${markerIdx++}`;
      defParts.push(renderArrowMarker(id, color));
      colorToMarkerId.set(color, id);
    }
  }
  parts.push(el("defs", {}, ...defParts));

  // Background
  parts.push(el("rect", { width, height, fill: palette.canvasBg, rx: 0 }));

  // Title label (when no containers — e.g., system-level view)
  if (title) {
    parts.push(
      el(
        "text",
        {
          x: padding / 2,
          y: padding / 2 + 4,
          fill: palette.textMuted,
          "font-size": "14px",
          "font-family": "sans-serif",
          "font-weight": "bold",
        },
        escapeXml(title),
      ),
    );
  }

  // Ghost ancestor containers (outermost first)
  for (const container of layoutResult.containers) {
    if (container.ghost) {
      const containerStyle = styles.nodes.get(container.id) ?? styles.defaultNodeStyle;
      parts.push(renderContainer(container, containerStyle, true));
    }
  }

  // Focused container
  for (const container of layoutResult.containers) {
    if (!container.ghost) {
      const containerStyle = styles.nodes.get(container.id) ?? styles.defaultNodeStyle;
      const diffState = options?.containerDiffState?.get(container.id);
      parts.push(renderContainer(container, containerStyle, false, diffState, palette));
    }
  }

  // Ghost edges — ghost wrapper dims children to GHOST_OPACITY so they read
  // as peripheral. When diff mode is active and a ghost edge has a non-
  // "unchanged" state, move it to the normal-edges group so the diff colors
  // are not washed out by the wrapper opacity.
  const ghostEdgeParts: string[] = [];
  const normalEdgeParts: string[] = [];
  // A collapsed team's re-targeted stub edges are keyed by the stub id, which
  // the original `edgeDiffState` (keyed on pre-collapse endpoints) cannot match;
  // `layout` folds their diff state onto the stub key, so overlay it here so the
  // stub edge keeps its `data-diff-state` (#1886). Stub keys use the reserved
  // `__group_collapsed_*__` prefix, so they never collide with real edge keys.
  const effectiveEdgeDiffState = layoutResult.foldedEdgeDiffState
    ? new Map<string, string>([
        ...(options?.edgeDiffState ?? new Map<string, string>()),
        ...layoutResult.foldedEdgeDiffState,
      ])
    : options?.edgeDiffState;
  // Resolved stroke of each edge, indexed to match `layoutResult.edges` — so a
  // crossing mark can be drawn in its own edge's colour/width (#1859 P2c-C),
  // not a fixed default that detaches from a coloured diagram.
  // Hops grouped by their host edge index (== position in `layoutResult.edges`,
  // the same array `computeCrossingMarks` indexed), so the host edge's stroke can
  // be gapped where each hop jumps over a crossing (#1859 P2c-C).
  const hopsByEdge = new Map<number, HopMark[]>();
  for (const hop of layoutResult.crossingMarks?.hops ?? []) {
    const list = hopsByEdge.get(hop.edge);
    if (list) list.push(hop);
    else hopsByEdge.set(hop.edge, [hop]);
  }
  // Resolve the edge style once per edge (reused by both the label-placement
  // pre-pass and the render loop below).
  const edgeStyleFor = (edgeLayout: LayoutResult["edges"][number]) => {
    const edgeKey = `${edgeLayout.from}->${edgeLayout.to}`;
    // Prefer the kind-qualified style entry so parallel sync/async edges between
    // the same pair keep their own stroke style; fall back to the bare key for
    // synthetic layout edges (delivers, owns, ghosts, aggregated domain edges).
    return (
      styles.edges.get(edgeStyleKey(edgeLayout.from, edgeLayout.to, edgeLayout.kind)) ??
      styles.edges.get(edgeKey) ??
      styles.defaultEdgeStyle
    );
  };

  // Auto label collision-avoidance (#2048): nudge labels that collide with node
  // cards or with each other off their default midpoint. Author-positioned
  // labels (non-default label-position/label-offset) are excluded from moving
  // but still act as obstacles, so author intent wins (ADR-1184 precedence).
  const { inputs: labelInputs, nodeRects } = buildLabelInputs(
    layoutResult.edges,
    layoutResult.nodes,
    edgeStyleFor,
  );
  const labelPlacements = resolveLabelPlacements(labelInputs, nodeRects);

  const edgeStroke: { color: string; strokeWidth: number }[] = [];
  let edgeIndex = 0;
  for (const edgeLayout of layoutResult.edges) {
    const edgeKey = `${edgeLayout.from}->${edgeLayout.to}`;
    const edgeStyle = edgeStyleFor(edgeLayout);
    edgeStroke.push({ color: edgeStyle.color, strokeWidth: edgeStyle.strokeWidth });
    const markerId = colorToMarkerId.get(edgeStyle.color) ?? "arrow-default";
    const diffState = effectiveEdgeDiffState?.get(edgeKey);
    const rendered = renderEdge(
      edgeLayout,
      edgeStyle,
      markerId,
      diffState,
      hopsByEdge.get(edgeIndex),
      labelPlacements.get(edgeIndex),
    );
    edgeIndex++;
    const isDimmedGhost =
      edgeLayout.ghost && (diffState === undefined || diffState === "unchanged");
    if (isDimmedGhost) {
      ghostEdgeParts.push(rendered);
    } else {
      normalEdgeParts.push(rendered);
    }
  }
  if (ghostEdgeParts.length > 0) {
    parts.push(el("g", { class: "ghost-edges", opacity: GHOST_OPACITY }, ...ghostEdgeParts));
  }
  parts.push(el("g", { class: "edges" }, ...normalEdgeParts));

  // Crossing marks on top of the edges (#1859 P2c-C): hop arcs neutralise
  // right-angle crossings and junction dots mark trunk merges. Present only in
  // the Group-by view (ungrouped leaves `crossingMarks` undefined — AC-5).
  if (layoutResult.crossingMarks) {
    const { hops, junctions } = layoutResult.crossingMarks;
    if (hops.length > 0 || junctions.length > 0) {
      parts.push(
        renderCrossingMarks(layoutResult.crossingMarks, edgeStroke, styles.defaultEdgeStyle),
      );
    }
  }

  // Nodes (ghost users first, then normal children). As with edges, a ghost
  // node that is diff-tagged (added / removed / changed) gets promoted to the
  // normal group so the diff colors are not flattened by the wrapper opacity.
  const ghostNodeParts: string[] = [];
  const normalNodeParts: string[] = [];
  // The deploy layout encodes per-container instances as `containerId::unitId`
  // (the map `nodeId`), but both resolved styles and diff metadata are keyed by
  // the bare unit id — `layoutNode.id`, the original AST id (Issue #735 / #1666).
  // So the lookups below fall back to `layoutNode.id`, which lets deploy units
  // pick up their resolved style — notably the Icon Mode `shape: url(...)`,
  // without which they hit `defaultNodeStyle` and never render an icon. For
  // system-view nodes `layoutNode.id === nodeId`, so the fallback is a no-op.
  for (const [nodeId, layoutNode] of layoutResult.nodes) {
    const styleKey = nodeStyleKey(nodeId, layoutNode.annotations);
    const nodeStyle =
      styles.nodes.get(styleKey) ??
      styles.nodes.get(nodeId) ??
      styles.nodes.get(layoutNode.id) ??
      styles.defaultNodeStyle;
    const diffMeta =
      options?.nodeDiffMeta?.get(layoutNode.id) ?? options?.nodeDiffMeta?.get(nodeId);
    const diffState =
      diffMeta?.state ??
      options?.nodeDiffState?.get(layoutNode.id) ??
      options?.nodeDiffState?.get(nodeId);
    const rendered = layoutNode.tags?.includes(CATEGORY_STUB_TAG)
      ? renderCategoryStub(layoutNode, palette)
      : renderNode(
          layoutNode,
          nodeStyle,
          nodeId,
          palette,
          serviceIdsWithDeploy,
          displayMode,
          childLevelLinks,
          diffState,
          diffMeta,
        );
    const isDimmedGhost =
      layoutNode.ghost && (diffState === undefined || diffState === "unchanged");
    if (isDimmedGhost) {
      ghostNodeParts.push(rendered);
    } else {
      normalNodeParts.push(rendered);
    }
  }
  if (ghostNodeParts.length > 0) {
    parts.push(el("g", { class: "ghost-nodes", opacity: GHOST_OPACITY }, ...ghostNodeParts));
  }
  parts.push(el("g", { class: "nodes" }, ...normalNodeParts));

  // Collapsible-category controls: a ⊖ button + hover-revealed extent frame for
  // each open `external` / `infra` group on the system view (Issue #1821).
  // Interactive chrome only — omitted from static outputs (export / render / CLI).
  if (options?.interactive) {
    const categoryControls = renderCategoryControls(layoutResult, palette);
    if (categoryControls) parts.push(categoryControls);
    const groupControls = renderGroupControls(layoutResult, palette, options?.collapsedGroups);
    if (groupControls) parts.push(groupControls);
    // In-place expansion is orthogonal to Group by: team and Phase 1 targets the
    // ungrouped, single-system view (view extraction only derives expansion for
    // the single-system root — #1921), so the ⊕/⊖ controls only appear there.
    // `render()` sets `expandable` from the slice's system count; a multi-system
    // root gets no expand affordance (the ⊕ would be a no-op there).
    if (!options?.groupBy && options?.expandable) {
      const expandControls = renderExpandControls(layoutResult, palette);
      if (expandControls) parts.push(expandControls);
    }
  }

  // Legend footer (Issue #887) — rendered as a band below the diagram so
  // it survives panning and is preserved by single-file SVG exports.
  // The footer's height extends the outer viewBox; positioning is handled
  // via a translate at y=height of the diagram body.
  let totalHeight = height;
  if (options?.legends && options?.legends.length > 0 && options?.viewScope) {
    const footer = buildLegendFooter(
      options.legends,
      options.viewScope,
      options.styleSheets ?? [],
      width,
      palette,
      options.legendUsage,
    );
    if (footer) {
      parts.push(el("g", { transform: `translate(0,${height})` }, footer.svg));
      totalHeight = height + footer.height;
    }
  }

  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${width} ${totalHeight}`,
      width,
      height: totalHeight,
    },
    ...parts,
  );
}

/**
 * The circle + ⊖/⊕ strokes shared by every collapse affordance — category
 * controls / stubs (#1821) and group controls (#1858). `plus` adds the vertical
 * stroke (⊕ = expand); omit it for ⊖ = collapse. Returns the child elements so
 * the caller wraps them in its own `<g>` (with the right data-attributes).
 */
function collapseGlyph(
  cx: number,
  cy: number,
  plus: boolean,
  palette: DiagramPalette,
  opts?: { radius?: number; fill?: string },
): string[] {
  const parts = [
    el("circle", {
      cx,
      cy,
      r: opts?.radius ?? 9,
      fill: opts?.fill ?? palette.surfaceBg,
      stroke: palette.accent,
      "stroke-width": 1.5,
    }),
    el("line", {
      x1: cx - 4,
      y1: cy,
      x2: cx + 4,
      y2: cy,
      stroke: palette.accent,
      "stroke-width": 1.5,
    }),
  ];
  if (plus) {
    parts.push(
      el("line", {
        x1: cx,
        y1: cy - 4,
        x2: cx,
        y2: cy + 4,
        stroke: palette.accent,
        "stroke-width": 1.5,
      }),
    );
  }
  return parts;
}

/**
 * Render the Group-by crossing marks layer (#1859 P2c-C). Emitted above the edge
 * layer so marks sit on top of the lines.
 *
 * - **hop**: a `<path>` arc that bumps *over* the crossing (crossing = NOT
 *   connected), centred at `(x, y)` and oriented along the host segment via
 *   `angle` (degrees). Elliptical (`rx = halfWidth`, `ry = HOP_RADIUS`) so a
 *   clustered wide hop stays a shallow bump; `sweep = 1` bumps to one side. An
 *   axis-aligned hop (`angle = 0`) renders exactly as the pre-#1939 flat bump.
 * - **junction**: a `<circle>` dot at each trunk merge (merge = connected).
 *
 * Each mark is drawn in its owning edge's resolved colour (and the hop in that
 * edge's stroke width) via `edgeStroke[mark.edge]`, so marks stay visually part
 * of the lines they annotate on a colour-styled diagram; `fallback` covers an
 * out-of-range index. Coordinates are rounded to 2 decimals so tiny float noise
 * never destabilises the SVG snapshot.
 *
 * Scope: crossings in any *single-system* view (right-angle and, since #1939,
 * diagonal; grouped and, since #1956, ungrouped). The multi-system view is
 * extended separately (#1939 Part 2) — see docs/design/system-view-grouping.md.
 */
function renderCrossingMarks(
  marks: CrossingMarks,
  edgeStroke: { color: string; strokeWidth: number }[],
  fallback: { color: string; strokeWidth: number },
): string {
  const r = (n: number): number => Number(n.toFixed(2));
  const strokeOf = (edge: number) => edgeStroke[edge] ?? fallback;
  const parts: string[] = [];
  for (const hop of marks.hops) {
    const rad = (hop.angle * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const x0 = r(hop.x - hop.halfWidth * c);
    const y0 = r(hop.y - hop.halfWidth * s);
    const x1 = r(hop.x + hop.halfWidth * c);
    const y1 = r(hop.y + hop.halfWidth * s);
    const stroke = strokeOf(hop.edge);
    parts.push(
      el("path", {
        d: `M ${x0} ${y0} A ${r(hop.halfWidth)} ${HOP_RADIUS} ${r(hop.angle)} 0 1 ${x1} ${y1}`,
        fill: "none",
        stroke: stroke.color,
        "stroke-width": stroke.strokeWidth,
      }),
    );
  }
  for (const j of marks.junctions) {
    parts.push(
      el("circle", { cx: r(j.x), cy: r(j.y), r: JUNCTION_RADIUS, fill: strokeOf(j.edge).color }),
    );
  }
  return el("g", { class: "crossing-marks" }, ...parts);
}

/**
 * The ⊕ placeholder a collapsed category folds to (Issue #1821). Drawn at the
 * stub node's laid-out box. Carries `data-collapse-category` so the app's click
 * delegation expands the category (toggling it out of `collapsedCategories`).
 */
function renderCategoryStub(node: LayoutNode, palette: DiagramPalette): string {
  const cat = categoryOf(node) ?? "";
  const cx = node.x + 18;
  const cy = node.y + node.height / 2;
  return el(
    "g",
    {
      class: "krs-category-stub",
      "data-node-id": escapeXml(node.id),
      "data-collapse-category": cat,
      role: "button",
      tabindex: "0",
    },
    el("rect", {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      rx: 8,
      fill: palette.surfaceBg,
      stroke: palette.mutedBorder,
      "stroke-width": 1,
      "stroke-dasharray": "4 3",
    }),
    ...collapseGlyph(cx, cy, true, palette, { radius: 8, fill: "none" }),
    el(
      "text",
      {
        x: cx + 16,
        y: cy + 4,
        fill: palette.textMuted,
        "font-family": "sans-serif",
        "font-size": 12,
      },
      escapeXml(node.label),
    ),
  );
}

interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function bboxOf(nodes: LayoutNode[]): Bbox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Split nodes into contiguous clusters along x, so a tier row (e.g. infra)
 * yields one cluster while side columns (e.g. `[external]` placed left + right)
 * yield one per side — avoiding a frame that spans the whole diagram.
 */
function clusterByXGap(nodes: LayoutNode[], gap: number): LayoutNode[][] {
  const sorted = [...nodes].sort((a, b) => a.x - b.x);
  const clusters: LayoutNode[][] = [];
  let current: LayoutNode[] = [];
  let rightEdge = -Infinity;
  for (const n of sorted) {
    if (current.length > 0 && n.x - rightEdge > gap) {
      clusters.push(current);
      current = [];
    }
    current.push(n);
    rightEdge = Math.max(rightEdge, n.x + n.width);
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

/**
 * ⊖ collapse buttons + hover-revealed extent frames for the open `external` /
 * `infra` groups (Issue #1821). The ⊖ is always visible (the collapse control);
 * hovering it reveals the group's dashed frame (`:hover` on the group; the frame
 * is `pointer-events: none` so it never blocks node clicks). Each control carries
 * `data-collapse-category` for the app's click delegation.
 */
function renderCategoryControls(layoutResult: LayoutResult, palette: DiagramPalette): string {
  const byCat = new Map<CategoryId, LayoutNode[]>();
  for (const [, node] of layoutResult.nodes) {
    if (node.tags?.includes(CATEGORY_STUB_TAG)) continue; // already collapsed
    const cat = categoryOf(node);
    if (cat === null) continue;
    const list = byCat.get(cat);
    if (list) list.push(node);
    else byCat.set(cat, [node]);
  }
  if (byCat.size === 0) return "";

  const groups: string[] = [];
  for (const [cat, nodes] of byCat) {
    for (const cluster of clusterByXGap(nodes, 80)) {
      const bb = bboxOf(cluster);
      const pad = 8;
      const fx = bb.minX - pad;
      const fy = bb.minY - pad;
      const fw = bb.maxX - bb.minX + pad * 2;
      const fh = bb.maxY - bb.minY + pad * 2;
      groups.push(
        el(
          "g",
          { class: "krs-cat-group", "data-category-group": cat },
          el("rect", {
            class: "krs-cat-frame",
            x: fx,
            y: fy,
            width: fw,
            height: fh,
            rx: 10,
            fill: "transparent",
            stroke: palette.accent,
            "stroke-width": 1.5,
            "stroke-dasharray": "6 4",
            "pointer-events": "none",
          }),
          el(
            "g",
            {
              class: "krs-cat-collapse",
              "data-collapse-category": cat,
              role: "button",
              tabindex: "0",
              transform: `translate(${fx + fw - 2},${fy + 2})`,
            },
            ...collapseGlyph(0, 0, false, palette),
          ),
        ),
      );
    }
  }
  const style = el(
    "style",
    {},
    ".krs-cat-frame{opacity:0;transition:opacity .1s}" +
      ".krs-cat-group:hover .krs-cat-frame{opacity:1}" +
      ".krs-cat-collapse,.krs-category-stub{cursor:pointer}",
  );
  return el("g", { class: "krs-category-controls" }, style, ...groups);
}

/**
 * A ⊖/⊕ toggle at the top-right of each team boundary frame (system-view Group
 * by, #1858 slice B). Shows ⊖ when the group is expanded (click collapses it to
 * its `<Team> (N)` stub) and ⊕ when collapsed (click expands). Carries
 * `data-collapse-group` for the app's click delegation. Interactive chrome only.
 */
function renderGroupControls(
  layoutResult: LayoutResult,
  palette: DiagramPalette,
  collapsedGroups: ReadonlySet<string> | undefined,
): string {
  const buttons: string[] = [];
  for (const container of layoutResult.containers) {
    if (!container.group || container.groupId === undefined) continue;
    // In-place expansion frames are their own control axis (`data-expand-node`,
    // renderExpandControls) — never a team collapse target (#1921).
    if (container.expanded) continue;
    // Collapsed → ⊕ (click expands); expanded → ⊖ (click collapses).
    const collapsed = collapsedGroups?.has(container.groupId) ?? false;
    const bx = container.x + container.width - 2;
    const by = container.y + 2;
    buttons.push(
      el(
        "g",
        {
          class: "krs-group-collapse",
          "data-collapse-group": container.groupId,
          role: "button",
          tabindex: "0",
          transform: `translate(${bx},${by})`,
        },
        ...collapseGlyph(0, 0, collapsed, palette),
      ),
    );
  }
  if (buttons.length === 0) return "";
  const style = el("style", {}, ".krs-group-collapse{cursor:pointer}");
  return el("g", { class: "krs-group-controls" }, style, ...buttons);
}

/**
 * In-place expansion controls (#1921): a ⊕ on every collapsed service box that
 * has domain children (click expands it in place) and a ⊖ on each expanded
 * container's boundary frame (click collapses it back). Both carry
 * `data-expand-node=<serviceId>` for the app's click delegation. Interactive
 * chrome only — never emitted in static output (mirrors renderGroupControls).
 */
function renderExpandControls(layoutResult: LayoutResult, palette: DiagramPalette): string {
  const buttons: string[] = [];
  // ⊖ on expanded frames (click collapses).
  for (const container of layoutResult.containers) {
    if (!container.expanded || container.nodeId === undefined) continue;
    const bx = container.x + container.width - 2;
    const by = container.y + 2;
    buttons.push(
      el(
        "g",
        {
          class: "krs-expand-control",
          "data-expand-node": container.nodeId,
          role: "button",
          tabindex: "0",
          transform: `translate(${bx},${by})`,
        },
        // expanded → ⊖
        ...collapseGlyph(0, 0, false, palette),
      ),
    );
  }
  // ⊕ on collapsed, drillable service boxes (click expands).
  for (const node of layoutResult.nodes.values()) {
    if (node.kind !== "service" || !node.hasChildren) continue;
    const bx = node.x + node.width - 2;
    const by = node.y + 2;
    buttons.push(
      el(
        "g",
        {
          class: "krs-expand-control",
          "data-expand-node": node.id,
          role: "button",
          tabindex: "0",
          transform: `translate(${bx},${by})`,
        },
        // collapsed → ⊕
        ...collapseGlyph(0, 0, true, palette),
      ),
    );
  }
  if (buttons.length === 0) return "";
  const style = el("style", {}, ".krs-expand-control{cursor:pointer}");
  return el("g", { class: "krs-expand-controls" }, style, ...buttons);
}

/**
 * The outline of a union of axis-aligned rects, as an SVG path `d` (#2179).
 *
 * A frame that reaches an out-of-band member is a rectilinear polygon, not a
 * rect. The union is built by **vertical slabs**: every distinct x becomes a
 * boundary, and each slab's vertical extent is the min/max over the rects
 * covering it. That is exact for the shapes `buildGroupFrames` produces, where
 * every strip shares an edge with the band body so each slab's coverage is one
 * contiguous interval — and it stays readable for any number of strips on either
 * side, which a hand-rolled L/T case analysis does not.
 *
 * Returns `null` for a single rect (nothing to union) and for a slab set that is
 * not contiguous, so the caller falls back to the plain `<rect>` rather than
 * drawing an outline that claims rows it does not cover.
 */
export function rectUnionPath(rects: readonly Rect[]): string | null {
  if (rects.length < 2) return null;
  const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.width]))].sort((a, b) => a - b);
  const slabs: { x1: number; x2: number; top: number; bottom: number }[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const x1 = xs[i];
    const x2 = xs[i + 1];
    const mid = (x1 + x2) / 2;
    const covering = rects.filter((r) => r.x <= mid && mid <= r.x + r.width);
    if (covering.length === 0) return null; // a gap along x — not one polygon
    const top = Math.min(...covering.map((r) => r.y));
    const bottom = Math.max(...covering.map((r) => r.y + r.height));
    // Contiguity: the covering rects must form one interval, or the outline
    // would fill a hole the frame does not actually cover.
    const sorted = [...covering].sort((a, b) => a.y - b.y);
    let reach = sorted[0].y + sorted[0].height;
    for (const r of sorted.slice(1)) {
      if (r.y > reach) return null;
      reach = Math.max(reach, r.y + r.height);
    }
    const prev = slabs[slabs.length - 1];
    if (prev && prev.x2 === x1 && prev.top === top && prev.bottom === bottom) prev.x2 = x2;
    else slabs.push({ x1, x2, top, bottom });
  }
  const round = (v: number): number => Math.round(v * 100) / 100;
  // Walk the tops left-to-right, then the bottoms right-to-left.
  const points: [number, number][] = [];
  const push = (x: number, y: number): void => {
    const last = points[points.length - 1];
    // Adjacent slabs meet at a shared x, so the naive walk repeats the corner…
    if (last && last[0] === x && last[1] === y) return;
    // …and slabs that differ on only one side leave collinear points along the
    // other. Fold them so the `d` lists corners, which is what a reader diffing
    // a snapshot wants to compare.
    const prev = points[points.length - 2];
    if (
      last &&
      prev &&
      ((prev[0] === last[0] && last[0] === x) || (prev[1] === last[1] && last[1] === y))
    ) {
      points[points.length - 1] = [x, y];
      return;
    }
    points.push([x, y]);
  };
  for (const s of slabs) {
    push(s.x1, s.top);
    push(s.x2, s.top);
  }
  for (const s of [...slabs].reverse()) {
    push(s.x2, s.bottom);
    push(s.x1, s.bottom);
  }
  return `M ${points.map(([x, y]) => `${round(x)} ${round(y)}`).join(" L ")} Z`;
}

/** Frame tint opacity — low enough that two overlapping fills stay distinguishable. */
const BOUNDARY_FILL_OPACITY = "0.1";

function boundaryHue(container: ContainerRect, palette?: DiagramPalette): string | undefined {
  if (container.hueIndex === undefined || palette === undefined) return undefined;
  const hues = palette.boundaryHues;
  return hues.length > 0 ? hues[container.hueIndex % hues.length] : undefined;
}

function renderContainer(
  container: ContainerRect,
  style: ResolvedNodeStyle,
  ghost: boolean,
  diffState?: string,
  palette?: DiagramPalette,
): string {
  const children: string[] = [];
  // An in-place-expanded container is an active user action (#1921): render it
  // prominently — a solid accent border with a faint accent fill — so the opened
  // service reads as a highlighted region rather than the muted, dashed team
  // frame it reuses geometry from. Without this it disappears into a busy diagram.
  const expanded = container.expanded === true;
  const accent = palette?.accent;
  // Boundary frames (#2179) carry an identifying hue and a low-alpha fill of it.
  // The fill is what makes an overlap read as an overlap: two dashed outlines of
  // the same colour read as nesting, while two tints composite to a third tone
  // in the shared cell. No code draws the intersection — alpha does.
  const hue = boundaryHue(container, palette);
  const outline = container.coverage ? rectUnionPath(container.coverage) : null;
  const frameShape = {
    fill: expanded && accent ? accent : (hue ?? "transparent"),
    "fill-opacity": expanded && accent ? "0.06" : hue ? BOUNDARY_FILL_OPACITY : undefined,
    stroke: expanded && accent ? accent : (hue ?? style.borderColor),
    "stroke-width": expanded ? 2 : hue ? 2 : style.borderWidth,
    "stroke-dasharray": !expanded && (ghost || container.group) ? "8 4" : undefined,
  };
  children.push(
    outline
      ? // A rectilinear outline cannot take `rx`; rounded joins keep it in the
        // same visual language as the rounded rects it sits among.
        el("path", { d: outline, ...frameShape, "stroke-linejoin": "round" })
      : el("rect", {
          x: container.x,
          y: container.y,
          width: container.width,
          height: container.height,
          ...frameShape,
          rx: style.borderRadius,
        }),
  );
  children.push(
    el(
      "text",
      {
        x: container.x + 12,
        y: container.y + 18,
        // The title takes the hue too. Without it the colour ↔ boundary mapping
        // cannot be recovered from the diagram, and the muted 0.7 the team frames
        // use leaves it close to unreadable (#2179).
        fill: expanded && accent ? accent : (hue ?? style.color),
        "font-size": "12px",
        "font-family": style.fontFamily,
        "font-weight": "bold",
        opacity: expanded || hue ? undefined : 0.7,
      },
      escapeXml(container.label),
    ),
  );

  return el(
    "g",
    {
      "data-container-id": container.id,
      "data-kind-band": container.kindBand,
      "data-group": container.group ? "true" : undefined,
      "data-expanded": expanded ? "true" : undefined,
      "data-diff-state": diffState,
      opacity: ghost ? GHOST_OPACITY : undefined,
    },
    ...children,
  );
}

/** Approximate px per character in a 縮退 tab's 10px label, and its horizontal padding. */
const DEGRADED_TAB_CHAR_WIDTH = 6;
const DEGRADED_TAB_PAD = 8;

/**
 * `◇ <boundary>` tabs for memberships no frame could reach (#2179) — the 縮退
 * fallback. Drawn as dashed pills on the card's bottom edge in the frame's own
 * stroke language and hue, so a membership the geometry cannot show still reads
 * as "this card is also inside that frame" rather than as a stray badge.
 *
 * `◇` is U+25C7. The first candidate `⧉` (U+29C9) rasterised as tofu on the PNG
 * path — `packages/app/src/render/png-font-coverage.test.ts` pins the codepoint
 * against the bundled fonts (TPL-1799).
 */
function renderDegradedTabs(
  node: LayoutNode,
  style: ResolvedNodeStyle,
  palette: DiagramPalette,
): string[] {
  const tabs = node.degradedBoundaries;
  if (!tabs || tabs.length === 0) return [];
  const hues = palette.boundaryHues;
  const out: string[] = [];
  // Right-aligned and stacked leftwards, so a card in three boundaries shows all
  // of them rather than silently keeping the first. Each pill is sized from the
  // text it will actually hold and clipped to the room still left on the card:
  // boundary labels are author-written and `charDisplayWidth` counts CJK at
  // 1.5×, so an unmeasured pill overflows its own border and the stack walks off
  // the card's left edge.
  let right = node.x + node.width - 12;
  const y = node.y + node.height - 9;
  for (const tab of tabs) {
    const room = right - (node.x + 4);
    // Below one glyph plus the ellipsis there is nothing legible left to draw.
    if (room < DEGRADED_TAB_PAD * 2 + DEGRADED_TAB_CHAR_WIDTH * 3) break;
    const label = truncateToWidth(
      `◇ ${tab.label}`,
      room - DEGRADED_TAB_PAD * 2,
      DEGRADED_TAB_CHAR_WIDTH,
    );
    const width = estimateTextWidth(label, DEGRADED_TAB_CHAR_WIDTH) + DEGRADED_TAB_PAD * 2;
    const x = right - width;
    const hue = hues.length > 0 ? hues[tab.hueIndex % hues.length] : palette.mutedBorder;
    out.push(
      el("rect", {
        x,
        y,
        width,
        height: 18,
        rx: 9,
        fill: palette.canvasBg,
        stroke: hue,
        "stroke-width": 1,
        "stroke-dasharray": "5 3",
      }),
      el(
        "text",
        {
          x: x + width / 2,
          y: y + 9,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          fill: hue,
          "font-size": "10px",
          "font-family": style.fontFamily,
        },
        escapeXml(label),
      ),
    );
    right = x - 4;
  }
  return out;
}

function renderNode(
  node: LayoutNode,
  style: ResolvedNodeStyle,
  nodeId: string,
  palette: DiagramPalette,
  serviceIdsWithDeploy?: Set<string>,
  displayMode?: DisplayMode,
  childLevelLinks?: Map<string, string>,
  diffState?: string,
  diffMeta?: NodeDiffMeta,
): string {
  const children: string[] = [];

  // For icon-mode nodes, render card frame (background + border) before the icon body.
  // Built-in shapes already include fill/stroke in their own rendering.
  const iconFrame = renderIconFrame(node, style, displayMode);
  if (iconFrame) children.push(iconFrame);

  // Shape
  children.push(renderShape(node.x, node.y, node.width, node.height, style));

  // Resolve text positions
  const shapeName = typeof style.shape === "string" ? style.shape : style.shape.url;
  const iconDef = getIconDef(shapeName);

  const textColor = style.color;
  const fontSize = style.fontSize;
  const displayDesc = node.descriptionSummary ?? node.properties.description;
  const hasMetaRow = node.linkCount > 0 || !!node.properties.team;

  if (iconDef?.labelSlot) {
    children.push(
      ...renderSlottedText(node, style, iconDef, displayMode, textColor, fontSize, displayDesc),
    );
  } else {
    children.push(
      ...renderDefaultText(
        node,
        style,
        palette,
        nodeId,
        textColor,
        fontSize,
        displayDesc,
        hasMetaRow,
      ),
    );
  }

  // Badge (single merged badge driven by the node's current annotations).
  // When diff metadata reports an annotation-only change, the badge is
  // wrapped in `<g data-node-badge data-diff-state="added|removed|unchanged">`
  // so UI can highlight badge churn without painting the whole node amber
  // (Issue #738 / design doc D-2). If the node's badge disappeared because
  // the last annotation was removed, we still emit a ghost badge so the
  // viewer can see *what* was removed.
  const {
    children: badgeParts,
    annotationAddedAttr,
    annotationRemovedAttr,
  } = renderNodeBadge(node, style, palette, nodeId, diffMeta);
  children.push(...badgeParts);

  // Sub-label: shown below the node for ghost domains to indicate the parent service
  const subLabel = renderSubLabel(node, style, textColor, fontSize);
  if (subLabel) children.push(subLabel);

  // Top-right icon buttons: deploy button and info button
  // Buttons are 16px diameter (r=8), spaced 20px apart from right edge
  const showDeployButton =
    DEPLOY_AFFORDANCE_KIND_SET.has(node.kind) && (serviceIdsWithDeploy?.has(nodeId) ?? false);
  // Show info button when the node has any metadata worth displaying in the detail panel.
  // Container nodes (hasChildren) need the button because clicking the body drills down.
  // Leaf nodes also get the button for discoverability, even though clicking the body also opens the panel.
  const showInfoButton =
    node.hasDescription || node.linkCount > 0 || !!node.properties.team || !!node.properties.role;
  const btnY = node.y + 14;
  let btnSlot = 0; // 0 = rightmost, increments leftward

  if (showInfoButton) {
    const btnX = node.x + node.width - 16 - btnSlot * 20;
    btnSlot++;
    children.push(
      renderIconButton(
        "data-info-button",
        nodeId,
        palette.textMuted,
        "i",
        { fontSize: "10px", italic: true },
        btnX,
        btnY,
      ),
    );
  }

  if (showDeployButton) {
    const btnX = node.x + node.width - 16 - btnSlot * 20;
    children.push(
      renderIconButton(
        "data-deploy-button",
        nodeId,
        palette.accent,
        "D",
        { fontSize: "9px", bold: true },
        btnX,
        btnY,
      ),
    );
  }

  // 縮退 tabs paint last so they sit on top of the card body (#2179).
  children.push(...renderDegradedTabs(node, style, palette));

  const nodeEl = el(
    "g",
    {
      "data-node-id": nodeId,
      "data-node-kind": node.kind,
      "data-has-children": node.hasChildren ? "true" : "false",
      "data-has-description": node.hasDescription ? "true" : "false",
      "data-link-count": node.linkCount > 0 ? String(node.linkCount) : undefined,
      "data-diff-state": diffState,
      "data-annotation-added": annotationAddedAttr,
      "data-annotation-removed": annotationRemovedAttr,
      style: node.hasChildren ? "cursor: pointer" : undefined,
      opacity: style.opacity < 1 ? style.opacity : undefined,
    },
    ...children,
  );

  const childLevelId = childLevelLinks?.get(nodeId);
  if (childLevelId) {
    return el("a", { href: `#${childLevelId}` }, nodeEl);
  }
  return nodeEl;
}

/**
 * Icon-mode card frame — the background + border rect drawn before the icon
 * body. Built-in shapes already paint their own fill/stroke, so this only
 * applies when the resolved shape is an external icon (`style.shape` is an
 * object, not a built-in shape name) and the view is in icon display mode.
 */
function renderIconFrame(
  node: LayoutNode,
  style: ResolvedNodeStyle,
  displayMode: DisplayMode | undefined,
): string | undefined {
  const isIconShape = typeof style.shape !== "string";
  if (displayMode !== "icon" || !isIconShape) return undefined;
  return el("rect", {
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    rx: style.borderRadius,
    ry: style.borderRadius,
    fill: style.backgroundColor,
    stroke: style.borderColor,
    "stroke-width": style.borderWidth,
    "stroke-dasharray":
      style.borderStyle === "dashed" ? "8 4" : style.borderStyle === "dotted" ? "2 2" : undefined,
  });
}

/**
 * Text rendered into an icon's declared label/description slots (`krs-label`
 * / `krs-description` positions carried on the SVG icon body) — the icon-mode
 * card's text layout, as opposed to the default centered text stack used by
 * shapes/icons with no slots (see `renderDefaultText`). Caller only invokes
 * this when `iconDef.labelSlot` is present.
 */
function renderSlottedText(
  node: LayoutNode,
  style: ResolvedNodeStyle,
  iconDef: SvgIconDef,
  displayMode: DisplayMode | undefined,
  textColor: string,
  fontSize: number,
  displayDesc: string | undefined,
): string[] {
  const labelSlot = iconDef.labelSlot;
  if (!labelSlot) return [];

  const children: string[] = [];
  const vw = iconDef.viewBoxWidth ?? 24;
  const vh = iconDef.viewBoxHeight ?? 24;
  const scaleX = node.width / vw;
  const scaleY = node.height / vh;

  const labelX = node.x + labelSlot.x * scaleX;
  const labelY = node.y + labelSlot.y * scaleY;
  const labelAnchor = labelSlot.textAnchor ?? "middle";

  // Icon-mode label truncation
  const iconMode = displayMode === "icon";
  const truncatedLabel = iconMode
    ? truncateToWidth(node.label, ICON_LABEL_MAX_WIDTH, ICON_LABEL_CHAR_WIDTH)
    : node.label;
  const labelFontSize = iconMode ? 13 : fontSize;

  children.push(
    el(
      "text",
      {
        x: labelX,
        y: labelY,
        "text-anchor": labelAnchor,
        "dominant-baseline": "central",
        fill: textColor,
        "font-size": `${labelFontSize}px`,
        "font-weight": style.fontWeight,
        "font-family": style.fontFamily,
      },
      escapeXml(truncatedLabel),
    ),
  );

  if (displayDesc && iconDef.descriptionSlot) {
    const descX = node.x + iconDef.descriptionSlot.x * scaleX;
    const descY = node.y + iconDef.descriptionSlot.y * scaleY;
    const descAnchor = iconDef.descriptionSlot.textAnchor ?? "middle";
    const descFontSize = iconMode ? 11 : Math.round(fontSize * RENDERED_DESC_FONT_RATIO);

    if (iconMode) {
      // Multi-line description: wrap text into up to 3 lines with tspan elements
      const lines = wrapToWidth(
        displayDesc,
        ICON_DESC_MAX_WIDTH,
        ICON_DESC_CHAR_WIDTH,
        ICON_DESC_MAX_LINES,
      );
      const tspans = lines.map((line, i) =>
        el(
          "tspan",
          {
            x: descX,
            dy: i === 0 ? "0" : `${ICON_DESC_LINE_HEIGHT}`,
          },
          escapeXml(line),
        ),
      );
      children.push(
        el(
          "text",
          {
            x: descX,
            y: descY,
            "text-anchor": descAnchor,
            "dominant-baseline": "hanging",
            fill: textColor,
            "font-size": `${descFontSize}px`,
            "font-family": style.fontFamily,
            opacity: 0.7,
          },
          ...tspans,
        ),
      );
    } else {
      children.push(
        el(
          "text",
          {
            x: descX,
            y: descY,
            "text-anchor": descAnchor,
            "dominant-baseline": "central",
            fill: textColor,
            "font-size": `${descFontSize}px`,
            "font-family": style.fontFamily,
            opacity: 0.7,
          },
          escapeXml(displayDesc),
        ),
      );
    }
  }

  return children;
}

/**
 * Default centered text stack for shapes/icons with no declared label slot:
 * label, then (as present) description, role, resource badge, capability
 * badge, and the link/team meta row (`renderMetaRow`). Each line grows
 * `nextY` for the next one, and `textLines` centers the whole stack
 * vertically inside the node.
 */
function renderDefaultText(
  node: LayoutNode,
  style: ResolvedNodeStyle,
  palette: DiagramPalette,
  nodeId: string,
  textColor: string,
  fontSize: number,
  displayDesc: string | undefined,
  hasMetaRow: boolean,
): string[] {
  const children: string[] = [];
  const textX = node.x + node.width / 2;
  const textLines =
    1 + (displayDesc ? 1 : 0) + (node.properties.role ? 1 : 0) + (hasMetaRow ? 1 : 0);
  let textY = node.y + node.height / 2;
  if (textLines > 1) textY -= ((textLines - 1) * (fontSize + 4)) / 2;

  children.push(
    el(
      "text",
      {
        x: textX,
        y: textY,
        "text-anchor": "middle",
        "dominant-baseline": "central",
        fill: textColor,
        "font-size": `${fontSize}px`,
        "font-weight": style.fontWeight,
        "font-family": style.fontFamily,
      },
      escapeXml(node.label),
    ),
  );

  let nextY = textY + fontSize + 4;

  if (displayDesc) {
    // Truncate description to fit within the node width
    const descFontSize = Math.round(fontSize * RENDERED_DESC_FONT_RATIO);
    const availableWidth = node.width - 40 * 2; // NODE_PADDING_X = 40
    const descCharWidth = CHAR_WIDTH * RENDERED_DESC_FONT_RATIO;
    const maxChars = Math.max(1, Math.floor(availableWidth / descCharWidth));
    const descChars = [...displayDesc];
    const truncatedDesc =
      descChars.length > maxChars ? descChars.slice(0, maxChars).join("") + "…" : displayDesc;
    children.push(
      el(
        "text",
        {
          x: textX,
          y: nextY,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          fill: textColor,
          "font-size": `${descFontSize}px`,
          "font-family": style.fontFamily,
          opacity: 0.7,
        },
        escapeXml(truncatedDesc),
      ),
    );
    nextY += fontSize + 4;
  }

  if (node.properties.role) {
    children.push(
      el(
        "text",
        {
          x: textX,
          y: nextY,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          fill: textColor,
          "font-size": `${Math.round(fontSize * 0.75)}px`,
          "font-family": style.fontFamily,
          "font-style": "italic",
          opacity: 0.6,
        },
        escapeXml(node.properties.role),
      ),
    );
    nextY += fontSize + 4;
  }

  // Resource badge (client only). Replaces the per-resource text loop with
  // a single "📦 ×N" badge so the card height does not grow with resource
  // count. The full list is surfaced in NodeDetailPanel (Issue #914).
  if (node.properties.resources && node.properties.resources.length > 0) {
    const resCount = node.properties.resources.length;
    const resFontSize = Math.round(fontSize * 0.7);
    const tooltip = node.properties.resources.map((r) => `${r.storageKind} "${r.name}"`).join(", ");
    children.push(
      el(
        "text",
        {
          x: textX,
          y: nextY,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          fill: textColor,
          "font-size": `${resFontSize}px`,
          "font-family": style.fontFamily,
          opacity: 0.8,
          "data-client-resource-count": String(resCount),
        },
        el("title", {}, escapeXml(tooltip)) + escapeXml(`📦 ×${resCount}`),
      ),
    );
    nextY += fontSize + 4;
  }

  // Capability badge (client only). Mirrors the resource badge: a single
  // "🔐 ×N" so the card height stays bounded regardless of how many
  // capabilities the client declares. Full list (including label /
  // description) is surfaced in NodeDetailPanel.
  if (node.properties.capabilities && node.properties.capabilities.length > 0) {
    const capCount = node.properties.capabilities.length;
    const capFontSize = Math.round(fontSize * 0.7);
    const tooltip = node.properties.capabilities.map((c) => c.name).join(", ");
    children.push(
      el(
        "text",
        {
          x: textX,
          y: nextY,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          fill: textColor,
          "font-size": `${capFontSize}px`,
          "font-family": style.fontFamily,
          opacity: 0.8,
          "data-client-capability-count": String(capCount),
        },
        el("title", {}, escapeXml(tooltip)) + escapeXml(`🔐 ×${capCount}`),
      ),
    );
    nextY += fontSize + 4;
  }

  // Meta row: link count + team
  if (hasMetaRow) {
    children.push(...renderMetaRow(node, style, palette, nodeId, textX, nextY));
  }

  return children;
}

/**
 * Link-count / team meta row rendered below a default-text-stack node's
 * badges (Issue #914 / team grouping). `hasMetaRow` (checked by the caller)
 * guarantees at least one of link count / team is present; both, only one,
 * or the layout (left/right split when both) branch on that here.
 */
function renderMetaRow(
  node: LayoutNode,
  style: ResolvedNodeStyle,
  palette: DiagramPalette,
  nodeId: string,
  textX: number,
  nextY: number,
): string[] {
  const children: string[] = [];
  const metaFontSize = `${Math.round(style.fontSize * 0.7)}px`;
  const metaAttrs = {
    "text-anchor": "middle" as const,
    "dominant-baseline": "central" as const,
    fill: palette.textSubtle,
    "font-size": metaFontSize,
    "font-family": style.fontFamily,
  };

  if (node.linkCount > 0 && node.properties.team) {
    // Both link count and team: render link on the left, team on the right
    const linkText = `🔗${node.linkCount}`;
    const teamText = `👥${teamChipText(node.properties.teamLabel ?? node.properties.team)}`;
    const contentLeft = node.x + 40;
    const contentRight = node.x + node.width - 40;
    children.push(
      el(
        "g",
        { "data-link-button": nodeId, style: "cursor: pointer", "pointer-events": "all" },
        el(
          "text",
          { ...metaAttrs, "text-anchor": "start", x: contentLeft, y: nextY },
          escapeXml(linkText),
        ),
      ),
    );
    children.push(
      el(
        "g",
        {
          "data-team-button": node.properties.team,
          style: "cursor: pointer",
          "pointer-events": "all",
        },
        el(
          "text",
          { ...metaAttrs, "text-anchor": "end", x: contentRight, y: nextY },
          escapeXml(teamText),
        ),
      ),
    );
  } else if (node.linkCount > 0) {
    children.push(
      el(
        "g",
        { "data-link-button": nodeId, style: "cursor: pointer", "pointer-events": "all" },
        el("text", { ...metaAttrs, x: textX, y: nextY }, escapeXml(`🔗${node.linkCount}`)),
      ),
    );
  } else if (node.properties.team) {
    const teamDisplay = teamChipText(node.properties.teamLabel ?? node.properties.team);
    children.push(
      el(
        "g",
        {
          "data-team-button": node.properties.team,
          style: "cursor: pointer",
          "pointer-events": "all",
        },
        el("text", { ...metaAttrs, x: textX, y: nextY }, escapeXml(`👥${teamDisplay}`)),
      ),
    );
  }

  return children;
}

/**
 * Annotation-driven badge (a single merged badge per node) plus the delta
 * `data-annotation-added` / `data-annotation-removed` attrs the caller
 * stamps onto the node's `<g>` (Issue #738 / design doc D-2). When the
 * node's last annotation was removed there is no current style badge, but a
 * ghost "removed" placeholder is still emitted so the viewer can see what
 * disappeared.
 */
function renderNodeBadge(
  node: LayoutNode,
  style: ResolvedNodeStyle,
  palette: DiagramPalette,
  nodeId: string,
  diffMeta: NodeDiffMeta | undefined,
): {
  children: string[];
  annotationAddedAttr: string | undefined;
  annotationRemovedAttr: string | undefined;
} {
  const children: string[] = [];
  const annotationsAdded = diffMeta?.changes?.annotations?.added ?? [];
  const annotationsRemoved = diffMeta?.changes?.annotations?.removed ?? [];
  const hasAnnotationDiff = annotationsAdded.length > 0 || annotationsRemoved.length > 0;

  const badgeX = node.x + node.width - 10;
  const badgeY = node.y - 6;
  const hasCurrentBadge = !!(style.badgeIcon || style.badgeLabel);

  if (hasCurrentBadge) {
    const badgeParts = badgeChildren(style, badgeX, badgeY, palette.badgeFallback);
    // Classify badge diff state. With a single merged badge, direction is:
    //   added.length > 0 → "added" (new annotation produced the current badge)
    //   removed.length > 0 (and none added) → "changed" (swap/rewrite)
    //   no diff or diff doesn't touch annotations → undefined (no attr)
    let badgeDiffState: string | undefined;
    if (annotationsAdded.length > 0) badgeDiffState = "added";
    else if (annotationsRemoved.length > 0) badgeDiffState = "changed";
    children.push(
      el("g", { "data-node-badge": nodeId, "data-diff-state": badgeDiffState }, ...badgeParts),
    );
  } else if (annotationsRemoved.length > 0) {
    // Ghost "removed" badge — all annotations were removed, so there is no
    // current style badge. Render a neutral placeholder with a strike so the
    // user still sees *something was removed*.
    const ghostColor = palette.textSubtle;
    children.push(
      el(
        "g",
        { "data-node-badge": nodeId, "data-diff-state": "removed" },
        el("circle", {
          cx: badgeX,
          cy: badgeY,
          r: 10,
          fill: "transparent",
          stroke: ghostColor,
          "stroke-width": 1.5,
          "stroke-dasharray": "3 2",
        }),
        el(
          "text",
          {
            x: badgeX,
            y: badgeY,
            "text-anchor": "middle",
            "dominant-baseline": "central",
            fill: ghostColor,
            "font-size": "10px",
          },
          "−",
        ),
      ),
    );
  }
  // Record annotation delta as data-attrs on the node group below so CSS / UI
  // can query the full before/after sets (badge diff is only a hint).
  const annotationAddedAttr =
    hasAnnotationDiff && annotationsAdded.length > 0 ? annotationsAdded.join(",") : undefined;
  const annotationRemovedAttr =
    hasAnnotationDiff && annotationsRemoved.length > 0 ? annotationsRemoved.join(",") : undefined;

  return { children, annotationAddedAttr, annotationRemovedAttr };
}

/**
 * Sub-label rendered below the node body — used for ghost domains to name
 * the parent service they belong to (`(parentLabel)`).
 */
function renderSubLabel(
  node: LayoutNode,
  style: ResolvedNodeStyle,
  textColor: string,
  fontSize: number,
): string | undefined {
  if (!node.subLabel) return undefined;
  const subLabelFontSize = Math.round(fontSize * 0.75);
  return el(
    "text",
    {
      x: node.x + node.width / 2,
      y: node.y + node.height + subLabelFontSize + 4,
      "text-anchor": "middle",
      "dominant-baseline": "central",
      fill: textColor,
      "font-size": `${subLabelFontSize}px`,
      "font-family": style.fontFamily,
    },
    escapeXml(`(${node.subLabel})`),
  );
}

/**
 * A top-right circular icon button — the shared `g > circle + text` affordance
 * behind the "i" info button and the "D" deploy button. The two differ only in
 * their `data-*` attribute, color, glyph, font size, and glyph emphasis
 * (`italic` vs `bold`), all threaded through params. The `<text>` attribute
 * order keeps `font-style` before `font-weight`; whichever `opts` flag is unset
 * is emitted as `undefined` and dropped by `el`, so each button's serialized
 * string stays byte-identical to the pre-merge dedicated helpers.
 *
 * - Info button (Issue #914): drawn on nodes with metadata worth surfacing in
 *   the detail panel (description, links, team, role). Container nodes get it
 *   too even though clicking the body also drills down, for discoverability.
 * - Deploy button: drawn on service/domain nodes that have at least one deploy
 *   unit realizing them, to jump to the deploy view for this node.
 */
function renderIconButton(
  dataAttr: string,
  nodeId: string,
  color: string,
  glyph: string,
  opts: { fontSize: string; italic?: boolean; bold?: boolean },
  btnX: number,
  btnY: number,
): string {
  return el(
    "g",
    { [dataAttr]: nodeId, style: "cursor: pointer", "pointer-events": "all" },
    el("circle", {
      cx: btnX,
      cy: btnY,
      r: 8,
      fill: "transparent",
      stroke: color,
      "stroke-width": 1,
    }),
    el(
      "text",
      {
        x: btnX,
        y: btnY,
        "text-anchor": "middle",
        "dominant-baseline": "central",
        fill: color,
        "font-size": opts.fontSize,
        "font-family": "sans-serif",
        "font-style": opts.italic ? "italic" : undefined,
        "font-weight": opts.bold ? "bold" : undefined,
      },
      glyph,
    ),
  );
}

// ---------------------------------------------------------------------------
// Icon-mode text helpers
// ---------------------------------------------------------------------------
