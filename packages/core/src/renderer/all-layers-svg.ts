import type { KrsFile, TeamNode, HierarchyNode, Diagnostic } from "../types/ast.js";
import type { StyleSheet } from "../types/style.js";
import type { Warning } from "../types/warnings.js";
import type { DisplayMode } from "./layout-types.js";
import { extractView } from "../view/view-extract.js";
import { withUnassignedSystem } from "../view/unassigned-system.js";
import { extractOrgView } from "../view/org-view-extract.js";
import { render } from "./svg-renderer.js";
import { renderOrgView } from "./org-renderer.js";
import { escapeXml } from "./svg-builder.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { getBuiltinStyleSheet, type AnnotationBadgeLabels } from "../builtins/default-style.js";
import { getIconThemeStyleSheet } from "../builtins/icon-theme.js";
import { StyleParser } from "../parser/style-parser.js";
import { DEFAULT_EMPTY_STATE_LABELS, type EmptyStateLabels } from "./empty-state-labels.js";
import { type DiagramTheme, resolvePalette } from "./palette.js";
import "../renderer/shapes.js"; // ensure built-in shapes are registered

function buildOrgPlaceholderSvg(labels?: EmptyStateLabels, theme?: DiagramTheme): string {
  const text = escapeXml(labels?.orgPlaceholder ?? DEFAULT_EMPTY_STATE_LABELS.orgPlaceholder);
  const palette = resolvePalette(theme);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="${palette.emptyStateText}" font-family="sans-serif">${text}</text></svg>`;
}

/**
 * Builds the system-side "no diagram" placeholder SVG.
 * `fluid: true` emits `width="100%" height="100%"` for callers that embed the
 * SVG in a layout container (drill-down, bundled all-views); the default emits
 * fixed `200×100` for the standalone all-layers export.
 */
export function buildNoDiagramSvg(
  labels?: EmptyStateLabels,
  fluid = false,
  theme?: DiagramTheme,
): string {
  const text = escapeXml(labels?.systemNoDiagram ?? DEFAULT_EMPTY_STATE_LABELS.systemNoDiagram);
  const dims = fluid ? `width="100%" height="100%"` : `width="200" height="100"`;
  const palette = resolvePalette(theme);
  return `<svg xmlns="http://www.w3.org/2000/svg" ${dims} viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="${palette.emptyStateText}" font-family="sans-serif">${text}</text></svg>`;
}

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

/**
 * Result of the bundled all-views builders. Extends {@link SvgResult} with the
 * resolver `warnings` so the all-views path matches `compileProject()`'s shape
 * and surfaces model-level facts (domain dispersal, unassigned nodes, …) that
 * do not depend on which view is rendered. See Issue #1438.
 */
export interface AllViewsSvgResult extends SvgResult {
  warnings: Warning[];
}

export function buildStyles(
  displayMode: DisplayMode | undefined,
  styleSource?: string,
  theme?: DiagramTheme,
  badgeLabels?: AnnotationBadgeLabels,
): { sheets: StyleSheet[]; diagnostics: Diagnostic[] } {
  // Build sheets for conflict analysis: [builtin(theme), ...userSheets]
  // Icon theme is appended last in resolveSheets so it takes highest priority for `shape`.
  const sheets: StyleSheet[] = [getBuiltinStyleSheet(theme, badgeLabels)];
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

interface AllLayersLevel {
  pathLabels: string[];
  viewBox: string;
  width: number;
  height: number;
  innerContent: string;
}

function assembleAllLayersSvg(levels: AllLayersLevel[], theme?: DiagramTheme): string {
  const palette = resolvePalette(theme);
  const maxWidth = Math.max(...levels.map((l) => l.width)) + ALL_LAYERS_PADDING * 2;

  let yOffset = ALL_LAYERS_PADDING;
  const parts: string[] = [];

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const sectionLabel = level.pathLabels.join(" › ");

    if (i > 0) {
      const sepY = yOffset - ALL_LAYERS_GAP / 2;
      parts.push(
        `<line x1="0" y1="${sepY}" x2="${maxWidth}" y2="${sepY}" stroke="${palette.surfaceBg}" stroke-width="1"/>`,
      );
    }

    parts.push(
      `<text x="${ALL_LAYERS_PADDING}" y="${yOffset + ALL_LAYERS_LABEL_OFFSET}" fill="${palette.textMuted}" font-family="sans-serif" font-size="11px" font-weight="600" letter-spacing="0.05em">${escapeXml(sectionLabel)}</text>`,
    );
    yOffset += ALL_LAYERS_SECTION_HEADER_HEIGHT;

    parts.push(
      `<svg x="${ALL_LAYERS_PADDING}" y="${yOffset}" width="${level.width}" height="${level.height}" viewBox="${level.viewBox}">${level.innerContent}</svg>`,
    );
    yOffset += level.height + ALL_LAYERS_GAP;
  }

  yOffset += ALL_LAYERS_PADDING;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxWidth}" height="${yOffset}" style="background:${palette.canvasBg}">${parts.join("")}</svg>`;
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
  emptyStateLabels?: EmptyStateLabels,
  theme?: DiagramTheme,
  badgeLabels?: AnnotationBadgeLabels,
): SvgResult {
  const effectiveSystems = withUnassignedSystem(krsFile);
  const rootSlice = extractView(effectiveSystems, []);
  if (rootSlice.childNodes.length === 0) {
    return {
      svg: buildNoDiagramSvg(emptyStateLabels, false, theme),
      diagnostics: [],
    };
  }

  const { sheets, diagnostics } = buildStyles(displayMode, styleSource, theme, badgeLabels);
  const styles = resolveStyles(effectiveSystems, sheets, []);
  const rootNode = effectiveSystems[0];
  const rootLabel = rootNode.label ?? rootNode.id;
  const ownerIndex = krsFile.ownerIndex ?? new Map();

  const levels: AllLayersLevel[] = [];
  collectAllLayersLevelsGeneric(
    {
      getSlice: (path) => extractView(effectiveSystems, path),
      hasContent: (slice) => slice.childNodes.length > 0 || slice.systems.length > 0,
      getChildren: (slice) =>
        slice.systems.length > 0 ? slice.systems.flatMap((s) => s.children) : slice.childNodes,
      render: (slice, links) =>
        render(slice, styles, undefined, ownerIndex, displayMode, links, { theme }),
    },
    [],
    [rootLabel],
    levels,
  );

  return { svg: assembleAllLayersSvg(levels, theme), diagnostics };
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
  emptyStateLabels?: EmptyStateLabels,
  theme?: DiagramTheme,
  badgeLabels?: AnnotationBadgeLabels,
): SvgResult {
  const organizations = krsFile.organizations;
  const topLevelTeams = organizations.flatMap((o) => o.teams);
  if (topLevelTeams.length === 0) {
    return {
      svg: buildOrgPlaceholderSvg(emptyStateLabels, theme),
      diagnostics: [],
    };
  }

  const { sheets, diagnostics } = buildStyles(displayMode, styleSource, theme, badgeLabels);
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
      render: (slice, links) => renderOrgView(slice, styles, displayMode, links, { theme }),
    },
    [],
    [rootLabel],
    levels,
  );

  if (levels.length === 0) {
    return {
      svg: buildOrgPlaceholderSvg(emptyStateLabels, theme),
      diagnostics,
    };
  }

  return { svg: assembleAllLayersSvg(levels, theme), diagnostics };
}
