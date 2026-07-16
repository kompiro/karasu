import type { Page } from "@playwright/test";
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
