import * as assert from "node:assert";
import {
  By,
  EditorView,
  type TextEditor,
  VSBrowser,
  type WebDriver,
  Workbench,
  until,
} from "vscode-extension-tester";
import {
  ELEMENT_TIMEOUT_MS,
  type FrameContext,
  ensureWebViewFrame,
  openFixtureWithRetry,
  openPreviewAndEnterFrame,
  reacquireFrame,
} from "./harness";

/**
 * AT-0037-9 / AT-0038 (WebView E2E — Phase 3, bidirectional editor ↔
 * SVG preview interaction).
 *
 * Coverage:
 *   AT-0037-9: editor cursor on a node identifier highlights the
 *              matching `<g data-node-id>` in the SVG preview
 *              (`class="karasu-highlighted"`).
 *   TC-01:     hint visible on first render (root view).
 *   TC-02:     hint still visible after drilling into a parent node.
 *   TC-03:     Cmd/Ctrl+Click on a parent node moves the editor cursor
 *              and does NOT drill the preview.
 *   TC-04:     Cmd/Ctrl+Click on a leaf node moves the editor cursor
 *              and does NOT change the preview view.
 *
 * AT-0037-9 is colocated here (rather than its own file) on purpose:
 * the WebView ExTester harness's "File: Open File..." simple-dialog
 * stalls on the second open in the same VS Code session, so each
 * additional test file that opens a fixture risked breaking later
 * suites. AT-0037-9 just needs the same fixture as AT-0038 plus a
 * cursor move, so sharing the suite-level `before` is the cheapest
 * way to keep the harness reliable.
 *
 * (TC-05 in the spec was "plain click on leaf → editor jump", which
 * pre-dates the Phase 6 detail-panel work. Plain-click on leaf now opens
 * the detail panel and is covered by AT-0039 TC-01; the AT-0038 doc has
 * been corrected to reflect that.)
 *
 * Three Selenium-vs-VS-Code-WebView pitfalls drive the implementation
 * shape:
 *
 *   1. A coordinate-based `element.click()` on the OrderService SVG
 *      group routes the click to a sibling group (the bounding box of
 *      a parent `<g>` includes its children, so the center can land on
 *      an overlapping ancestor). We dispatch the event on the exact
 *      target via `executeScript` so the handler's `e.target` is the
 *      intended element. Modifier-clicks pass `ctrlKey: true` directly
 *      to the synthetic MouseEvent — the WebView handler reads
 *      `e.metaKey || e.ctrlKey` from the event object, so we don't
 *      need to drive the OS keyboard via Actions (xvfb-friendly).
 *   2. The drill-down handler reassigns `webview.html` from the
 *      extension host, replacing the iframe document and invalidating
 *      Selenium's current frame context. After a drill click we
 *      `switchBack` and `switchToFrame` again before reading post-
 *      drill state (the shared `reacquireFrame` helper). The
 *      Cmd/Ctrl+Click navigate path does NOT rebuild the WebView, so
 *      it does not need this dance.
 *   3. Reading the .krs editor's cursor needs the .krs editor to be
 *      active. After clicking inside the WebView the preview panel is
 *      active, so `editorView.openEditor("at-0038.krs", 0)` returns
 *      the TextEditor and brings it into focus. We refocus the preview
 *      afterwards so the next test starts in the same WebView frame.
 *
 * The drill assertion in TC-02 only checks `segments.length > 1` —
 * drilling OrderService surfaces its full ancestor chain
 * ("Root › ECommerce › OrderService") and TC-02's purpose is just
 * "hint stays visible after *some* drill happened".
 *
 * Test order is state-driven (01 → 03 → 02 → 04) rather than spec
 * order: TC-01/03 both run at root view, TC-02 drills into OrderService,
 * TC-04 then runs in that drilled view. Each test name is independent,
 * so the CI output still reads cleanly.
 */

const FIXTURE_NAME = "at-0038.krs";
const HINT_TEXT = "Cmd/Ctrl+Click to jump";
// Re-acquiring the frame after the TC-02 drill needs a longer settle than the
// default view-switch reacquire (the drill rebuilds more of the SVG).
const DRILL_REACQUIRE_SLEEP_MS = 1000;

// Identifiers in the AT-0038 fixture (see run-webview-tests.mjs). Lines
// are 1-indexed to match what `TextEditor.getCoordinates()` returns.
const FIXTURE_LINE = {
  OrderService: 2,
  OrderManagement: 3,
} as const;

describe("AT-0037-9 / AT-0038 (WebView) — bidirectional editor ↔ SVG preview", function () {
  this.timeout(240_000);

  let driver: WebDriver;
  let ctx: FrameContext;

  async function readBreadcrumb(): Promise<string> {
    return (await driver.executeScript(
      "const el = document.getElementById('breadcrumb');" +
        "return el ? Array.from(el.querySelectorAll('button')).map(b => b.textContent).join(' › ') : '';",
    )) as string;
  }

  function breadcrumbSegments(text: string): string[] {
    return text
      .split("›")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function dispatchClick(selector: string, modifier: boolean): Promise<void> {
    const ctrl = modifier ? "true" : "false";
    await driver.executeScript(
      `const el = document.querySelector(${JSON.stringify(selector)});` +
        "if (!el) throw new Error('selector did not match: ' + " +
        JSON.stringify(selector) +
        ");" +
        `el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: ${ctrl}, metaKey: ${ctrl} }));`,
    );
  }

  async function readEditorLine(): Promise<number> {
    if (ctx.inWebViewFrame) {
      await ctx.webview.switchBack();
      ctx.inWebViewFrame = false;
    }
    const editor = (await new EditorView().openEditor(FIXTURE_NAME, 0)) as TextEditor;
    await driver.sleep(150);
    const [line] = await editor.getCoordinates();
    return line;
  }

  // Dispatch a Cmd/Ctrl+Click at `selector` and poll the .krs editor
  // cursor until it lands on `expectedLine`. We re-dispatch on each
  // poll iteration as a defensive guard: LSP cold-start under a fresh
  // VS Code session can drop the very first `PositionOfNodeRequest`,
  // and re-dispatching is cheap. Leaves the driver in WebView frame
  // context.
  async function clickAndAwaitCursor(
    selector: string,
    expectedLine: number,
    description: string,
  ): Promise<void> {
    let lastLine = 0;
    try {
      await driver.wait(
        async () => {
          await ensureWebViewFrame(ctx);
          await dispatchClick(selector, true);
          await driver.sleep(200);
          lastLine = await readEditorLine();
          return lastLine === expectedLine;
        },
        ELEMENT_TIMEOUT_MS,
        `editor cursor did not move to line ${expectedLine} for ${description} after Cmd/Ctrl+Click`,
      );
    } catch (err) {
      throw new Error(
        `editor cursor did not reach line ${expectedLine} for ${description}; last seen line ${lastLine}. Original: ${(err as Error).message}`,
        { cause: err },
      );
    } finally {
      await ensureWebViewFrame(ctx);
    }
  }

  before(async () => {
    const fixturePath = process.env.KARASU_E2E_FIXTURE_KRS_AT0038;
    if (!fixturePath) {
      throw new Error("KARASU_E2E_FIXTURE_KRS_AT0038 env var was not set by run-webview-tests.mjs");
    }

    driver = VSBrowser.instance.driver;
    const editorView = new EditorView();
    const workbench = new Workbench();

    await openFixtureWithRetry(driver, workbench, editorView, fixturePath, FIXTURE_NAME);
    ctx = await openPreviewAndEnterFrame(driver, workbench, editorView);
  });

  beforeEach(async () => {
    await ensureWebViewFrame(ctx);
  });

  after(async () => {
    if (ctx.inWebViewFrame) {
      try {
        await ctx.webview.switchBack();
      } catch {
        // already detached
      }
      ctx.inWebViewFrame = false;
    }
    await new EditorView().closeAllEditors();
  });

  it("AT-0037-9: editor cursor on a node identifier highlights the matching SVG node", async () => {
    // Move the .krs editor cursor onto OrderService (line 2, col 11).
    // The cursor watcher in extension.ts debounces by 150 ms, asks the
    // LSP for the node id, and posts a `highlight` message that adds
    // `karasu-highlighted` to the matching `<g data-node-id>`.
    if (ctx.inWebViewFrame) {
      await ctx.webview.switchBack();
      ctx.inWebViewFrame = false;
    }
    const editorView = new EditorView();
    const editor = (await editorView.openEditor(FIXTURE_NAME, 0)) as TextEditor;
    await editor.moveCursor(FIXTURE_LINE.OrderService, 11);

    await ensureWebViewFrame(ctx);

    let lastClass = "";
    await driver.wait(
      async () => {
        lastClass = (await driver.executeScript(
          "const el = document.querySelector('[data-node-id=\"OrderService\"]');" +
            'return el ? el.getAttribute("class") || "" : "";',
        )) as string;
        return lastClass.includes("karasu-highlighted");
      },
      ELEMENT_TIMEOUT_MS,
      `[data-node-id="OrderService"] never picked up class "karasu-highlighted"; last class was "${lastClass}"`,
    );

    assert.ok(
      lastClass.includes("karasu-highlighted"),
      `expected [data-node-id="OrderService"]'s class to contain "karasu-highlighted"; saw: "${lastClass}"`,
    );
  });

  it("TC-01: shows the hint text on the root view", async () => {
    const hint = await driver.wait(until.elementLocated(By.css("#jump-hint")), ELEMENT_TIMEOUT_MS);
    assert.strictEqual(await hint.isDisplayed(), true, "#jump-hint should be visible at root view");
    const text = await hint.getText();
    assert.ok(
      text.includes(HINT_TEXT),
      `#jump-hint should contain "${HINT_TEXT}" at root; saw: ${text}`,
    );
  });

  it("TC-03: Cmd/Ctrl+Click on a parent node moves the editor cursor without drilling", async () => {
    const beforeBreadcrumb = await readBreadcrumb();
    assert.deepStrictEqual(
      breadcrumbSegments(beforeBreadcrumb),
      ["Root"],
      `expected to start at root, but breadcrumb was "${beforeBreadcrumb}"`,
    );

    const selector = '[data-node-id="OrderService"][data-has-children="true"]';
    await driver.wait(until.elementLocated(By.css(selector)), ELEMENT_TIMEOUT_MS);

    await clickAndAwaitCursor(selector, FIXTURE_LINE.OrderService, "OrderService");

    const afterBreadcrumb = await readBreadcrumb();
    assert.deepStrictEqual(
      breadcrumbSegments(afterBreadcrumb),
      ["Root"],
      `Cmd/Ctrl+Click should not drill the preview; breadcrumb went to "${afterBreadcrumb}"`,
    );
  });

  it("TC-02: keeps the hint visible after plain-clicking a parent node to drill in", async () => {
    await dispatchClick('[data-node-id="OrderService"][data-has-children="true"]', false);

    // Drill rebuilds webview.html — re-acquire the frame.
    await reacquireFrame(ctx, DRILL_REACQUIRE_SLEEP_MS);

    let lastBreadcrumb = "";
    try {
      await driver.wait(
        async () => {
          lastBreadcrumb = await readBreadcrumb();
          return breadcrumbSegments(lastBreadcrumb).length > 1;
        },
        ELEMENT_TIMEOUT_MS,
        "breadcrumb did not advance past Root after drill click",
      );
    } catch (err) {
      throw new Error(
        `breadcrumb did not advance past Root after drill click; last seen: "${lastBreadcrumb}". Original: ${(err as Error).message}`,
        { cause: err },
      );
    }

    const hint = await driver.wait(until.elementLocated(By.css("#jump-hint")), ELEMENT_TIMEOUT_MS);
    assert.strictEqual(
      await hint.isDisplayed(),
      true,
      "#jump-hint should remain visible after drilling into OrderService",
    );
    const text = await hint.getText();
    assert.ok(
      text.includes(HINT_TEXT),
      `#jump-hint should still contain "${HINT_TEXT}" after drill-down; saw: ${text}`,
    );
  });

  it("TC-04: Cmd/Ctrl+Click on a leaf node moves the editor cursor without changing the view", async () => {
    const beforeBreadcrumb = await readBreadcrumb();
    assert.ok(
      breadcrumbSegments(beforeBreadcrumb).length > 1,
      `TC-04 expects to start in a drilled view; breadcrumb was "${beforeBreadcrumb}"`,
    );

    const leafSelector = '[data-node-id="OrderManagement"]';
    await driver.wait(until.elementLocated(By.css(leafSelector)), ELEMENT_TIMEOUT_MS);

    await clickAndAwaitCursor(leafSelector, FIXTURE_LINE.OrderManagement, "OrderManagement");

    const afterBreadcrumb = await readBreadcrumb();
    assert.strictEqual(
      afterBreadcrumb,
      beforeBreadcrumb,
      `Cmd/Ctrl+Click on a leaf should not change the preview view; breadcrumb went from "${beforeBreadcrumb}" to "${afterBreadcrumb}"`,
    );
  });
});
