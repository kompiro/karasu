/**
 * WCAG 2.x relative-luminance contrast, used to keep the builtin themes'
 * text-bearing colors machine-checkably legible (#2366 proposal A).
 *
 * Only 6-digit `#RRGGBB` (and shorthand `#RGB`) hex colors are supported —
 * that is the only color form the builtin sheets and `DiagramPalette` use.
 */

/** Parse `#RGB` / `#RRGGBB` into [r, g, b] 0-255, or undefined if not hex. */
function parseHex(color: string): [number, number, number] | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return undefined;
  let hex = m[1];
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channelToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a hex color. Returns undefined for non-hex input. */
export function relativeLuminance(color: string): number | undefined {
  const rgb = parseHex(color);
  if (!rgb) return undefined;
  const [r, g, b] = rgb.map(channelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio between two hex colors, in [1, 21].
 * Returns undefined when either color is not a parseable hex value.
 */
export function contrastRatio(a: string, b: string): number | undefined {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === undefined || lb === undefined) return undefined;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA threshold for normal-size text. */
export const WCAG_AA_NORMAL_TEXT = 4.5;
