import { buildDrawioProject, type FileSystemProvider } from "@karasu-tools/core";

/**
 * Build a draw.io (mxGraph XML) export for the current project and trigger a
 * browser download. Uses the same `buildDrawioProject` pipeline as the CLI,
 * so the output matches `karasu render --format drawio` exactly.
 */
export async function downloadDrawio(
  entryPath: string,
  fs: FileSystemProvider,
  filename: string,
): Promise<void> {
  const result = await buildDrawioProject(entryPath, fs);
  const blob = new Blob([result.xml], { type: "application/xml" });
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
