/**
 * Self-contained CSS for diff-state visuals, mirrored from
 * `packages/app/src/styles/app.css` but with the `.preview-pane svg` scope
 * dropped so the rules apply to a standalone SVG opened anywhere
 * (file://, git diff driver, README embed, etc).
 *
 * The app continues to use its scoped copy in `app.css`; this constant
 * is what `compile*Diff` injects into the rendered SVG. Keeping the two
 * close-enough is a manual exercise — palette values are duplicated
 * intentionally to keep the SVG self-contained (no CSS variables).
 *
 * Issue #1020 surfaced the gap: `data-diff-state` was emitted but the
 * SVG had no embedded styles, so CLI output looked identical to a
 * non-diff render when opened standalone.
 */
const DIFF_INLINE_STYLE = `
[data-diff-state="unchanged"] { opacity: 0.55; }
[data-diff-state="added"],
[data-diff-state="removed"],
[data-diff-state="changed"] { opacity: 1; }

[data-diff-state="added"] rect,
[data-diff-state="added"] path,
[data-diff-state="added"] circle,
[data-diff-state="added"] polygon { stroke: #22c55e; stroke-width: 2.5; }
[data-diff-state="added"] line { stroke: #22c55e; }

[data-diff-state="removed"] rect,
[data-diff-state="removed"] path,
[data-diff-state="removed"] circle,
[data-diff-state="removed"] polygon { stroke: #ef4444; stroke-width: 2; stroke-dasharray: 6 4; opacity: 0.7; }
[data-diff-state="removed"] line { stroke: #ef4444; stroke-dasharray: 6 4; }

[data-diff-state="changed"] rect,
[data-diff-state="changed"] path,
[data-diff-state="changed"] circle,
[data-diff-state="changed"] polygon { stroke: #f59e0b; stroke-width: 2.5; }
[data-diff-state="changed"] line { stroke: #f59e0b; }

[data-node-badge] { opacity: 1; }
[data-node-badge][data-diff-state="added"] circle { stroke: #22c55e; stroke-width: 2; }
[data-node-badge][data-diff-state="removed"] circle { stroke: #ef4444; stroke-width: 2; stroke-dasharray: 3 2; }
[data-node-badge][data-diff-state="changed"] circle { stroke: #f59e0b; stroke-width: 2; }
`.trim();

/**
 * Injects the diff stylesheet into an SVG string by adding a `<style>`
 * element immediately after the opening `<svg ...>` tag. If the SVG
 * already contains a `<style>` element with the diff marker comment,
 * it is left alone (idempotent).
 */
export function injectDiffStyle(svg: string): string {
  if (svg.includes("/* karasu-diff-style */")) return svg;
  const styleBlock = `<style>/* karasu-diff-style */\n${DIFF_INLINE_STYLE}\n</style>`;
  return svg.replace(/(<svg\b[^>]*>)/, `$1${styleBlock}`);
}
