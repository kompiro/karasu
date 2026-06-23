import {
  EditorView,
  InputBox,
  Key,
  type WebDriver,
  WebView,
  Workbench,
} from "vscode-extension-tester";

/**
 * Shared ExTester WebView harness for the karasu preview suites.
 *
 * Three pieces of logic used to be copy-pasted across every WebView spec
 * (`at-0038-cmd-click-hint.test.ts`, `at-0039-detail-panel.test.ts`, and the
 * `screenshots.capture.ts` capture spec):
 *
 *   1. the 3-attempt "File: Open File..." retry (the simple-dialog stalls
 *      intermittently under xvfb — see `.claude/rules/vscode-webview-tests.md`
 *      rule 2 and memory `feedback_webview_simple_dialog_flake.md`),
 *   2. opening the preview and switching into its WebView iframe, and
 *   3. the `switchBack → sleep → switchToFrame` frame-reacquire dance that the
 *      extension forces whenever it reassigns `webview.html` (drill-down, view
 *      switch, cross-diagram navigation).
 *
 * Centralising the retry/timeout/frame constants here keeps the three suites in
 * lock-step. The rule still mandates the *pattern*, not literal duplication; the
 * helpers below are that pattern in one place.
 */

/** Editor-tab title of the karasu preview WebView. */
const PREVIEW_TITLE = "karasu Preview";

/** Default `driver.wait` budget for DOM/state assertions. */
export const ELEMENT_TIMEOUT_MS = 15_000;

/**
 * Settle time after a frame-rebuilding action (drill, view switch, nav) before
 * re-entering the iframe. View switches use this value; the AT-0038 drill flow
 * passes a longer value explicitly.
 */
const FRAME_REACQUIRE_SLEEP_MS = 800;

// Internal timing constants. Kept here so every suite shares the same values.
const ENTER_FRAME_SLEEP_MS = 300;
const OPEN_PREVIEW_SETTLE_MS = 500;
const OPEN_FIXTURE_ATTEMPTS = 3;
const OPEN_FIXTURE_ATTEMPT_TIMEOUT_MS = 7_000;
const OPEN_FIXTURE_DISMISS_SLEEP_MS = 500;

/** The three preview faces the toolbar can switch between. */
export type PreviewView = "system" | "deploy" | "org";

/**
 * Mutable WebView frame state shared between the spec and the harness. The
 * harness flips `inWebViewFrame` as it enters/leaves the iframe so callers can
 * keep their own logic (cursor reads, screenshots) in sync.
 */
export interface FrameContext {
  driver: WebDriver;
  webview: WebView;
  inWebViewFrame: boolean;
}

/**
 * Open `fixturePath` via the "File: Open File..." command with a 3-attempt
 * retry. The simple-dialog occasionally stalls on confirm() under xvfb — the
 * dialog stays open with the typed path but the editor never appears — so we
 * dismiss any lingering dialog with ESC between attempts. Throws after the last
 * attempt fails.
 */
export async function openFixtureWithRetry(
  driver: WebDriver,
  workbench: Workbench,
  editorView: EditorView,
  fixturePath: string,
  fixtureName: string,
): Promise<void> {
  let opened = false;
  let lastErr: unknown;
  for (let attempt = 0; attempt < OPEN_FIXTURE_ATTEMPTS && !opened; attempt++) {
    try {
      if (attempt > 0) {
        try {
          await driver.actions().sendKeys(Key.ESCAPE).perform();
          await driver.actions().sendKeys(Key.ESCAPE).perform();
        } catch {
          // best-effort dismissal
        }
        await driver.sleep(OPEN_FIXTURE_DISMISS_SLEEP_MS);
      }
      await workbench.executeCommand("File: Open File...");
      const openInput = await InputBox.create();
      await openInput.setText(fixturePath);
      await openInput.confirm();
      await driver.wait(
        async () => {
          const titles = await editorView.getOpenEditorTitles();
          return titles.some((t) => t.includes(fixtureName));
        },
        OPEN_FIXTURE_ATTEMPT_TIMEOUT_MS,
        "fixture .krs file did not appear as an open editor",
      );
      opened = true;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!opened) {
    throw new Error(
      `failed to open ${fixtureName} after ${OPEN_FIXTURE_ATTEMPTS} attempts; last error: ${
        (lastErr as Error)?.message ?? lastErr
      }`,
      { cause: lastErr },
    );
  }
}

/**
 * Run "karasu: Open Preview", wait for the preview to land in a second editor
 * group, switch into its WebView iframe, and return the resulting
 * {@link FrameContext} (already inside the frame).
 */
export async function openPreviewAndEnterFrame(
  driver: WebDriver,
  workbench: Workbench,
  editorView: EditorView,
): Promise<FrameContext> {
  await workbench.executeCommand("karasu: Open Preview");
  await driver.wait(
    async () => (await editorView.getEditorGroups()).length >= 2,
    ELEMENT_TIMEOUT_MS,
    "preview WebView did not open in a second editor group",
  );

  await editorView.openEditor(PREVIEW_TITLE, 1);
  await driver.sleep(OPEN_PREVIEW_SETTLE_MS);

  const webview = new WebView();
  await webview.switchToFrame();
  return { driver, webview, inWebViewFrame: true };
}

/**
 * Re-enter the WebView iframe if the driver is currently outside it (e.g. after
 * focusing the .krs editor). No-op when already inside the frame.
 */
export async function ensureWebViewFrame(ctx: FrameContext): Promise<void> {
  if (!ctx.inWebViewFrame) {
    await new EditorView().openEditor(PREVIEW_TITLE, 1);
    await ctx.driver.sleep(ENTER_FRAME_SLEEP_MS);
    await ctx.webview.switchToFrame();
    ctx.inWebViewFrame = true;
  }
}

/**
 * Leave the WebView iframe if currently inside it. Best-effort: a failing
 * `switchBack` (frame already detached) is swallowed.
 */
export async function leaveWebViewFrame(ctx: FrameContext): Promise<void> {
  if (ctx.inWebViewFrame) {
    try {
      await ctx.webview.switchBack();
    } catch {
      // already detached
    }
    ctx.inWebViewFrame = false;
  }
}

/**
 * The frame-reacquire dance after an action that rebuilds `webview.html`
 * (drill-down, view switch, cross-diagram nav): `switchBack` → `sleep` →
 * `switchToFrame`. Leaves the driver inside the freshly rebuilt iframe.
 */
export async function reacquireFrame(
  ctx: FrameContext,
  sleepMs: number = FRAME_REACQUIRE_SLEEP_MS,
): Promise<void> {
  await ctx.webview.switchBack();
  ctx.inWebViewFrame = false;
  await ctx.driver.sleep(sleepMs);
  await ctx.webview.switchToFrame();
  ctx.inWebViewFrame = true;
}

/** True when the toolbar button for `view` carries the active (background) style. */
export async function isViewActive(driver: WebDriver, view: PreviewView): Promise<boolean> {
  return (await driver.executeScript(
    `const btn = document.querySelector('[data-view="${view}"]');` +
      "const style = btn ? (btn.getAttribute('style') || '') : '';" +
      "return style.includes('background');",
  )) as boolean;
}

/**
 * Click a toolbar view button and wait for the WebView to rebuild. The
 * switchView postMessage causes the extension to reassign `webview.html`,
 * invalidating the current frame context (same recovery as the drill flow).
 * No-op when `view` is already active.
 */
export async function switchToView(ctx: FrameContext, view: PreviewView): Promise<void> {
  await ensureWebViewFrame(ctx);
  if (await isViewActive(ctx.driver, view)) return;
  await ctx.driver.executeScript(
    `const btn = document.querySelector('[data-view="${view}"]');` +
      "if (!btn) throw new Error('toolbar view button not found: ' + " +
      JSON.stringify(view) +
      ");" +
      "btn.click();",
  );
  await reacquireFrame(ctx);
  await ctx.driver.wait(
    async () => await isViewActive(ctx.driver, view),
    ELEMENT_TIMEOUT_MS,
    `${view} view did not become active after toolbar click`,
  );
}
