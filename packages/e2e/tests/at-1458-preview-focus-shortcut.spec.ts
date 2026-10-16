import { expect, test } from "../fixtures/opfs.js";
import { bootProjectApp } from "../fixtures/boot.js";
import { blurToPreview, focusEditor, pressChord } from "../fixtures/keyboard.js";
import { selectedTab } from "../fixtures/tabs.js";

/**
 * AT-1458: `Ctrl/Cmd+Shift+F` toggles the preview Focus mode through a real
 * keydown, both ways (TPL-1402), and the palette entry does the same.
 */

const SHOP_KRS = `system Shop {
  service Storefront
  service Payment

  Storefront -> Payment "pays"
}
`;

test.describe("AT-1458 preview focus shortcut", () => {
  test("Ctrl/Cmd+Shift+F enters and leaves Focus mode from the preview", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, SHOP_KRS);
    await blurToPreview(page);

    await pressChord(page, "Shift+F");
    const exitFocus = page.getByRole("button", { name: "Exit focus mode" });
    await expect(exitFocus).toHaveAttribute("aria-pressed", "true");
    // Focus mode folds the editor and the activity bar away.
    await expect(page.getByRole("navigation", { name: "Activity Bar" })).toHaveCount(0);

    await pressChord(page, "Shift+F");
    const enterFocus = page.getByRole("button", { name: "Enter focus mode" });
    await expect(enterFocus).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("navigation", { name: "Activity Bar" })).toBeVisible();
  });

  // #3207: Monaco's EditContext focus target is not contenteditable, so the
  // dispatcher does not see a text input and `mod+shift+f` fires. Remove the
  // fixme with the fix.
  test.fixme("Ctrl/Cmd+Shift+F is ignored while the editor has focus", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, SHOP_KRS);
    await focusEditor(page);

    await pressChord(page, "Shift+F");
    // Barrier: `mod+shift+2` fires inside the editor too ("allow"); once Chat
    // is selected, the `mod+shift+f` keydown before it has been handled.
    await pressChord(page, "Shift+2");
    await expect(selectedTab(page, "Chat")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter focus mode" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("the palette's Toggle Preview Focus toggles Focus mode", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, SHOP_KRS);

    await pressChord(page, "Shift+P");
    await page.getByRole("combobox", { name: "Search commands" }).fill("Toggle Preview Focus");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("dialog", { name: "Command Palette" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Exit focus mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
