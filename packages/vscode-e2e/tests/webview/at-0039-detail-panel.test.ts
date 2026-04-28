import * as assert from "node:assert";
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

const PREVIEW_TITLE = "karasu Preview";
const ELEMENT_TIMEOUT_MS = 15_000;

describe("AT-0039 (WebView) — clicking a leaf node opens the detail panel", function () {
  this.timeout(240_000);

  it("opens the preview, focuses the WebView, and clicks Customer to surface the detail panel", async () => {
    const driver = VSBrowser.instance.driver;
    const editorView = new EditorView();

    // Wait for the .krs file to surface as a tab (VSBrowser.openResources in
    // the before-hook starts the open async; first boot is slow).
    await driver.wait(
      async () => {
        const titles = await editorView.getOpenEditorTitles();
        return titles.some((t) => t.includes("at-0039.krs"));
      },
      ELEMENT_TIMEOUT_MS,
      "fixture .krs file did not appear as an open editor",
    );

    const titles = await editorView.getOpenEditorTitles();
    const krsTitle = titles.find((t) => t.includes("at-0039.krs")) as string;

    // Focus the krs editor — `karasu.openPreview` reads
    // `vscode.window.activeTextEditor` and silently bails if the active
    // editor is not a krs document.
    await editorView.openEditor(krsTitle, 0);
    await driver.sleep(500);

    // Trigger karasu's Open Preview command. It opens a WebView in the
    // beside column (editor group 1).
    await new Workbench().executeCommand("karasu: Open Preview");

    // Wait for the second editor group to appear before constructing the
    // WebView. A static sleep was unreliable on CI's first-boot path.
    await driver.wait(
      async () => (await editorView.getEditorGroups()).length >= 2,
      ELEMENT_TIMEOUT_MS,
      `preview WebView did not open in a second editor group; open editors: ${titles.join(", ")}`,
    );

    // Bring the WebView active so `new WebView()` resolves to it.
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
