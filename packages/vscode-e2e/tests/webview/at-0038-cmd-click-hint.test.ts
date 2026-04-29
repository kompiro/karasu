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
 * AT-0038 TC-01 / TC-02 (WebView E2E — Phase 3, AT-0038 hint visibility).
 *
 * The karasu preview toolbar renders a `#jump-hint` element with the text
 * "ⓘ for details · Cmd/Ctrl+Click to jump". The two TCs covered here are
 * pure DOM checks:
 *
 *   TC-01: hint visible on first render (root view).
 *   TC-02: hint still visible after drilling into a parent node.
 *
 * Drilling rebuilds the WebView HTML, so TC-02 re-locates the element
 * after the breadcrumb advances rather than assuming the original
 * reference is still attached.
 *
 * The remaining AT-0038 TCs (TC-03..TC-05, modifier-click → editor jump)
 * also need to assert that the active TextEditor's cursor moved; that is
 * deferred to a follow-up PR (see #1014).
 */

const PREVIEW_TITLE = "karasu Preview";
const ELEMENT_TIMEOUT_MS = 15_000;
const HINT_TEXT = "Cmd/Ctrl+Click to jump";

describe("AT-0038 (WebView) — Cmd/Ctrl+Click hint text visibility", function () {
  this.timeout(240_000);

  let webview: WebView;

  before(async () => {
    const fixturePath = process.env.KARASU_E2E_FIXTURE_KRS_AT0038;
    if (!fixturePath) {
      throw new Error("KARASU_E2E_FIXTURE_KRS_AT0038 env var was not set by run-webview-tests.mjs");
    }

    const driver = VSBrowser.instance.driver;
    const editorView = new EditorView();
    const workbench = new Workbench();

    await workbench.executeCommand("File: Open File...");
    const openInput = await InputBox.create();
    await openInput.setText(fixturePath);
    await openInput.confirm();

    await driver.wait(
      async () => {
        const titles = await editorView.getOpenEditorTitles();
        return titles.some((t) => t.includes("at-0038.krs"));
      },
      ELEMENT_TIMEOUT_MS,
      "fixture .krs file did not appear as an open editor",
    );

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
  });

  after(async () => {
    if (webview) {
      try {
        await webview.switchBack();
      } catch {
        // already detached
      }
    }
    await new EditorView().closeAllEditors();
  });

  it("TC-01: shows the hint text in the toolbar on the root view", async () => {
    const driver = VSBrowser.instance.driver;
    const hint = await driver.wait(until.elementLocated(By.css("#jump-hint")), ELEMENT_TIMEOUT_MS);
    const displayed = await hint.isDisplayed();
    assert.strictEqual(displayed, true, "#jump-hint should be visible at root view");

    const text = await hint.getText();
    assert.ok(text.includes(HINT_TEXT), `#jump-hint should contain "${HINT_TEXT}"; saw: ${text}`);
  });

  it("TC-02: keeps the hint visible after drilling into a parent node", async () => {
    const driver = VSBrowser.instance.driver;

    const orderService = await driver.wait(
      until.elementLocated(By.css('[data-node-id="OrderService"][data-has-children="true"]')),
      ELEMENT_TIMEOUT_MS,
    );
    await orderService.click();

    // Wait for the breadcrumb to update past Root — confirms the drill
    // happened and the WebView HTML has been rebuilt.
    await driver.wait(
      async () => {
        const crumbs = await driver.findElements(By.css("#breadcrumb button"));
        const labels = await Promise.all(crumbs.map((c) => c.getText()));
        return labels.some((l) => l.includes("OrderService"));
      },
      ELEMENT_TIMEOUT_MS,
      "breadcrumb did not advance to OrderService after click",
    );

    const hint = await driver.wait(until.elementLocated(By.css("#jump-hint")), ELEMENT_TIMEOUT_MS);
    const displayed = await hint.isDisplayed();
    assert.strictEqual(
      displayed,
      true,
      "#jump-hint should remain visible after drilling into OrderService",
    );

    const text = await hint.getText();
    assert.ok(
      text.includes(HINT_TEXT),
      `#jump-hint should still contain "${HINT_TEXT}" after drill-down; saw: ${text}`,
    );
  });
});
