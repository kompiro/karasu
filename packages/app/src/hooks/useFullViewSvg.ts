import { useMemo } from "react";
import { buildExportSvg, buildExportSvgOrg } from "@karasu/core";
import type { ActiveView } from "../state/app-reducer.js";

/**
 * Builds a multi-level SVG for the Full View toggle.
 * All drill-down levels are stacked vertically and visible simultaneously.
 * Returns an HTML string suitable for use as <iframe srcdoc>.
 * Returns null when full view is disabled or for deploy view (no drill-down).
 */
export function useFullViewSvg(
  source: string,
  styleSource: string,
  isFullView: boolean,
  activeView: ActiveView,
): string | null {
  return useMemo(() => {
    if (!isFullView || activeView === "deploy" || !source) return null;

    try {
      const svgContent =
        activeView === "org"
          ? buildExportSvgOrg(source, styleSource || undefined)
          : buildExportSvg(source, styleSource || undefined);

      // Wrap SVG in minimal HTML. All levels are visible simultaneously (no JS needed).
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:auto;background:#0F172A;}svg{display:block;}</style></head><body>${svgContent}</body></html>`;
    } catch {
      return null;
    }
  }, [source, styleSource, isFullView, activeView]);
}
