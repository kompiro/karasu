import { expect, test } from "../fixtures/opfs.js";
import { bootProjectApp } from "../fixtures/boot.js";
import { blurToPreview, focusEditor, pressChord } from "../fixtures/keyboard.js";
import { selectedTab } from "../fixtures/tabs.js";

/**
 * AT-1423: diagram view shortcuts `Ctrl/Cmd+1..4` through a real keydown on
 * the document, which the unit tests (`DiagramViewShortcuts.test.tsx`) cannot
 * reach: they render the component alone, without Monaco holding focus.
 *
 * Out of scope (manual): macOS `Cmd+1..4` not switching browser tabs. The
 * browser's own tab switch is outside the page, so Playwright cannot observe it.
 */

const SHOP_KRS = `system Shop {
  service Storefront
  service Payment

  Storefront -> Payment "pays"
}

deploy Prod {
  oci storefrontApp {
    realizes Storefront
  }
}
`;

const NO_DEPLOY_KRS = `system Shop {
  service Storefront
}
`;

test.describe("AT-1423 diagram view shortcuts", () => {
  test("Ctrl/Cmd+1..4 select System, Deploy, Org and CRUD from the preview", async ({
    page,
    opfs,
  }) => {
    await bootProjectApp(page, opfs, SHOP_KRS);
    await expect(selectedTab(page, "System")).toBeVisible();
    await blurToPreview(page);

    await pressChord(page, "2");
    await expect(selectedTab(page, "Deploy")).toBeVisible();
    await pressChord(page, "3");
    await expect(selectedTab(page, "Org")).toBeVisible();
    await pressChord(page, "4");
    await expect(selectedTab(page, "CRUD")).toBeVisible();
    await pressChord(page, "1");
    await expect(selectedTab(page, "System")).toBeVisible();
  });

  // #3207: Monaco's EditContext focus target is not contenteditable, so the
  // dispatcher does not see a text input and `mod+1` fires. Remove the fixme
  // with the fix.
  test.fixme("Ctrl/Cmd+1 is ignored while the editor has focus", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, SHOP_KRS);
    await blurToPreview(page);
    await pressChord(page, "2");
    await expect(selectedTab(page, "Deploy")).toBeVisible();

    await focusEditor(page);
    await pressChord(page, "1");
    // Barrier: `mod+shift+2` fires inside the editor too ("allow"). Once Chat
    // is selected, the `mod+1` keydown before it has been handled, so the
    // Deploy assertion below is not racing it.
    await pressChord(page, "Shift+2");
    await expect(selectedTab(page, "Chat")).toBeVisible();
    await expect(selectedTab(page, "Deploy")).toBeVisible();
  });

  test("Ctrl/Cmd+2 on a model without a deploy block shows the empty Deploy view", async ({
    page,
    opfs,
  }) => {
    await bootProjectApp(page, opfs, NO_DEPLOY_KRS);
    await blurToPreview(page);

    await pressChord(page, "2");
    await expect(selectedTab(page, "Deploy")).toBeVisible();
    await expect(page.getByText("Add a deploy block to your .krs file")).toBeVisible();
  });
});
