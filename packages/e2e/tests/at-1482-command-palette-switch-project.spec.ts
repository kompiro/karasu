import { expect, test } from "../fixtures/opfs.js";
import { pressChord } from "../fixtures/keyboard.js";

/**
 * AT-1482: switching projects from the command palette. `Switch Project…` is
 * the palette-only `project.switch` command (no keybinding), so the palette is
 * the only way in. Switching changes the URL to `/projects/<id>` and loads that
 * project's `index.krs`; jsdom has neither the router history nor OPFS.
 *
 * Out of scope (manual): the picker staying above other overlays (TPL-1468) is
 * a stacking judgment.
 */

const ALPHA_KRS = `system Alpha {
  service AlphaApi
}
`;

const BRAVO_KRS = `system Bravo {
  service BravoShop
}
`;

test.describe("AT-1482 command palette Switch Project", () => {
  test.beforeEach(async ({ page, opfs }) => {
    await opfs.seed({
      projects: [
        { id: "alpha", name: "Alpha", files: { "index.krs": ALPHA_KRS } },
        { id: "bravo", name: "Bravo Shop", files: { "index.krs": BRAVO_KRS } },
      ],
      lastProjectId: "alpha",
    });
    await opfs.gotoApp();
    await expect(page.locator('.preview-container svg [data-node-id="AlphaApi"]')).toBeVisible();
  });

  test("Switch Project… opens the picker; filter and Enter switch the project", async ({
    page,
  }) => {
    await pressChord(page, "Shift+P");
    const palette = page.getByRole("dialog", { name: "Command Palette" });
    await page.getByRole("combobox", { name: "Search commands" }).fill("Switch Project");
    await page.keyboard.press("Enter");

    const picker = page.getByRole("dialog", { name: "Switch Project" });
    await expect(picker).toBeVisible();
    await expect(palette).toHaveCount(0);
    const search = page.getByRole("combobox", { name: "Search projects" });
    await expect(search).toBeFocused();

    const options = picker.getByRole("option");
    await expect(options).toHaveCount(2);
    await expect(options.filter({ hasText: "Alpha" })).toContainText("current");
    await expect(options.filter({ hasText: "Bravo Shop" })).not.toContainText("current");

    await search.fill("brav");
    await expect(options).toHaveCount(1);
    await page.keyboard.press("Enter");

    await expect(picker).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).pathname).toBe("/projects/bravo");
    const dropdown = page.locator(".project-selector select.project-selector-dropdown");
    await expect(dropdown).toHaveValue("bravo");
    await expect(dropdown.locator("option:checked")).toHaveText("Bravo Shop");
    await expect(page.locator(".monaco-editor .view-lines").first()).toContainText("system Bravo");
    await expect(page.locator('.preview-container svg [data-node-id="BravoShop"]')).toBeVisible();
  });

  test("arrow keys and a click pick a project in the picker", async ({ page }) => {
    await pressChord(page, "Shift+P");
    await page.getByRole("combobox", { name: "Search commands" }).fill("Switch Project");
    await page.keyboard.press("Enter");

    const picker = page.getByRole("dialog", { name: "Switch Project" });
    const options = picker.getByRole("option");
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowUp");
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");

    await options.filter({ hasText: "Bravo Shop" }).click();
    await expect(picker).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).pathname).toBe("/projects/bravo");
  });

  test("Esc closes the picker without switching", async ({ page }) => {
    await pressChord(page, "Shift+P");
    await page.getByRole("combobox", { name: "Search commands" }).fill("Switch Project");
    await page.keyboard.press("Enter");

    const picker = page.getByRole("dialog", { name: "Switch Project" });
    await expect(picker).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await expect(page.locator(".project-selector select.project-selector-dropdown")).toHaveValue(
      "alpha",
    );
  });
});
