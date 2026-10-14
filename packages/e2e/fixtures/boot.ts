import { type Page, expect } from "@playwright/test";
import { replaceEditorContent } from "./editor.js";
import type { OpfsFixture } from "./opfs.js";

/**
 * Boot the app in memory mode and load `krs` into the Monaco editor.
 *
 * This is the canonical 3-step boot sequence used by most memory-mode specs:
 *
 *   await opfs.seed({ mode: "memory" });
 *   await opfs.gotoApp();
 *   await replaceEditorContent(page, krs);
 *
 * Extracted verbatim so a future change to the boot contract is a one-site
 * edit. Specs that need a different seed (OPFS projects, locale opt-out) or
 * a custom `gotoApp` path should keep calling the fixture methods directly.
 */
export async function bootMemoryApp(page: Page, opfs: OpfsFixture, krs: string): Promise<void> {
  await opfs.seed({ mode: "memory" });
  await opfs.gotoApp();
  await replaceEditorContent(page, krs);
}

/**
 * Boot the app in project (OPFS) mode with a single project holding `krs` as
 * its `index.krs`, and wait until the diagram has drawn a node.
 *
 * Project mode is what mounts the file sidebar, the Outline view and the
 * `Switch Project…` command, which memory mode lacks. Specs that need several
 * projects call `opfs.seed` themselves.
 */
export async function bootProjectApp(
  page: Page,
  opfs: OpfsFixture,
  krs: string,
  project: { id: string; name: string } = { id: "demo", name: "Demo" },
): Promise<void> {
  await opfs.seed({
    projects: [{ ...project, files: { "index.krs": krs } }],
    lastProjectId: project.id,
  });
  await opfs.gotoApp();
  await expect(page.locator(".preview-container svg [data-node-id]").first()).toBeVisible();
}
