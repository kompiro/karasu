/**
 * Strip the interactive category controls (⊖ buttons + hover frames, the
 * `krs-category-controls` group) from a live-preview SVG before it leaves the
 * app as a file (Issue #1821). Static outputs that are rendered fresh
 * (all-layers / drill-down / `/render` / CLI) never contain them; only the
 * live system view does, and the plain "Export SVG" reuses that live SVG.
 * The ⊕ stub of an already-collapsed category is content, not chrome, so it is
 * kept. SVGs without the controls group are returned untouched (no re-serialize).
 */
export function stripInteractiveChrome(svg: string): string {
  if (!svg.includes("krs-category-controls")) return svg;
  try {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    if (doc.querySelector("parsererror")) return svg;
    doc.querySelectorAll(".krs-category-controls").forEach((node) => node.remove());
    return new XMLSerializer().serializeToString(doc.documentElement);
  } catch {
    return svg;
  }
}

export function downloadSvg(svg: string, filename: string): void {
  const blob = new Blob([stripInteractiveChrome(svg)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation to allow the browser to initiate the download first
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
