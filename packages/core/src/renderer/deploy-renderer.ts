import type { ResolvedStyles } from "../types/style.js";
import type { DeployViewSlice } from "../view/deploy-view-extract.js";
import { layoutDeploy } from "./deploy-layout.js";
import { renderFromLayout } from "./svg-renderer.js";

/**
 * Renders a deploy diagram SVG from a DeployViewSlice.
 * Deploy units are grouped by `realizes` service into labeled containers.
 * System-level edges are shown as ghost edges between containers.
 * Per-unit styles are resolved via the style pipeline (styles.nodes) rather than hardcoded colors.
 */
export function renderDeploy(slice: DeployViewSlice, styles: ResolvedStyles): string {
  const layoutResult = layoutDeploy(slice);
  return renderFromLayout(layoutResult, styles, slice.deployLabel || undefined);
}
