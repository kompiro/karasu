import { type Locator, type Page, expect } from "@playwright/test";

/** A file-tree row whose name is exactly `name` (so `index.krs` never matches `index.krs.style`). */
export function treeItem(page: Page, name: string): Locator {
  return page.locator(".file-tree-item", { has: page.getByText(name, { exact: true }) });
}

/** Right-click a file-tree row and return the context menu once it is visible. */
export async function openTreeContextMenu(page: Page, name: string): Promise<Locator> {
  await treeItem(page, name).click({ button: "right" });
  const menu = page.locator(".context-menu");
  await expect(menu).toBeVisible();
  return menu;
}

/**
 * Open a row's context menu and click one of its items.
 *
 * The item is looked up inside `.context-menu`: the project selector's
 * "✎ Rename" / "✕ Delete" buttons would otherwise match the same names.
 */
export async function treeContextMenuAction(
  page: Page,
  name: string,
  action: "Rename" | "Delete",
): Promise<void> {
  const menu = await openTreeContextMenu(page, name);
  await menu.getByRole("button", { name: action, exact: true }).click();
}
