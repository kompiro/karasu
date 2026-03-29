import { el, escapeXml } from "./svg-builder.js";

export interface ExportLevel {
  /** "root" for the top-level view, or nodeId for a drill-down view */
  id: string;
  /** Full SVG string (including <svg> wrapper) from render() */
  svg: string;
  /** ID of the parent level ("root" for top-level children, null for root itself) */
  parentId: string | null;
  /** Human-readable label for the back button */
  label?: string;
}

const NAV_CSS = `
.krs-view { display: none; }
svg:not(:has(.krs-view:target)) #krs-view-root { display: block; }
.krs-view:target { display: block; }
`;

/** Extract the content between the <svg ...> and </svg> tags, excluding <defs> */
function extractSvgBody(svg: string): string {
  const bodyMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  const body = bodyMatch ? bodyMatch[1] : svg;
  // Strip <defs> block — shared defs are hoisted to the outer SVG's <defs>
  return body.replace(/<defs(?:\s[^>]*)?\/?>(?:[\s\S]*?<\/defs>)?/, "");
}

/** Extract a single attribute value from the opening <svg> tag */
function extractAttr(svg: string, attr: string): string | undefined {
  const match = svg.match(new RegExp(`<svg[^>]*\\s${attr}="([^"]*)"`));
  return match ? match[1] : undefined;
}

/** Build a "← Back" navigation button SVG element */
function renderBackButton(parentId: string, parentLabel: string): string {
  const btnWidth = 90;
  const btnHeight = 24;
  const x = 8;
  const y = 8;
  return el(
    "a",
    { href: `#krs-view-${parentId}` },
    el("rect", {
      x,
      y,
      width: btnWidth,
      height: btnHeight,
      rx: 4,
      fill: "#1E293B",
      stroke: "#334155",
      "stroke-width": 1,
    }),
    el(
      "text",
      {
        x: x + btnWidth / 2,
        y: y + btnHeight / 2,
        "text-anchor": "middle",
        "dominant-baseline": "central",
        fill: "#94A3B8",
        "font-size": "11px",
        "font-family": "sans-serif",
      },
      `← ${escapeXml(parentLabel)}`,
    ),
  );
}

/**
 * Assemble multiple rendered SVG levels into a single self-navigating SVG file.
 * Uses CSS :target + :has() for JavaScript-free drill-down navigation.
 *
 * Requires Chrome 105+, Firefox 121+, Safari 15.4+.
 */
export function assembleMultiLevelSvg(levels: ExportLevel[]): string {
  if (levels.length === 0) return "";
  if (levels.length === 1) return levels[0].svg;

  const root = levels.find((l) => l.id === "root") ?? levels[0];
  const viewBox = extractAttr(root.svg, "viewBox") ?? "0 0 800 600";
  const width = extractAttr(root.svg, "width") ?? "800";
  const height = extractAttr(root.svg, "height") ?? "600";

  // Extract shared <defs> from root (arrow markers, etc.)
  // Handles both <defs>...</defs> and self-closing <defs/> / <defs></defs>
  const defsMatch = root.svg.match(/<defs(?:\s[^>]*)?>([\s\S]*?)<\/defs>/);
  const sharedDefs = defsMatch ? defsMatch[1] : "";

  const viewGroups = levels.map((level) => {
    const body = extractSvgBody(level.svg);
    const backButton =
      level.parentId !== null
        ? renderBackButton(level.parentId, level.label ?? level.parentId)
        : "";
    return el("g", { id: `krs-view-${level.id}`, class: "krs-view" }, backButton, body);
  });

  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox,
      width,
      height,
    },
    el("defs", {}, sharedDefs),
    el("style", {}, NAV_CSS),
    ...viewGroups,
  );
}
