import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/opfs";

/**
 * AT-0004: Project management & OPFS.
 *
 * Covers the deterministic bullets of `docs/acceptance/0004-project-management-opfs.md`
 * using the `opfs` fixture (ADR-20260427-05). Out of scope here:
 *  - Drilldown / breadcrumb behavior (covered by AT-0029, AT-0030)
 *  - Warning panel (covered by AT-0045, AT-0057)
 *  - Live preview re-render (visual; stays in human / AI review)
 *  - Rename / Export / Import flows (not part of AT-0004's bullets)
 */

const SAMPLE_KRS_A = 'system "Project A" {}\n';
const SAMPLE_KRS_B = 'system "Project B" {}\n';
const SAMPLE_KRS_C = 'system "Project C" {}\n';

/**
 * Force the locale to English so that `+ New`, `✕ Delete`, etc. labels are
 * deterministic regardless of the test runner's `navigator.language`.
 * Must be called *after* `opfs.seed`/`reset` (which clears localStorage)
 * and *before* `gotoApp`.
 */
async function pinLocaleEn(page: Page) {
  await page.evaluate(() => localStorage.setItem("karasu-locale", "en"));
}

async function editorReplace(page: Page, content: string) {
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(content);
}

test.describe("AT-0004 Project management & OPFS", () => {
  // ── AC-1: ProjectSelector UI ──────────────────────────────────────────

  test("dropdown lists seeded projects in the order they were written", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [
        { id: "alpha", name: "Alpha", files: { "index.krs": SAMPLE_KRS_A } },
        { id: "bravo", name: "Bravo", files: { "index.krs": SAMPLE_KRS_B } },
        { id: "charlie", name: "Charlie", files: { "index.krs": SAMPLE_KRS_C } },
      ],
      lastProjectId: "alpha",
    });
    await pinLocaleEn(page);
    await opfs.gotoApp();

    const dropdown = page.locator(".project-selector select.project-selector-dropdown");
    await expect(dropdown).toHaveValue("alpha");
    await expect(dropdown.locator("option")).toHaveText(["Alpha", "Bravo", "Charlie"]);
  });

  test("+ New flow creates a project and persists it to OPFS", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [{ id: "alpha", name: "Alpha", files: { "index.krs": SAMPLE_KRS_A } }],
      lastProjectId: "alpha",
    });
    await pinLocaleEn(page);
    await opfs.gotoApp();

    await page.getByRole("button", { name: "+ New" }).click();
    await page.locator(".project-selector-input").fill("Fresh Project");
    await page.getByRole("button", { name: "OK" }).click();

    const dropdown = page.locator(".project-selector select.project-selector-dropdown");
    await expect(dropdown.locator('option:has-text("Fresh Project")')).toHaveCount(1);

    // The newly created project becomes the active selection.
    const selectedText = await dropdown.locator("option:checked").textContent();
    expect(selectedText?.trim()).toBe("Fresh Project");

    // OPFS reflects the new project in meta and on disk.
    const metaJson = await opfs.read("/meta/projects.json");
    expect(metaJson).not.toBeNull();
    const meta = JSON.parse(metaJson as string) as Array<{ name: string; rootPath: string }>;
    const created = meta.find((m) => m.name === "Fresh Project");
    expect(created).toBeDefined();
    const newIndex = await opfs.read(`${created!.rootPath}/index.krs`);
    expect(newIndex).not.toBeNull();
  });

  test("✕ Delete with confirm removes the project from the dropdown and OPFS", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [
        { id: "alpha", name: "Alpha", files: { "index.krs": SAMPLE_KRS_A } },
        { id: "bravo", name: "Bravo", files: { "index.krs": SAMPLE_KRS_B } },
      ],
      lastProjectId: "bravo",
    });
    await pinLocaleEn(page);
    await opfs.gotoApp();

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "✕ Delete" }).click();

    const dropdown = page.locator(".project-selector select.project-selector-dropdown");
    await expect(dropdown.locator('option:has-text("Bravo")')).toHaveCount(0);
    await expect(dropdown.locator('option:has-text("Alpha")')).toHaveCount(1);

    // The deleted project is gone from OPFS.
    expect(await opfs.read("/projects/bravo/index.krs")).toBeNull();
  });

  // ── AC-2: FileTree UI ────────────────────────────────────────────────

  test("FileTree lists files at the project root and toggles directory expansion", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [
        {
          id: "multi",
          name: "Multi",
          files: {
            "index.krs": SAMPLE_KRS_A,
            "extras/notes.krs": 'system "Notes" {}\n',
          },
        },
      ],
      lastProjectId: "multi",
    });
    await pinLocaleEn(page);
    await opfs.gotoApp();

    const fileTree = page.locator(".file-tree");
    await expect(fileTree).toBeVisible();

    // Top-level entries: the `extras` directory and `index.krs`.
    await expect(fileTree.locator(".file-tree-name", { hasText: "index.krs" })).toHaveCount(1);
    const extrasDir = fileTree.locator(".file-tree-item", { hasText: "extras" }).first();
    await expect(extrasDir).toBeVisible();

    // Child file is hidden until the directory is expanded.
    await expect(fileTree.locator(".file-tree-name", { hasText: "notes.krs" })).toHaveCount(0);

    await extrasDir.click();
    await expect(fileTree.locator(".file-tree-name", { hasText: "notes.krs" })).toHaveCount(1);

    // Collapse hides the child again.
    await extrasDir.click();
    await expect(fileTree.locator(".file-tree-name", { hasText: "notes.krs" })).toHaveCount(0);
  });

  test("FileTree click switches the editor and applies the selected highlight", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [
        {
          id: "twofile",
          name: "TwoFile",
          files: {
            "index.krs": SAMPLE_KRS_A,
            "alt.krs": 'system "AltFile" {}\n',
          },
        },
      ],
      lastProjectId: "twofile",
    });
    await pinLocaleEn(page);
    await opfs.gotoApp();

    const fileTree = page.locator(".file-tree");
    const indexItem = fileTree.locator(".file-tree-item", { hasText: "index.krs" }).first();
    const altItem = fileTree.locator(".file-tree-item", { hasText: "alt.krs" }).first();

    // index.krs is the initial selection.
    await expect(indexItem).toHaveClass(/file-tree-item-selected/);
    await expect(altItem).not.toHaveClass(/file-tree-item-selected/);

    await altItem.click();

    await expect(altItem).toHaveClass(/file-tree-item-selected/);
    await expect(indexItem).not.toHaveClass(/file-tree-item-selected/);
    await expect(page.locator(".monaco-editor")).toContainText("AltFile");
  });

  // ── AC-3: ProjectModeApp initialization ──────────────────────────────

  test("first-run seeding from empty OPFS populates the dropdown with example projects", async ({
    page,
    opfs,
  }) => {
    await opfs.reset();
    await pinLocaleEn(page);
    await opfs.gotoApp();

    const dropdown = page.locator(".project-selector select.project-selector-dropdown");
    await expect(dropdown).toBeVisible();

    // First-run seeds Getting Started + the seven ec-platform examples.
    // We don't pin the exact count (it can change as examples are added),
    // but `01-system` must always be present.
    await expect(dropdown.locator('option:has-text("01-system")')).toHaveCount(1);
    await expect(dropdown.locator("option")).not.toHaveCount(0);
  });

  test("lastProjectId in localStorage restores the previously selected project", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [
        { id: "alpha", name: "Alpha", files: { "index.krs": SAMPLE_KRS_A } },
        { id: "bravo", name: "Bravo", files: { "index.krs": SAMPLE_KRS_B } },
        { id: "charlie", name: "Charlie", files: { "index.krs": SAMPLE_KRS_C } },
      ],
      lastProjectId: "charlie",
    });
    await pinLocaleEn(page);
    await opfs.gotoApp();

    const dropdown = page.locator(".project-selector select.project-selector-dropdown");
    await expect(dropdown).toHaveValue("charlie");
    await expect(page.locator(".monaco-editor")).toContainText("Project C");
  });

  test("editor edits autosave to OPFS", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [{ id: "edit-me", name: "EditMe", files: { "index.krs": SAMPLE_KRS_A } }],
      lastProjectId: "edit-me",
    });
    await pinLocaleEn(page);
    await opfs.gotoApp();

    await editorReplace(page, 'system "Edited Live" {}\n');

    // `handleEditorChange` writes synchronously after the React state update,
    // so poll `opfs.read` to avoid racing the write. Compare on substring —
    // Monaco may normalize line endings, so we don't pin the trailing newline.
    await expect
      .poll(() => opfs.read("/projects/edit-me/index.krs"), { timeout: 5_000 })
      .toContain('system "Edited Live"');
  });
});
