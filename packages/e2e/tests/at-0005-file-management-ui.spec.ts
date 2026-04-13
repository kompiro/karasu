import { expect, test } from "@playwright/test";

/**
 * AT-0005: File management UI (FileTree CRUD).
 *
 * Covers the deterministic creation flows and the Esc cancel path:
 *  - Clicking "+File" opens an inline input; Enter creates a `.krs` file
 *  - A name without an extension gets `.krs` appended
 *  - Clicking "+Dir" creates a new directory
 *  - Esc cancels the inline input without creating anything
 *
 * Out of scope for this pilot:
 *  - Context menu Rename / Delete paths — depend on window.confirm and
 *    right-click menu coordinates, which we will tackle once the
 *    dialog/context-menu helpers land in the shared E2E fixture work (#534).
 *  - `.krs.style` extension preservation edge case.
 */

test.describe("AT-0005 File management UI", () => {
  test("header +File button creates a new .krs file (AC-1)", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "+File" }).click();

    const input = page.locator(".file-tree-inline-input");
    await expect(input).toBeVisible();
    await input.fill("e2e-scratch");
    await input.press("Enter");

    // The extension-less name gets `.krs` appended and the file appears
    // in the tree.
    const newItem = page
      .locator(".file-tree-item", { has: page.locator("text=e2e-scratch.krs") })
      .first();
    await expect(newItem).toBeVisible();
  });

  test("header +Dir button creates a new directory (AC-1)", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "+Dir" }).click();

    const input = page.locator(".file-tree-inline-input");
    await expect(input).toBeVisible();
    await input.fill("e2e-scratch-dir");
    await input.press("Enter");

    const newItem = page
      .locator(".file-tree-item", { has: page.locator("text=e2e-scratch-dir") })
      .first();
    await expect(newItem).toBeVisible();
  });

  test("Esc cancels the inline input without creating an entry (AC-1)", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "+File" }).click();
    const input = page.locator(".file-tree-inline-input");
    await expect(input).toBeVisible();
    await input.fill("never-created");
    await input.press("Escape");

    await expect(input).toHaveCount(0);
    await expect(page.locator(".file-tree-item", { hasText: "never-created" })).toHaveCount(0);
  });
});
