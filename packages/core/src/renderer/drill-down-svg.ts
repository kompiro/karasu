import type { KrsFile, KrsNode, TeamNode } from "../types/ast.js";
import type { StyleSheet } from "../types/style.js";
import type { DisplayMode } from "./layout-types.js";
import { extractView, extractEntityView } from "../view/view-extract.js";
import type { ViewPath } from "../view/view-extract.js";
import { withUnassignedSystem } from "../view/unassigned-system.js";
import { extractOrgView } from "../view/org-view-extract.js";
import { extractDeployView } from "../view/deploy-view-extract.js";
import { render, sanitizeId, anchorId, legendScopeForLogicalSlice } from "./svg-renderer.js";
import { buildGroupLabelIndex } from "./group-labels.js";
import { renderOrgView } from "./org-renderer.js";
import { renderDeploy } from "./deploy-renderer.js";
import { escapeXml } from "./svg-builder.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { analyze } from "../resolver/warnings.js";
import {
  extractSvgParts,
  buildStyles,
  buildNoDiagramSvg,
  buildLegendRenderOptions,
  type LegendRenderOptions,
  type DrillDownCallbacks,
  type SvgResult,
  type AllViewsSvgResult,
} from "./all-layers-svg.js";
import { DEFAULT_EMPTY_STATE_LABELS, type EmptyStateLabels } from "./empty-state-labels.js";
import type { AnnotationBadgeLabels } from "../builtins/default-style.js";
import { type DiagramPalette, type DiagramTheme, resolvePalette } from "./palette.js";
import "../renderer/shapes.js"; // ensure built-in shapes are registered

function buildDrillDownCss(palette: DiagramPalette): string {
  return `
  .krs-view { display: none; }
  svg:not(:has(.krs-view:target)) .krs-root-level { display: block; }
  .krs-view:target { display: block; }
  .krs-back-button rect { fill: ${palette.border}; stroke: ${palette.textMuted}; stroke-width: 1; }
  .krs-back-button text { fill: ${palette.textPrimary}; font-family: sans-serif; font-size: 13px; }
  .krs-back-button { cursor: pointer; }
`.trim();
}

function renderBackButton(parentViewId: string, viewPrefix: string): string {
  return `<a href="#${anchorId(viewPrefix, parentViewId)}" tabindex="0"><g class="krs-back-button" transform="translate(20, 10)"><rect x="0" y="0" width="80" height="26" rx="4"/><text x="40" y="17" text-anchor="middle">&#x2190; Back</text></g></a>`;
}

// ─── Drill-down SVG (CSS :target navigation) ───────────────────────────────

function collectDrillDownLevelsGeneric<S>(
  callbacks: DrillDownCallbacks<S>,
  path: string[],
  viewId: string,
  parentViewId: string | null,
  levels: string[],
  viewPrefix: string,
): void {
  const slice = callbacks.getSlice(path);
  if (!callbacks.hasContent(slice)) return;

  const children = callbacks.getChildren(slice);
  // A child is drillable only if it actually emits a level. Having children is
  // necessary but not sufficient: a domain whose only children are entities
  // renders an empty usecase view (entities live in the separate
  // #krs-entity-<id> view), so `hasContent` is false and no #krs-system-<id>
  // level is emitted. Linking to it would dead-end and bounce back to root.
  const drillable = children.filter(
    (c) => c.children.length > 0 && callbacks.hasContent(callbacks.getSlice([...path, c.id])),
  );
  const childLevelLinks = new Map(drillable.map((c) => [c.id, anchorId(viewPrefix, c.id)]));

  const svg = callbacks.render(slice, childLevelLinks);
  const { viewBox, innerContent } = extractSvgParts(svg);

  const backButton = parentViewId !== null ? renderBackButton(parentViewId, viewPrefix) : "";
  // Paint the back button after (on top of) innerContent: innerContent carries
  // the opaque level canvas <rect>, and SVG paints in document order, so a
  // back button emitted first is buried and becomes invisible/unclickable
  // (#2044). It must come last to stay hit-testable.
  const innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${innerContent}${backButton}</svg>`;
  const cssClass = parentViewId === null ? "krs-view krs-root-level" : "krs-view";
  levels.push(`<g id="${anchorId(viewPrefix, viewId)}" class="${cssClass}">${innerSvg}</g>`);

  for (const child of drillable) {
    collectDrillDownLevelsGeneric(
      callbacks,
      [...path, child.id],
      sanitizeId(child.id),
      viewId,
      levels,
      viewPrefix,
    );
  }
}

/**
 * Builds a single SVG with all drill-down levels navigable via CSS :target + :has().
 * No JavaScript required. Each level is hidden/shown by CSS based on the URL fragment.
 */
export function buildDrillDownSvg(
  krsFile: KrsFile,
  styleSource?: string,
  displayMode?: DisplayMode,
  emptyStateLabels?: EmptyStateLabels,
  theme?: DiagramTheme,
  badgeLabels?: AnnotationBadgeLabels,
  groupBy?: "team" | "boundary",
): SvgResult {
  const effectiveSystems = withUnassignedSystem(krsFile);
  const rootSlice = extractView(effectiveSystems, []);
  if (rootSlice.childNodes.length === 0) {
    return {
      svg: buildNoDiagramSvg(emptyStateLabels, true, theme),
      diagnostics: [],
    };
  }

  const { sheets, diagnostics } = buildStyles(displayMode, styleSource, theme, badgeLabels);
  const styles = resolveStyles(effectiveSystems, sheets, []);
  const ownerIndex = krsFile.ownerIndex ?? new Map();
  const groupLabels = buildGroupLabelIndex(krsFile, groupBy);
  const legendOptions = buildLegendRenderOptions(krsFile, sheets);

  const levels: string[] = [];
  collectDrillDownLevelsGeneric(
    {
      getSlice: (path) => extractView(effectiveSystems, path),
      hasContent: (slice) => slice.childNodes.length > 0 || slice.systems.length > 0,
      // At the multi-system root view we need every owning system's children
      // (real + synthesized "Unassigned" pseudo-system) so drill-down pages
      // are produced for each. For deeper levels slice.systems is empty and
      // we fall back to the container's direct children.
      getChildren: (slice) =>
        slice.systems.length > 0 ? slice.systems.flatMap((s) => s.children) : slice.childNodes,
      render: (slice, links) =>
        render(slice, styles, undefined, ownerIndex, displayMode, links, {
          theme,
          ...legendOptions,
          viewScope: legendScopeForLogicalSlice(slice),
          // Grouping resolves per level, against the nodes drawn there (#1983);
          // collapse off by design.
          groupBy,
          boundaryIndex: krsFile.boundaryIndex,
          scopedBoundaryIndex: krsFile.scopedBoundaryIndex,
          groupLabels,
        }),
    },
    [],
    "root",
    null,
    levels,
    "system",
  );

  // Per-domain entity views (#krs-entity-<domainId>): the same levels the
  // all-views bundle emits, reachable in the standalone system drill-down
  // export too (the app's "-drilldown.svg"). They share the system levels'
  // CSS :target mechanism, stay hidden by default (class krs-view, not
  // krs-root-level), and each carries its own back button.
  const entityLevels = collectEntityLevels(
    effectiveSystems,
    sheets,
    ownerIndex,
    displayMode,
    theme,
    legendOptions,
    groupBy,
    krsFile.boundaryIndex,
    krsFile.scopedBoundaryIndex,
    groupLabels,
  );
  for (const level of entityLevels) levels.push(level.element);

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><style>${buildDrillDownCss(resolvePalette(theme))}</style>${levels.join("")}</svg>`,
    diagnostics,
  };
}

/**
 * Result of {@link renderEntityView}. Extends {@link SvgResult} with an explicit
 * `hasContent` flag so callers gate UI (e.g. the app's usecase/entity toggle) on
 * a structured signal rather than scanning the rendered SVG text — `false` means
 * the path did not resolve to a domain that owns entities and `svg` is the
 * empty-diagram placeholder.
 */
export interface EntityViewResult extends SvgResult {
  hasContent: boolean;
}

/**
 * Render the **live, single-level entity view** of the domain addressed by
 * `viewPath` — the interactive counterpart to the static `#krs-entity-<id>`
 * bundle level. Unlike {@link buildDrillDownSvg} it emits one plain `<svg>` (no
 * CSS `:target` levels, no back button); the app drives view state itself and
 * swaps this SVG in when the entity sub-mode is toggled on for a drilled
 * domain. Returns the empty-diagram placeholder (with `hasContent: false`) when
 * the path does not resolve to a domain that owns entities. Mirrors
 * {@link renderOrgTreeView}'s role for the org view.
 */
export function renderEntityView(
  krsFile: KrsFile,
  viewPath: ViewPath,
  styleSource?: string,
  displayMode?: DisplayMode,
  emptyStateLabels?: EmptyStateLabels,
  theme?: DiagramTheme,
  badgeLabels?: AnnotationBadgeLabels,
  groupBy?: "team" | "boundary",
): EntityViewResult {
  const effectiveSystems = withUnassignedSystem(krsFile);
  const { sheets, diagnostics } = buildStyles(displayMode, styleSource, theme, badgeLabels);
  const slice = extractEntityView(effectiveSystems, viewPath);
  if (slice.childNodes.length === 0) {
    return {
      svg: buildNoDiagramSvg(emptyStateLabels, true, theme),
      diagnostics,
      hasContent: false,
    };
  }
  const styles = resolveStyles(effectiveSystems, sheets, []);
  const ownerIndex = krsFile.ownerIndex ?? new Map();
  const legendOptions = buildLegendRenderOptions(krsFile, sheets);
  // Grouping resolves per view: entity members frame here, like any other
  // level (#1983). No `interactive` / `collapsedGroups` — frames only, the
  // collapse ⊖ control stays a system-view affordance (ADR-1821).
  const svg = render(slice, styles, undefined, ownerIndex, displayMode, new Map(), {
    theme,
    ...legendOptions,
    viewScope: legendScopeForLogicalSlice(slice),
    groupBy,
    boundaryIndex: krsFile.boundaryIndex,
    scopedBoundaryIndex: krsFile.scopedBoundaryIndex,
    groupLabels: buildGroupLabelIndex(krsFile, groupBy),
  });
  return { svg, diagnostics, hasContent: true };
}

// ─── Org Drill-down SVG (CSS :target navigation) ─────────────────────────────

/**
 * Builds a single SVG with all org drill-down levels navigable via CSS :target + :has().
 * No JavaScript required. Each level is hidden/shown by CSS based on the URL fragment.
 */
export function buildDrillDownSvgOrg(
  krsFile: KrsFile,
  styleSource?: string,
  displayMode?: DisplayMode,
  emptyStateLabels?: EmptyStateLabels,
  theme?: DiagramTheme,
  badgeLabels?: AnnotationBadgeLabels,
): SvgResult {
  const topLevelTeams = krsFile.organizations.flatMap((o) => o.teams);
  if (topLevelTeams.length === 0) {
    const text = escapeXml(
      emptyStateLabels?.orgPlaceholder ?? DEFAULT_EMPTY_STATE_LABELS.orgPlaceholder,
    );
    const palette = resolvePalette(theme);
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="${palette.emptyStateText}" font-family="sans-serif">${text}</text></svg>`,
      diagnostics: [],
    };
  }

  const { sheets, diagnostics } = buildStyles(displayMode, styleSource, theme, badgeLabels);
  const styles = resolveStyles(krsFile.systems, sheets, [], krsFile.organizations);
  const legendOptions = buildLegendRenderOptions(krsFile, sheets);

  const levels: string[] = [];
  collectDrillDownLevelsGeneric(
    {
      getSlice: (path) => extractOrgView(krsFile.organizations, path),
      hasContent: (slice) => slice.focusedTeam !== null || slice.teams.length > 0,
      getChildren: (slice) =>
        slice.focusedTeam !== null
          ? slice.focusedTeam.children.filter((c): c is TeamNode => c.kind === "team")
          : slice.teams,
      // renderOrgView paints the legend footer on its top-level branch only,
      // so drilled team levels stay legend-free (org has no depth vocabulary).
      render: (slice, links) =>
        renderOrgView(slice, styles, displayMode, links, { theme, ...legendOptions }),
    },
    [],
    "root",
    null,
    levels,
    "org",
  );

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><style>${buildDrillDownCss(resolvePalette(theme))}</style>${levels.join("")}</svg>`,
    diagnostics,
  };
}

// ─── All Views Bundled SVG (tab navigation + per-view drill-down) ─────────────

type ViewType = "system" | "deploy" | "org";
const TAB_HEIGHT = 32;
const TAB_WIDTH = 100;
const VIEW_TYPES: { type: ViewType; label: string }[] = [
  { type: "system", label: "System" },
  { type: "deploy", label: "Deploy" },
  { type: "org", label: "Org" },
];

interface BundledLevel {
  element: string;
  width: number;
  height: number;
}

function collectDrillDownLevelsWithDimensions<S>(
  callbacks: DrillDownCallbacks<S>,
  path: string[],
  viewId: string,
  parentViewId: string | null,
  levels: BundledLevel[],
  viewPrefix: string,
): void {
  const slice = callbacks.getSlice(path);
  if (!callbacks.hasContent(slice)) return;

  const children = callbacks.getChildren(slice);
  // A child is drillable only if it actually emits a level. Having children is
  // necessary but not sufficient: a domain whose only children are entities
  // renders an empty usecase view (entities live in the separate
  // #krs-entity-<id> view), so `hasContent` is false and no #krs-system-<id>
  // level is emitted. Linking to it would dead-end and bounce back to root.
  const drillable = children.filter(
    (c) => c.children.length > 0 && callbacks.hasContent(callbacks.getSlice([...path, c.id])),
  );
  const childLevelLinks = new Map(drillable.map((c) => [c.id, anchorId(viewPrefix, c.id)]));

  const svg = callbacks.render(slice, childLevelLinks);
  const { viewBox, innerContent, width, height } = extractSvgParts(svg);

  const backButton = parentViewId !== null ? renderBackButton(parentViewId, viewPrefix) : "";
  // Back button last so it paints on top of the opaque level canvas rect (#2044).
  const innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${innerContent}${backButton}</svg>`;
  const cssClass = parentViewId === null ? "krs-view krs-root-level" : "krs-view";
  const element = `<g id="${anchorId(viewPrefix, viewId)}" class="${cssClass}">${innerSvg}</g>`;
  levels.push({ element, width, height });

  for (const child of drillable) {
    collectDrillDownLevelsWithDimensions(
      callbacks,
      [...path, child.id],
      sanitizeId(child.id),
      viewId,
      levels,
      viewPrefix,
    );
  }
}

/**
 * Collect the per-domain **entity view** levels for the all-views bundle. Each
 * domain that owns entities gets one `<g id="krs-entity-<domainId>">` level (a
 * flat view, no further drill), reachable via the `#krs-entity-<domainId>`
 * fragment. Back navigation returns to the domain's usecase view
 * (`#krs-system-<domainId>`) when it exists; an entity-only domain has no
 * usecase level, so it falls back to the parent drill level (or the system
 * root) to avoid a dead back-link. The interactive toggle that links to these
 * levels lands with the app integration.
 */
function collectEntityLevels(
  effectiveSystems: KrsNode[],
  sheets: StyleSheet[],
  ownerIndex: Map<string, string>,
  displayMode: DisplayMode | undefined,
  theme: DiagramTheme | undefined,
  legendOptions: ReturnType<typeof buildLegendRenderOptions>,
  groupBy?: "team" | "boundary",
  boundaryIndex?: Map<string, string>,
  scopedBoundaryIndex?: Map<string, Map<string, string>>,
  groupLabels?: Map<string, string>,
): BundledLevel[] {
  const levels: BundledLevel[] = [];
  const styles = resolveStyles(effectiveSystems, sheets, []);

  // Enumerate every domain at any depth (domain under system / service, or a
  // nested sub-domain) with its full drill path, mirroring how the system view
  // recurses into any child that has children.
  const domainsWithPath: { domain: KrsNode; path: string[] }[] = [];
  const walk = (node: KrsNode, path: string[]): void => {
    const here = [...path, node.id];
    if (node.kind === "domain") domainsWithPath.push({ domain: node, path: here });
    for (const child of node.children) walk(child, here);
  };
  for (const system of effectiveSystems) {
    for (const child of system.children) walk(child, [system.id]);
  }

  for (const { domain, path } of domainsWithPath) {
    const slice = extractEntityView(effectiveSystems, path);
    if (slice.childNodes.length === 0) continue;
    const svg = render(slice, styles, undefined, ownerIndex, displayMode, new Map(), {
      theme,
      ...legendOptions,
      viewScope: legendScopeForLogicalSlice(slice),
      // Grouping resolves per level: entity members frame in their entity
      // view too (#1983); collapse off by design.
      groupBy,
      boundaryIndex,
      scopedBoundaryIndex,
      groupLabels,
    });
    const { viewBox, innerContent } = extractSvgParts(svg);
    // Back target: the domain's usecase view when it exists (the domain has
    // non-entity children, so extractView emits a #krs-system-<domainId>
    // level), otherwise the parent drill level (always emitted). This avoids a
    // dead back-link for entity-only domains.
    const hasUsecaseView = domain.children.some((c) => c.kind !== "entity");
    const backTarget = hasUsecaseView
      ? domain.id
      : path.length >= 3
        ? path[path.length - 2]
        : "root";
    const backButton = renderBackButton(backTarget, "system");
    // Back button last so it paints on top of the opaque level canvas rect (#2044).
    const innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${innerContent}${backButton}</svg>`;
    levels.push({
      // Entity levels do not contribute to the shared canvas dimensions (they
      // are fragment-only in v1); they scale to fit the bundle viewBox.
      element: `<g id="${anchorId("entity", domain.id)}" class="krs-view">${innerSvg}</g>`,
      width: 0,
      height: 0,
    });
  }
  return levels;
}

function renderTabBar(enabledViews: Set<ViewType>): string {
  const tabs = VIEW_TYPES.map(({ type, label }, i) => {
    const x = i * TAB_WIDTH;
    const disabled = !enabledViews.has(type);
    const cssClass = disabled
      ? `krs-tab krs-tab--${type} krs-tab--disabled`
      : `krs-tab krs-tab--${type}`;
    const inner = `<rect x="${x}" y="0" width="${TAB_WIDTH}" height="${TAB_HEIGHT}"/><text x="${x + TAB_WIDTH / 2}" y="${TAB_HEIGHT / 2 + 5}" text-anchor="middle">${escapeXml(label)}</text>`;
    if (disabled) {
      return `<g class="${cssClass}">${inner}</g>`;
    }
    return `<a href="#${anchorId(type, "root")}"><g class="${cssClass}">${inner}</g></a>`;
  });
  return `<g class="krs-tab-bar">${tabs.join("")}</g>`;
}

function buildAllViewsCss(palette: DiagramPalette): string {
  return `
  .krs-pane { display: none; }
  .krs-view { display: none; }
  svg:not(:has(.krs-view:target)) .krs-root-level { display: block; }
  .krs-view:target { display: block; }
  .krs-pane--system { display: block; }
  :has([id^="krs-deploy-"]:target) .krs-pane--system { display: none; }
  :has([id^="krs-deploy-"]:target) .krs-pane--deploy { display: block; }
  :has([id^="krs-org-"]:target) .krs-pane--system { display: none; }
  :has([id^="krs-org-"]:target) .krs-pane--org { display: block; }
  :has([id^="krs-system-"]:target) .krs-pane--system { display: block; }
  .krs-tab-bar rect { fill: ${palette.surfaceBg}; stroke: ${palette.border}; stroke-width: 1; }
  .krs-tab-bar text { fill: ${palette.textSubtle}; font-family: sans-serif; font-size: 12px; }
  .krs-tab--disabled rect { fill: ${palette.canvasBg}; }
  .krs-tab--disabled text { fill: ${palette.mutedBorder}; }
  .krs-tab:not(.krs-tab--disabled) { cursor: pointer; }
  .krs-tab:not(.krs-tab--disabled) rect { fill: ${palette.surfaceBg}; }
  .krs-tab:not(.krs-tab--disabled) text { fill: ${palette.textPrimary}; }
  :has([id^="krs-system-"]:target) .krs-tab--system rect,
  .krs-pane--system:not([style*="display: none"]) ~ * .krs-tab--system rect { fill: ${palette.border}; }
  :has([id^="krs-deploy-"]:target) .krs-tab--deploy rect { fill: ${palette.border}; }
  :has([id^="krs-org-"]:target) .krs-tab--org rect { fill: ${palette.border}; }
  .krs-back-button rect { fill: ${palette.border}; stroke: ${palette.textMuted}; stroke-width: 1; }
  .krs-back-button text { fill: ${palette.textPrimary}; font-family: sans-serif; font-size: 13px; }
  .krs-back-button { cursor: pointer; }
`.trim();
}

function collectDeployLevel(
  krsFile: KrsFile,
  sheets: StyleSheet[],
  legendOptions: LegendRenderOptions,
  displayMode?: DisplayMode,
  theme?: DiagramTheme,
): BundledLevel | null {
  const deployBlocks = krsFile.deploys;
  if (deployBlocks.length === 0) return null;

  // Orphan-wrap so `realizes` targets pointing at top-level (unassigned)
  // services/domains resolve to their declared labels.
  const deployView = extractDeployView(deployBlocks, withUnassignedSystem(krsFile));
  if (deployView.containers.length === 0 && deployView.unclassifiedUnits.length === 0) return null;

  const deployNodes = deployBlocks.flatMap((b) => b.nodes);
  const styles = resolveStyles(krsFile.systems, sheets, deployNodes);
  const svg = renderDeploy(deployView, styles, displayMode, {
    theme,
    ...legendOptions,
    viewScope: "deploy",
  });
  const { viewBox, innerContent, width, height } = extractSvgParts(svg);

  const innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${innerContent}</svg>`;
  const element = `<g id="krs-deploy-root" class="krs-view krs-root-level">${innerSvg}</g>`;
  return { element, width, height };
}

/**
 * Builds a single SVG bundling system, deploy, and org views with CSS-only tab navigation.
 * Each view supports drill-down via CSS :target + :has(). No JavaScript required.
 */
export function buildAllViewsSvg(
  krsFile: KrsFile,
  styleSource?: string,
  displayMode?: DisplayMode,
  emptyStateLabels?: EmptyStateLabels,
  theme?: DiagramTheme,
  badgeLabels?: AnnotationBadgeLabels,
  groupBy?: "team" | "boundary",
): AllViewsSvgResult {
  const { sheets, diagnostics } = buildStyles(displayMode, styleSource, theme, badgeLabels);
  // Resolver warnings are a model-level fact, independent of which view is
  // rendered — surface them on the all-views path too (Issue #1438).
  const warnings = analyze(krsFile, sheets);
  const effectiveSystems = withUnassignedSystem(krsFile);

  // Collect system levels
  const legendOptions = buildLegendRenderOptions(krsFile, sheets);
  const groupLabels = buildGroupLabelIndex(krsFile, groupBy);
  const systemLevels: BundledLevel[] = [];
  const systemRootSlice = extractView(effectiveSystems, []);
  if (systemRootSlice.childNodes.length > 0) {
    const styles = resolveStyles(effectiveSystems, sheets, []);
    const ownerIndex = krsFile.ownerIndex ?? new Map();
    collectDrillDownLevelsWithDimensions(
      {
        getSlice: (path) => extractView(effectiveSystems, path),
        hasContent: (slice) => slice.childNodes.length > 0 || slice.systems.length > 0,
        getChildren: (slice) =>
          slice.systems.length > 0 ? slice.systems.flatMap((s) => s.children) : slice.childNodes,
        render: (slice, links) =>
          render(slice, styles, undefined, ownerIndex, displayMode, links, {
            theme,
            ...legendOptions,
            viewScope: legendScopeForLogicalSlice(slice),
            // Grouping resolves per level, against the nodes drawn there (#1983);
            // collapse off by design.
            groupBy,
            boundaryIndex: krsFile.boundaryIndex,
            scopedBoundaryIndex: krsFile.scopedBoundaryIndex,
            groupLabels,
          }),
      },
      [],
      "root",
      null,
      systemLevels,
      "system",
    );
  }

  // Collect per-domain entity views (hidden levels reachable via
  // #krs-entity-<domainId>; the interactive toggle lands with the app).
  const entityLevels = collectEntityLevels(
    effectiveSystems,
    sheets,
    krsFile.ownerIndex ?? new Map(),
    displayMode,
    theme,
    legendOptions,
    groupBy,
    krsFile.boundaryIndex,
    krsFile.scopedBoundaryIndex,
    groupLabels,
  );

  // Collect deploy level
  const deployLevel = collectDeployLevel(krsFile, sheets, legendOptions, displayMode, theme);

  // Collect org levels
  const orgLevels: BundledLevel[] = [];
  const topLevelTeams = krsFile.organizations?.flatMap((o) => o.teams) ?? [];
  if (topLevelTeams.length > 0) {
    const styles = resolveStyles(krsFile.systems, sheets, [], krsFile.organizations);
    collectDrillDownLevelsWithDimensions(
      {
        getSlice: (path) => extractOrgView(krsFile.organizations, path),
        hasContent: (slice) => slice.focusedTeam !== null || slice.teams.length > 0,
        getChildren: (slice) =>
          slice.focusedTeam !== null
            ? slice.focusedTeam.children.filter((c): c is TeamNode => c.kind === "team")
            : slice.teams,
        render: (slice, links) =>
          renderOrgView(slice, styles, displayMode, links, { theme, ...legendOptions }),
      },
      [],
      "root",
      null,
      orgLevels,
      "org",
    );
  }

  // Determine which views have content
  const enabledViews = new Set<ViewType>();
  if (systemLevels.length > 0) enabledViews.add("system");
  if (deployLevel !== null) enabledViews.add("deploy");
  if (orgLevels.length > 0) enabledViews.add("org");

  if (enabledViews.size === 0) {
    return {
      svg: buildNoDiagramSvg(emptyStateLabels, true, theme),
      diagnostics,
      warnings,
    };
  }

  // Compute SVG dimensions from the reachable tab views only. Entity views are
  // fragment-only in v1 (no tab / toggle yet), so they must not inflate the
  // shared canvas and rescale the system/deploy/org views.
  const allLevels = [...systemLevels, ...(deployLevel ? [deployLevel] : []), ...orgLevels];
  const maxWidth = Math.max(...allLevels.map((l) => l.width));
  const maxHeight = Math.max(...allLevels.map((l) => l.height));
  const totalWidth = maxWidth;
  const totalHeight = TAB_HEIGHT + maxHeight;

  // Build panes
  // Entity views live inside the system pane — they are drilled from a domain
  // in the system view, so they share its pane visibility.
  const systemPaneLevels = [...systemLevels, ...entityLevels];
  const systemPane =
    systemPaneLevels.length > 0
      ? `<g class="krs-pane krs-pane--system" transform="translate(0, ${TAB_HEIGHT})">${systemPaneLevels.map((l) => l.element).join("")}</g>`
      : "";
  const deployPane = deployLevel
    ? `<g class="krs-pane krs-pane--deploy" transform="translate(0, ${TAB_HEIGHT})">${deployLevel.element}</g>`
    : "";
  const orgPane =
    orgLevels.length > 0
      ? `<g class="krs-pane krs-pane--org" transform="translate(0, ${TAB_HEIGHT})">${orgLevels.map((l) => l.element).join("")}</g>`
      : "";

  const tabBar = renderTabBar(enabledViews);
  const css = buildAllViewsCss(resolvePalette(theme));

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}"><style>${css}</style>${tabBar}${systemPane}${deployPane}${orgPane}</svg>`,
    diagnostics,
    warnings,
  };
}

/**
 * Bundle pre-rendered single-level view SVGs into one tabbed SVG.
 *
 * Used by the diff bundled output (`buildAllViewsSvgDiffProject`) where each
 * view is a single root level (no drill-down). Each pane wraps the inner
 * content of the provided SVG into a `<g id="krs-<type>-root">`.
 *
 * Returns null if no panes are provided.
 */
export function bundleSingleLevelViews(
  panes: {
    system?: string;
    deploy?: string;
    org?: string;
  },
  theme?: DiagramTheme,
): string | null {
  const enabledViews = new Set<ViewType>();
  if (panes.system !== undefined) enabledViews.add("system");
  if (panes.deploy !== undefined) enabledViews.add("deploy");
  if (panes.org !== undefined) enabledViews.add("org");
  if (enabledViews.size === 0) return null;

  const wrap = (
    type: ViewType,
    svg: string,
  ): { element: string; width: number; height: number } => {
    const { viewBox, innerContent, width, height } = extractSvgParts(svg);
    const innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${innerContent}</svg>`;
    const element = `<g class="krs-pane krs-pane--${type}" transform="translate(0, ${TAB_HEIGHT})"><g id="krs-${type}-root" class="krs-view krs-root-level">${innerSvg}</g></g>`;
    return { element, width, height };
  };

  const built: { type: ViewType; element: string; width: number; height: number }[] = [];
  if (panes.system !== undefined) built.push({ type: "system", ...wrap("system", panes.system) });
  if (panes.deploy !== undefined) built.push({ type: "deploy", ...wrap("deploy", panes.deploy) });
  if (panes.org !== undefined) built.push({ type: "org", ...wrap("org", panes.org) });

  const maxWidth = Math.max(...built.map((b) => b.width));
  const maxHeight = Math.max(...built.map((b) => b.height));
  const totalWidth = maxWidth;
  const totalHeight = TAB_HEIGHT + maxHeight;

  const tabBar = renderTabBar(enabledViews);
  const css = buildAllViewsCss(resolvePalette(theme));
  const panesXml = built.map((b) => b.element).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}"><style>${css}</style>${tabBar}${panesXml}</svg>`;
}
