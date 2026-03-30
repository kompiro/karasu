import { useMemo } from "react";
import { buildExportSvg, buildExportSvgOrg, type DisplayMode } from "@karasu/core";
import type { ActiveView } from "../state/app-reducer.js";

/**
 * Builds a multi-level SVG for the Full View toggle.
 * All drill-down levels are stacked vertically and visible simultaneously.
 * Returns an HTML string suitable for use as <iframe srcdoc>.
 * Returns null when full view is disabled or for deploy view (no drill-down).
 *
 * Note: styleSource is currently passed as empty string by all callers because
 * style files are resolved through the filesystem inside compileProject() and are
 * not separately available as raw strings at this call site.
 * Custom styles are therefore not applied in Full View mode. (#TODO follow-up)
 */
export function useFullViewSvg(
  source: string,
  styleSource: string,
  isFullView: boolean,
  activeView: ActiveView,
  displayMode?: DisplayMode,
): string | null {
  return useMemo(() => {
    if (!isFullView || activeView === "deploy" || !source) return null;

    try {
      const svgContent =
        activeView === "org"
          ? buildExportSvgOrg(source, styleSource || undefined, displayMode)
          : buildExportSvg(source, styleSource || undefined, displayMode);

      // Wrap SVG in minimal HTML. All levels are visible simultaneously (no JS needed).
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:auto;background:#0F172A;}svg{display:block;}</style></head><body>${svgContent}</body></html>`;
    } catch {
      return null;
    }
  }, [source, styleSource, isFullView, activeView, displayMode]);
}
