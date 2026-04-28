import * as assert from "node:assert";
import {
  By,
  EditorView,
  InputBox,
  VSBrowser,
  WebView,
  Workbench,
  until,
} from "vscode-extension-tester";

/**
 * AT-0039 TC-01 (WebView E2E — Phase 2b).
 *
 * Clicking a leaf node in the karasu preview WebView opens the detail
 * panel (`#detail-panel.visible`).
 *
 * Two file-open paths were tried before settling on the current approach:
 *
 *   1. ExTester's `runOptions.resources` → `code -r <folder>` (Phase 2a):
 *      under xvfb VS Code launched without a workspace, so the fixture
 *      could not be reached. Screenshot evidence confirms the workspace
 *      never opened.
 *   2. Untitled buffer + Change Language Mode: VS Code accepted the krs
 *      content but `compileProject(document.uri.fsPath, ...)` cannot read
 *      from `untitled:Untitled-1`, so the preview rendered "No nodes to
 *      render".
 *
 * Phase 2b therefore writes the fixture to an absolute path in the
 * runner (`run-webview-tests.mjs`), exposes it via
 * `process.env.KARASU_E2E_FIXTURE_KRS`, and opens it through VS Code's
 * `workbench.action.files.openFile` command. With
 * `files.simpleDialog.enable: true` (set in `tests/webview/settings.json`),
 * that command opens a Quick Pick / InputBox we can type into, instead of
 * the OS-native dialog that does not work under xvfb.
 */

const PREVIEW_TITLE = "karasu Preview";
const ELEMENT_TIMEOUT_MS = 15_000;

describe("AT-0039 (WebView) — clicking a leaf node opens the detail panel", function () {
  this.timeout(240_000);

  it("opens the preview, focuses the WebView, and clicks Customer to surface the detail panel", async () => {
    const fixturePath = process.env.KARASU_E2E_FIXTURE_KRS;
    if (!fixturePath) {
      throw new Error("KARASU_E2E_FIXTURE_KRS env var was not set by run-webview-tests.mjs");
    }

    const driver = VSBrowser.instance.driver;
    const editorView = new EditorView();
    const workbench = new Workbench();

    // Open the on-disk fixture via VS Code's File: Open File command.
    // settings.json forces the simple (Quick Pick) dialog so we can type
    // the absolute path even under xvfb.
    await workbench.executeCommand("File: Open File...");
    const openInput = await InputBox.create();
    await openInput.setText(fixturePath);
    await openInput.confirm();

    await driver.wait(
      async () => {
        const titles = await editorView.getOpenEditorTitles();
        return titles.some((t) => t.includes("at-0039.krs"));
      },
      ELEMENT_TIMEOUT_MS,
      "fixture .krs file did not appear as an open editor",
    );

    // Trigger the preview command. Opens a WebView in the beside column
    // (editor group 1).
    await workbench.executeCommand("karasu: Open Preview");
    await driver.wait(
      async () => (await editorView.getEditorGroups()).length >= 2,
      ELEMENT_TIMEOUT_MS,
      "preview WebView did not open in a second editor group",
    );

    // Bring the WebView active so `new WebView()` resolves to it.
    await editorView.openEditor(PREVIEW_TITLE, 1);
    await driver.sleep(500);

    const webview = new WebView();
    await webview.switchToFrame();

    try {
      // Wait for the SVG renderer to mount Customer (a leaf node).
      const customer = await driver.wait(
        until.elementLocated(By.css('[data-node-id="Customer"]')),
        ELEMENT_TIMEOUT_MS,
      );
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
