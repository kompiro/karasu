import { type Page, expect } from "@playwright/test";

/**
 * Mirrors `DEBOUNCE_MS` in `packages/app/src/hooks/useSystemView.ts`. We give a
 * little extra so the React commit + auto-switch effects (`useAutoSwitchView`
 * for org/deploy) have a chance to settle before the caller starts
 * asserting on the active tab. Without this, tests that click a tab right
 * after editing race with the auto-switch and the active tab can flip after
 * a manual `selected: true` assertion has already passed.
 */
const COMPILE_SETTLE_MS = 400;

/**
 * Settle window for `expectNoWarningMatching` below. Same intent as
 * `COMPILE_SETTLE_MS` above — give the reactive compile pipeline a moment
 * before sampling the DOM — but kept at its own historical duration
 * (500ms vs. 400ms) since the four call sites it was extracted from
 * predate `COMPILE_SETTLE_MS`. Coalescing the two values (or replacing the
 * sleep with a smarter wait) is an intentionally separate, riskier
 * follow-up — see #2021 point 6.
 *
 * KNOWN LIMITATION (follow-up): this is a blind fixed sleep, so a warning
 * that only renders *after* the window (e.g. a compile that runs slow on a
 * loaded CI runner, past ~500ms) would be missed by the negative check
 * below. A deterministic replacement — waiting on a compile-done / render
 * settle signal — was investigated for this batch but the app exposes no
 * such marker today (no render-counter, `data-*` ready attribute, or
 * compile-complete event that e2e can await). Rather than invent a fragile
 * new mechanism, the pre-existing sleep is preserved as-is. A marker-based
 * wait is deferred to a follow-up that adds the signal on the app side.
 */
const WARNING_SETTLE_MS = 500;

/**
 * Assert that no warning appears — the "negative assertion" idiom used by
 * specs proving a particular `.krs` source does *not* trigger a
 * diagnostic. There is no positive signal to wait on (the absence of a
 * warning looks identical to "hasn't rendered yet"), so this settles for
 * `WARNING_SETTLE_MS` before sampling the panel. See the KNOWN LIMITATION
 * note on `WARNING_SETTLE_MS` for why the settle is a blind sleep.
 *
 * - `pattern` omitted: the warning panel, if present, must have zero
 *   `.warning-item` children (used when *any* warning would be wrong).
 * - `pattern` given: the warning panel, if present, must not contain text
 *   matching it (used when other, unrelated warnings are expected).
 */
export async function expectNoWarningMatching(page: Page, pattern?: RegExp): Promise<void> {
  await page.waitForTimeout(WARNING_SETTLE_MS);
  const panel = page.locator(".warning-panel");
  if ((await panel.count()) > 0) {
    if (pattern) {
      await expect(panel).not.toContainText(pattern);
    } else {
      await expect(panel.locator(".warning-item")).toHaveCount(0);
    }
  }
}

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
  //
  // Monaco's paste handler can momentarily steal keyboard focus from the
  // EditContext textbox; if `Ctrl+Home` is sent during that window the
  // chord never reaches the editor and the viewport stays at end-of-file
  // (#990). Re-focus the textbox and dispatch the chord through the locator
  // so it is bound to the focused element rather than the page.
  await editorTextbox.focus();
  await expect(editorTextbox).toBeFocused();
  await editorTextbox.press("Control+Home");

  const firstLine = content.split("\n").find((line) => line.trim().length > 0);
  if (firstLine) {
    const probe = firstLine.trim().slice(0, 24);
    await expect(page.locator(".monaco-editor .view-lines").first()).toContainText(probe);
  }

  await page.waitForTimeout(COMPILE_SETTLE_MS);
}
