import { test, expect } from "../fixtures/opfs";
import { replaceEditorContent } from "../fixtures/editor.js";
import { clickAndDownload, downloadToPath } from "../fixtures/download.js";

/**
 * AT-0004: Project management & OPFS.
 *
 * Covers the deterministic bullets of `docs/acceptance/0004-project-management-opfs.md`
 * using the `opfs` fixture (ADR-862).
 *
 * Coverage map (test name → AC bullets):
 *  - "dropdown lists seeded projects ..."             → AC-1 dropdown listing
 *  - "+ New flow creates ..."                          → AC-1 create flow + OPFS persistence
 *  - "✕ Delete with confirm ..."                       → AC-1 delete flow + OPFS persistence
 *  - "FileTree lists files ... toggles ..."            → AC-2 listing + expand/collapse
 *  - "FileTree click switches the editor ..."          → AC-2 select + highlight, AC-3 switch loads index.krs
 *  - "first-run seeding ..."                           → AC-3 empty-OPFS bootstrap
 *  - "lastProjectId in localStorage restores ..."      → AC-3 last-project restore + AC-1 dropdown switch effect
 *  - "editor edits autosave to OPFS"                   → AC-3 autosave round-trip
 *  - "✎ Rename updates ..."                            → AC-4 rename
 *  - "↓ Export downloads ..."                          → AC-4 export
 *  - "↑ Import of an exported ZIP ..."                 → AC-4 import
 *  - "browser Back / Forward ..."                      → AT-0046 TC-3 / TC-4 / TC-5
 *
 * Out of scope here:
 *  - Drilldown / breadcrumb behavior (covered by AT-0029, AT-0030)
 *  - Warning panel (covered by AT-0045, AT-0057)
 *  - Live preview re-render (visual; stays in human / AI review)
 */

const SAMPLE_KRS_A = 'system "Project A" {}\n';
const SAMPLE_KRS_B = 'system "Project B" {}\n';
const SAMPLE_KRS_C = 'system "Project C" {}\n';

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
    await opfs.gotoApp();

    const dropdown = page.getByRole("combobox", { name: "Project", exact: true });
    await expect(dropdown).toHaveValue("alpha");
    await expect(dropdown.locator("option")).toHaveText(["Alpha", "Bravo", "Charlie"]);
  });

  test("+ New flow creates a project and persists it to OPFS", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [{ id: "alpha", name: "Alpha", files: { "index.krs": SAMPLE_KRS_A } }],
      lastProjectId: "alpha",
    });
    await opfs.gotoApp();

    await page.getByRole("button", { name: "+ New" }).click();
    await page.locator(".project-selector-input").fill("Fresh Project");
    await page.getByRole("button", { name: "OK" }).click();

    const dropdown = page.getByRole("combobox", { name: "Project", exact: true });
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
    await opfs.gotoApp();

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "✕ Delete" }).click();

    const dropdown = page.getByRole("combobox", { name: "Project", exact: true });
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
    await opfs.gotoApp();

    const dropdown = page.getByRole("combobox", { name: "Project", exact: true });
    await expect(dropdown).toBeVisible();

    // First-run seeds Getting Started + the ec-platform examples. We assert
    // a lower bound rather than a specific name (the example list can be
    // reorganized) — the AT bullet only requires that empty OPFS bootstraps
    // into a populated dropdown.
    const optionCount = await dropdown.locator("option").count();
    expect(optionCount).toBeGreaterThanOrEqual(2);
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
    await opfs.gotoApp();

    const dropdown = page.getByRole("combobox", { name: "Project", exact: true });
    await expect(dropdown).toHaveValue("charlie");
    await expect(page.locator(".monaco-editor")).toContainText("Project C");
  });

  test("editor edits autosave to OPFS", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [{ id: "edit-me", name: "EditMe", files: { "index.krs": SAMPLE_KRS_A } }],
      lastProjectId: "edit-me",
    });
    await opfs.gotoApp();

    await replaceEditorContent(page, 'system "Edited Live" {}\n');

    // `handleEditorChange` writes synchronously after the React state update,
    // so poll `opfs.read` to avoid racing the write. Compare on substring —
    // Monaco may normalize line endings, so we don't pin the trailing newline.
    await expect
      .poll(() => opfs.read("/projects/edit-me/index.krs"), { timeout: 5_000 })
      .toContain('system "Edited Live"');
  });

  // ── AC-4: Rename / Export / Import ───────────────────────────────────

  test("✎ Rename updates the dropdown and /meta/projects.json", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [{ id: "alpha", name: "Alpha", files: { "index.krs": SAMPLE_KRS_A } }],
      lastProjectId: "alpha",
    });
    await opfs.gotoApp();

    await page.getByRole("button", { name: "✎ Rename" }).click();
    const input = page.getByPlaceholder("Project name");
    await expect(input).toHaveValue("Alpha");
    await input.fill("Renamed Alpha");
    await input.press("Enter");

    const dropdown = page.getByRole("combobox", { name: "Project", exact: true });
    await expect(dropdown).toHaveValue("alpha");
    await expect(dropdown.locator("option")).toHaveText(["Renamed Alpha"]);

    // The rename is persisted, not just reflected in React state.
    await expect
      .poll(async () => {
        const json = await opfs.read("/meta/projects.json");
        const meta = JSON.parse(json ?? "[]") as Array<{ id: string; name: string }>;
        return meta.find((m) => m.id === "alpha")?.name;
      })
      .toBe("Renamed Alpha");
  });

  test("↓ Export downloads the project as <name>.zip", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [{ id: "alpha", name: "Alpha", files: { "index.krs": SAMPLE_KRS_A } }],
      lastProjectId: "alpha",
    });
    await opfs.gotoApp();

    const download = await clickAndDownload(page.getByRole("button", { name: "↓ Export" }));
    expect(download.suggestedFilename()).toBe("Alpha.zip");
    await downloadToPath(download);
  });

  test("↑ Import of an exported ZIP creates and selects a disambiguated copy", async ({
    page,
    opfs,
  }) => {
    const notes = 'system "Notes" {}\n';
    await opfs.seed({
      projects: [
        {
          id: "alpha",
          name: "Alpha",
          files: { "index.krs": SAMPLE_KRS_A, "extras/notes.krs": notes },
        },
      ],
      lastProjectId: "alpha",
    });
    await opfs.gotoApp();

    const download = await clickAndDownload(page.getByRole("button", { name: "↓ Export" }));
    // The ↑ Import button forwards to this hidden input; drive it directly so
    // no OS file picker opens.
    await page
      .locator('.project-selector input[type="file"][accept=".zip"]')
      .setInputFiles(await downloadToPath(download));

    // The ZIP's top-level directory names the project; "Alpha" is taken, so
    // the import becomes "Alpha (2)" and is selected.
    const dropdown = page.getByRole("combobox", { name: "Project", exact: true });
    await expect(dropdown.locator("option:checked")).toHaveText("Alpha (2)");
    const newId = await dropdown.inputValue();
    expect(newId).not.toBe("alpha");
    await expect(page).toHaveURL((url) => url.pathname === `/projects/${newId}`);

    // Every file survives the round trip, nested paths included.
    expect(await opfs.read(`/projects/${newId}/index.krs`)).toBe(SAMPLE_KRS_A);
    expect(await opfs.read(`/projects/${newId}/extras/notes.krs`)).toBe(notes);
    // The source project is untouched.
    expect(await opfs.read("/projects/alpha/index.krs")).toBe(SAMPLE_KRS_A);
  });

  // ── AT-0046: project switching is browser history ────────────────────

  test("browser Back / Forward walk the project switches", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [
        { id: "alpha", name: "Alpha", files: { "index.krs": SAMPLE_KRS_A } },
        { id: "bravo", name: "Bravo", files: { "index.krs": SAMPLE_KRS_B } },
      ],
      lastProjectId: "alpha",
    });
    await opfs.gotoApp();

    const dropdown = page.getByRole("combobox", { name: "Project", exact: true });
    const editor = page.locator(".monaco-editor");
    // The hash carries the drill state (`#krs-system-root?file=…`); only the
    // pathname names the project.
    await expect(page).toHaveURL((url) => url.pathname === "/projects/alpha");

    // TC-3: switching pushes /projects/<id>.
    await dropdown.selectOption("bravo");
    await expect(page).toHaveURL((url) => url.pathname === "/projects/bravo");
    await expect(editor).toContainText("Project B");

    // TC-4: Back returns to A — URL, dropdown and editor together.
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === "/projects/alpha");
    await expect(dropdown).toHaveValue("alpha");
    await expect(editor).toContainText("Project A");

    // TC-5: Forward returns to B.
    await page.goForward();
    await expect(page).toHaveURL((url) => url.pathname === "/projects/bravo");
    await expect(dropdown).toHaveValue("bravo");
    await expect(editor).toContainText("Project B");
  });
});
