import type { Download, Locator } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * Click `locator` and wait for the resulting `download` event.
 *
 * The `waitForEvent` promise is registered *before* the click so the event
 * cannot be missed — identical to the inline choreography this replaces.
 * The page is derived from the locator, so a cross-page mismatch is
 * impossible.
 */
export async function clickAndDownload(locator: Locator): Promise<Download> {
  const downloadPromise = locator.page().waitForEvent("download");
  await locator.click();
  return downloadPromise;
}

/**
 * Read a Playwright download's bytes into a UTF-8 string.
 */
export async function readDownloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Resolve a Playwright download to its on-disk path, asserting the file
 * exists. The path is what `setInputFiles` takes, so a download can be fed
 * straight back into an upload (export → import round trips).
 */
export async function downloadToPath(download: Download): Promise<string> {
  const path = await download.path();
  if (!existsSync(path)) {
    throw new Error(`download "${download.suggestedFilename()}" has no file at ${path}`);
  }
  return path;
}
