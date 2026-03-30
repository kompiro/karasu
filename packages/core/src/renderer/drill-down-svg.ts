import type { KrsNode, KrsFile, TeamNode, OrganizationBlock } from "../types/ast.js";
import type { ResolvedStyles, StyleSheet } from "../types/style.js";
import type { DisplayMode } from "./layout.js";
import { extractView } from "../view/view-extract.js";
import { extractOrgView } from "../view/org-view-extract.js";
import { render, sanitizeId } from "./svg-renderer.js";
import { renderOrgView } from "./org-renderer.js";
import { escapeXml } from "./svg-builder.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { getIconThemeStyleSheet } from "../builtins/icon-theme.js";
import "../renderer/shapes.js"; // ensure built-in shapes are registered

const DRILL_DOWN_CSS = `
  .krs-view { display: none; }
  svg:not(:has(.krs-view:target)) #krs-view-root { display: block; }
  .krs-view:target { display: block; }
  .krs-back-button rect { fill: #334155; stroke: #64748B; stroke-width: 1; }
  .krs-back-button text { fill: #E2E8F0; font-family: sans-serif; font-size: 13px; }
  .krs-back-button { cursor: pointer; }
`.trim();

function renderBackButton(parentViewId: string): string {
  return `<a href="#krs-view-${parentViewId}" tabindex="0"><g class="krs-back-button" transform="translate(20, 10)"><rect x="0" y="0" width="80" height="26" rx="4"/><text x="40" y="17" text-anchor="middle">&#x2190; Back</text></g></a>`;
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

function buildStyles(displayMode: DisplayMode | undefined): StyleSheet[] {
  const sheets: StyleSheet[] = [getBuiltinStyleSheet()];
  if (displayMode === "icon") sheets.push(getIconThemeStyleSheet());
  return sheets;
}

// ─── Drill-down SVG (CSS :target navigation) ───────────────────────────────

function collectDrillDownLevels(
  systems: KrsNode[],
  ownerIndex: Map<string, string>,
  styles: ResolvedStyles,
  displayMode: DisplayMode | undefined,
  path: string[],
  viewId: string,
  parentViewId: string | null,
  levels: string[],
): void {
  const viewSlice = extractView(systems, path);
  if (viewSlice.childNodes.length === 0 && viewSlice.containerNode === null) return;

  const childLevelLinks = new Map(
    viewSlice.childNodes
      .filter((n) => n.children.length > 0)
      .map((n) => [n.id, `krs-view-${sanitizeId(n.id)}`]),
  );

  const svg = render(viewSlice, styles, undefined, ownerIndex, displayMode, childLevelLinks);
  const { viewBox, innerContent } = extractSvgParts(svg);

  const backButton = parentViewId !== null ? renderBackButton(parentViewId) : "";
  const innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${backButton}${innerContent}</svg>`;
  levels.push(`<g id="krs-view-${viewId}" class="krs-view">${innerSvg}</g>`);

  for (const child of viewSlice.childNodes) {
    if (child.children.length > 0) {
      collectDrillDownLevels(
        systems,
        ownerIndex,
        styles,
        displayMode,
        [...path, child.id],
        sanitizeId(child.id),
        viewId,
        levels,
      );
    }
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
): string {
  const rootSlice = extractView(krsFile.systems, []);
  if (rootSlice.childNodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No diagram</text></svg>`;
  }

  const styles = resolveStyles(krsFile.systems, buildStyles(displayMode), []);

  const levels: string[] = [];
  collectDrillDownLevels(
    krsFile.systems,
    krsFile.ownerIndex ?? new Map(),
    styles,
    displayMode,
    [],
    "root",
    null,
    levels,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><style>${DRILL_DOWN_CSS}</style>${levels.join("")}</svg>`;
}

// ─── Full View SVG (all levels stacked vertically) ──────────────────────────

const FULL_VIEW_PADDING = 16;
const FULL_VIEW_SECTION_HEADER_HEIGHT = 20;
const FULL_VIEW_GAP = 24;
const FULL_VIEW_LABEL_OFFSET = 14;
const FULL_VIEW_BG = "#0F172A";
const FULL_VIEW_LABEL_COLOR = "#64748B";

interface FullViewLevel {
  pathLabels: string[];
  viewBox: string;
  width: number;
  height: number;
  innerContent: string;
}

function collectFullViewLevels(
  systems: KrsNode[],
  ownerIndex: Map<string, string>,
  styles: ResolvedStyles,
  displayMode: DisplayMode | undefined,
  path: string[],
  pathLabels: string[],
  levels: FullViewLevel[],
): void {
  const viewSlice = extractView(systems, path);
  if (viewSlice.childNodes.length === 0 && viewSlice.containerNode === null) return;

  const svg = render(viewSlice, styles, undefined, ownerIndex, displayMode);
  const { viewBox, innerContent, width, height } = extractSvgParts(svg);

  levels.push({ pathLabels, viewBox, width, height, innerContent });

  for (const child of viewSlice.childNodes) {
    if (child.children.length > 0) {
      collectFullViewLevels(
        systems,
        ownerIndex,
        styles,
        displayMode,
        [...path, child.id],
        [...pathLabels, child.label ?? child.id],
        levels,
      );
    }
  }
}

/**
 * Builds a single SVG with all drill-down levels stacked vertically.
 * All levels are visible simultaneously — no interaction required.
 */
export function buildFullViewSvg(
  krsFile: KrsFile,
  styleSource?: string,
  displayMode?: DisplayMode,
): string {
  const rootSlice = extractView(krsFile.systems, []);
  if (rootSlice.childNodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No diagram</text></svg>`;
  }

  const styles = resolveStyles(krsFile.systems, buildStyles(displayMode), []);
  const systemNode = krsFile.systems[0];
  const rootLabel = systemNode.label ?? systemNode.id;

  const levels: FullViewLevel[] = [];
  collectFullViewLevels(
    krsFile.systems,
    krsFile.ownerIndex ?? new Map(),
    styles,
    displayMode,
    [],
    [rootLabel],
    levels,
  );

  const maxWidth = Math.max(...levels.map((l) => l.width)) + FULL_VIEW_PADDING * 2;

  let yOffset = FULL_VIEW_PADDING;
  const parts: string[] = [];

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const sectionLabel = level.pathLabels.join(" › ");

    if (i > 0) {
      // Separator line before each non-root section
      const sepY = yOffset - FULL_VIEW_GAP / 2;
      parts.push(
        `<line x1="0" y1="${sepY}" x2="${maxWidth}" y2="${sepY}" stroke="#1E293B" stroke-width="1"/>`,
      );
    }

    parts.push(
      `<text x="${FULL_VIEW_PADDING}" y="${yOffset + FULL_VIEW_LABEL_OFFSET}" fill="${FULL_VIEW_LABEL_COLOR}" font-family="sans-serif" font-size="11px" font-weight="600" letter-spacing="0.05em">${escapeXml(sectionLabel)}</text>`,
    );
    yOffset += FULL_VIEW_SECTION_HEADER_HEIGHT;

    parts.push(
      `<svg x="${FULL_VIEW_PADDING}" y="${yOffset}" width="${level.width}" height="${level.height}" viewBox="${level.viewBox}">${level.innerContent}</svg>`,
    );
    yOffset += level.height + FULL_VIEW_GAP;
  }

  yOffset += FULL_VIEW_PADDING;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxWidth}" height="${yOffset}" style="background:${FULL_VIEW_BG}">${parts.join("")}</svg>`;
}

// ─── Org Drill-down SVG (CSS :target navigation) ─────────────────────────────

function collectDrillDownOrgLevels(
  organizations: OrganizationBlock[],
  styles: ResolvedStyles,
  displayMode: DisplayMode | undefined,
  path: string[],
  viewId: string,
  parentViewId: string | null,
  levels: string[],
): void {
  const slice = extractOrgView(organizations, path);

  const currentTeams = slice.focusedTeam !== null ? slice.focusedTeam.teams : slice.teams;
  if (slice.focusedTeam === null && currentTeams.length === 0) return;

  const drillableTeams = currentTeams.filter((t) => t.teams.length > 0);
  const childLevelLinks = new Map(
    drillableTeams.map((t) => [t.id, `krs-view-${sanitizeId(t.id)}`]),
  );

  const svg = renderOrgView(slice, styles, displayMode, childLevelLinks);
  const { viewBox, innerContent } = extractSvgParts(svg);

  const backButton = parentViewId !== null ? renderBackButton(parentViewId) : "";
  const innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${backButton}${innerContent}</svg>`;
  levels.push(`<g id="krs-view-${viewId}" class="krs-view">${innerSvg}</g>`);

  for (const team of drillableTeams) {
    collectDrillDownOrgLevels(
      organizations,
      styles,
      displayMode,
      [...path, team.id],
      sanitizeId(team.id),
      viewId,
      levels,
    );
  }
}

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

  const styles = resolveStyles(krsFile.systems, buildStyles(displayMode), []);

  const levels: string[] = [];
  collectDrillDownOrgLevels(krsFile.organizations, styles, displayMode, [], "root", null, levels);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><style>${DRILL_DOWN_CSS}</style>${levels.join("")}</svg>`;
}
// ─── Org Full View SVG (all org levels stacked vertically) ──────────────────

function collectOrgFullViewLevels(
  organizations: OrganizationBlock[],
  styles: ResolvedStyles,
  displayMode: DisplayMode | undefined,
  path: string[],
  pathLabels: string[],
  levels: FullViewLevel[],
): void {
  const slice = extractOrgView(organizations, path);
  // At root (path=[]), show if there are top-level teams.
  // At a team level (focusedTeam set), always render (even leaf teams show members).
  const hasContent = slice.focusedTeam !== null ? true : slice.teams.length > 0;
  if (!hasContent) return;

  const svg = renderOrgView(slice, styles, displayMode);
  const { viewBox, innerContent, width, height } = extractSvgParts(svg);
  levels.push({ pathLabels, viewBox, width, height, innerContent });

  const teams: TeamNode[] = slice.focusedTeam !== null ? slice.focusedTeam.teams : slice.teams;
  for (const team of teams) {
    collectOrgFullViewLevels(
      organizations,
      styles,
      displayMode,
      [...path, team.id],
      [...pathLabels, team.label ?? team.id],
      levels,
    );
  }
}

/**
 * Builds a single SVG with all org drill-down levels stacked vertically.
 * All levels are visible simultaneously — no interaction required.
 */
export function buildFullViewSvgOrg(
  krsFile: KrsFile,
  styleSource?: string,
  displayMode?: DisplayMode,
): string {
  const organizations = krsFile.organizations;
  const topLevelTeams = organizations.flatMap((o) => o.teams);
  if (topLevelTeams.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No org diagram</text></svg>`;
  }

  const styles = resolveStyles(krsFile.systems, buildStyles(displayMode), []);
  const rootLabel = organizations[0].label ?? organizations[0].id;

  const levels: FullViewLevel[] = [];
  collectOrgFullViewLevels(organizations, styles, displayMode, [], [rootLabel], levels);

  if (levels.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No org diagram</text></svg>`;
  }

  const maxWidth = Math.max(...levels.map((l) => l.width)) + FULL_VIEW_PADDING * 2;

  let yOffset = FULL_VIEW_PADDING;
  const parts: string[] = [];

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const sectionLabel = level.pathLabels.join(" › ");

    if (i > 0) {
      const sepY = yOffset - FULL_VIEW_GAP / 2;
      parts.push(
        `<line x1="0" y1="${sepY}" x2="${maxWidth}" y2="${sepY}" stroke="#1E293B" stroke-width="1"/>`,
      );
    }

    parts.push(
      `<text x="${FULL_VIEW_PADDING}" y="${yOffset + FULL_VIEW_LABEL_OFFSET}" fill="${FULL_VIEW_LABEL_COLOR}" font-family="sans-serif" font-size="11px" font-weight="600" letter-spacing="0.05em">${escapeXml(sectionLabel)}</text>`,
    );
    yOffset += FULL_VIEW_SECTION_HEADER_HEIGHT;

    parts.push(
      `<svg x="${FULL_VIEW_PADDING}" y="${yOffset}" width="${level.width}" height="${level.height}" viewBox="${level.viewBox}">${level.innerContent}</svg>`,
    );
    yOffset += level.height + FULL_VIEW_GAP;
  }

  yOffset += FULL_VIEW_PADDING;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxWidth}" height="${yOffset}" style="background:${FULL_VIEW_BG}">${parts.join("")}</svg>`;
}
