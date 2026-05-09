/**
 * Axis classification for `.krs.style` properties used by the Tidy
 * formatter to group declarations within a rule.
 *
 * Order of axes follows the `docs/design/tidy-style-and-trivia.md`
 * decision: visual → typography → layout → karasu. Properties whose
 * names are not in any explicit list fall into `karasu` so that
 * forward-compatible properties land at the end of the rule.
 */
type PropertyAxis = "visual" | "typography" | "layout" | "karasu";

export const AXIS_ORDER: readonly PropertyAxis[] = [
  "visual",
  "typography",
  "layout",
  "karasu",
] as const;

const VISUAL = new Set([
  "color",
  "background-color",
  "border-color",
  "border-width",
  "border-style",
  "border-radius",
  "opacity",
  "stroke-width",
  "stroke-style",
]);

const TYPOGRAPHY = new Set(["font-size", "font-weight", "font-family"]);

const LAYOUT = new Set(["direction", "column"]);

const KARASU = new Set(["shape", "badge-color", "badge-icon", "badge-label"]);

/**
 * Classify a property by axis. Unknown / future properties default to
 * `karasu` so they land at the end of the rule rather than getting
 * mixed into a more specific axis.
 */
export function axisOfProperty(property: string): PropertyAxis {
  if (VISUAL.has(property)) return "visual";
  if (TYPOGRAPHY.has(property)) return "typography";
  if (LAYOUT.has(property)) return "layout";
  if (KARASU.has(property)) return "karasu";
  return "karasu";
}
