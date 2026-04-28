import * as assert from "node:assert";
import * as path from "node:path";
import { By, EditorView, VSBrowser, WebView, Workbench, until } from "vscode-extension-tester";

/**
 * AT-0039 TC-01 (WebView E2E — Phase 2).
 *
 * Clicking a leaf node in the karasu preview WebView opens the detail
 * panel (`#detail-panel.visible`). This is the first AT migrated from
 * manual to automated coverage under the harness designed in
 * `docs/design/vscode-webview-e2e-harness.md`.
 *
 * The trick that broke Phase 1's first attempt: `new WebView()` defaults
 * to the active editor, which on first boot is the .krs file (column 1).
 * The preview opens via `ViewColumn.Beside` (column 2), so we must
 * `EditorView.openEditor("karasu Preview")` first to make column 2 active
 * before constructing the WebView.
 */

const FIXTURE_KRS = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "fixtures",
  "webview-workspace",
  "at-0039.krs",
);

const PREVIEW_TITLE = "karasu Preview";
const SETTLE_MS = 2000;
const ELEMENT_TIMEOUT_MS = 10_000;

describe("AT-0039 (WebView) — clicking a leaf node opens the detail panel", function () {
  this.timeout(240_000);

  before(async () => {
    await VSBrowser.instance.openResources(FIXTURE_KRS);
    await VSBrowser.instance.driver.sleep(SETTLE_MS);
  });

  it("opens the preview, focuses the WebView, and clicks Customer to surface the detail panel", async () => {
    const driver = VSBrowser.instance.driver;

    // Trigger karasu's Open Preview command. It opens a WebView in the
    // beside column.
    await new Workbench().executeCommand("karasu: Open Preview");
    await driver.sleep(SETTLE_MS);

    // The .krs file lives in editor group 0 (column 1) and the preview
    // WebView in group 1 (ViewColumn.Beside). Bring the WebView active so
    // `new WebView()` resolves to it.
    const editorView = new EditorView();
    await editorView.openEditor(PREVIEW_TITLE, 1);
    await driver.sleep(500);

    const webview = new WebView();
    await webview.switchToFrame();

    try {
      // Wait for the SVG renderer to mount the Customer leaf node.
      const customer = await driver.wait(
        until.elementLocated(By.css('[data-node-id="Customer"]')),
        ELEMENT_TIMEOUT_MS,
      );
      // Inside the SVG the clickable target is a <g> element that surrounds
      // the rect+text; clicking the group triggers preview-panel.ts's leaf
      // handler.
      await customer.click();

      // Detail panel toggles its `visible` class when populated.
      const detailPanel = await driver.wait(
        until.elementLocated(By.css("#detail-panel.visible")),
        ELEMENT_TIMEOUT_MS,
      );
      const text = await detailPanel.getText();
      assert.match(
        text,
        /Customer/,
        `detail panel should mention the clicked node label; saw: ${text}`,
      );
    } finally {
      await webview.switchBack();
    }
  });

  after(async () => {
    await new EditorView().closeAllEditors();
  });
});
