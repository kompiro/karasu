import type { KrsNode, KrsFile } from "../types/ast.js";
import type { ResolvedStyles, StyleSheet } from "../types/style.js";
import type { DisplayMode } from "./layout.js";
import { extractView } from "../view/view-extract.js";
import { render, sanitizeId } from "./svg-renderer.js";
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

/**
 * Extracts the inner SVG content and viewBox from a rendered SVG string.
 * Returns { viewBox, innerContent } where innerContent is everything between
 * the outer <svg...> and </svg> tags.
 */
function extractSvgParts(svg: string): { viewBox: string; innerContent: string } {
  const openTagMatch = svg.match(/^<svg([^>]*)>/s);
  if (!openTagMatch) return { viewBox: "0 0 200 100", innerContent: svg };

  const attrs = openTagMatch[1];
  const viewBoxMatch = attrs.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 200 100";

  // Everything between the outer <svg> and </svg>
  const innerContent = svg.slice(openTagMatch[0].length, svg.lastIndexOf("</svg>"));
  return { viewBox, innerContent };
}

function collectLevels(
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

  // Nodes at this level that have their own children → become drill-down links
  const linkedNodeIds = new Set(
    viewSlice.childNodes.filter((n) => n.children.length > 0).map((n) => n.id),
  );

  const svg = render(viewSlice, styles, undefined, ownerIndex, displayMode, linkedNodeIds);
  const { viewBox, innerContent } = extractSvgParts(svg);

  const backButton = parentViewId !== null ? renderBackButton(parentViewId) : "";
  const innerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${backButton}${innerContent}</svg>`;
  levels.push(`<g id="krs-view-${viewId}" class="krs-view">${innerSvg}</g>`);

  // Recurse into children that have further children
  for (const child of viewSlice.childNodes) {
    if (child.children.length > 0) {
      const childViewId = sanitizeId(child.id);
      collectLevels(
        systems,
        ownerIndex,
        styles,
        displayMode,
        [...path, child.id],
        childViewId,
        viewId,
        levels,
      );
    }
  }
}

/**
 * Builds a single SVG string containing all drill-down levels of the system diagram,
 * navigable via CSS :target + :has() without JavaScript.
 *
 * @param krsFile      - Parsed KRS file (systems + ownerIndex)
 * @param styleSource  - Optional style source string
 * @param displayMode  - Layout display mode
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

  const sheets: StyleSheet[] = [getBuiltinStyleSheet()];
  if (displayMode === "icon") sheets.push(getIconThemeStyleSheet());

  const styles = resolveStyles(krsFile.systems, sheets, []);

  const levels: string[] = [];
  collectLevels(
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
