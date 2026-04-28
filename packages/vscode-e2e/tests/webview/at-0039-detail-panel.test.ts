import * as assert from "node:assert";
import {
  By,
  EditorView,
  InputBox,
  TextEditor,
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
 * File-open under xvfb is unreliable through ExTester's `code -r <folder>`
 * path (Phase 2a screenshot evidence: VS Code launched without a
 * workspace, Quick Open found nothing). This Phase 2b PoC sidesteps the
 * problem by creating an untitled buffer in the running VS Code, typing
 * the .krs content, and switching its language mode to `krs`. That
 * activates the extension via `onLanguage:krs` without depending on a
 * workspace folder being opened correctly.
 *
 * Implementation note: `new WebView()` defaults to the active editor.
 * The preview opens via `ViewColumn.Beside` (group 1), so we
 * `EditorView.openEditor("karasu Preview", 1)` first to bring the
 * WebView active before constructing it.
 */

const KRS_SOURCE = `system Demo {
  service OrderService {
    description "Handles order processing and payment."
  }
  user Customer [human] {
    description "A customer who purchases products."
    role "Buyer"
  }
  Customer -> OrderService "places an order"
}
`;

const PREVIEW_TITLE = "karasu Preview";
const ELEMENT_TIMEOUT_MS = 15_000;

describe("AT-0039 (WebView) — clicking a leaf node opens the detail panel", function () {
  this.timeout(240_000);

  it("opens the preview, focuses the WebView, and clicks Customer to surface the detail panel", async () => {
    const driver = VSBrowser.instance.driver;
    const editorView = new EditorView();
    const workbench = new Workbench();

    // 1. New untitled file — sidesteps ExTester's flaky folder-open path
    //    under xvfb.
    await workbench.executeCommand("File: New Untitled Text File");
    await driver.wait(
      async () => (await editorView.getOpenEditorTitles()).length > 0,
      ELEMENT_TIMEOUT_MS,
      "untitled editor never appeared",
    );

    // 2. Paste the .krs source into it.
    const editor = (await editorView.openEditor(
      (
        await editorView.getOpenEditorTitles()
      )[0],
    )) as TextEditor;
    await editor.setText(KRS_SOURCE);

    // 3. Change Language Mode to krs so onLanguage:krs activates the
    //    karasu extension and registers `karasu.openPreview`.
    await workbench.executeCommand("Change Language Mode");
    const langInput = await InputBox.create();
    await langInput.setText("krs");
    await langInput.confirm();
    await driver.sleep(1500);

    // 4. Trigger the preview command. Opens a WebView in the beside column
    //    (editor group 1).
    await workbench.executeCommand("karasu: Open Preview");
    await driver.wait(
      async () => (await editorView.getEditorGroups()).length >= 2,
      ELEMENT_TIMEOUT_MS,
      "preview WebView did not open in a second editor group",
    );

    // 5. Bring the WebView active so `new WebView()` resolves to it.
    await editorView.openEditor(PREVIEW_TITLE, 1);
    await driver.sleep(500);

    const webview = new WebView();
    await webview.switchToFrame();

    try {
      // 6. Wait for the SVG renderer to mount Customer (a leaf node).
      const customer = await driver.wait(
        until.elementLocated(By.css('[data-node-id="Customer"]')),
        ELEMENT_TIMEOUT_MS,
      );
      await customer.click();

      // 7. Detail panel toggles its `visible` class when populated.
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
