import { expect, test } from "../fixtures/opfs.js";
import { bootProjectApp } from "../fixtures/boot.js";
import { blurToPreview, focusEditor, pressChord } from "../fixtures/keyboard.js";
import { selectedTab } from "../fixtures/tabs.js";

/**
 * AT-1421: the command palette in a real browser. It opens on
 * `Ctrl/Cmd+Shift+P` even while Monaco has focus (`whenTextInputFocused:
 * "allow"`, TPL-1419), filters as the user types, runs the selected command on
 * Enter or click, and closes on Esc.
 *
 * Out of scope (manual): the palette's on-screen position, and macOS
 * `Cmd+Shift+P` not opening a private browser window. The latter is the
 * browser's own shortcut, outside the page.
 */

const SHOP_KRS = `system Shop {
  service Storefront
  service Payment

  Storefront -> Payment "pays"
}

deploy Prod {
  oci storefrontApp {
    realizes Storefront
  }
}
`;

test.describe("AT-1421 command palette", () => {
  test("opens from the editor, filters, and runs Show Deploy View on Enter", async ({
    page,
    opfs,
  }) => {
    await bootProjectApp(page, opfs, SHOP_KRS);
    await focusEditor(page);

    await pressChord(page, "Shift+P");
    const palette = page.getByRole("dialog", { name: "Command Palette" });
    await expect(palette).toBeVisible();
    const search = page.getByRole("combobox", { name: "Search commands" });
    await expect(search).toBeFocused();

    const options = palette.getByRole("option");
    await expect(options.filter({ hasText: "Toggle Sidebar" })).toHaveCount(1);
    await search.fill("view");
    await expect(options.filter({ hasText: "Toggle Sidebar" })).toHaveCount(0);
    await expect(options.filter({ hasText: "Show Deploy View" })).toHaveCount(1);
    // The palette never lists its own open command.
    await expect(options.filter({ hasText: "Show All Commands" })).toHaveCount(0);

    await search.fill("deploy");
    await expect(options).toHaveCount(1);
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");

    await expect(palette).toHaveCount(0);
    await expect(selectedTab(page, "Deploy")).toBeVisible();
  });

  test("arrow keys move the selection and a click runs the command", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, SHOP_KRS);
    await blurToPreview(page);

    await pressChord(page, "Shift+P");
    const palette = page.getByRole("dialog", { name: "Command Palette" });
    await page.getByRole("combobox", { name: "Search commands" }).fill("Show");
    const options = palette.getByRole("option");
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "false");
    await page.keyboard.press("ArrowUp");
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");

    await page.getByRole("combobox", { name: "Search commands" }).fill("Toggle Sidebar");
    await options.filter({ hasText: "Toggle Sidebar" }).click();
    await expect(palette).toHaveCount(0);
    await expect(page.locator(".sidebar-area")).toHaveCount(0);
  });

  test("shows the empty state when nothing matches", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, SHOP_KRS);

    await pressChord(page, "Shift+P");
    const palette = page.getByRole("dialog", { name: "Command Palette" });
    await page.getByRole("combobox", { name: "Search commands" }).fill("no such command");
    await expect(palette.getByRole("option")).toHaveCount(0);
    await expect(palette).toContainText("No matching commands");
  });

  test("Esc closes the palette", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, SHOP_KRS);

    await pressChord(page, "Shift+P");
    const palette = page.getByRole("dialog", { name: "Command Palette" });
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);
  });
});
