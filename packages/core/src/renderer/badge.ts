import { el, escapeXml } from "./svg-builder.js";

/** The subset of a resolved node style that drives the annotation badge. */
interface BadgeStyle {
  badgeIcon?: string;
  badgeLabel?: string;
  badgeColor?: string;
}

/**
 * Build the SVG children of a single annotation badge (a colored circle, an
 * optional icon glyph, and an optional label) centred on (`badgeX`, `badgeY`).
 *
 * Returns an empty array when the style carries neither an icon nor a label, so
 * callers can render a badge unconditionally. The caller wraps the returned
 * children in its own `<g>` — the system renderer adds diff-state metadata, the
 * org renderer wraps them plainly. Keeping the shape here is the single source
 * of truth for badge geometry across both renderers (#1583).
 */
export function badgeChildren(
  style: BadgeStyle,
  badgeX: number,
  badgeY: number,
  fallbackColor: string,
): string[] {
  if (!style.badgeIcon && !style.badgeLabel) return [];
  const children: string[] = [];
  const badgeColor = style.badgeColor ?? fallbackColor;
  children.push(el("circle", { cx: badgeX, cy: badgeY, r: 10, fill: badgeColor }));
  if (style.badgeIcon) {
    children.push(
      el(
        "text",
        {
          x: badgeX,
          y: badgeY,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          fill: "white",
          "font-size": "10px",
        },
        escapeXml(style.badgeIcon),
      ),
    );
  }
  if (style.badgeLabel) {
    children.push(
      el(
        "text",
        {
          x: badgeX + 14,
          y: badgeY,
          "dominant-baseline": "central",
          fill: badgeColor,
          "font-size": "9px",
          "font-weight": "bold",
          "font-family": "sans-serif",
        },
        escapeXml(style.badgeLabel),
      ),
    );
  }
  return children;
}
