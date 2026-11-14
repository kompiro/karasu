/**
 * The colour the OGP frame fills its margins with when none (or an invalid one)
 * is given.
 */
export const DEFAULT_OGP_BACKGROUND = "#ffffff";

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`: the only spellings a frame background may take. */
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * A frame background from untrusted input (the `/render` query's `bg`), or
 * `undefined` when it is absent or not a hex colour (#3773).
 *
 * The value is written into an SVG attribute and handed to resvg, so only a
 * strict hex colour passes: anything else (a quote, `<`, a named colour, a
 * CSS function) is refused rather than escaped.
 */
export function parseOgpBackground(raw: string | null | undefined): string | undefined {
  return typeof raw === "string" && HEX_COLOR.test(raw) ? raw : undefined;
}

/**
 * Wrap a diagram SVG into a fixed-size OGP frame (design: Issue #1801).
 *
 * OGP cards display a fixed aspect ratio (`summary_large_image` ≈ 1.91:1,
 * 1200×630). karasu diagrams are often tall/portrait, so a width-fit PNG gets
 * cropped to its top band by the platform. To show the *whole* diagram we
 * letterbox it: render into a `width`×`height` canvas with the diagram scaled
 * to fit (`preserveAspectRatio="xMidYMid meet"`) and centered, with the margins
 * filled by `background`. A `background` that {@link parseOgpBackground}
 * refuses falls back to {@link DEFAULT_OGP_BACKGROUND}, so no caller can write
 * markup into the frame through it (#3773).
 *
 * Pure string transform (no DOM / resvg) so it is unit-testable; the Workers
 * that rasterize the result (the app's `/render` Pages Function and nest's
 * `/g/<id>/og.png`, #2995) call it from here so both frames stay identical.
 */
export function wrapSvgForOgpFrame(
  svg: string,
  width: number,
  height: number,
  background: string,
): string {
  const open = svg.match(/<svg\b[^>]*>/i);
  if (!open) return svg; // not a recognizable SVG — leave untouched

  const openTag = open[0];
  const viewBoxMatch = openTag.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  const widthAttr = openTag.match(/\bwidth\s*=\s*["']([^"']+)["']/i);
  const heightAttr = openTag.match(/\bheight\s*=\s*["']([^"']+)["']/i);
  // Fall back to width/height when there is no explicit viewBox, so the nested
  // viewport can scale the content. Bail if we can't establish a coordinate box.
  const viewBox = viewBoxMatch
    ? viewBoxMatch[1]
    : widthAttr && heightAttr
      ? `0 0 ${widthAttr[1]} ${heightAttr[1]}`
      : null;
  if (!viewBox) return svg;

  // Re-size the original root to fill the frame and contain its viewBox. The
  // viewBox is preserved; width/height/preserveAspectRatio are overridden.
  const innerOpenTag = openTag
    .replace(/\s(width|height|preserveAspectRatio)\s*=\s*["'][^"']*["']/gi, "")
    .replace(
      /^<svg\b/i,
      `<svg width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"`,
    );
  const inner = svg.replace(openTag, innerOpenTag);

  const fill = parseOgpBackground(background) ?? DEFAULT_OGP_BACKGROUND;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${fill}"/>` +
    inner +
    `</svg>`
  );
}
