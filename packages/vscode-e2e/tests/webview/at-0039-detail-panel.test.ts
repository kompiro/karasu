import * as assert from "node:assert";
import {
  By,
  EditorView,
  InputBox,
  Key,
  TextEditor,
  VSBrowser,
  type WebDriver,
  WebView,
  Workbench,
  until,
} from "vscode-extension-tester";

/**
 * AT-0039 (WebView E2E — Phase 6 detail panel).
 *
 * Coverage:
 *   TC-01: clicking a leaf node opens the detail panel.
 *   TC-02: detail panel shows description (Markdown rendered), links,
 *          and properties (team / role).
 *   TC-03: "Jump to editor" button moves the .krs editor cursor to the
 *          node's definition (panel stays open).
 *   TC-04: × close button and click-outside both dismiss the panel.
 *   TC-06: ⓘ info button on a parent node opens the detail panel
 *          without drilling. (The "plain click on parent → drill" half
 *          of TC-06 is already covered by AT-0038 TC-02.)
 *   TC-08: tooltip is suppressed while the detail panel is open and
 *          reappears once it is closed.
 *
 * TC-05 (Cmd/Ctrl+Click → editor jump, no panel) is automated by
 * AT-0038 TC-03/TC-04. TC-09 (toolbar hint text) is automated by
 * AT-0038 TC-01.
 *
 * TC-07 (clicking a Links link opens the URL in the external browser)
 * stays manual: from inside the WebView frame we can verify that the
 * page posts an `openExternal` message to the extension, but cannot
 * observe `vscode.env.openExternal` actually being called by the host
 * without test-only seams in production code (see ADR-20260428-05's
 * "no extension-host stubs" rule).
 *
 * The "File: Open File..." simple-dialog stalls intermittently under
 * xvfb (see the retry pattern shared with AT-0038); we keep the
 * 3-attempt retry here too.
 */

const PREVIEW_TITLE = "karasu Preview";
const FIXTURE_NAME = "at-0039.krs";
const ELEMENT_TIMEOUT_MS = 15_000;

// Lines (1-indexed) match `TextEditor.getCoordinates()`. The Customer
// node identifier in the AT-0039 fixture lives on line 17.
const FIXTURE_LINE = {
  Customer: 17,
} as const;

describe("AT-0039 (WebView) — detail panel", function () {
  this.timeout(240_000);

  let driver: WebDriver;
  let webview: WebView;
  let inWebViewFrame = false;

  async function ensureWebViewFrame(): Promise<void> {
    if (!inWebViewFrame) {
      await new EditorView().openEditor(PREVIEW_TITLE, 1);
      await driver.sleep(300);
      await webview.switchToFrame();
      inWebViewFrame = true;
    }
  }

  async function dispatchClickOnSelector(
    selector: string,
    { ctrlKey = false }: { ctrlKey?: boolean } = {},
  ): Promise<void> {
    const ctrl = ctrlKey ? "true" : "false";
    await driver.executeScript(
      `const el = document.querySelector(${JSON.stringify(selector)});` +
        "if (!el) throw new Error('selector did not match: ' + " +
        JSON.stringify(selector) +
        ");" +
        `el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: ${ctrl}, metaKey: ${ctrl} }));`,
    );
  }

  async function dispatchMouseMoveOnSelector(selector: string): Promise<void> {
    await driver.executeScript(
      `const el = document.querySelector(${JSON.stringify(selector)});` +
        "if (!el) throw new Error('selector did not match: ' + " +
        JSON.stringify(selector) +
        ");" +
        "const rect = el.getBoundingClientRect();" +
        "const cx = rect.left + rect.width / 2;" +
        "const cy = rect.top + rect.height / 2;" +
        "el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));",
    );
  }

  async function detailPanelText(): Promise<string> {
    return (await driver.executeScript(
      "const el = document.getElementById('detail-panel');" +
        "return el ? (el.textContent || '') : '';",
    )) as string;
  }

  async function detailPanelHtml(): Promise<string> {
    return (await driver.executeScript(
      "const el = document.getElementById('detail-panel');" +
        "return el ? (el.innerHTML || '') : '';",
    )) as string;
  }

  async function detailPanelHasVisibleClass(): Promise<boolean> {
    return (await driver.executeScript(
      "const el = document.getElementById('detail-panel');" +
        "return !!(el && el.classList.contains('visible'));",
    )) as boolean;
  }

  async function tooltipIsVisible(): Promise<boolean> {
    return (await driver.executeScript(
      "const t = document.getElementById('karasu-tooltip');" +
        "return !!(t && t.style.display === 'block');",
    )) as boolean;
  }

  async function readBreadcrumb(): Promise<string> {
    return (await driver.executeScript(
      "const el = document.getElementById('breadcrumb');" +
        "return el ? Array.from(el.querySelectorAll('button')).map(b => b.textContent).join(' › ') : '';",
    )) as string;
  }

  async function closePanelIfOpen(): Promise<void> {
    if (await detailPanelHasVisibleClass()) {
      await driver.executeScript(
        "const btn = document.getElementById('dp-close-btn'); if (btn) btn.click();",
      );
      await driver.wait(
        async () => !(await detailPanelHasVisibleClass()),
        ELEMENT_TIMEOUT_MS,
        "detail panel did not close",
      );
    }
  }

  before(async () => {
    const fixturePath = process.env.KARASU_E2E_FIXTURE_KRS;
    if (!fixturePath) {
      throw new Error("KARASU_E2E_FIXTURE_KRS env var was not set by run-webview-tests.mjs");
    }

    driver = VSBrowser.instance.driver;
    const editorView = new EditorView();
    const workbench = new Workbench();

    // Open the fixture via "File: Open File..." with a 3-attempt retry —
    // the simple-dialog stalls intermittently under xvfb.
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
  });

  beforeEach(async () => {
    await ensureWebViewFrame();
  });

  after(async () => {
    if (inWebViewFrame) {
      try {
        await webview.switchBack();
      } catch {
        // already detached
      }
      inWebViewFrame = false;
    }
    await new EditorView().closeAllEditors();
  });

  it("TC-01: clicking a leaf node (Customer) opens the detail panel", async () => {
    await closePanelIfOpen();

    await driver.wait(
      until.elementLocated(By.css('[data-node-id="Customer"]')),
      ELEMENT_TIMEOUT_MS,
    );
    await dispatchClickOnSelector('[data-node-id="Customer"]');

    await driver.wait(
      async () => await detailPanelHasVisibleClass(),
      ELEMENT_TIMEOUT_MS,
      "detail panel did not become visible after clicking Customer",
    );

    const text = await detailPanelText();
    assert.match(text, /Customer/, `panel should contain "Customer"; saw: ${text}`);
  });

  it("TC-02: detail panel shows description / links / properties (OrderService via ⓘ)", async () => {
    await closePanelIfOpen();

    await driver.wait(
      until.elementLocated(By.css('[data-info-button="OrderService"]')),
      ELEMENT_TIMEOUT_MS,
    );
    await dispatchClickOnSelector('[data-info-button="OrderService"]');

    await driver.wait(
      async () => await detailPanelHasVisibleClass(),
      ELEMENT_TIMEOUT_MS,
      "detail panel did not become visible after clicking the ⓘ button",
    );

    const html = await detailPanelHtml();
    const text = await detailPanelText();

    assert.match(
      html,
      /<strong>order processing<\/strong>/i,
      `description should render Markdown bold for **order processing**; saw HTML: ${html.slice(0, 400)}`,
    );
    assert.match(
      html,
      /<h2>Responsibilities<\/h2>/i,
      "description should render the Markdown heading",
    );
    assert.match(html, /<li>Accept new orders<\/li>/i, "description should render the bullet list");
    assert.match(text, /Design Wiki/, "panel should mention the Design Wiki link");
    assert.match(text, /API Docs/, "panel should mention the API Docs link");
    assert.match(text, /Order Team/, "panel should mention the team property");
  });

  it("TC-04: × close button dismisses the panel; click-outside also dismisses it", async () => {
    await closePanelIfOpen();

    await dispatchClickOnSelector('[data-node-id="Customer"]');
    await driver.wait(
      async () => await detailPanelHasVisibleClass(),
      ELEMENT_TIMEOUT_MS,
      "panel did not open before testing close",
    );

    await driver.executeScript(
      "const btn = document.getElementById('dp-close-btn');" +
        "if (!btn) throw new Error('dp-close-btn not found');" +
        "btn.click();",
    );
    await driver.wait(
      async () => !(await detailPanelHasVisibleClass()),
      ELEMENT_TIMEOUT_MS,
      "panel did not close after pressing the × button",
    );
    assert.strictEqual(
      await detailPanelHasVisibleClass(),
      false,
      "panel should be hidden after clicking the × button",
    );

    await dispatchClickOnSelector('[data-node-id="Customer"]');
    await driver.wait(
      async () => await detailPanelHasVisibleClass(),
      ELEMENT_TIMEOUT_MS,
      "panel did not re-open before testing click-outside",
    );

    // A click that lands on `#preview` itself (no `[data-node-id]`
    // ancestor) is treated as "click outside any node" by the WebView
    // handler and triggers `hideDetailPanel()`.
    await driver.executeScript(
      "const preview = document.getElementById('preview');" +
        "if (!preview) throw new Error('#preview not found');" +
        "preview.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));",
    );
    await driver.wait(
      async () => !(await detailPanelHasVisibleClass()),
      ELEMENT_TIMEOUT_MS,
      "panel did not close after clicking outside any node",
    );
    assert.strictEqual(
      await detailPanelHasVisibleClass(),
      false,
      "panel should be hidden after clicking outside any node",
    );
  });

  it("TC-06: ⓘ info button on a parent does not drill the preview", async () => {
    await closePanelIfOpen();

    const beforeBreadcrumb = await readBreadcrumb();
    assert.deepStrictEqual(
      beforeBreadcrumb
        .split("›")
        .map((s) => s.trim())
        .filter(Boolean),
      ["Root"],
      `expected to start at root, but breadcrumb was "${beforeBreadcrumb}"`,
    );

    await dispatchClickOnSelector('[data-info-button="OrderService"]');

    await driver.wait(
      async () => await detailPanelHasVisibleClass(),
      ELEMENT_TIMEOUT_MS,
      "detail panel did not open after ⓘ click",
    );

    const afterBreadcrumb = await readBreadcrumb();
    assert.deepStrictEqual(
      afterBreadcrumb
        .split("›")
        .map((s) => s.trim())
        .filter(Boolean),
      ["Root"],
      `ⓘ click should not drill the preview; breadcrumb went to "${afterBreadcrumb}"`,
    );

    const text = await detailPanelText();
    assert.match(text, /OrderService/, `panel should mention OrderService; saw: ${text}`);
  });

  it("TC-08: tooltip is suppressed while the detail panel is open", async () => {
    await closePanelIfOpen();

    // With panel CLOSED, hovering OrderService (which has a
    // description) should make the tooltip visible.
    await dispatchMouseMoveOnSelector('[data-node-id="OrderService"]');
    await driver.wait(
      async () => await tooltipIsVisible(),
      ELEMENT_TIMEOUT_MS,
      "tooltip should appear when hovering a described node with the panel closed",
    );

    // Open the panel; the tooltip should not show even when we hover
    // OrderService again.
    await dispatchClickOnSelector('[data-node-id="Customer"]');
    await driver.wait(
      async () => await detailPanelHasVisibleClass(),
      ELEMENT_TIMEOUT_MS,
      "detail panel did not open before testing tooltip suppression",
    );

    await dispatchMouseMoveOnSelector('[data-node-id="OrderService"]');
    await driver.sleep(300);
    assert.strictEqual(
      await tooltipIsVisible(),
      false,
      "tooltip should be hidden while the detail panel is open",
    );
  });

  it("TC-03: Jump to editor button moves the .krs editor cursor and leaves the panel open", async () => {
    await closePanelIfOpen();

    await dispatchClickOnSelector('[data-node-id="Customer"]');
    await driver.wait(
      async () => await detailPanelHasVisibleClass(),
      ELEMENT_TIMEOUT_MS,
      "panel did not open before testing Jump to editor",
    );

    await driver.executeScript(
      "const btn = document.getElementById('dp-jump-btn');" +
        "if (!btn) throw new Error('dp-jump-btn not found');" +
        "btn.click();",
    );

    // Allow the postMessage roundtrip to settle, then assert that the
    // panel is still visible — this proves the dp-jump-btn handler
    // does not call hideDetailPanel(). We MUST do this assertion
    // before focusing the .krs editor below: focusing the editor fires
    // `onDidChangeActiveTextEditor`, which rebuilds `webview.html` and
    // wipes panel state. That rebuild is a test-only artefact (real
    // users keep looking at the preview after Jump-to-editor) so we
    // capture the panel state while we are still inside the live
    // WebView frame.
    await driver.sleep(500);
    assert.strictEqual(
      await detailPanelHasVisibleClass(),
      true,
      "panel should remain visible after Jump-to-editor (handler does not call hideDetailPanel)",
    );

    // Switch out of the WebView frame to read the editor's coordinates.
    // Bringing the .krs editor to focus rebuilds the preview, which is
    // why the visibility assertion above runs first.
    await webview.switchBack();
    inWebViewFrame = false;

    let lastLine = 0;
    await driver.wait(
      async () => {
        const editor = (await new EditorView().openEditor(FIXTURE_NAME, 0)) as TextEditor;
        await driver.sleep(150);
        const [line] = await editor.getCoordinates();
        lastLine = line;
        return line === FIXTURE_LINE.Customer;
      },
      ELEMENT_TIMEOUT_MS,
      `editor cursor did not move to Customer line (expected ${FIXTURE_LINE.Customer}); last seen line ${lastLine}`,
    );
  });
});
