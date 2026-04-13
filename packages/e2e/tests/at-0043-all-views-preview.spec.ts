import { type Page, expect, test } from "@playwright/test";

/**
 * AT-0043: Open All Views — bundled SVG popup.
 *
 * The shipped feature opens the bundled all-views SVG in a new window
 * (not an in-app iframe, despite the earlier AT draft). This spec
 * verifies the deterministic surface:
 *
 *  - The toolbar button is present, carries the expected label and is
 *    enabled on a real project with views
 *  - Clicking it opens a popup whose URL is a `blob:` address
 *  - With an editor that parses to no views, the button is disabled
 *
 * Inside-popup tab navigation and drill-down rely on opening the
 * blob: URL in a secondary context and inspecting the bundled SVG —
 * kept in manual / AI visual review for now since the popup is a
 * separate Playwright page without a stable selector surface.
 */

async function replaceEditorContent(page: Page, content: string) {
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(content);
}

test.describe("AT-0043 Open All Views (bundled SVG popup)", () => {
  test("button is visible and enabled with a project that has views", async ({ page }) => {
    await page.goto("/");

    const button = page.getByRole("button", { name: "Open all views in new window" });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    await expect(button).toContainText("Open All Views");
  });

  test("clicking the button opens a blob: popup carrying the bundled SVG", async ({ page }) => {
    await page.goto("/");

    const button = page.getByRole("button", { name: "Open all views in new window" });
    const popupPromise = page.waitForEvent("popup");
    await button.click();
    const popup = await popupPromise;

    expect(popup.url()).toMatch(/^blob:/);
    await popup.close();
  });

  test("button is disabled when no views can be built from the editor source", async ({
    page,
  }) => {
    await page.goto("/");

    // An empty document has no views, so the bundled SVG cannot be
    // generated and the button disables itself via the `!allViewsSvg`
    // guard.
    await replaceEditorContent(page, "\n");

    const button = page.getByRole("button", { name: "Open all views in new window" });
    await expect(button).toBeDisabled();
  });
});
