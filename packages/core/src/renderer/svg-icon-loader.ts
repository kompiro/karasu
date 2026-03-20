/**
 * SVG icon loader — parses SVG file strings into SvgIconDef.
 *
 * Extracts viewBox, text slot positions (krs-label / krs-description),
 * and the remaining SVG body for use as a registered shape.
 */

import {
  registerIcon,
  type SvgIconDef,
  type SvgIconTextSlot,
} from "./shape-registry.js";

/**
 * Parse an SVG string into an SvgIconDef.
 *
 * - Extracts viewBox dimensions from the root <svg> element
 * - Detects <text class="krs-label"> and <text class="krs-description"> elements,
 *   extracting their position as text slots
 * - Removes those text elements from the body
 */
export function parseSvgIcon(name: string, svgString: string): SvgIconDef {
  // Extract viewBox
  const viewBoxMatch = svgString.match(/viewBox\s*=\s*"([^"]+)"/);
  let viewBoxWidth = 24;
  let viewBoxHeight = 24;
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/\s+/);
    if (parts.length >= 4) {
      viewBoxWidth = parseFloat(parts[2]);
      viewBoxHeight = parseFloat(parts[3]);
    }
  }

  // Extract text slots
  const labelSlot = extractTextSlot(svgString, "krs-label");
  const descriptionSlot = extractTextSlot(svgString, "krs-description");

  // Extract body: content between <svg ...> and </svg>, then remove krs-* text elements
  let body = extractSvgBody(svgString);
  body = removeTextSlotElements(body, "krs-label");
  body = removeTextSlotElements(body, "krs-description");

  return {
    name,
    viewBoxWidth,
    viewBoxHeight,
    body: body.trim(),
    labelSlot,
    descriptionSlot,
  };
}

/**
 * Parse and register an SVG icon in one step.
 */
export function loadAndRegisterIcon(name: string, svgString: string): void {
  const def = parseSvgIcon(name, svgString);
  registerIcon(def);
}

/**
 * Register multiple SVG icons at once.
 * @param icons - Map of icon name to SVG string content
 */
export function loadAndRegisterIcons(icons: Record<string, string>): void {
  for (const [name, svgString] of Object.entries(icons)) {
    loadAndRegisterIcon(name, svgString);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractTextSlot(
  svg: string,
  className: string,
): SvgIconTextSlot | undefined {
  // Match <text ... class="krs-label" ...> or <text ... class="krs-description" ...>
  const pattern = new RegExp(
    `<text\\s[^>]*class\\s*=\\s*"${className}"[^>]*>`,
    "i",
  );
  const match = svg.match(pattern);
  if (!match) return undefined;

  const tag = match[0];

  const xMatch = tag.match(/\bx\s*=\s*"([^"]+)"/);
  const yMatch = tag.match(/\by\s*=\s*"([^"]+)"/);
  const anchorMatch = tag.match(/\btext-anchor\s*=\s*"([^"]+)"/);

  if (!xMatch || !yMatch) return undefined;

  return {
    x: parseFloat(xMatch[1]),
    y: parseFloat(yMatch[1]),
    textAnchor: anchorMatch?.[1],
  };
}

function extractSvgBody(svgString: string): string {
  // Remove the opening <svg ...> tag and closing </svg>
  const openMatch = svgString.match(/<svg\s[^>]*>/i);
  if (!openMatch) return svgString;

  const startIdx = openMatch.index! + openMatch[0].length;
  const endIdx = svgString.lastIndexOf("</svg>");
  if (endIdx === -1) return svgString.slice(startIdx);

  return svgString.slice(startIdx, endIdx);
}

function removeTextSlotElements(body: string, className: string): string {
  // Remove <text class="krs-label" ...>...</text> or self-closing <text class="krs-label" .../>
  const pattern = new RegExp(
    `<text\\s[^>]*class\\s*=\\s*"${className}"[^>]*>.*?</text>|<text\\s[^>]*class\\s*=\\s*"${className}"[^>]*/>`,
    "gi",
  );
  return body.replace(pattern, "");
}
