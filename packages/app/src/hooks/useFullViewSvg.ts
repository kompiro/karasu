import { useMemo } from "react";
import { buildExportSvg, buildExportSvgOrg } from "@karasu/core";
import type { ActiveView } from "../state/app-reducer.js";

// JavaScript that runs inside the iframe to handle level navigation.
// CSS :has() is not reliable inside SVG <style> elements across all browsers,
// so we use JS to show/hide .krs-view groups based on the URL hash.
const LEVEL_NAV_SCRIPT = `
<script>
(function () {
  var ROOT_ID = 'krs-view-root';
  function showLevel() {
    var hash = location.hash.slice(1);
    var views = document.querySelectorAll('.krs-view');
    views.forEach(function (v) { v.style.display = 'none'; });
    var target = hash ? document.getElementById(hash) : null;
    var show = (target && target.classList.contains('krs-view')) ? target : document.getElementById(ROOT_ID);
    if (show) show.style.display = 'block';
  }
  window.addEventListener('hashchange', showLevel);
  document.addEventListener('DOMContentLoaded', showLevel);
  showLevel();
})();
</script>
`.trim();

/**
 * Builds a multi-level SVG for the Full View toggle.
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

      // Wrap SVG in minimal HTML. JavaScript handles level navigation (hash → show/hide).
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:auto;background:#0F172A;}svg{display:block;}</style></head><body>${svgContent}${LEVEL_NAV_SCRIPT}</body></html>`;
    } catch {
      return null;
    }
  }, [source, styleSource, isFullView, activeView]);
}
