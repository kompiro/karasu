import { expect, test } from "../fixtures/opfs.js";
import { bootProjectApp } from "../fixtures/boot.js";
import { blurToPreview, focusEditor, pressChord } from "../fixtures/keyboard.js";
import { selectedTab } from "../fixtures/tabs.js";

/**
 * AT-1422: `Ctrl/Cmd+Shift+E` / `Ctrl/Cmd+Shift+O` switch the activity-bar
 * view through a real keydown, and `Ctrl/Cmd+Shift+O` reopens a collapsed
 * sidebar. The activity-bar buttons carry the state: the active view's button
 * is `aria-pressed` and reads "Hide …".
 *
 * Out of scope (manual): Monaco's own Go to Symbol on `Ctrl/Cmd+Shift+O`
 * inside the editor. Whether it opens is Monaco's behaviour, not the app's.
 */

const SHOP_KRS = `system Shop {
  service Storefront
  service Payment

  Storefront -> Payment "pays"
}
`;

test.describe("AT-1422 sidebar view shortcuts", () => {
  test("Ctrl/Cmd+Shift+O and Ctrl/Cmd+Shift+E switch between Outline and Files", async ({
    page,
    opfs,
  }) => {
    await bootProjectApp(page, opfs, SHOP_KRS);
    await expect(page.getByRole("button", { name: "Hide files" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await blurToPreview(page);

    await pressChord(page, "Shift+O");
    await expect(page.getByRole("button", { name: "Hide outline" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Show files" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await pressChord(page, "Shift+E");
    await expect(page.getByRole("button", { name: "Hide files" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Show outline" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("Ctrl/Cmd+Shift+O reopens a collapsed sidebar on the Outline view", async ({
    page,
    opfs,
  }) => {
    await bootProjectApp(page, opfs, SHOP_KRS);
    await blurToPreview(page);
    await pressChord(page, "b");
    await expect(page.locator(".sidebar-area")).toHaveCount(0);

    await pressChord(page, "Shift+O");
    await expect(page.locator(".sidebar-area")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hide outline" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  // #3207: Monaco's EditContext focus target is not contenteditable, so the
  // dispatcher does not see a text input and `mod+shift+o` fires. Remove the
  // fixme with the fix.
  test.fixme("Ctrl/Cmd+Shift+O is ignored while the editor has focus", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, SHOP_KRS);
    await focusEditor(page);

    await pressChord(page, "Shift+O");
    // Barrier: `mod+shift+2` fires inside the editor too ("allow"); once Chat
    // is selected, the `mod+shift+o` keydown before it has been handled.
    await pressChord(page, "Shift+2");
    await expect(selectedTab(page, "Chat")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hide files" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
