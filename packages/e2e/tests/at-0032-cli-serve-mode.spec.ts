import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/serve.js";

/**
 * AT-0032: CLI serve mode, in the browser (#3049).
 *
 * Runs only in the `serve` project, against `karasu serve` over
 * `fixtures/serve-project/` (`scripts/start-serve.ts`). That project exists
 * only under `E2E_SERVE=1`, which the nightly sets. The API side of the same
 * cases is in `packages/cli/src/serve*.test.ts`.
 */

const diagram = (page: Page) => page.locator(".app.serve-mode .preview-container svg");

/** Serve mode shows the preview alone: no editor, no sidebar. */
async function expectPreviewOnly(page: Page): Promise<void> {
  await expect(page.locator(".app.serve-mode")).toBeVisible();
  await expect(page.locator(".monaco-editor")).toHaveCount(0);
  await expect(page.locator(".activity-bar")).toHaveCount(0);
}

test.describe("AT-0032: CLI serve mode", () => {
  test("TC-02: / previews index.krs with no editor pane", async ({ page, serveProject }) => {
    await serveProject.open("/");

    await expect(diagram(page)).toContainText("Index Web");
    await expectPreviewOnly(page);
  });

  test("TC-03: /other previews other.krs", async ({ page, serveProject }) => {
    await serveProject.open("/other");

    await expect(diagram(page)).toContainText("Other Web");
    await expect(diagram(page)).not.toContainText("Index Web");
    await expectPreviewOnly(page);
  });

  test("TC-04: rewriting the file on disk redraws the diagram without a reload", async ({
    page,
    serveProject,
  }) => {
    // The page subscribes to `/api/watch` in an effect after the first
    // render; the server registers the client before it sends the headers,
    // so once the response is in, a write cannot land unseen.
    const watching = page.waitForResponse((res) => res.url().endsWith("/api/watch"));
    // `live.krs` is this test's alone, so rewriting it cannot race TC-02/03.
    await serveProject.open("/live");
    await expect(diagram(page)).toContainText("Before Edit");
    await watching;

    // A reload would wipe this marker; the SSE path keeps the document.
    await page.evaluate(() => {
      (window as Window & { __noReload?: boolean }).__noReload = true;
    });
    await serveProject.write(
      "live",
      `system ServeLive {
  label "Serve Live"
  service LiveWeb { label "After Edit" }
}
`,
    );

    await expect(diagram(page)).toContainText("After Edit");
    await expect(diagram(page)).not.toContainText("Before Edit");
    expect(
      await page.evaluate(() => (window as Window & { __noReload?: boolean }).__noReload),
    ).toBe(true);
  });

  test("TC-06: a missing file shows File not found", async ({ page, serveProject }) => {
    await serveProject.open("/missing");

    await expect(page.getByText("File not found: missing.krs")).toBeVisible();
    await expect(page.locator(".preview-container svg")).toHaveCount(0);
  });

  // #3162: Share is back in serve mode, with links built on the public app so
  // that someone not running `karasu serve` can open them. The file name serve
  // puts in the path must not follow the link there.
  test("TC-07: Share builds its links on the public app, not on the local server", async ({
    page,
    serveProject,
  }) => {
    await serveProject.open("/other");
    await expect(diagram(page)).toContainText("Other Web");

    await page.getByRole("button", { name: /Share/ }).click();

    const priv = page.getByLabel("Private shareable URL");
    await expect(priv).toHaveValue(/^https:\/\/karasu\.kompiro\.dev\/#s=/);
    await expect(priv).not.toHaveValue(/\/other/);
    await expect(page.getByText(/These links open on karasu\.kompiro\.dev/)).toBeVisible();
  });
});
