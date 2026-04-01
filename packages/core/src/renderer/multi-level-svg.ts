import type { KrsNode } from "../types/ast.js";
import type { ViewPath } from "../view/view-extract.js";
import { el, escapeXml } from "./svg-builder.js";

const BREADCRUMB_HEIGHT = 40;

export interface ExportLevel {
  /** CSS-safe ID, e.g. "krs-view-root" or "krs-view-root__ECommerce__Order" */
  id: string;
  /** Width of the level's SVG content */
  width: number;
  /** Height of the level's SVG content (excluding breadcrumb) */
  height: number;
  /** The rendered SVG string for this level (full <svg> element) */
  svgContent: string;
  /** Ancestry chain from root to this level, inclusive */
  breadcrumb: { id: string; label: string }[];
}

/**
 * Convert a ViewPath to a CSS-safe fragment ID.
 * Uses "__" as separator to avoid collision with hyphens in quoted node IDs.
 *
 * [] → "krs-view-root"
 * ["ECommerce"] → "krs-view-root__ECommerce"
 * ["ECommerce", "Order"] → "krs-view-root__ECommerce__Order"
 */
export function buildLevelId(path: ViewPath): string {
  if (path.length === 0) return "krs-view-root";
  return "krs-view-root__" + path.join("__");
}

/**
 * Recursively collect all ViewPaths up to maxDepth for system view.
 * Only includes paths where the target node actually has children.
 */
export function collectAllSystemPaths(systems: KrsNode[], maxDepth: number): ViewPath[] {
  const paths: ViewPath[] = [[]];

  function recurse(node: KrsNode, currentPath: ViewPath): void {
    if (currentPath.length >= maxDepth) return;
    for (const child of node.children) {
      if (child.children.length > 0) {
        const childPath = [...currentPath, child.id];
        paths.push(childPath);
        recurse(child, childPath);
      }
    }
  }

  for (const system of systems) {
    recurse(system, []);
  }

  return paths;
}

function assembleBreadcrumbSvg(
  breadcrumb: { id: string; label: string }[],
  currentIdx: number,
  totalWidth: number,
): string {
  const PADDING = 16;
  const SEP = " › ";
  const FONT_SIZE = 13;
  const CHAR_WIDTH = 7.5;
  const SEP_WIDTH = SEP.length * CHAR_WIDTH;

  const parts: string[] = [];

  parts.push(
    el("rect", {
      x: 0,
      y: 0,
      width: totalWidth,
      height: BREADCRUMB_HEIGHT,
      fill: "#1E293B",
    }),
  );

  let x = PADDING;
  for (let i = 0; i < breadcrumb.length; i++) {
    const crumb = breadcrumb[i];
    const isCurrent = i === currentIdx;
    const label = escapeXml(crumb.label);
    const labelWidth = [...crumb.label].length * CHAR_WIDTH;

    if (i > 0) {
      parts.push(
        el(
          "text",
          {
            x,
            y: BREADCRUMB_HEIGHT / 2,
            "dominant-baseline": "central",
            fill: "#64748B",
            "font-size": `${FONT_SIZE}px`,
            "font-family": "sans-serif",
          },
          escapeXml(SEP),
        ),
      );
      x += SEP_WIDTH;
    }

    if (isCurrent) {
      parts.push(
        el(
          "text",
          {
            x,
            y: BREADCRUMB_HEIGHT / 2,
            "dominant-baseline": "central",
            fill: "#E2E8F0",
            "font-size": `${FONT_SIZE}px`,
            "font-family": "sans-serif",
            "font-weight": "bold",
          },
          label,
        ),
      );
    } else {
      parts.push(
        el(
          "a",
          { href: `#${crumb.id}`, style: "cursor: pointer" },
          el(
            "text",
            {
              x,
              y: BREADCRUMB_HEIGHT / 2,
              "dominant-baseline": "central",
              fill: "#60A5FA",
              "font-size": `${FONT_SIZE}px`,
              "font-family": "sans-serif",
            },
            label,
          ),
        ),
      );
    }

    x += labelWidth + 4;
  }

  return el("g", { class: "krs-breadcrumb" }, ...parts);
}

/**
 * Assemble a list of ExportLevels into a single multi-level SVG.
 * All levels are visible simultaneously, stacked vertically.
 * Breadcrumb links and drillable-node links scroll to the target level (HTML anchor).
 */
export function assembleMultiLevelSvg(levels: ExportLevel[]): string {
  if (levels.length === 0) {
    return el(
      "svg",
      { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 200 100" },
      el(
        "text",
        {
          x: 100,
          y: 50,
          "text-anchor": "middle",
          fill: "#9CA3AF",
          "font-family": "sans-serif",
        },
        "No levels to display",
      ),
    );
  }

  const maxWidth = Math.max(...levels.map((l) => l.width));

  // Each level occupies BREADCRUMB_HEIGHT (header) + level.height (content).
  // Levels are stacked vertically; the SVG total height is the sum.
  const levelHeights = levels.map((l) => BREADCRUMB_HEIGHT + l.height);
  const totalHeight = levelHeights.reduce((sum, h) => sum + h, 0);

  const cssContent = "a { cursor: pointer; }";

  let currentY = 0;
  const levelGroups = levels.map((level, i) => {
    const levelY = currentY;
    currentY += levelHeights[i];

    const breadcrumbSvg = assembleBreadcrumbSvg(
      level.breadcrumb,
      level.breadcrumb.length - 1,
      maxWidth,
    );

    // Re-embed as nested <svg> positioned below the breadcrumb bar within this level.
    // Nested SVGs keep their own <defs> so marker IDs don't conflict across levels.
    const nestedSvgContent = level.svgContent
      .replace(
        /^<svg[^>]*>/,
        `<svg x="0" y="${BREADCRUMB_HEIGHT}" viewBox="0 0 ${level.width} ${level.height}" width="${level.width}" height="${level.height}">`,
      )
      .replace(/\s*<\/svg>\s*$/, "\n</svg>");

    return el(
      "g",
      { id: level.id, class: "krs-level", transform: `translate(0, ${levelY})` },
      breadcrumbSvg,
      nestedSvgContent,
    );
  });

  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${maxWidth} ${totalHeight}`,
      width: maxWidth,
      height: totalHeight,
    },
    el("style", {}, cssContent),
    ...levelGroups,
  );
}
