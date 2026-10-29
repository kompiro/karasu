import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { By, EditorView, type WebDriver, until } from "vscode-extension-tester";
import {
  ELEMENT_TIMEOUT_MS,
  type FrameContext,
  type PreviewView,
  SUITE_TIMEOUT_MS,
  leaveWebViewFrame,
  openFixtureAndPreview,
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
 * `File: Open File...` retry, preview-frame entry, and the view switch through
 * the viewer's tabs (the preview is the app's viewer since #3312).
 *
 * The viewer opens a diagram centred at full size, so a tall one runs past the
 * panel at both ends. Before each shot the capture zooms out until the diagram
 * fits, and moves focus off the tab it clicked, so the listing shows the whole
 * diagram and no focus ring.
 */

const FIXTURE_NAME = "karasu-showcase.krs";

/** Wheel steps tried before giving up on fitting (each is a 10% zoom-out). */
const MAX_FIT_STEPS = 15;

/**
 * Zoom the preview out with the viewer's own wheel zoom until the diagram
 * fits its container with a small margin. Must be called inside the frame.
 */
async function fitDiagram(driver: WebDriver): Promise<void> {
  for (let step = 0; step < MAX_FIT_STEPS; step++) {
    const fits = (await driver.executeScript(
      "const box = document.querySelector('.preview-container');" +
        "const svg = box && box.querySelector('svg');" +
        "if (!box || !svg) return true;" +
        "const b = box.getBoundingClientRect(), s = svg.getBoundingClientRect();" +
        "if (s.height <= b.height * 0.92 && s.width <= b.width * 0.95) return true;" +
        "box.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));" +
        "return false;",
    )) as boolean;
    if (fits) return;
    await driver.sleep(120);
  }
}

const SHOTS: ReadonlyArray<{ view: PreviewView; file: string }> = [
  // The System shot shows the .krs editor beside the logical view — it is the
  // editor ↔ preview workflow image referenced by the README.
  { view: "system", file: "01-system-view.png" },
  { view: "deploy", file: "02-deploy-view.png" },
  { view: "org", file: "03-org-view.png" },
];

describe("karasu Marketplace screenshots (capture)", function () {
  this.timeout(SUITE_TIMEOUT_MS);

  let driver: WebDriver;
  let ctx: FrameContext;
  let outDir: string;

  before(async () => {
    outDir = process.env.KARASU_E2E_CAPTURE_OUT_DIR ?? "";
    if (!outDir) {
      throw new Error("KARASU_E2E_CAPTURE_OUT_DIR env var was not set by capture-screenshots.mjs");
    }
    fs.mkdirSync(outDir, { recursive: true });

    ctx = await openFixtureAndPreview({
      envVar: "KARASU_E2E_CAPTURE_FIXTURE_KRS",
      fixtureName: FIXTURE_NAME,
      runnerName: "capture-screenshots.mjs",
    });
    driver = ctx.driver;

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
      await driver.wait(until.elementLocated(By.css(".preview-container svg")), ELEMENT_TIMEOUT_MS);
      await fitDiagram(driver);
      await driver.executeScript(
        "if (document.activeElement instanceof HTMLElement) document.activeElement.blur();",
      );
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
