import type { EdgeDirection, ResolvedStyles } from "../types/style.js";
import type { ViewSlice } from "../view/view-slice.js";
import { layout } from "./layout.js";
import { CATEGORY_STUB_TAG } from "./category-collapse.js";
import type { DisplayMode, LayoutNode, LayoutResult, Rect } from "./layout-types.js";
import { renderArrowMarker } from "./edge-routing.js";
import { containerStyleOf, renderContainer } from "./container-frame.js";
import { buildLegendFooter, el, escapeXml } from "./svg-builder.js";
import { GHOST_OPACITY } from "./rendering-constants.js";
import { DEFAULT_EMPTY_STATE_LABELS } from "./empty-state-labels.js";
import type { LegendViewScope } from "../types/ast.js";
import { resolvePalette } from "./palette.js";
import { nodePathRefId } from "../parser/node-path.js";
import type { RenderOptions } from "./render-options.js";
import { renderEdgeLayer } from "./edge-layer.js";
import { assignChipZones, chipZoneOf, renderNode } from "./node-card.js";
import { resolveNodeStyle, shapeNameOf } from "./node-style.js";
import {
  renderCategoryControls,
  renderCategoryStub,
  renderExpandControls,
  renderGroupControls,
} from "./canvas-controls.js";

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
  const layoutResult = layout(viewSlice, {
    ownerIndex,
    shapeForNode,
    chipZoneFor,
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

  // Same shape as the edge diff-state merge in `renderEdgeLayer`: a collapse
  // stub is keyed by the stub id, which the pre-collapse membership cannot
  // match, so the folded map overlays it (#2174 / TPL-1886).
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

  parts.push(
    ...renderEdgeLayer(
      layoutResult,
      styles,
      palette,
      colorToMarkerId,
      facetsFor,
      overlay,
      options?.edgeDiffState,
    ),
  );

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
