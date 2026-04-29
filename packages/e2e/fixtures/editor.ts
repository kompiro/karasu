import { type Page, expect } from "@playwright/test";

/**
 * Mirrors `DEBOUNCE_MS` in `packages/app/src/hooks/useSystemView.ts`. We give a
 * little extra so the React commit + auto-switch effects (`useAutoSwitchToOrg`,
 * `useAutoSwitchToDeploy`) have a chance to settle before the caller starts
 * asserting on the active tab. Without this, tests that click a tab right
 * after editing race with the auto-switch and the active tab can flip after
 * a manual `selected: true` assertion has already passed.
 */
const COMPILE_SETTLE_MS = 400;

/**
 * Replace Monaco editor content deterministically.
 *
 * The previous click-on-`.view-lines` + `Ctrl+A` / `Delete` / `insertText`
 * pattern raced with Monaco taking focus and silently no-op'd in roughly 1
 * out of 5 local runs (and was the dominant flake source across AT-0007,
 * AT-0011, AT-0044, AT-0046, AT-0049, AT-0053, AT-0054, AT-0057 in CI).
 *
 * Implementation notes:
 *   - Monaco's current build uses the EditContext API: the focusable element
 *     is a contenteditable `<div class="native-edit-context" role="textbox">`
 *     rather than the legacy `<textarea class="inputarea">`. Selecting by
 *     accessibility role-and-name is robust against future class changes.
 *   - `keyboard.insertText` of multi-line content is delivered as separate
 *     Enter keystrokes via the EditContext path, which triggers Monaco's
 *     auto-indent on every newline and compounds indentation. Paste through
 *     the clipboard (`Ctrl+V`) goes through Monaco's paste handler, which
 *     honors the literal content without re-indenting.
 *
 * Hardening steps:
 *   1. Wait until the Monaco wrapper is mounted.
 *   2. Focus the EditContext textbox and assert focus before sending keys.
 *   3. Select-all + Delete to clear any preexisting model content.
 *   4. Write the new content to the clipboard, then dispatch Ctrl+V.
 *   5. Wait until the rendered view-lines actually contain the new first
 *      non-empty line — catches focus loss between steps 4 and the caller's
 *      next assertion here, not 30 s later.
 *   6. Wait for the compile debounce + auto-switch effects to settle.
 *
 * The browser context must have `clipboard-read` / `clipboard-write`
 * permissions granted. Set this once in your spec via:
 *
 *   test.use({ permissions: ["clipboard-read", "clipboard-write"] });
 */
export async function replaceEditorContent(page: Page, content: string): Promise<void> {
  await expect(page.locator(".monaco-editor")).toBeVisible();

  const editorTextbox = page.getByRole("textbox", { name: "Editor content" });
  await editorTextbox.focus();
  await expect(editorTextbox).toBeFocused();

  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");

  await page.evaluate((text: string) => navigator.clipboard.writeText(text), content);
  await page.keyboard.press("Control+V");

  // Monaco virtually renders only the visible lines into `.view-lines`. After
  // pasting a long buffer, the cursor (and viewport) sit at the end so the
  // top of the file is not in the DOM — verifying the first line of the
  // pasted content would fail not because the paste failed but because the
  // line is off-screen. `Ctrl+Home` scrolls back to the top.
  await page.keyboard.press("Control+Home");

  const firstLine = content.split("\n").find((line) => line.trim().length > 0);
  if (firstLine) {
    const probe = firstLine.trim().slice(0, 24);
    await expect(page.locator(".monaco-editor .view-lines").first()).toContainText(probe);
  }

  await page.waitForTimeout(COMPILE_SETTLE_MS);
}
