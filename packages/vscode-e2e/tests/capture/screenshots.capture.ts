import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  By,
  EditorView,
  VSBrowser,
  type WebDriver,
  Workbench,
  until,
} from "vscode-extension-tester";
import {
  ELEMENT_TIMEOUT_MS,
  type FrameContext,
  type PreviewView,
  leaveWebViewFrame,
  openFixtureWithRetry,
  openPreviewAndEnterFrame,
  switchToView,
} from "../webview/harness";

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
 * Reuses the shared WebView harness (`../webview/harness`): the 3-attempt
 * `File: Open File...` retry, preview-frame entry, and the `[data-view]`
 * toolbar switch with its frame re-acquire.
 */

const FIXTURE_NAME = "karasu-showcase.krs";

const SHOTS: ReadonlyArray<{ view: PreviewView; file: string }> = [
  // The System shot shows the .krs editor beside the logical view — it is the
  // editor ↔ preview workflow image referenced by the README.
  { view: "system", file: "01-system-view.png" },
  { view: "deploy", file: "02-deploy-view.png" },
  { view: "org", file: "03-org-view.png" },
];

describe("karasu Marketplace screenshots (capture)", function () {
  this.timeout(240_000);

  let driver: WebDriver;
  let ctx: FrameContext;
  let outDir: string;

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

    await openFixtureWithRetry(driver, workbench, editorView, fixturePath, FIXTURE_NAME);
    ctx = await openPreviewAndEnterFrame(driver, workbench, editorView);

    // Wait for the preview to render before capturing anything.
    await driver.wait(until.elementLocated(By.css("[data-node-id]")), ELEMENT_TIMEOUT_MS);
  });

  after(async () => {
    await leaveWebViewFrame(ctx);
    try {
      await new EditorView().closeAllEditors();
    } catch {
      // best-effort
    }
  });

  for (const { view, file } of SHOTS) {
    it(`captures the ${view} view → ${file}`, async () => {
      await switchToView(ctx, view);
      // takeScreenshot captures the whole VS Code window regardless of frame
      // context; leave the frame so a stray focus ring inside the iframe does
      // not show, and give the layout a beat to settle.
      await leaveWebViewFrame(ctx);
      await driver.sleep(600);
      const base64 = await driver.takeScreenshot();
      const target = path.join(outDir, file);
      fs.writeFileSync(target, Buffer.from(base64, "base64"));
      assert.ok(fs.statSync(target).size > 0, `captured screenshot ${file} is empty`);
    });
  }
});
