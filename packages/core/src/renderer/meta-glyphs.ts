import { el } from "./svg-builder.js";

/**
 * Small single-color vector glyphs for node meta chips (#2366 PoC).
 *
 * These replace the emoji the renderer used to place in SVG `<text>` (🔗 link
 * count, 👥 team, 📦 resources, 🔐 capabilities). Emoji glyphs come from the
 * viewer's fonts, so the same SVG rendered as tofu in any environment without
 * a color-emoji font (headless CI, containers, PDF export) and could not
 * follow the theme's text color. A `<path>` has neither problem.
 *
 * Each glyph is authored on a 24×24 box (feather-icons style geometry) and
 * scaled to `size`. `(x, y)` is the top-left corner of the drawn glyph box.
 */
export type MetaGlyphName = "link" | "team" | "package" | "capability";

const GLYPH_BODIES: Record<MetaGlyphName, string> = {
  link:
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  team:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>' +
    '<circle cx="9" cy="7" r="4"/>' +
    '<path d="M23 21v-2a4 4 0 0 0-3-3.87"/>' +
    '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  package:
    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' +
    '<polyline points="3.27 6.96 12 12.01 20.73 6.96"/>' +
    '<line x1="12" y1="22.08" x2="12" y2="12"/>',
  capability:
    '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
};

/** Render one glyph with its top-left corner at (x, y), scaled to `size` px. */
export function metaGlyph(
  name: MetaGlyphName,
  x: number,
  y: number,
  size: number,
  color: string,
  opacity?: number,
): string {
  const s = size / 24;
  return el(
    "g",
    {
      transform: `translate(${x} ${y}) scale(${s})`,
      fill: "none",
      stroke: color,
      "stroke-width": 2.4,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      opacity,
      "data-meta-glyph": name,
    },
    GLYPH_BODIES[name],
  );
}
