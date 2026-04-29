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
 * "ⓘ for details · Cmd/Ctrl+Click to jump". Two TCs are covered here:
 *
 *   TC-01: hint visible on first render (root view).
 *   TC-02: hint still visible after drilling into a parent node.
 *
 * Two Selenium-vs-VS-Code-WebView pitfalls drive the implementation
 * shape:
 *
 *   1. A coordinate-based `element.click()` on the OrderService SVG
 *      group routes the click to a sibling group (the bounding box of
 *      a parent SVG `<g>` includes its children, so the center can
 *      land on an overlapping ancestor). We dispatch the event on the
 *      exact target via `executeScript` so the handler's `e.target`
 *      is the intended element.
 *   2. The drill-down handler reassigns `webview.html` from the
 *      extension host, replacing the iframe document and invalidating
 *      Selenium's current frame context. We `switchBack` and
 *      `switchToFrame` again before reading post-drill state, then
 *      read each `<button>`'s textContent (atomic, no stale-ref risk)
 *      to confirm the breadcrumb advanced past Root.
 *
 * The drill assertion only checks `segments.length > 1` — drilling
 * OrderService surfaces its full ancestor chain
 * ("Root › ECommerce › OrderService") and TC-02's purpose is just
 * "hint stays visible after *some* drill happened". Tightening to a
 * specific target would belong with the editor-jump TCs.
 *
 * The two TCs share an open WebView, so they run in a single `it()`
 * block (mirroring AT-0039). That also keeps the suite's editor /
 * WebView state fully scoped to one Mocha case, which is friendlier
 * to other suites running in the same VS Code session.
 *
 * Remaining AT-0038 TCs (TC-03..TC-05, modifier-click → editor jump)
 * need to assert the active TextEditor's cursor moved; that is
 * deferred to a follow-up PR (see #1014).
 */

const PREVIEW_TITLE = "karasu Preview";
const ELEMENT_TIMEOUT_MS = 15_000;
const HINT_TEXT = "Cmd/Ctrl+Click to jump";

describe("AT-0038 (WebView) — Cmd/Ctrl+Click hint text visibility", function () {
  this.timeout(240_000);

  it("shows the hint text on the root view and keeps it visible after drilling into a parent node", async () => {
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

    const webview = new WebView();
    await webview.switchToFrame();

    try {
      // TC-01: hint visible at root view.
      const rootHint = await driver.wait(
        until.elementLocated(By.css("#jump-hint")),
        ELEMENT_TIMEOUT_MS,
      );
      assert.strictEqual(
        await rootHint.isDisplayed(),
        true,
        "#jump-hint should be visible at root view",
      );
      const rootText = await rootHint.getText();
      assert.ok(
        rootText.includes(HINT_TEXT),
        `#jump-hint should contain "${HINT_TEXT}" at root; saw: ${rootText}`,
      );

      // Drill into OrderService (a parent). The SVG renders OrderService
      // as a container whose bounding box includes its children — a
      // coordinate-based `element.click()` lands inside that area but
      // can route the click to a sibling group (e.g. the parent system
      // ECommerce when nested groups overlap), so we dispatch the event
      // on the exact target element via the page's own DOM.
      await driver.wait(
        until.elementLocated(By.css('[data-node-id="OrderService"][data-has-children="true"]')),
        ELEMENT_TIMEOUT_MS,
      );
      await driver.executeScript(
        'const el = document.querySelector(\'[data-node-id="OrderService"][data-has-children="true"]\');' +
          "if (!el) throw new Error('OrderService node not found');" +
          "el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));",
      );

      // The drill-down handler postMessages the extension host, which
      // reassigns `webview.html`. That replaces the iframe's document,
      // invalidating Selenium's current frame context. Detach and let
      // VS Code rebuild before re-acquiring the WebView.
      await webview.switchBack();
      await driver.sleep(1000);
      await webview.switchToFrame();

      // Wait for the breadcrumb to advance past Root. Drilling fans out
      // the full ancestor chain (e.g. "Root › ECommerce › OrderService"),
      // so checking for more than one segment is enough — and is robust
      // to overflow:hidden truncation that can confuse `innerText`.
      let lastBreadcrumb = "";
      try {
        await driver.wait(
          async () => {
            lastBreadcrumb = (await driver.executeScript(
              "const el = document.getElementById('breadcrumb');" +
                "return el ? Array.from(el.querySelectorAll('button')).map(b => b.textContent).join(' › ') : '';",
            )) as string;
            const segments = lastBreadcrumb
              .split("›")
              .map((s) => s.trim())
              .filter(Boolean);
            return segments.length > 1;
          },
          ELEMENT_TIMEOUT_MS,
          "breadcrumb did not advance past Root after click",
        );
      } catch (err) {
        throw new Error(
          `breadcrumb did not advance past Root after click; last seen: "${lastBreadcrumb}". Original: ${(err as Error).message}`,
          { cause: err },
        );
      }

      // TC-02: locate #jump-hint in the rebuilt document and assert it
      // is still visible with the same text.
      const drilledHint = await driver.wait(
        until.elementLocated(By.css("#jump-hint")),
        ELEMENT_TIMEOUT_MS,
      );
      assert.strictEqual(
        await drilledHint.isDisplayed(),
        true,
        "#jump-hint should remain visible after drilling into OrderService",
      );
      const drilledText = await drilledHint.getText();
      assert.ok(
        drilledText.includes(HINT_TEXT),
        `#jump-hint should still contain "${HINT_TEXT}" after drill-down; saw: ${drilledText}`,
      );
    } finally {
      await webview.switchBack();
    }
  });

  after(async () => {
    await new EditorView().closeAllEditors();
  });
});
