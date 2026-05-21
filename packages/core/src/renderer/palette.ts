/**
 * Diagram chrome palette.
 *
 * The SVG renderers paint two distinct layers of color:
 *
 *  1. **Chrome** — structural colors of the diagram surface itself: the
 *     canvas background, legend band, breadcrumb / tab bars, org-tree
 *     cards, empty-state text, diff indicators, …  These are hardcoded in
 *     the renderer (they are not user-stylable via `.krs.style`).
 *  2. **Node / edge styles** — the `.krs.style` cascade (see
 *     `builtins/default-style.ts`).
 *
 * This module owns layer 1. `DiagramPalette` names every chrome color by
 * its *role* (not by hex), so a single `theme` argument can swap the whole
 * surface between dark and light. `darkPalette` carries the historical hex
 * values verbatim — the default theme is `"dark"`, so existing renderer
 * output (and every SVG snapshot) is byte-for-byte unchanged.
 *
 * See `docs/design/svg-diagram-theming.md` (option 1, resolve-and-embed).
 */

/** Resolved diagram theme. `"dark"` is the default for backward compatibility. */
export type DiagramTheme = "dark" | "light";

/**
 * Role-named chrome colors. Dedupe is by role: two roles may share a hex
 * value in one theme yet diverge in the other, so each role gets its own
 * field even when the dark values happen to coincide.
 */
export interface DiagramPalette {
  /** Canvas / panel background rect fill (svg-renderer, org, deploy, all-layers). */
  canvasBg: string;
  /** Secondary surface: breadcrumb band, drill-down tab bar, all-layers separator. */
  surfaceBg: string;
  /** Legend band background. */
  legendBg: string;
  /** Legend band border + swatch stroke + top separator. */
  legendBorder: string;
  /** Legend entry text. */
  legendText: string;
  /** Legend block titles + neutral fallback swatch. */
  legendMuted: string;
  /** Card / connector border (drill-down back-button + active tab, org-tree member stroke). */
  border: string;
  /** Muted border / disabled state (drill-down disabled tab text, org-tree team stroke). */
  mutedBorder: string;
  /** Primary chrome text (drill-down tab / back-button text, breadcrumb current crumb, org-tree text). */
  textPrimary: string;
  /** Muted text (diagram title, info button, drill-down tab text, all-layers section label). */
  textMuted: string;
  /** Secondary muted text (node meta row, ghost badge, org-tree sub-text). */
  textSubtle: string;
  /** Empty-state placeholder text. */
  emptyStateText: string;
  /** Clickable link text (multi-level breadcrumb link). */
  link: string;
  /** Accent: deploy-button stroke/text + diff indicator. */
  accent: string;
  /** Fallback badge color when a node's style supplies none. */
  badgeFallback: string;
}

/**
 * Dark theme — the historical hardcoded values. Keep these byte-identical
 * to the literals they replaced so default rendering does not change.
 */
export const darkPalette: DiagramPalette = {
  canvasBg: "#0F172A",
  surfaceBg: "#1E293B",
  legendBg: "#1F2937",
  legendBorder: "#334155",
  legendText: "#E5E7EB",
  legendMuted: "#9CA3AF",
  border: "#334155",
  mutedBorder: "#475569",
  textPrimary: "#E2E8F0",
  textMuted: "#64748B",
  textSubtle: "#94A3B8",
  emptyStateText: "#9CA3AF",
  link: "#60A5FA",
  accent: "#3B82F6",
  badgeFallback: "#EF4444",
};

/**
 * Light theme — light equivalents that mirror the role semantics. The
 * canvas is near-white, text rows are dark slate, and link / accent stay
 * saturated enough to read on a light surface.
 */
export const lightPalette: DiagramPalette = {
  canvasBg: "#FFFFFF",
  surfaceBg: "#F1F5F9",
  legendBg: "#F8FAFC",
  legendBorder: "#CBD5E1",
  legendText: "#1E293B",
  legendMuted: "#64748B",
  border: "#CBD5E1",
  mutedBorder: "#94A3B8",
  textPrimary: "#1E293B",
  textMuted: "#64748B",
  textSubtle: "#475569",
  emptyStateText: "#64748B",
  link: "#2563EB",
  accent: "#2563EB",
  badgeFallback: "#DC2626",
};

/**
 * Resolve a {@link DiagramPalette} for the given theme. Defaults to
 * `"dark"` when `theme` is omitted so callers that never opt in keep the
 * legacy output.
 */
export function resolvePalette(theme?: DiagramTheme): DiagramPalette {
  return theme === "light" ? lightPalette : darkPalette;
}
