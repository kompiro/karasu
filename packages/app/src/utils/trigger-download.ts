/**
 * Trigger a browser file download for in-memory content via a temporary
 * object URL. Shared by every "save as file" surface in the app (SVG /
 * draw.io / project-zip exports, translate-result download).
 *
 * The anchor is appended to the document before the click (required by some
 * browsers for programmatic downloads), and revocation is deferred with
 * `setTimeout(…, 0)` so the browser can initiate the download before the
 * blob URL disappears.
 *
 * Note: PreviewColumn's "open all views in a tab" intentionally does NOT use
 * this helper — it is an open-in-tab navigation with a long-lived (10s)
 * revoke window, not a download.
 */
export function triggerBlobDownload(content: BlobPart, mimeType: string, filename: string): void {
  const blob = new Blob([content], { type: mimeType });
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
