import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-0050: FileTree collapse scope.
 *
 * Verifies that the sidebar **Collapse** button in ProjectMode only hides the
 * FileTree, leaving the ProjectSelector toolbar accessible. Also confirms
 * that the Preview-focused mode regression (hiding both panels) is preserved.
 *
 * Out of scope:
 *  - Layout dimensions of the expanded editor/preview: visual review handles
 *    whether space is reclaimed pleasantly.
 */

test.describe("AT-0050 FileTree collapse scope", () => {
  test("collapse hides the FileTree while keeping the ProjectSelector toolbar accessible", async ({
    page,
    opfs,
  }) => {
    await opfs.reset();
    await opfs.gotoApp();

    const projectSelector = page.locator(".project-selector");
    const fileTree = page.locator(".file-tree");

    // Both panels render before collapsing.
    await expect(projectSelector).toBeVisible();
    await expect(fileTree).toBeVisible();

    await page.getByRole("button", { name: "Collapse sidebar" }).click();

    // FileTree disappears, ProjectSelector toolbar remains.
    await expect(fileTree).toBeHidden();
    await expect(projectSelector).toBeVisible();

    // Expand button surfaces while collapsed.
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();

    // The ProjectSelector dropdown and its action buttons are still usable.
    const dropdown = projectSelector.locator("select.project-selector-dropdown");
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toBeEnabled();
    await expect(projectSelector.getByRole("button", { name: /New/ })).toBeEnabled();

    // Switching projects while collapsed still works.
    await dropdown.selectOption({ index: 1 });
    const selectedValue = await dropdown.inputValue();
    expect(selectedValue).not.toEqual("");
  });

  test("expand restores the FileTree and preserves the ProjectSelector toolbar", async ({
    page,
    opfs,
  }) => {
    await opfs.reset();
    await opfs.gotoApp();

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.locator(".file-tree")).toBeHidden();

    await page.getByRole("button", { name: "Expand sidebar" }).click();

    await expect(page.locator(".file-tree")).toBeVisible();
    await expect(page.locator(".project-selector")).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  });

  test("preview focus mode hides both FileTree and ProjectSelector toolbar (regression)", async ({
    page,
    opfs,
  }) => {
    await opfs.reset();
    await opfs.gotoApp();

    await expect(page.locator(".project-selector")).toBeVisible();
    await expect(page.locator(".file-tree")).toBeVisible();

    await page.getByRole("button", { name: "Enter focus mode" }).click();

    // Both panels hidden while focused.
    await expect(page.locator(".project-selector")).toBeHidden();
    await expect(page.locator(".file-tree")).toBeHidden();

    await page.getByRole("button", { name: "Exit focus mode" }).click();

    // Both panels restored on exit.
    await expect(page.locator(".project-selector")).toBeVisible();
    await expect(page.locator(".file-tree")).toBeVisible();
  });
});
