import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/serve.js";

/**
 * AT-3258: `karasu serve` resolves imports.
 *
 * Runs in the `serve` project (`E2E_SERVE=1`, the nightly), over
 * `fixtures/serve-project/imports/`: an entry that pulls services in by a
 * whole-file, a named and a directory import and styles them from an
 * `@import`ed sheet. Serve mode used to put only the opened file into the
 * browser, so every import reported `File not found`.
 */

const diagram = (page: Page) => page.locator(".app.serve-mode .preview-container svg");
const fileNotFound = (page: Page) => page.getByText(/File not found/);

/** Card fill of the service labelled `label`. */
function cardFill(page: Page, label: string) {
  return diagram(page)
    .locator("g[data-node-kind='service']", { hasText: label })
    .locator("rect")
    .first();
}

/** Mark the document so a test can tell an in-place redraw from a reload. */
async function markNoReload(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as Window & { __noReload?: boolean }).__noReload = true;
  });
}

async function expectNoReload(page: Page): Promise<void> {
  expect(await page.evaluate(() => (window as Window & { __noReload?: boolean }).__noReload)).toBe(
    true,
  );
}

/** Open `path` and wait until the page is subscribed to `/api/watch`. */
async function openWatching(page: Page, open: () => Promise<void>): Promise<void> {
  // The server registers the client before it sends the headers, so once the
  // response is in, a write cannot land unseen (as in AT-0032 TC-04).
  const watching = page.waitForResponse((res) => res.url().endsWith("/api/watch"));
  await open();
  await watching;
}

test.describe("AT-3258: karasu serve resolves imports", () => {
  test("TC-01: whole-file, named, directory and style imports all resolve", async ({
    page,
    serveProject,
  }) => {
    await serveProject.open("/imports/index");

    for (const label of ["Reader Web", "Editor Web", "Moderation Web", "Shared Web"]) {
      await expect(diagram(page)).toContainText(label);
    }
    await expect(cardFill(page, "Reader Web")).toHaveAttribute("fill", "#123456");
    await expect(fileNotFound(page)).toHaveCount(0);
  });

  test("TC-02: a file in a subdirectory resolves its relative imports from its own folder", async ({
    page,
    serveProject,
  }) => {
    await serveProject.open("/imports/services/moderation");

    await expect(diagram(page)).toContainText("Moderation Web");
    await expect(diagram(page)).toContainText("Shared Web");
    await expect(fileNotFound(page)).toHaveCount(0);
  });

  test("TC-03: saving an imported .krs redraws the open diagram without a reload", async ({
    page,
    serveProject,
  }) => {
    await openWatching(page, () => serveProject.open("/imports/index"));
    await expect(diagram(page)).toContainText("Reader Web");
    await markNoReload(page);

    await serveProject.writeFile(
      "imports/reader.krs",
      `system Imports {
  service Reader { label "Reader Edited" }
}
`,
    );

    await expect(diagram(page)).toContainText("Reader Edited");
    await expectNoReload(page);
  });

  test("TC-04: saving the imported .krs.style redraws the open diagram", async ({
    page,
    serveProject,
  }) => {
    await openWatching(page, () => serveProject.open("/imports/index"));
    await expect(cardFill(page, "Reader Web")).toHaveAttribute("fill", "#123456");
    await markNoReload(page);

    await serveProject.writeFile(
      "imports/theme.krs.style",
      "service {\n  background-color: #654321;\n}\n",
    );

    await expect(cardFill(page, "Reader Web")).toHaveAttribute("fill", "#654321");
    await expectNoReload(page);
  });

  test("TC-05: deleting an imported file reports File not found for its import", async ({
    page,
    serveProject,
  }) => {
    await openWatching(page, () => serveProject.open("/imports/index"));
    await expect(diagram(page)).toContainText("Editor Web");

    await serveProject.remove("imports/editor.krs");

    // The import that lost its file is the one reported. The diagram itself
    // keeps its last good drawing under the outdated banner, as it does for
    // any error, so it is not what this checks.
    await expect(page.getByText(/File not found: \S*imports\/editor\.krs/)).toBeVisible();
  });
});
