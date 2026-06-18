import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  By,
  EditorView,
  InputBox,
  Key,
  VSBrowser,
  type WebDriver,
  WebView,
  Workbench,
  until,
} from "vscode-extension-tester";

/**
 * Marketplace screenshot capture (Issue #1671).
 *
 * This is NOT a regression test — it is an on-demand generator that drives
 * the real extension under xvfb via WebDriver and saves full-window PNGs of
 * the karasu preview in each of its three faces (System / Deploy / Org). The
 * System shot doubles as the editor ↔ preview workflow image.
 *
 * It lives outside the `*.test.ts` glob so the gated `test:webview` suite does
 * not pick it up (see `.claude/rules/vscode-webview-tests.md` rule 2: every new
 * spec in the gated suite raises the simple-dialog flake risk). It is run
 * explicitly via `capture-screenshots.mjs`, which points its own glob at
 * `out/capture/*.capture.js` and supplies the fixture + output dir via env.
 *
 * Reuses the established harness patterns from `at-0039-detail-panel.test.ts`:
 * dispatch-event clicks, `[data-view]` toolbar buttons, frame re-acquire after
 * a view switch, and the 3-attempt `File: Open File...` retry.
 */

const PREVIEW_TITLE = "karasu Preview";
const FIXTURE_NAME = "karasu-showcase.krs";
const ELEMENT_TIMEOUT_MS = 15_000;

type Face = "system" | "deploy" | "org";

const SHOTS: ReadonlyArray<{ view: Face; file: string }> = [
  // The System shot shows the .krs editor beside the logical view — it is the
  // editor ↔ preview workflow image referenced by the README.
  { view: "system", file: "01-system-view.png" },
  { view: "deploy", file: "02-deploy-view.png" },
  { view: "org", file: "03-org-view.png" },
];

describe("karasu Marketplace screenshots (capture)", function () {
  this.timeout(240_000);

  let driver: WebDriver;
  let webview: WebView;
  let inWebViewFrame = false;
  let outDir: string;

  async function enterFrame(): Promise<void> {
    if (!inWebViewFrame) {
      await new EditorView().openEditor(PREVIEW_TITLE, 1);
      await driver.sleep(300);
      await webview.switchToFrame();
      inWebViewFrame = true;
    }
  }

  async function leaveFrame(): Promise<void> {
    if (inWebViewFrame) {
      await webview.switchBack();
      inWebViewFrame = false;
    }
  }

  async function isViewActive(view: Face): Promise<boolean> {
    return (await driver.executeScript(
      `const btn = document.querySelector('[data-view="${view}"]');` +
        "const style = btn ? (btn.getAttribute('style') || '') : '';" +
        "return style.includes('background');",
    )) as boolean;
  }

  // Click a toolbar view button and wait for the WebView to rebuild. The
  // switchView postMessage causes the extension to reassign `webview.html`,
  // invalidating the current frame context (same recovery as the drill flow).
  async function switchToView(view: Face): Promise<void> {
    await enterFrame();
    if (await isViewActive(view)) return;
    await driver.executeScript(
      `const btn = document.querySelector('[data-view="${view}"]');` +
        "if (!btn) throw new Error('toolbar view button not found: ' + " +
        JSON.stringify(view) +
        ");" +
        "btn.click();",
    );
    await webview.switchBack();
    inWebViewFrame = false;
    await driver.sleep(800);
    await webview.switchToFrame();
    inWebViewFrame = true;
    await driver.wait(
      async () => await isViewActive(view),
      ELEMENT_TIMEOUT_MS,
      `${view} view did not become active after toolbar click`,
    );
  }

  before(async () => {
    const fixturePath = process.env.KARASU_E2E_CAPTURE_FIXTURE_KRS;
    if (!fixturePath) {
      throw new Error(
        "KARASU_E2E_CAPTURE_FIXTURE_KRS env var was not set by capture-screenshots.mjs",
      );
    }
    outDir = process.env.KARASU_E2E_CAPTURE_OUT_DIR ?? "";
    if (!outDir) {
      throw new Error("KARASU_E2E_CAPTURE_OUT_DIR env var was not set by capture-screenshots.mjs");
    }
    fs.mkdirSync(outDir, { recursive: true });

    driver = VSBrowser.instance.driver;
    const editorView = new EditorView();
    const workbench = new Workbench();

    // Open the fixture via "File: Open File..." with a 3-attempt retry — the
    // simple-dialog stalls intermittently under xvfb.
    let opened = false;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3 && !opened; attempt++) {
      try {
        if (attempt > 0) {
          try {
            await driver.actions().sendKeys(Key.ESCAPE).perform();
            await driver.actions().sendKeys(Key.ESCAPE).perform();
          } catch {
            // best-effort dismissal
          }
          await driver.sleep(500);
        }
        await workbench.executeCommand("File: Open File...");
        const openInput = await InputBox.create();
        await openInput.setText(fixturePath);
        await openInput.confirm();
        await driver.wait(
          async () => {
            const titles = await editorView.getOpenEditorTitles();
            return titles.some((t) => t.includes(FIXTURE_NAME));
          },
          7_000,
          "fixture .krs file did not appear as an open editor",
        );
        opened = true;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!opened) {
      throw new Error(
        `failed to open ${FIXTURE_NAME} after 3 attempts; last error: ${(lastErr as Error)?.message ?? lastErr}`,
        { cause: lastErr },
      );
    }

    await workbench.executeCommand("karasu: Open Preview");
    await driver.wait(
      async () => (await editorView.getEditorGroups()).length >= 2,
      ELEMENT_TIMEOUT_MS,
      "preview WebView did not open in a second editor group",
    );

    await editorView.openEditor(PREVIEW_TITLE, 1);
    await driver.sleep(500);

    webview = new WebView();
    await webview.switchToFrame();
    inWebViewFrame = true;

    // Wait for the preview to render before capturing anything.
    await driver.wait(until.elementLocated(By.css("[data-node-id]")), ELEMENT_TIMEOUT_MS);
  });

  after(async () => {
    await leaveFrame();
    try {
      await new EditorView().closeAllEditors();
    } catch {
      // best-effort
    }
  });

  for (const { view, file } of SHOTS) {
    it(`captures the ${view} view → ${file}`, async () => {
      await switchToView(view);
      // takeScreenshot captures the whole VS Code window regardless of frame
      // context; leave the frame so a stray focus ring inside the iframe does
      // not show, and give the layout a beat to settle.
      await leaveFrame();
      await driver.sleep(600);
      const base64 = await driver.takeScreenshot();
      const target = path.join(outDir, file);
      fs.writeFileSync(target, Buffer.from(base64, "base64"));
      assert.ok(fs.statSync(target).size > 0, `captured screenshot ${file} is empty`);
    });
  }
});
