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
