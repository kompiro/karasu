import { triggerBlobDownload } from "./trigger-download.js";

/** Classes of chrome only the live preview can honour. */
const INTERACTIVE_CHROME_CLASSES = [
  // ⊖ buttons + hover frames of the collapsible categories (Issue #1821).
  "krs-category-controls",
  // Per-node i / D buttons in the card's corner lane (Issue #2420).
  "krs-node-controls",
];

/**
 * Strip interactive chrome from a live-preview SVG before it leaves the app as
 * a file. Static outputs that are rendered fresh (all-layers / drill-down /
 * `/render` / CLI) never contain it; only the live system view does, and the
 * plain "Export SVG" reuses that live SVG — so without this the exported file
 * would carry controls nothing can click (TPL-1001).
 *
 * The ⊕ stub of an already-collapsed category is content, not chrome, so it is
 * kept. SVGs with no chrome at all are returned untouched (no re-serialize).
 */
export function stripInteractiveChrome(svg: string): string {
  if (!INTERACTIVE_CHROME_CLASSES.some((cls) => svg.includes(cls))) return svg;
  try {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    if (doc.querySelector("parsererror")) return svg;
    doc
      .querySelectorAll(INTERACTIVE_CHROME_CLASSES.map((cls) => `.${cls}`).join(", "))
      .forEach((node) => node.remove());
    return new XMLSerializer().serializeToString(doc.documentElement);
  } catch {
    return svg;
  }
}

export function downloadSvg(svg: string, filename: string): void {
  triggerBlobDownload(stripInteractiveChrome(svg), "image/svg+xml", filename);
}
