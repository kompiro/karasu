import type { KrsFile, TeamNode, HierarchyNode, Diagnostic } from "../types/ast.js";
import type { StyleSheet } from "../types/style.js";
import type { DisplayMode } from "./layout.js";
import { extractView } from "../view/view-extract.js";
import { extractOrgView } from "../view/org-view-extract.js";
import { render } from "./svg-renderer.js";
import { renderOrgView } from "./org-renderer.js";
import { escapeXml } from "./svg-builder.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { getIconThemeStyleSheet } from "../builtins/icon-theme.js";
import { StyleParser } from "../parser/style-parser.js";
import "../renderer/shapes.js"; // ensure built-in shapes are registered

// ─── Shared helpers (also used by drill-down-svg.ts) ─────────────────────────

interface SvgParts {
  viewBox: string;
  innerContent: string;
  width: number;
  height: number;
}

/**
 * Extracts the inner SVG content and viewBox dimensions from a rendered SVG string.
 */
export function extractSvgParts(svg: string): SvgParts {
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

export function buildStyles(
  displayMode: DisplayMode | undefined,
  styleSource?: string,
): { sheets: StyleSheet[]; diagnostics: Diagnostic[] } {
  // Build sheets for conflict analysis: [builtin, ...userSheets]
  // Icon theme is appended last in resolveSheets so it takes highest priority for `shape`.
  const sheets: StyleSheet[] = [getBuiltinStyleSheet()];
  const diagnostics: Diagnostic[] = [];
  if (styleSource) {
    const styleResult = StyleParser.parse(styleSource);
    sheets.push(styleResult.value);
    diagnostics.push(...styleResult.diagnostics);
  }
  const resolveSheets = displayMode === "icon" ? [...sheets, getIconThemeStyleSheet()] : sheets;
  return { sheets: resolveSheets, diagnostics };
}

export interface DrillDownCallbacks<S> {
  getSlice(path: string[]): S;
  hasContent(slice: S): boolean;
  getChildren(slice: S): HierarchyNode[];
  render(slice: S, childLevelLinks?: Map<string, string>): string;
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
