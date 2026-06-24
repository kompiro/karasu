import type { ResolvedStyles } from "../types/style.js";
import type { DeployViewSlice } from "../view/deploy-view-extract.js";
import type { DisplayMode } from "./layout-types.js";
import { layoutDeploy } from "./deploy-layout.js";
import { renderFromLayout, type RenderOptions } from "./svg-renderer.js";
import { DEFAULT_EMPTY_STATE_LABELS, type EmptyStateLabels } from "./empty-state-labels.js";
import { escapeXml } from "./svg-builder.js";
import { resolvePalette } from "./palette.js";

interface DeployRenderOptions extends RenderOptions {
  /** Localized labels for the empty-state placeholder. English fallback when omitted. */
  emptyLabels?: EmptyStateLabels;
}

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
  options?: DeployRenderOptions,
): string {
  const palette = resolvePalette(options?.theme);
  if (slice.containers.length === 0 && slice.unclassifiedUnits.length === 0) {
    const title = escapeXml(
      options?.emptyLabels?.deployTitle ?? DEFAULT_EMPTY_STATE_LABELS.deployTitle,
    );
    const hint = escapeXml(
      options?.emptyLabels?.deployHint ?? DEFAULT_EMPTY_STATE_LABELS.deployHint,
    );
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100"><rect width="200" height="100" fill="${palette.canvasBg}"/><text x="100" y="46" text-anchor="middle" fill="${palette.emptyStateText}" font-family="sans-serif" font-size="12">${title}</text><text x="100" y="64" text-anchor="middle" fill="${palette.textMuted}" font-family="sans-serif" font-size="10">${hint}</text></svg>`;
  }
  const layoutResult = layoutDeploy(slice, {
    jobBand: options?.emptyLabels?.deployJobBand,
    unclassified: options?.emptyLabels?.deployUnclassified,
  });
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
