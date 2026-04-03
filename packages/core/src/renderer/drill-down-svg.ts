import type { KrsNode, KrsFile, TeamNode, OrganizationBlock } from "../types/ast.js";
import type { ResolvedStyles, StyleSheet } from "../types/style.js";
import type { DisplayMode } from "./layout.js";
import { extractView, type ViewSlice } from "../view/view-extract.js";
import { extractOrgView, type OrgViewSlice } from "../view/org-view-extract.js";
import { render, sanitizeId } from "./svg-renderer.js";
import { renderOrgView } from "./org-renderer.js";
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

function buildStyles(displayMode: DisplayMode | undefined, styleSource?: string): StyleSheet[] {
  const sheets: StyleSheet[] = [getBuiltinStyleSheet()];
  if (displayMode === "icon") sheets.push(getIconThemeStyleSheet());
  if (styleSource) {
    const styleResult = StyleParser.parse(styleSource);
    sheets.push(styleResult.value);
  }
  return sheets;
}

// ─── Adapter interface & generic collectors ───────────────────────────────

interface DrillDownAdapter<TSource, TSlice, TChild> {
  extractSlice(source: TSource, path: string[]): TSlice;
  hasContent(slice: TSlice): boolean;
  getChildren(slice: TSlice): TChild[];
  isDrillable(child: TChild): boolean;
  childId(child: TChild): string;
  childLabel(child: TChild): string;
  render(slice: TSlice, childLevelLinks?: Map<string, string>): string;
}

function collectDrillDownLevelsGeneric<TSource, TSlice, TChild>(
  adapter: DrillDownAdapter<TSource, TSlice, TChild>,
  source: TSource,
  path: string[],
  viewId: string,
  parentViewId: string | null,
  levels: string[],
  viewPrefix: string,
): void {
  const slice = adapter.extractSlice(source, path);
  if (!adapter.hasContent(slice)) return;

  const children = adapter.getChildren(slice);
  const drillable = children.filter((c) => adapter.isDrillable(c));
  const childLevelLinks = new Map(
    drillable.map((c) => [adapter.childId(c), `krs-${viewPrefix}-${sanitizeId(adapter.childId(c))}`]),
  );

  const svg = adapter.render(slice, childLevelLinks);
  const { viewBox, innerContent } = extractSvgParts(svg);

  const backButton = parentViewId !== null ? renderBackButton(parentViewId, viewPrefix) : "";
  const innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${backButton}${innerContent}</svg>`;
  const cssClass = parentViewId === null ? "krs-view krs-root-level" : "krs-view";
  levels.push(`<g id="krs-${viewPrefix}-${viewId}" class="${cssClass}">${innerSvg}</g>`);

  for (const child of drillable) {
    collectDrillDownLevelsGeneric(
      adapter,
      source,
      [...path, adapter.childId(child)],
      sanitizeId(adapter.childId(child)),
      viewId,
      levels,
      viewPrefix,
    );
  }
}

// ─── Adapter factories ────────────────────────────────────────────────────

function createSystemAdapter(
  systems: KrsNode[],
  ownerIndex: Map<string, string>,
  styles: ResolvedStyles,
  displayMode: DisplayMode | undefined,
): DrillDownAdapter<KrsNode[], ViewSlice, KrsNode> {
  return {
    extractSlice: (source, path) => extractView(source, path),
    hasContent: (slice) => slice.childNodes.length > 0,
    getChildren: (slice) => slice.childNodes,
    isDrillable: (child) => child.children.length > 0,
    childId: (child) => child.id,
    childLabel: (child) => child.label ?? child.id,
    render: (slice, links) => render(slice, styles, undefined, ownerIndex, displayMode, links),
  };
}

function createOrgAdapter(
  organizations: OrganizationBlock[],
  styles: ResolvedStyles,
  displayMode: DisplayMode | undefined,
): DrillDownAdapter<OrganizationBlock[], OrgViewSlice, TeamNode> {
  return {
    extractSlice: (source, path) => extractOrgView(source, path),
    hasContent: (slice) => slice.focusedTeam !== null || slice.teams.length > 0,
    getChildren: (slice) => (slice.focusedTeam !== null ? slice.focusedTeam.teams : slice.teams),
    isDrillable: (t) => t.teams.length > 0 || t.members.length > 0,
    childId: (t) => t.id,
    childLabel: (t) => t.label ?? t.id,
    render: (slice, links) => renderOrgView(slice, styles, displayMode, links),
  };
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
): string {
  const rootSlice = extractView(krsFile.systems, []);
  if (rootSlice.childNodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No diagram</text></svg>`;
  }

  const styles = resolveStyles(krsFile.systems, buildStyles(displayMode, styleSource), []);
  const adapter = createSystemAdapter(
    krsFile.systems,
    krsFile.ownerIndex ?? new Map(),
    styles,
    displayMode,
  );

  const levels: string[] = [];
  collectDrillDownLevelsGeneric(adapter, krsFile.systems, [], "root", null, levels, "system");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><style>${DRILL_DOWN_CSS}</style>${levels.join("")}</svg>`;
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

function collectAllLayersLevelsGeneric<TSource, TSlice, TChild>(
  adapter: DrillDownAdapter<TSource, TSlice, TChild>,
  source: TSource,
  path: string[],
  pathLabels: string[],
  levels: AllLayersLevel[],
): void {
  const slice = adapter.extractSlice(source, path);
  if (!adapter.hasContent(slice)) return;

  const svg = adapter.render(slice);
  const { viewBox, innerContent, width, height } = extractSvgParts(svg);

  levels.push({ pathLabels, viewBox, width, height, innerContent });

  const children = adapter.getChildren(slice);
  for (const child of children) {
    collectAllLayersLevelsGeneric(
      adapter,
      source,
      [...path, adapter.childId(child)],
      [...pathLabels, adapter.childLabel(child)],
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
): string {
  const rootSlice = extractView(krsFile.systems, []);
  if (rootSlice.childNodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No diagram</text></svg>`;
  }

  const styles = resolveStyles(krsFile.systems, buildStyles(displayMode, styleSource), []);
  const systemNode = krsFile.systems[0];
  const rootLabel = systemNode.label ?? systemNode.id;

  const adapter = createSystemAdapter(
    krsFile.systems,
    krsFile.ownerIndex ?? new Map(),
    styles,
    displayMode,
  );

  const levels: AllLayersLevel[] = [];
  collectAllLayersLevelsGeneric(adapter, krsFile.systems, [], [rootLabel], levels);

  return assembleAllLayersSvg(levels);
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
): string {
  const topLevelTeams = krsFile.organizations.flatMap((o) => o.teams);
  if (topLevelTeams.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No org diagram</text></svg>`;
  }

  const styles = resolveStyles(
    krsFile.systems,
    buildStyles(displayMode, styleSource),
    [],
    krsFile.organizations,
  );
  const adapter = createOrgAdapter(krsFile.organizations, styles, displayMode);

  const levels: string[] = [];
  collectDrillDownLevelsGeneric(adapter, krsFile.organizations, [], "root", null, levels, "org");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><style>${DRILL_DOWN_CSS}</style>${levels.join("")}</svg>`;
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
): string {
  const organizations = krsFile.organizations;
  const topLevelTeams = organizations.flatMap((o) => o.teams);
  if (topLevelTeams.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No org diagram</text></svg>`;
  }

  const styles = resolveStyles(
    krsFile.systems,
    buildStyles(displayMode, styleSource),
    [],
    organizations,
  );
  const rootLabel = organizations[0].label ?? organizations[0].id;
  const adapter = createOrgAdapter(organizations, styles, displayMode);

  const levels: AllLayersLevel[] = [];
  collectAllLayersLevelsGeneric(adapter, organizations, [], [rootLabel], levels);

  if (levels.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No org diagram</text></svg>`;
  }

  return assembleAllLayersSvg(levels);
}
