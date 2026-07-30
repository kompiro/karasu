import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-0005 AC-2: the file-tree context menu closes on Esc and on an outside
 * click.
 *
 * Both were left manual with the rationale that "document-level listeners
 * cannot be reproduced reliably in jsdom (`.claude/rules/testing.md`)". That
 * rationale is about jsdom, not about the behaviour: in a real browser these are
 * ordinary events. The menu is also hand-rolled (`FileTree.tsx` registers
 * `window` `click` and `keydown` listeners) rather than Radix-backed, so the
 * "the guarantee comes from Radix" half of the rule does not apply either —
 * this wiring is ours and worth asserting.
 */

const KRS = `system Demo {
  service Api
}
`;

async function openFileContextMenu(page: import("@playwright/test").Page) {
  await page.locator(".file-tree-item", { hasText: "index.krs" }).first().click({
    button: "right",
  });
  const menu = page.locator(".context-menu");
  await expect(menu).toBeVisible();
  return menu;
}

test.describe("AT-0005 file context menu dismissal", () => {
  test("Esc closes the context menu (AC-2)", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [{ id: "ctx", name: "Ctx", files: { "index.krs": KRS } }],
      lastProjectId: "ctx",
    });
    await opfs.gotoApp();

    const menu = await openFileContextMenu(page);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("clicking outside closes the context menu (AC-2)", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [{ id: "ctx", name: "Ctx", files: { "index.krs": KRS } }],
      lastProjectId: "ctx",
    });
    await opfs.gotoApp();

    const menu = await openFileContextMenu(page);
    // Click well away from the menu, in the preview pane.
    await page.locator(".preview-container").click({ position: { x: 10, y: 10 } });
    await expect(menu).toHaveCount(0);
  });

  test("the menu closes without performing a destructive action", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [{ id: "ctx", name: "Ctx", files: { "index.krs": KRS } }],
      lastProjectId: "ctx",
    });
    await opfs.gotoApp();

    const menu = await openFileContextMenu(page);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    // Dismissal must not be a disguised activation: the file is still there and
    // no rename input opened. A menu that closed *because* Delete fired would
    // otherwise satisfy the two tests above.
    await expect(page.locator(".file-tree-item", { hasText: "index.krs" })).toHaveCount(1);
    await expect(page.locator(".file-tree-item input")).toHaveCount(0);
  });
});
