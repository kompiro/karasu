import type { EdgeDirection, ResolvedStyles } from "../types/style.js";
import type { ViewSlice } from "../view/view-slice.js";
import { layout } from "./layout.js";
import type { GroupLabelIndex } from "./group-labels.js";
import { CATEGORY_STUB_TAG, categoryOf, type CategoryId } from "./category-collapse.js";
import type { DisplayMode, HopMark, LayoutNode, LayoutResult, Rect } from "./layout-types.js";
import { renderEdge, renderArrowMarker } from "./edge-routing.js";
import { edgeLineKeyOf, resolvedEdgeStyle } from "./edge-line-key.js";
import { resolveLabelPlacements, buildLabelInputs } from "./label-placement.js";
import {
  edgesWithMarks,
  renderCrossingMarks,
  renderTrunkBands,
  type MarkState,
} from "./crossing-marks-svg.js";
import { containerStyleOf, frameBordersOf, renderContainer } from "./container-frame.js";
import { buildLegendFooter, el, escapeXml } from "./svg-builder.js";
import { GHOST_OPACITY } from "./rendering-constants.js";
import { edgeKey, type NodeDiffMeta } from "../diff/view-diff.js";
import { DEFAULT_EMPTY_STATE_LABELS, type EmptyStateLabels } from "./empty-state-labels.js";
import type { Diagnostic, LegendBlock, LegendViewScope } from "../types/ast.js";
import type { LegendUsage } from "../legend/usage.js";
import type { StyleSheet } from "../types/style.js";
import { type DiagramPalette, type DiagramTheme, resolvePalette } from "./palette.js";
import { FACET_DIM_OPACITY, type FacetOverlay } from "./facet-overlay.js";
import { nodePathRefId } from "../parser/node-path.js";
import { assignChipZones, chipZoneOf, renderFacetRings, renderNode } from "./node-card.js";
import { resolveNodeStyle, shapeNameOf } from "./node-style.js";

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
   * The canvas cards' diff metadata keyed by full path (`DiffedView.nodesByPath`).
   * When provided, a card that knows its path takes its state from here and
   * nowhere else: a miss means the card has no state, not that it may borrow
   * the bare-id entry of a same-named node (#2934).
   */
  nodeDiffMetaByPath?: Map<string, NodeDiffMeta>;
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
   * When true, draw the per-node info / deploy buttons in the card's corner
   * lane (Issue #2420). Defaults to false, so static outputs carry no button
   * for a viewer that cannot click it.
   *
   * Deliberately not folded into `interactive`: the two name different viewer
   * capabilities. The VS Code webview handles `data-info-button` but has no
   * category-collapse handling, so one shared flag would either take away its
   * ⓘ or give it a dead ⊖.
   */
  nodeControls?: boolean;
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
  /**
   * Resolved facet overlay (#2174). Absent means the overlay is off, and the
   * renderer then emits nothing extra — that absence is what keeps
   * "no facet selected ⇒ byte-identical output" true.
   */
  facetOverlay?: FacetOverlay;
  /**
   * Localized heading for the overlay's legend block. Core keeps an English
   * default, the way `emptyLabels` / `annotationBadgeLabels` do — the renderer
   * never reaches for a translation table.
   */
  facetLegendTitle?: string;
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
  /**
   * Card → anchor of the level it drills to. Keyed by `cardLinkKey` (node-card.ts) for a
   * card with a node path, by bare id otherwise (#2933).
   */
  childLevelLinks?: Map<string, string>,
  options?: RenderOptions,
): string {
  const edgeDirections = new Map<string, EdgeDirection>();
  for (const [key, edgeStyle] of styles.edges) {
    if (edgeStyle.direction !== "auto") edgeDirections.set(key, edgeStyle.direction);
  }
  // Resolved-shape lookup for measureNode's inset-aware sizing (#2366 F) —
  // the same resolveNodeStyle chain renderFromLayout draws with.
  const shapeForNode = (
    id: string,
    annotations: readonly string[],
    path?: readonly string[],
  ): string | undefined =>
    shapeNameOf(resolveNodeStyle(styles, id, annotations, undefined, path).shape);
  // The corner lane the ports must keep clear of (#2422). Resolved here
  // because the lane's width comes from the badge style; layout only knows
  // where the card ended up.
  const palette = resolvePalette(options?.theme);
  const chipZoneFor = (node: LayoutNode): Rect | undefined =>
    // The layout is about to apply the shape insets it was given the hook for,
    // so the lane is measured the way `renderNode` will draw it.
    chipZoneOf(node, node.id, styles, palette, displayMode !== "icon", serviceIdsWithDeploy);
  const edgeLineKey = edgeLineKeyOf(styles, options?.edgeDiffState);
  const layoutResult = layout(viewSlice, {
    ownerIndex,
    shapeForNode,
    chipZoneFor,
    edgeLineKey,
    teamLabels: options?.teamLabels,
    boundaryMembership: options?.boundaryMembership,
    scopedBoundaryMembership: options?.scopedBoundaryMembership,
    declaredGroupOrder: options?.declaredGroupOrder,
    groupLabels: options?.groupLabels,
    displayMode,
    layoutHints: styles.layoutHints,
    layoutHintsByPath: styles.layoutHintsByPath,
    edgeDirections,
    collapsedCategories: options?.collapsedCategories,
    groupBy: options?.groupBy,
    collapsedGroups: options?.collapsedGroups,
    edgeDiffState: options?.edgeDiffState,
    // Diff state reaches the layout so a removed node cannot be claimed by a
    // band-less boundary (#2176); it must stay in the frame ADR-1886 returns it to.
    nodeDiffState: options?.nodeDiffState,
    nodeDiffMetaByPath: options?.nodeDiffMetaByPath,
    // Layout needs the membership only to re-derive it onto collapse stubs; it
    // never influences placement, which is what keeps the overlay orthogonal to
    // the Group-by axis (#2174).
    facetMembership: options?.facetOverlay?.membership,
    facetMembershipByPath: options?.facetOverlay?.membershipByPath,
    facetOrder: options?.facetOverlay?.entries.map((e) => e.id),
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

  assignChipZones(layoutResult, styles, palette, serviceIdsWithDeploy);

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
      parts.push(renderContainer(container, containerStyleOf(styles, container, palette), true));
    }
  }

  // Focused container
  for (const container of layoutResult.containers) {
    if (!container.ghost) {
      const containerStyle = containerStyleOf(styles, container, palette);
      const diffState = options?.containerDiffState?.get(container.id);
      parts.push(
        renderContainer(
          container,
          containerStyle,
          false,
          diffState,
          palette,
          styles.boundaryFrames,
          styles.teamFrames,
        ),
      );
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
  // Same shape as the diff-state merge below: a collapse stub is keyed by the
  // stub id, which the pre-collapse membership cannot match, so the folded map
  // overlays it (#2174 / TPL-1886).
  const overlay = options?.facetOverlay;
  const facetMembership: ReadonlyMap<string, readonly string[]> | undefined = overlay
    ? layoutResult.foldedFacetMembership
      ? new Map<string, readonly string[]>([
          ...overlay.membership,
          ...layoutResult.foldedFacetMembership,
        ])
      : overlay.membership
    : undefined;
  // A card that knows its path is ringed by what that node declared (#2934); the
  // bare union would ring every node sharing its id. Stubs, ghosts and edge
  // endpoints carry no path and read the bare map (with the folded stubs).
  const facetsFor = (
    nodeId: string,
    layoutId: string,
    path?: readonly string[],
  ): readonly string[] =>
    (overlay !== undefined && path !== undefined
      ? overlay.membershipByPath.get(nodePathRefId(path))
      : (facetMembership?.get(nodeId) ?? facetMembership?.get(layoutId))) ?? [];
  /**
   * An edge's own selected facets (#2544), read off the layout edge rather than
   * out of a membership map: an edge's `canonicalId` is `undefined` whenever its
   * base form collided (ADR-1096), so there is no id to key it by. Filtered
   * through the overlay's own order — never the edge's declaration order — so
   * the innermost casing is the same facet on every edge, the rule the node
   * rings follow.
   */
  const facetOrder = overlay?.entries.map((e) => e.id) ?? [];
  const edgeFacetsFor = (edgeLayout: LayoutResult["edges"][number]): readonly string[] => {
    const own = edgeLayout.facets;
    if (!overlay || own === undefined) return [];
    return facetOrder.filter((id) => own.includes(id));
  };

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
  const edgeStyleFor = (edgeLayout: LayoutResult["edges"][number]) =>
    resolvedEdgeStyle(styles, edgeLayout);

  // Auto label collision-avoidance (#2048): nudge labels that collide with node
  // cards, with each other, or with another edge's polyline (#2360) off their
  // default midpoint. A label's own edge line is exempt — that is where it
  // belongs. Author-positioned labels (non-default label-position/label-offset)
  // are excluded from moving but still act as obstacles, so author intent wins
  // (ADR-1184 precedence). A nudge never carries a label onto or across the
  // border of a frame drawn above (#3155), measured on the stroke drawn there.
  const {
    inputs: labelInputs,
    nodeRects,
    edgeLines,
  } = buildLabelInputs(layoutResult.edges, layoutResult.nodes, edgeStyleFor);
  const frameBorders = frameBordersOf(layoutResult, styles, palette);
  const labelPlacements = resolveLabelPlacements(labelInputs, nodeRects, edgeLines, frameBorders);
  // Labels the pass could not seat clear under `label-display: auto` (#3022).
  // The pass reports them on its inputs; `renderEdge` leaves them off the canvas.
  const deferredLabels = new Set(labelInputs.filter((l) => l.deferred).map((l) => l.index));

  const edgeStroke: { color: string; strokeWidth: number }[] = [];
  const markedEdges = edgesWithMarks(layoutResult.crossingMarks);
  // What the crossing marks follow from their edges (#3157), by edge index.
  const markState: MarkState = { dimmed: new Set(), diffStates: [] };
  let edgeIndex = 0;
  for (const edgeLayout of layoutResult.edges) {
    const edgeStyle = edgeStyleFor(edgeLayout);
    edgeStroke.push({ color: edgeStyle.color, strokeWidth: edgeStyle.strokeWidth });
    const markerId = colorToMarkerId.get(edgeStyle.color) ?? "arrow-default";
    // An edge that resolved its own state while being laid out wins over the
    // keyed map (#2756): on the multi-system root the `edgeKey` is shared by every
    // frame that draws the same pair, so the map cannot tell them apart. Layout
    // leaves it unset everywhere else, where the keyed lookup is the answer.
    const diffState = edgeLayout.diffState ?? effectiveEdgeDiffState?.get(edgeKey(edgeLayout));
    // An edge belongs to the selection two ways, and either one is enough to
    // keep it at full strength: it carries the facet itself (#2544), or it
    // touches a member node. The second is why the rule is "dim when *both*
    // endpoints are outside" — where the highlighted set meets the rest of the
    // model is the main thing an overlay is read for.
    // An endpoint is read through its card, so a card sharing its id with a
    // member does not keep its edge lit (#2934); the multi-system root names
    // the card by `fromKey` / `toKey`, every other canvas by the bare id.
    const endpointFacets = (id: string, key: string | undefined): readonly string[] =>
      facetsFor(id, id, layoutResult.nodes.get(key ?? id)?.path);
    const edgeFacets = edgeFacetsFor(edgeLayout);
    const edgeDimmed =
      overlay !== undefined &&
      edgeFacets.length === 0 &&
      endpointFacets(edgeLayout.from, edgeLayout.fromKey).length === 0 &&
      endpointFacets(edgeLayout.to, edgeLayout.toKey).length === 0;
    const rendered = renderEdge(
      edgeLayout,
      edgeStyle,
      markerId,
      diffState,
      hopsByEdge.get(edgeIndex),
      labelPlacements.get(edgeIndex),
      edgeFacets,
      overlay?.colorOf,
      deferredLabels.has(edgeIndex),
      markedEdges.has(edgeIndex) ? edgeIndex : undefined,
    );
    if (edgeDimmed) markState.dimmed.add(edgeIndex);
    markState.diffStates[edgeIndex] = diffState;
    edgeIndex++;
    const withDim = edgeDimmed ? el("g", { opacity: FACET_DIM_OPACITY }, rendered) : rendered;
    const isDimmedGhost =
      edgeLayout.ghost && (diffState === undefined || diffState === "unchanged");
    if (isDimmedGhost) {
      ghostEdgeParts.push(withDim);
    } else {
      normalEdgeParts.push(withDim);
    }
  }
  if (ghostEdgeParts.length > 0) {
    parts.push(el("g", { class: "ghost-edges", opacity: GHOST_OPACITY }, ...ghostEdgeParts));
  }
  // Trunk bands under the edges (#2883): the stretches several edges share,
  // drawn as wide as the count they carry. Behind the lines, so a band reads as
  // the backdrop it is and the lines stay what you follow.
  if (layoutResult.crossingMarks && layoutResult.crossingMarks.bands.length > 0) {
    parts.push(
      renderTrunkBands(
        layoutResult.crossingMarks.bands,
        edgeStroke,
        styles.defaultEdgeStyle,
        markState,
      ),
    );
  }
  parts.push(el("g", { class: "edges" }, ...normalEdgeParts));

  // Crossing marks on top of the edges (#1859 P2c-C): hop arcs neutralise
  // right-angle crossings and the merge mark carries the count a trunk goes on
  // to hold. Present only in the Group-by view (ungrouped leaves
  // `crossingMarks` undefined — AC-5).
  if (layoutResult.crossingMarks) {
    const { hops, junctions } = layoutResult.crossingMarks;
    if (hops.length > 0 || junctions.length > 0) {
      parts.push(
        renderCrossingMarks(
          layoutResult.crossingMarks,
          edgeStroke,
          styles.defaultEdgeStyle,
          palette,
          markState,
        ),
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
  // The element id — `data-node-id` and every per-node lookup keyed by it — is
  // the Map key only where the layout says the key is the identity (deploy,
  // `nodeIdentity: "key"`). Otherwise it is the node's own bare id: the
  // multi-system root keys its Map by (system, id) so two same-named nodes both
  // survive the merge, while the id space the app, the outline and the
  // permalinks read stays the bare id (#2917).
  const elementIdOf = (mapKey: string, layoutNode: LayoutNode): string =>
    layoutResult.nodeIdentity === "key" ? mapKey : layoutNode.id;
  for (const [mapKey, layoutNode] of layoutResult.nodes) {
    const nodeId = elementIdOf(mapKey, layoutNode);
    const nodeStyle = resolveNodeStyle(
      styles,
      nodeId,
      layoutNode.annotations,
      layoutNode.id,
      layoutNode.path,
    );
    const byPath =
      layoutNode.path !== undefined && options?.nodeDiffMetaByPath !== undefined
        ? options.nodeDiffMetaByPath
        : undefined;
    const diffMeta = byPath
      ? byPath.get(nodePathRefId(layoutNode.path!))
      : (options?.nodeDiffMeta?.get(layoutNode.id) ?? options?.nodeDiffMeta?.get(nodeId));
    const diffState = byPath
      ? diffMeta?.state
      : (diffMeta?.state ??
        options?.nodeDiffState?.get(layoutNode.id) ??
        options?.nodeDiffState?.get(nodeId));
    const rendered = layoutNode.tags?.includes(CATEGORY_STUB_TAG)
      ? renderCategoryStub(
          layoutNode,
          palette,
          facetsFor(nodeId, layoutNode.id, layoutNode.path),
          overlay !== undefined,
          overlay?.colorOf,
        )
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
          facetsFor(nodeId, layoutNode.id, layoutNode.path),
          overlay !== undefined,
          overlay?.colorOf,
          styles.boundaryFrames,
          layoutResult.shapeInsetsApplied ?? false,
          options?.nodeControls ?? false,
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
  // The overlay contributes its own colour key, so the band is drawn whenever
  // *either* an authored legend applies or facets are selected — a reader
  // looking at coloured rings must be able to find out what they mean, even in a
  // model that declares no `legend` at all (#2174).
  const facetLegendBlock =
    overlay && overlay.entries.length > 0
      ? {
          title: options?.facetLegendTitle ?? "Facets",
          rows: overlay.entries.map((e) => ({ color: e.color, label: e.label })),
        }
      : undefined;
  const hasAuthoredLegend =
    !!options?.legends && options.legends.length > 0 && !!options?.viewScope;
  if (hasAuthoredLegend || facetLegendBlock) {
    const footer = buildLegendFooter(
      options?.legends ?? [],
      options?.viewScope ?? "system",
      options?.styleSheets ?? [],
      width,
      palette,
      options?.legendUsage,
      facetLegendBlock,
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
 * The ⊕ placeholder a collapsed category folds to (Issue #1821). Drawn at the
 * stub node's laid-out box. Carries `data-collapse-category` so the app's click
 * delegation expands the category (toggling it out of `collapsedCategories`).
 */
function renderCategoryStub(
  node: LayoutNode,
  palette: DiagramPalette,
  /**
   * Facets folded onto this stub (#2174). A collapsed category that hides
   * members of a selected facet still has to say so, or collapsing reads as
   * "nothing here belongs" (TPL-1886).
   */
  facets: readonly string[] = [],
  overlayOn = false,
  facetColorOf?: ReadonlyMap<string, string>,
): string {
  const cat = categoryOf(node) ?? "";
  const cx = node.x + 18;
  const cy = node.y + node.height / 2;
  const rings =
    facets.length > 0 && facetColorOf ? renderFacetRings(node, facets, facetColorOf) : [];
  return el(
    "g",
    {
      class: "krs-category-stub",
      "data-node-id": escapeXml(node.id),
      "data-collapse-category": cat,
      "data-facet-member": facets.length > 0 ? facets.join(" ") : undefined,
      role: "button",
      tabindex: "0",
      opacity: overlayOn && facets.length === 0 ? FACET_DIM_OPACITY : undefined,
    },
    ...rings,
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
