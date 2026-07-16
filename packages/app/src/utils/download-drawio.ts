import { buildDrawioProject, type FileSystemProvider } from "@karasu-tools/core";
import { triggerBlobDownload } from "./trigger-download.js";

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
  triggerBlobDownload(result.xml, "application/xml", filename);
}
