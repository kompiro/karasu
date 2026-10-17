import { expect, test } from "../fixtures/opfs.js";
import { bootProjectApp } from "../fixtures/boot.js";
import { blurToPreview, focusEditor, pressChord } from "../fixtures/keyboard.js";
import { selectedTab } from "../fixtures/tabs.js";

/**
 * AT-1411: `Ctrl/Cmd+B` collapses and re-expands the sidebar through a real
 * keydown on the document, and the sidebar comes back on the view it had.
 * Project mode, because only there does the sidebar (and its Outline) exist.
 */

const SHOP_KRS = `system Shop {
  service Storefront
  service Payment

  Storefront -> Payment "pays"
}
`;

test.describe("AT-1411 sidebar toggle shortcut", () => {
  test("Ctrl/Cmd+B collapses the sidebar and re-expands it on the Outline view", async ({
    page,
    opfs,
  }) => {
    await bootProjectApp(page, opfs, SHOP_KRS);
    await page.getByRole("button", { name: "Show outline" }).click();
    await expect(page.getByRole("button", { name: "Hide outline" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await blurToPreview(page);

    await pressChord(page, "b");
    await expect(page.locator(".sidebar-area")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show outline" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await pressChord(page, "b");
    await expect(page.locator(".sidebar-area")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hide outline" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  // Monaco in Chromium focuses an EditContext div, not a textarea; `mod+b`
  // fired there until #3207.
  test("Ctrl/Cmd+B is ignored while the editor has focus", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, SHOP_KRS);
    await expect(page.locator(".sidebar-area")).toBeVisible();
    await focusEditor(page);

    await pressChord(page, "b");
    // Barrier: `mod+shift+2` fires inside the editor too ("allow"); once Chat
    // is selected, the `mod+b` keydown before it has been handled.
    await pressChord(page, "Shift+2");
    await expect(selectedTab(page, "Chat")).toBeVisible();
    await expect(page.locator(".sidebar-area")).toBeVisible();
  });
});
