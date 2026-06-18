import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-0058 / AT-0061 / AT-0062: Graphical diff viewer — app interaction flow.
 *
 * The diff viewer is an app-only flow: pick a compare source, the preview
 * enters diff mode (a banner + `data-diff-state` attributes on the SVG), and
 * the direction can be swapped or the source pasted. Core diff logic is
 * covered by `view-diff.test.ts`; this spec fences the UI wiring that unit
 * tests cannot reach.
 *
 * Coverage:
 *  - AT-0058 §1 / TC-1: file-picker compare renders a diff with the added
 *    node marked `data-diff-state="added"` and the banner naming both sides.
 *  - AT-0062 TC-1: the Swap button flips the direction in place — the added
 *    node becomes `removed` and the banner before/after order reverses.
 *  - AT-0061 TC-2: the paste-compare dialog drives a diff from a pasted blob
 *    (banner shows the italic `pasted` before-label).
 *  - AT-0058 TC-6: Exit diff restores the non-diff render (no `data-diff-state`).
 *
 * Out of scope (documented to avoid false "missing coverage" reads):
 *  - Colour / opacity perception (TC-1/3/5), annotation-badge diff (TC-4),
 *    org-view (TC-8a) and deploy-view (TC-9) diff styling — visual checks.
 *  - Snapshot compare source (AT-0060) and open-file-as-entry history /
 *    deep-link (AT-0063) — the latter's meaningful ACs are browser-history
 *    and app-reducer unit-level, not an app e2e fit.
 */

// `index.krs` is the project entry → always the after-side. It has `Payments`
// and the `Orders -> Payments` edge that `before.krs` lacks.
const INDEX_KRS = `system Shop {
  service Catalog
  service Orders
  service Payments
  Catalog -> Orders "queries"
  Orders -> Payments "charges"
}
`;

const BEFORE_KRS = `system Shop {
  service Catalog
  service Orders
  Catalog -> Orders "queries"
}
`;

// Same shape as BEFORE_KRS, used as a pasted before-side blob.
const PASTED_KRS = BEFORE_KRS;

const banner = (page: import("@playwright/test").Page) =>
  page.getByRole("status", { name: "Diff mode active" });

test.describe("AT-0058 Graphical diff viewer", () => {
  test("file-picker compare renders the diff on the system view (AT-0058 TC-1)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [
        { id: "diff", name: "Diff", files: { "index.krs": INDEX_KRS, "before.krs": BEFORE_KRS } },
      ],
      lastProjectId: "diff",
    });
    await opfs.gotoApp();

    // Open index.krs so it is the current file (the compare after-side).
    await page.locator(".file-tree-item", { hasText: "index.krs" }).first().click();
    await expect(page.locator('[data-node-id="Payments"]')).toBeVisible();

    // Right-click before.krs → "⇄ Compare with current".
    await page.locator(".file-tree-item", { hasText: "before.krs" }).first().click({
      button: "right",
    });
    await page.getByRole("button", { name: "⇄ Compare with current" }).click();

    await expect(banner(page)).toBeVisible();
    await expect(banner(page)).toContainText("before.krs");
    await expect(banner(page)).toContainText("index.krs");

    // Payments is present only in the after-side → rendered as added.
    await expect(page.locator('[data-node-id="Payments"][data-diff-state="added"]')).toBeVisible();
  });

  test("Swap flips the diff direction in place (AT-0062 TC-1)", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [
        { id: "diff", name: "Diff", files: { "index.krs": INDEX_KRS, "before.krs": BEFORE_KRS } },
      ],
      lastProjectId: "diff",
    });
    await opfs.gotoApp();

    await page.locator(".file-tree-item", { hasText: "index.krs" }).first().click();
    await page.locator(".file-tree-item", { hasText: "before.krs" }).first().click({
      button: "right",
    });
    await page.getByRole("button", { name: "⇄ Compare with current" }).click();
    await expect(page.locator('[data-node-id="Payments"][data-diff-state="added"]')).toBeVisible();

    const swap = page.getByRole("button", { name: "Swap diff direction" });
    await swap.click();

    // Direction reversed: index.krs is now the before-side, so Payments
    // (absent from before.krs, the new after-side) is rendered as removed.
    await expect(swap).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator('[data-node-id="Payments"][data-diff-state="removed"]'),
    ).toBeVisible();
    await expect(page.locator('[data-node-id="Payments"][data-diff-state="added"]')).toHaveCount(0);
  });

  test("paste-compare dialog drives a diff from a pasted blob (AT-0061 TC-2)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [{ id: "diff", name: "Diff", files: { "index.krs": INDEX_KRS } }],
      lastProjectId: "diff",
    });
    await opfs.gotoApp();

    await page.locator(".file-tree-item", { hasText: "index.krs" }).first().click();

    // Open the paste dialog from the file-tree header (button text "⇄ Paste").
    await page.getByRole("button", { name: "⇄ Paste" }).click();
    const textarea = page.getByRole("textbox", { name: "Pasted .krs content" });
    await expect(textarea).toBeVisible();
    await textarea.fill(PASTED_KRS);
    await page.getByRole("button", { name: "Compare with pasted .krs" }).click();

    await expect(banner(page)).toBeVisible();
    await expect(banner(page)).toContainText("pasted");
    // Pasted blob (before-side) lacks Payments → added in the current file.
    await expect(page.locator('[data-node-id="Payments"][data-diff-state="added"]')).toBeVisible();
  });

  test("Exit diff restores the non-diff render (AT-0058 TC-6)", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [
        { id: "diff", name: "Diff", files: { "index.krs": INDEX_KRS, "before.krs": BEFORE_KRS } },
      ],
      lastProjectId: "diff",
    });
    await opfs.gotoApp();

    await page.locator(".file-tree-item", { hasText: "index.krs" }).first().click();
    await page.locator(".file-tree-item", { hasText: "before.krs" }).first().click({
      button: "right",
    });
    await page.getByRole("button", { name: "⇄ Compare with current" }).click();
    await expect(page.locator("[data-diff-state]").first()).toBeVisible();

    await page.getByRole("button", { name: "Exit diff mode" }).click();

    await expect(banner(page)).toHaveCount(0);
    await expect(page.locator('[data-node-id="Payments"]')).toBeVisible();
    await expect(page.locator("[data-diff-state]")).toHaveCount(0);
  });
});
