import { expect, test } from "../fixtures/anthropic.js";
import { focusEditor, pressChord } from "../fixtures/keyboard.js";
import { selectedTab } from "../fixtures/tabs.js";

/**
 * AT-1462: `Ctrl/Cmd+Shift+1` / `Ctrl/Cmd+Shift+2` switch the edit pane
 * between Editor and Chat through a real keydown. Both commands are
 * `whenTextInputFocused: "allow"`, so they fire while the user is typing in
 * the editor or in the chat input; that is the half the unit tests can only
 * approximate with a jsdom `<input>`.
 *
 * An API key is seeded so the Chat tab shows its message input (without one it
 * shows the key setup notice, which has no text field). No message is sent,
 * so the Anthropic mock is never called.
 */

const SHOP_KRS = `system Shop {
  service Storefront
}
`;

test.describe("AT-1462 edit tab shortcuts", () => {
  test.beforeEach(async ({ page, opfs, anthropic }) => {
    await opfs.seed({
      projects: [{ id: "demo", name: "Demo", files: { "index.krs": SHOP_KRS } }],
      lastProjectId: "demo",
    });
    await anthropic.seedApiKey("sk-ant-test-fake");
    await opfs.gotoApp();
    await expect(page.locator(".preview-container svg [data-node-id]").first()).toBeVisible();
  });

  test("Ctrl/Cmd+Shift+2 and Ctrl/Cmd+Shift+1 switch tabs while typing", async ({ page }) => {
    await focusEditor(page);
    await pressChord(page, "Shift+2");
    await expect(selectedTab(page, "Chat")).toBeVisible();

    const chatInput = page.getByRole("textbox", { name: /Chat message input/i });
    await chatInput.focus();
    await expect(chatInput).toBeFocused();
    await pressChord(page, "Shift+1");
    await expect(selectedTab(page, "Editor")).toBeVisible();
    await expect(page.locator(".monaco-editor")).toBeVisible();

    // The active tab's own shortcut is a no-op.
    await pressChord(page, "Shift+1");
    await expect(selectedTab(page, "Editor")).toBeVisible();
  });

  test("the palette's Show Chat and Show Editor switch tabs", async ({ page }) => {
    await pressChord(page, "Shift+P");
    await page.getByRole("combobox", { name: "Search commands" }).fill("Show Chat");
    await page.keyboard.press("Enter");
    await expect(selectedTab(page, "Chat")).toBeVisible();

    await pressChord(page, "Shift+P");
    await page.getByRole("combobox", { name: "Search commands" }).fill("Show Editor");
    await page.keyboard.press("Enter");
    await expect(selectedTab(page, "Editor")).toBeVisible();
  });

  test("clicking the edit tabs still switches them", async ({ page }) => {
    await page.getByRole("tab", { name: "Chat" }).click();
    await expect(selectedTab(page, "Chat")).toBeVisible();
    await page.getByRole("tab", { name: "Editor" }).click();
    await expect(selectedTab(page, "Editor")).toBeVisible();
  });
});
