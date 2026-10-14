import type { Page } from "@playwright/test";
import { expect, test, type OpfsFixture } from "../fixtures/opfs.js";

/**
 * AT-0005: File management UI (FileTree CRUD).
 *
 * Covers the deterministic creation flows, the Esc cancel path, and the
 * context-menu Rename / Delete flows end to end (OPFS + editor):
 *  - Clicking "+File" opens an inline input; Enter creates a `.krs` file
 *  - A name without an extension gets `.krs` appended
 *  - Clicking "+Dir" creates a new directory
 *  - Esc cancels the inline input without creating anything
 *  - Rename moves the file in OPFS and re-selects the open file at its new path
 *  - Delete asks `window.confirm`: accept removes the file and clears the
 *    editor, dismiss leaves everything in place
 *
 * Out of scope:
 *  - `.krs.style` extension preservation (unit: `useFileTreeOps.test.ts`).
 *  - Directory rename / delete (unit: `useFileTreeOps.test.ts`).
 *
 * Menu items are scoped to `.context-menu`: the project selector's
 * "✎ Rename" / "✕ Delete" buttons would otherwise match the same names.
 */

const INDEX_KRS = 'system "Index Content" {}\n';
const OTHER_KRS = 'system "Other Content" {}\n';

async function seedTwoFiles(opfs: OpfsFixture) {
  await opfs.seed({
    projects: [
      { id: "files", name: "Files", files: { "index.krs": INDEX_KRS, "other.krs": OTHER_KRS } },
    ],
    lastProjectId: "files",
  });
  await opfs.gotoApp();
}

function treeItem(page: Page, name: string) {
  return page.locator(".file-tree-item", {
    has: page.getByText(name, { exact: true }),
  });
}

async function contextMenuAction(page: Page, fileName: string, action: "Rename" | "Delete") {
  await treeItem(page, fileName).click({ button: "right" });
  const menu = page.locator(".context-menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: action, exact: true }).click();
}

test.describe("AT-0005 File management UI", () => {
  test("header +File button creates a new .krs file (AC-1)", async ({ page, opfs }) => {
    await opfs.reset();
    await opfs.gotoApp();

    await page.getByRole("button", { name: "+File" }).click();

    const input = page.getByRole("textbox", { name: "Name", exact: true });
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

  test("header +Dir button creates a new directory (AC-1)", async ({ page, opfs }) => {
    await opfs.reset();
    await opfs.gotoApp();

    await page.getByRole("button", { name: "+Dir" }).click();

    const input = page.getByRole("textbox", { name: "Name", exact: true });
    await expect(input).toBeVisible();
    await input.fill("e2e-scratch-dir");
    await input.press("Enter");

    const newItem = page
      .locator(".file-tree-item", { has: page.locator("text=e2e-scratch-dir") })
      .first();
    await expect(newItem).toBeVisible();
  });

  test("Esc cancels the inline input without creating an entry (AC-1)", async ({ page, opfs }) => {
    await opfs.reset();
    await opfs.gotoApp();

    await page.getByRole("button", { name: "+File" }).click();
    const input = page.getByRole("textbox", { name: "Name", exact: true });
    await expect(input).toBeVisible();
    await input.fill("never-created");
    await input.press("Escape");

    await expect(input).toHaveCount(0);
    await expect(page.locator(".file-tree-item", { hasText: "never-created" })).toHaveCount(0);
  });

  test("context menu Rename moves the open file and re-selects it (AC-3 / AC-6)", async ({
    page,
    opfs,
  }) => {
    await seedTwoFiles(opfs);
    await expect(treeItem(page, "index.krs")).toHaveClass(/file-tree-item-selected/);

    await contextMenuAction(page, "index.krs", "Rename");
    const input = page.getByRole("textbox", { name: "Name", exact: true });
    await expect(input).toHaveValue("index.krs");
    await input.fill("main.krs");
    await input.press("Enter");

    await expect(treeItem(page, "main.krs")).toHaveCount(1);
    await expect(treeItem(page, "index.krs")).toHaveCount(0);
    // The renamed file was open, so the editor follows it to the new path.
    await expect(treeItem(page, "main.krs")).toHaveClass(/file-tree-item-selected/);
    await expect(page.locator(".monaco-editor")).toContainText("Index Content");

    expect(await opfs.read("/projects/files/index.krs")).toBeNull();
    expect(await opfs.read("/projects/files/main.krs")).toBe(INDEX_KRS);
  });

  test("context menu Delete removes the file once the confirm is accepted (AC-4 / AC-6)", async ({
    page,
    opfs,
  }) => {
    await seedTwoFiles(opfs);
    const editor = page.locator(".monaco-editor");
    await expect(editor).toContainText("Index Content");

    let message = "";
    page.once("dialog", (d) => {
      message = d.message();
      void d.accept();
    });
    await contextMenuAction(page, "index.krs", "Delete");

    await expect(treeItem(page, "index.krs")).toHaveCount(0);
    await expect(treeItem(page, "other.krs")).toHaveCount(1);
    expect(message).toContain("index.krs");
    // The deleted file was open, so the editor is cleared.
    await expect(editor).not.toContainText("Index Content");

    expect(await opfs.read("/projects/files/index.krs")).toBeNull();
    expect(await opfs.read("/projects/files/other.krs")).toBe(OTHER_KRS);
  });

  test("context menu Delete keeps the file when the confirm is dismissed (AC-4)", async ({
    page,
    opfs,
  }) => {
    await seedTwoFiles(opfs);

    let dialogSeen = false;
    page.once("dialog", (d) => {
      dialogSeen = true;
      void d.dismiss();
    });
    await contextMenuAction(page, "other.krs", "Delete");

    await expect.poll(() => dialogSeen).toBe(true);
    await expect(treeItem(page, "other.krs")).toHaveCount(1);
    expect(await opfs.read("/projects/files/other.krs")).toBe(OTHER_KRS);
  });
});
