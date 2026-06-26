/**
 * Wrap a diagram SVG into a fixed-size OGP frame (design: Issue #1801).
 *
 * OGP cards display a fixed aspect ratio (`summary_large_image` ≈ 1.91:1,
 * 1200×630). karasu diagrams are often tall/portrait, so a width-fit PNG gets
 * cropped to its top band by the platform. To show the *whole* diagram we
 * letterbox it: render into a `width`×`height` canvas with the diagram scaled
 * to fit (`preserveAspectRatio="xMidYMid meet"`) and centered, with the margins
 * filled by `background`.
 *
 * Pure string transform (no DOM / resvg) so it is unit-testable; the Workers
 * function rasterizes the result.
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

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${background}"/>` +
    inner +
    `</svg>`
  );
}
