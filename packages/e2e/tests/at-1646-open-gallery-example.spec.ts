import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-1646: open a gallery example in the app via the deep-link
 * `?example=<slug>&lang=<lang>` (#1646 / #1665), automating AC-4 — the only
 * acceptance condition that can be verified through the browser launch path.
 *
 * The deep-link makes the app fetch from a FIXED origin
 * (`raw.githubusercontent.com/.../examples/<lang>/<slug>/...`) — never a
 * user-supplied URL (TPL-20260510-17). We intercept that origin with
 * `page.route()` and fulfill each request from the on-disk `examples/` file,
 * so the test is hermetic: it never hits the network and does not depend on
 * what is currently committed to `main`.
 *
 * Covers:
 *  - en deep-link → example fetched from the fixed origin and restored as a
 *    Project that renders its view (English labels)
 *  - `lang=ja` selects the Japanese bundled variant (cf. #1670) regardless of
 *    the UI locale
 *  - a malformed slug is rejected by the manifest WITHOUT any fetch, surfacing
 *    the error banner (the trust-boundary guard, TPL-20260510-17)
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/e2e/tests -> repo root -> examples/
const EXAMPLES_DIR = resolve(__dirname, "../../../examples");

const RAW_ORIGIN_GLOB = "https://raw.githubusercontent.com/kompiro/karasu/main/examples/**";

/**
 * Intercept the fixed raw origin and serve each file from disk. Returns a
 * counter so a test can assert that a rejected (malformed) slug triggers NO
 * fetch at all.
 */
async function interceptRawOrigin(page: Page): Promise<{ count: () => number }> {
  let fetchCount = 0;
  await page.route(RAW_ORIGIN_GLOB, async (route) => {
    fetchCount += 1;
    // URL shape: .../main/examples/<lang>/<slug>/<rel...>
    const rel = route.request().url().split("/examples/")[1];
    try {
      const body = readFileSync(resolve(EXAMPLES_DIR, rel), "utf8");
      await route.fulfill({ status: 200, contentType: "text/plain", body });
    } catch {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "not found" });
    }
  });
  return { count: () => fetchCount };
}

// Each test seeds one throwaway project so ProjectMode takes the non-empty
// bootstrap branch (skipping the ~12 default-seed projects); the deep-link adds
// its example on top, keeping the test fast and isolated from seed timing.

// Open a file from the project file tree. The on-switch auto-open targets
// `index.krs`, but payment-platform's entry is `system.krs`, so we open it the
// way a user would before inspecting the rendered preview.
async function openFile(page: Page, name: string) {
  await page.locator(".file-tree-item", { hasText: name }).first().click();
}

test.describe("AT-1646 open a gallery example via deep-link", () => {
  test("en deep-link restores payment-platform as a Project and renders its view", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [{ id: "dummy", name: "Dummy", files: { "index.krs": "system D {}\n" } }],
      lastProjectId: "dummy",
    });
    const raw = await interceptRawOrigin(page);

    await opfs.gotoApp("/?example=payment-platform&lang=en");

    // Restored as a Project: the selector lists it and the fetched entry file
    // is in the tree.
    await expect(page.locator(".project-selector")).toContainText("payment-platform");
    expect(raw.count()).toBeGreaterThan(0);

    // Opening the entry renders the example with English labels.
    await openFile(page, "system.krs");
    await expect(page.locator(".preview-column svg").first()).toContainText("Payment Gateway");
  });

  test("lang=ja selects the Japanese bundled variant (#1670)", async ({ page, opfs }) => {
    // UI locale stays English (fixture default) — only the deep-link `lang`
    // differs, isolating the locale-variant selection.
    await opfs.seed({
      projects: [{ id: "dummy", name: "Dummy", files: { "index.krs": "system D {}\n" } }],
      lastProjectId: "dummy",
    });
    await interceptRawOrigin(page);

    await opfs.gotoApp("/?example=payment-platform&lang=ja");

    await openFile(page, "system.krs");
    const previewSvg = page.locator(".preview-column svg").first();
    await expect(previewSvg).toContainText("決済ゲートウェイ");
    // English label must NOT appear — proves the ja variant was fetched.
    await expect(previewSvg).not.toContainText("Payment Gateway");
  });

  test("a malformed slug is rejected without any fetch (TPL-20260510-17)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [{ id: "dummy", name: "Dummy", files: { "index.krs": "system D {}\n" } }],
      lastProjectId: "dummy",
    });
    const raw = await interceptRawOrigin(page);

    // `../etc` fails the manifest's bare-kebab slug guard, so openExample throws
    // before any fetch and surfaces the error banner.
    await opfs.gotoApp("/?example=../etc&lang=en");

    const banner = page.locator(".export-error[role='alert']");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Could not open the example");
    expect(raw.count()).toBe(0);
  });
});
