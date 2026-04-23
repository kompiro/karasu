import type { ResolvedStyles } from "../types/style.js";
import type { DeployViewSlice } from "../view/deploy-view-extract.js";
import type { DisplayMode } from "./layout.js";
import { layoutDeploy } from "./deploy-layout.js";
import { renderFromLayout, type RenderOptions } from "./svg-renderer.js";

/**
 * Renders a deploy diagram SVG from a DeployViewSlice.
 * Deploy units are grouped by `realizes` service into labeled containers.
 * System-level edges are shown as ghost edges between containers.
 * Per-unit styles are resolved via the style pipeline (styles.nodes) rather than hardcoded colors.
 *
 * `options.nodeDiffState` / `options.edgeDiffState` propagate diff metadata so
 * each rendered unit / ghost edge gets a `data-diff-state` attribute (Issue #735).
 */
export function renderDeploy(
  slice: DeployViewSlice,
  styles: ResolvedStyles,
  displayMode?: DisplayMode,
  options?: RenderOptions,
): string {
  if (slice.containers.length === 0 && slice.unclassifiedUnits.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100"><rect width="200" height="100" fill="#0F172A"/><text x="100" y="46" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif" font-size="12">No deploy block defined</text><text x="100" y="64" text-anchor="middle" fill="#64748B" font-family="sans-serif" font-size="10">Add a deploy block to your .krs file</text></svg>`;
  }
  const layoutResult = layoutDeploy(slice);
  return renderFromLayout(
    layoutResult,
    styles,
    slice.deployLabel || undefined,
    undefined,
    displayMode,
    undefined,
    options,
  );
}
