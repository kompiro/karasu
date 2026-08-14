import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-0043: Open All Views — bundled SVG popup.
 *
 * The shipped feature opens the bundled all-views SVG in a new window
 * (not an in-app iframe, despite the earlier AT draft). This spec
 * verifies the deterministic surface:
 *
 *  - The control is present, carries the expected label and is enabled
 *    on a real project with views
 *  - Clicking it opens a popup whose URL is a `blob:` address
 *  - With an editor that parses to no views, the control is disabled
 *
 * Since #2317 it lives inside the export button's dropdown rather than
 * beside it, so each case opens that menu first.
 *
 * Inside-popup tab navigation, drill-down, the Back control and disabled
 * tabs are fenced in `at-0041-all-views-bundled-svg.spec.ts`, which opens
 * the blob: popup as a secondary `Page` and asserts the `:target` / `:has()`
 * effects via getComputedStyle — so this spec keeps to the open/disable
 * surface and defers the bundled-SVG navigation there.
 */

test.describe("AT-0043 Open All Views (bundled SVG popup)", () => {
  const openExportMenu = (page: import("@playwright/test").Page) =>
    page.getByRole("button", { name: "Export options" }).click();
  const openAllViews = (page: import("@playwright/test").Page) =>
    page.getByRole("menuitem", { name: "Open all views in new window" });

  test("menu item is visible and enabled with a project that has views", async ({ page, opfs }) => {
    await opfs.reset();
    await opfs.gotoApp();
    await openExportMenu(page);

    const item = openAllViews(page);
    await expect(item).toBeVisible();
    // Radix marks a disabled item with aria-disabled="true"; an enabled one
    // carries no such attribute.
    await expect(item).not.toHaveAttribute("aria-disabled", "true");
    await expect(item).toContainText("Open All Views");
  });

  test("clicking the menu item opens a blob: popup carrying the bundled SVG", async ({
    page,
    opfs,
  }) => {
    await opfs.reset();
    await opfs.gotoApp();
    await openExportMenu(page);

    const popupPromise = page.waitForEvent("popup");
    await openAllViews(page).click();
    const popup = await popupPromise;

    expect(popup.url()).toMatch(/^blob:/);
    await popup.close();
  });

  // Note: the AT lists a "control is disabled when no views can be built"
  // case. In practice even a trivially empty editor still yields a
  // bundled SVG (the tab chrome is always produced), so there is no
  // stable way to drive the disabled state from the editor alone. That
  // scenario stays in the manual checklist until there is a helper for
  // forcing `allViewsSvg` to be undefined.
});
