import type { KrsFile, TeamNode, HierarchyNode, Diagnostic } from "../types/ast.js";
import type { StyleSheet } from "../types/style.js";
import type { DisplayMode } from "./layout.js";
import { extractView } from "../view/view-extract.js";
import { extractOrgView } from "../view/org-view-extract.js";
import { extractDeployView } from "../view/deploy-view-extract.js";
import { render, sanitizeId } from "./svg-renderer.js";
import { renderOrgView } from "./org-renderer.js";
import { renderDeploy } from "./deploy-renderer.js";
import { escapeXml } from "./svg-builder.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { getIconThemeStyleSheet } from "../builtins/icon-theme.js";
import { StyleParser } from "../parser/style-parser.js";
import "../renderer/shapes.js"; // ensure built-in shapes are registered

const DRILL_DOWN_CSS = `
  .krs-view { display: none; }
  svg:not(:has(.krs-view:target)) .krs-root-level { display: block; }
  .krs-view:target { display: block; }
  .krs-back-button rect { fill: #334155; stroke: #64748B; stroke-width: 1; }
  .krs-back-button text { fill: #E2E8F0; font-family: sans-serif; font-size: 13px; }
  .krs-back-button { cursor: pointer; }
`.trim();

function renderBackButton(parentViewId: string, viewPrefix: string): string {
  return `<a href="#krs-${viewPrefix}-${parentViewId}" tabindex="0"><g class="krs-back-button" transform="translate(20, 10)"><rect x="0" y="0" width="80" height="26" rx="4"/><text x="40" y="17" text-anchor="middle">&#x2190; Back</text></g></a>`;
}

interface SvgParts {
  viewBox: string;
  innerContent: string;
  width: number;
  height: number;
}

/**
 * Extracts the inner SVG content and viewBox dimensions from a rendered SVG string.
 */
function extractSvgParts(svg: string): SvgParts {
  const openTagMatch = svg.match(/^<svg([^>]*)>/s);
  if (!openTagMatch) return { viewBox: "0 0 200 100", innerContent: svg, width: 200, height: 100 };

  const attrs = openTagMatch[1];
  const viewBoxMatch = attrs.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 200 100";

  const [, , rawW, rawH] = viewBox.split(" ").map(Number);
  const width = isFinite(rawW) ? rawW : 200;
  const height = isFinite(rawH) ? rawH : 100;

  const innerContent = svg.slice(openTagMatch[0].length, svg.lastIndexOf("</svg>"));
  return { viewBox, innerContent, width, height };
}

export interface SvgResult {
  svg: string;
  diagnostics: Diagnostic[];
}

function buildStyles(
  displayMode: DisplayMode | undefined,
  styleSource?: string,
): { sheets: StyleSheet[]; diagnostics: Diagnostic[] } {
  const sheets: StyleSheet[] = [getBuiltinStyleSheet()];
  const diagnostics: Diagnostic[] = [];
  if (displayMode === "icon") sheets.push(getIconThemeStyleSheet());
  if (styleSource) {
    const styleResult = StyleParser.parse(styleSource);
    sheets.push(styleResult.value);
    diagnostics.push(...styleResult.diagnostics);
  }
  return { sheets, diagnostics };
}

// ─── Callbacks interface & generic collectors ─────────────────────────────

interface DrillDownCallbacks<S> {
  getSlice(path: string[]): S;
  hasContent(slice: S): boolean;
  getChildren(slice: S): HierarchyNode[];
  render(slice: S, childLevelLinks?: Map<string, string>): string;
}

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
  const drillable = children.filter((c) => c.children.length > 0);
  const childLevelLinks = new Map(
    drillable.map((c) => [c.id, `krs-${viewPrefix}-${sanitizeId(c.id)}`]),
  );

  const svg = callbacks.render(slice, childLevelLinks);
  const { viewBox, innerContent } = extractSvgParts(svg);

  const backButton = parentViewId !== null ? renderBackButton(parentViewId, viewPrefix) : "";
  const innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${backButton}${innerContent}</svg>`;
  const cssClass = parentViewId === null ? "krs-view krs-root-level" : "krs-view";
  levels.push(`<g id="krs-${viewPrefix}-${viewId}" class="${cssClass}">${innerSvg}</g>`);

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

// ─── Drill-down SVG (CSS :target navigation) ───────────────────────────────

/**
 * Builds a single SVG with all drill-down levels navigable via CSS :target + :has().
 * No JavaScript required. Each level is hidden/shown by CSS based on the URL fragment.
 */
export function buildDrillDownSvg(
  krsFile: KrsFile,
  styleSource?: string,
  displayMode?: DisplayMode,
): SvgResult {
  const unassignedDomains = krsFile.domains ?? [];
  const rootSlice = extractView(krsFile.systems, [], unassignedDomains);
  if (rootSlice.childNodes.length === 0) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No diagram</text></svg>`,
      diagnostics: [],
    };
  }

  const { sheets, diagnostics } = buildStyles(displayMode, styleSource);
  const styles = resolveStyles(krsFile.systems, sheets, [], undefined, unassignedDomains);
  const ownerIndex = krsFile.ownerIndex ?? new Map();

  const levels: string[] = [];
  collectDrillDownLevelsGeneric(
    {
      getSlice: (path) => extractView(krsFile.systems, path, unassignedDomains),
      hasContent: (slice) => slice.childNodes.length > 0,
      getChildren: (slice) => slice.childNodes,
      render: (slice, links) => render(slice, styles, undefined, ownerIndex, displayMode, links),
    },
    [],
    "root",
    null,
    levels,
    "system",
  );

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><style>${DRILL_DOWN_CSS}</style>${levels.join("")}</svg>`,
    diagnostics,
  };
}

// ─── All Layers SVG (all levels stacked vertically) ──────────────────────────

const ALL_LAYERS_PADDING = 16;
const ALL_LAYERS_SECTION_HEADER_HEIGHT = 20;
const ALL_LAYERS_GAP = 24;
const ALL_LAYERS_LABEL_OFFSET = 14;
const ALL_LAYERS_BG = "#0F172A";
const ALL_LAYERS_LABEL_COLOR = "#64748B";

interface AllLayersLevel {
  pathLabels: string[];
  viewBox: string;
  width: number;
  height: number;
  innerContent: string;
}

function assembleAllLayersSvg(levels: AllLayersLevel[]): string {
  const maxWidth = Math.max(...levels.map((l) => l.width)) + ALL_LAYERS_PADDING * 2;

  let yOffset = ALL_LAYERS_PADDING;
  const parts: string[] = [];

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const sectionLabel = level.pathLabels.join(" › ");

    if (i > 0) {
      const sepY = yOffset - ALL_LAYERS_GAP / 2;
      parts.push(
        `<line x1="0" y1="${sepY}" x2="${maxWidth}" y2="${sepY}" stroke="#1E293B" stroke-width="1"/>`,
      );
    }

    parts.push(
      `<text x="${ALL_LAYERS_PADDING}" y="${yOffset + ALL_LAYERS_LABEL_OFFSET}" fill="${ALL_LAYERS_LABEL_COLOR}" font-family="sans-serif" font-size="11px" font-weight="600" letter-spacing="0.05em">${escapeXml(sectionLabel)}</text>`,
    );
    yOffset += ALL_LAYERS_SECTION_HEADER_HEIGHT;

    parts.push(
      `<svg x="${ALL_LAYERS_PADDING}" y="${yOffset}" width="${level.width}" height="${level.height}" viewBox="${level.viewBox}">${level.innerContent}</svg>`,
    );
    yOffset += level.height + ALL_LAYERS_GAP;
  }

  yOffset += ALL_LAYERS_PADDING;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxWidth}" height="${yOffset}" style="background:${ALL_LAYERS_BG}">${parts.join("")}</svg>`;
}

function collectAllLayersLevelsGeneric<S>(
  callbacks: DrillDownCallbacks<S>,
  path: string[],
  pathLabels: string[],
  levels: AllLayersLevel[],
): void {
  const slice = callbacks.getSlice(path);
  if (!callbacks.hasContent(slice)) return;

  const svg = callbacks.render(slice);
  const { viewBox, innerContent, width, height } = extractSvgParts(svg);

  levels.push({ pathLabels, viewBox, width, height, innerContent });

  const children = callbacks.getChildren(slice);
  for (const child of children) {
    collectAllLayersLevelsGeneric(
      callbacks,
      [...path, child.id],
      [...pathLabels, child.label ?? child.id],
      levels,
    );
  }
}

/**
 * Builds a single SVG with all drill-down levels stacked vertically.
 * All levels are visible simultaneously — no interaction required.
 */
export function buildAllLayersSvg(
  krsFile: KrsFile,
  styleSource?: string,
  displayMode?: DisplayMode,
): SvgResult {
  const unassignedDomains = krsFile.domains ?? [];
  const rootSlice = extractView(krsFile.systems, [], unassignedDomains);
  if (rootSlice.childNodes.length === 0) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No diagram</text></svg>`,
      diagnostics: [],
    };
  }

  const { sheets, diagnostics } = buildStyles(displayMode, styleSource);
  const styles = resolveStyles(krsFile.systems, sheets, [], undefined, unassignedDomains);
  const systemNode = krsFile.systems[0];
  const rootLabel = systemNode.label ?? systemNode.id;
  const ownerIndex = krsFile.ownerIndex ?? new Map();

  const levels: AllLayersLevel[] = [];
  collectAllLayersLevelsGeneric(
    {
      getSlice: (path) => extractView(krsFile.systems, path, unassignedDomains),
      hasContent: (slice) => slice.childNodes.length > 0,
      getChildren: (slice) => slice.childNodes,
      render: (slice, links) => render(slice, styles, undefined, ownerIndex, displayMode, links),
    },
    [],
    [rootLabel],
    levels,
  );

  return { svg: assembleAllLayersSvg(levels), diagnostics };
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
): SvgResult {
  const topLevelTeams = krsFile.organizations.flatMap((o) => o.teams);
  if (topLevelTeams.length === 0) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No org diagram</text></svg>`,
      diagnostics: [],
    };
  }

  const { sheets, diagnostics } = buildStyles(displayMode, styleSource);
  const styles = resolveStyles(krsFile.systems, sheets, [], krsFile.organizations);

  const levels: string[] = [];
  collectDrillDownLevelsGeneric(
    {
      getSlice: (path) => extractOrgView(krsFile.organizations, path),
      hasContent: (slice) => slice.focusedTeam !== null || slice.teams.length > 0,
      getChildren: (slice) =>
        slice.focusedTeam !== null
          ? slice.focusedTeam.children.filter((c): c is TeamNode => c.kind === "team")
          : slice.teams,
      render: (slice, links) => renderOrgView(slice, styles, displayMode, links),
    },
    [],
    "root",
    null,
    levels,
    "org",
  );

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><style>${DRILL_DOWN_CSS}</style>${levels.join("")}</svg>`,
    diagnostics,
  };
}

// ─── Org All Layers SVG (all org levels stacked vertically) ──────────────────

/**
 * Builds a single SVG with all org drill-down levels stacked vertically.
 * All levels are visible simultaneously — no interaction required.
 */
export function buildAllLayersSvgOrg(
  krsFile: KrsFile,
  styleSource?: string,
  displayMode?: DisplayMode,
): SvgResult {
  const organizations = krsFile.organizations;
  const topLevelTeams = organizations.flatMap((o) => o.teams);
  if (topLevelTeams.length === 0) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No org diagram</text></svg>`,
      diagnostics: [],
    };
  }

  const { sheets, diagnostics } = buildStyles(displayMode, styleSource);
  const styles = resolveStyles(krsFile.systems, sheets, [], organizations);
  const rootLabel = organizations[0].label ?? organizations[0].id;

  const levels: AllLayersLevel[] = [];
  collectAllLayersLevelsGeneric(
    {
      getSlice: (path) => extractOrgView(organizations, path),
      hasContent: (slice) => slice.focusedTeam !== null || slice.teams.length > 0,
      getChildren: (slice) =>
        slice.focusedTeam !== null
          ? slice.focusedTeam.children.filter((c): c is TeamNode => c.kind === "team")
          : slice.teams,
      render: (slice, links) => renderOrgView(slice, styles, displayMode, links),
    },
    [],
    [rootLabel],
    levels,
  );

  if (levels.length === 0) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No org diagram</text></svg>`,
      diagnostics,
    };
  }

  return { svg: assembleAllLayersSvg(levels), diagnostics };
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
  const drillable = children.filter((c) => c.children.length > 0);
  const childLevelLinks = new Map(
    drillable.map((c) => [c.id, `krs-${viewPrefix}-${sanitizeId(c.id)}`]),
  );

  const svg = callbacks.render(slice, childLevelLinks);
  const { viewBox, innerContent, width, height } = extractSvgParts(svg);

  const backButton = parentViewId !== null ? renderBackButton(parentViewId, viewPrefix) : "";
  const innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${backButton}${innerContent}</svg>`;
  const cssClass = parentViewId === null ? "krs-view krs-root-level" : "krs-view";
  const element = `<g id="krs-${viewPrefix}-${viewId}" class="${cssClass}">${innerSvg}</g>`;
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
    return `<a href="#krs-${type}-root"><g class="${cssClass}">${inner}</g></a>`;
  });
  return `<g class="krs-tab-bar">${tabs.join("")}</g>`;
}

function buildAllViewsCss(): string {
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
  .krs-tab-bar rect { fill: #1E293B; stroke: #334155; stroke-width: 1; }
  .krs-tab-bar text { fill: #94A3B8; font-family: sans-serif; font-size: 12px; }
  .krs-tab--disabled rect { fill: #0F172A; }
  .krs-tab--disabled text { fill: #475569; }
  .krs-tab:not(.krs-tab--disabled) { cursor: pointer; }
  .krs-tab:not(.krs-tab--disabled) rect { fill: #1E293B; }
  .krs-tab:not(.krs-tab--disabled) text { fill: #E2E8F0; }
  :has([id^="krs-system-"]:target) .krs-tab--system rect,
  .krs-pane--system:not([style*="display: none"]) ~ * .krs-tab--system rect { fill: #334155; }
  :has([id^="krs-deploy-"]:target) .krs-tab--deploy rect { fill: #334155; }
  :has([id^="krs-org-"]:target) .krs-tab--org rect { fill: #334155; }
  .krs-back-button rect { fill: #334155; stroke: #64748B; stroke-width: 1; }
  .krs-back-button text { fill: #E2E8F0; font-family: sans-serif; font-size: 13px; }
  .krs-back-button { cursor: pointer; }
`.trim();
}

function collectDeployLevel(
  krsFile: KrsFile,
  sheets: StyleSheet[],
  displayMode?: DisplayMode,
): BundledLevel | null {
  const deployBlocks = krsFile.deploys;
  if (deployBlocks.length === 0) return null;

  const deployView = extractDeployView(deployBlocks, krsFile.systems);
  if (deployView.containers.length === 0 && deployView.unclassifiedUnits.length === 0) return null;

  const deployNodes = deployBlocks.flatMap((b) => b.nodes);
  const styles = resolveStyles(krsFile.systems, sheets, deployNodes);
  const svg = renderDeploy(deployView, styles, displayMode);
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
): SvgResult {
  const { sheets, diagnostics } = buildStyles(displayMode, styleSource);
  const unassignedDomains = krsFile.domains ?? [];

  // Collect system levels
  const systemLevels: BundledLevel[] = [];
  const systemRootSlice = extractView(krsFile.systems, [], unassignedDomains);
  if (systemRootSlice.childNodes.length > 0) {
    const styles = resolveStyles(krsFile.systems, sheets, [], undefined, unassignedDomains);
    const ownerIndex = krsFile.ownerIndex ?? new Map();
    collectDrillDownLevelsWithDimensions(
      {
        getSlice: (path) => extractView(krsFile.systems, path, unassignedDomains),
        hasContent: (slice) => slice.childNodes.length > 0,
        getChildren: (slice) => slice.childNodes,
        render: (slice, links) => render(slice, styles, undefined, ownerIndex, displayMode, links),
      },
      [],
      "root",
      null,
      systemLevels,
      "system",
    );
  }

  // Collect deploy level
  const deployLevel = collectDeployLevel(krsFile, sheets, displayMode);

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
        render: (slice, links) => renderOrgView(slice, styles, displayMode, links),
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
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No diagram</text></svg>`,
      diagnostics,
    };
  }

  // Compute SVG dimensions
  const allLevels = [...systemLevels, ...(deployLevel ? [deployLevel] : []), ...orgLevels];
  const maxWidth = Math.max(...allLevels.map((l) => l.width));
  const maxHeight = Math.max(...allLevels.map((l) => l.height));
  const totalWidth = maxWidth;
  const totalHeight = TAB_HEIGHT + maxHeight;

  // Build panes
  const systemPane =
    systemLevels.length > 0
      ? `<g class="krs-pane krs-pane--system" transform="translate(0, ${TAB_HEIGHT})">${systemLevels.map((l) => l.element).join("")}</g>`
      : "";
  const deployPane = deployLevel
    ? `<g class="krs-pane krs-pane--deploy" transform="translate(0, ${TAB_HEIGHT})">${deployLevel.element}</g>`
    : "";
  const orgPane =
    orgLevels.length > 0
      ? `<g class="krs-pane krs-pane--org" transform="translate(0, ${TAB_HEIGHT})">${orgLevels.map((l) => l.element).join("")}</g>`
      : "";

  const tabBar = renderTabBar(enabledViews);
  const css = buildAllViewsCss();

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}"><style>${css}</style>${tabBar}${systemPane}${deployPane}${orgPane}</svg>`,
    diagnostics,
  };
}
