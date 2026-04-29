import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-0040: Panel focus mode — sidebar collapse and preview fullscreen.
 *
 * Covers TC-1 (sidebar collapse toggle), TC-2 (preview fullscreen focus),
 * and TC-5 (combined sidebar collapse + focus interaction).
 *
 * Out of scope:
 *  - TC-3 Monaco re-layout: requires visual judgment of editor rendering;
 *    handled by AI visual review of artifacts.
 *  - TC-4 MemoryMode: requires forcing OPFS-unavailable, deferred until
 *    a shared OPFS fixture helper exists (#534).
 */
test.describe("AT-0040 Panel focus mode", () => {
  test("collapses and expands the sidebar in ProjectMode (TC-1)", async ({ page, opfs }) => {
    await opfs.reset();
    await opfs.gotoApp();

    const collapseButton = page.getByRole("button", { name: "Collapse sidebar" });
    await expect(collapseButton).toBeVisible();

    await collapseButton.click();

    const expandButton = page.getByRole("button", { name: "Expand sidebar" });
    await expect(expandButton).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toHaveCount(0);

    await expandButton.click();
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  });

  test("enters and exits preview focus mode (TC-2)", async ({ page, opfs }) => {
    await opfs.reset();
    await opfs.gotoApp();

    const enterFocus = page.getByRole("button", { name: "Enter focus mode" });
    await expect(enterFocus).toBeVisible();

    await enterFocus.click();

    // Toolbar buttons remain accessible while in focus mode.
    await expect(page.getByRole("button", { name: "Exit focus mode" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export SVG" })).toBeVisible();
    // Sidebar toggle disappears because the sidebar itself is hidden.
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toHaveCount(0);

    await page.getByRole("button", { name: "Exit focus mode" }).click();
    await expect(page.getByRole("button", { name: "Enter focus mode" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  });

  test("preserves sidebar-collapsed state across focus toggle (TC-5)", async ({ page, opfs }) => {
    await opfs.reset();
    await opfs.gotoApp();

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();

    await page.getByRole("button", { name: "Enter focus mode" }).click();
    await expect(page.getByRole("button", { name: "Exit focus mode" })).toBeVisible();

    await page.getByRole("button", { name: "Exit focus mode" }).click();

    // Sidebar should still be collapsed after exiting focus mode.
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toHaveCount(0);

    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  });
});
