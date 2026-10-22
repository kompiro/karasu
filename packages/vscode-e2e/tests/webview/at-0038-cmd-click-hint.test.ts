import * as assert from "node:assert";
import {
  By,
  EditorView,
  type TextEditor,
  type WebDriver,
  Workbench,
  until,
} from "vscode-extension-tester";
import {
  ELEMENT_TIMEOUT_MS,
  type FrameContext,
  SUITE_TIMEOUT_MS,
  breadcrumbSegments,
  dispatchClick,
  ensureWebViewFrame,
  leaveWebViewFrame,
  openFixtureAndPreview,
  reacquireFrame,
  readBreadcrumb,
  readEditorCursorLine,
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
 *   #3252:     the edge hover rules reach the webview (the preview is
 *              the app's viewer since #3312, so it loads the app's
 *              stylesheet). The hover itself is asserted by the app's
 *              Playwright suite (AT-1186 / AT-2632); a real `:hover`
 *              through Selenium coordinates is not worth the flake.
 *   TPL-2996:  an edit made without saving reaches the preview, and the
 *              drilled view is kept.
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
 *   2. The preview is the app's viewer (#3312): a drill happens in place
 *      and the page is never rebuilt, but the viewer compiles 300ms after
 *      the click, so post-drill state is polled for rather than read
 *      once. The viewer reads a press as mousedown then mouseup, which
 *      `dispatchClick` sends.
 *   3. Reading the .krs editor's cursor needs the .krs editor to be
 *      active. After clicking inside the WebView the preview panel is
 *      active, so `editorView.openEditor("at-0038.krs", 0)` returns
 *      the TextEditor and brings it into focus. We refocus the preview
 *      afterwards so the next test starts in the same WebView frame.
 *
 * The viewer's breadcrumb starts at the system's label, so the root view
 * reads as one segment ("ECommerce") and a drill adds one per level. The
 * drill assertion in TC-02 only checks `segments.length > 1`: TC-02's
 * purpose is just "hint stays visible after *some* drill happened".
 *
 * Test order is state-driven (01 → 03 → 02 → 04) rather than spec
 * order: TC-01/03 both run at root view, TC-02 drills into OrderService,
 * TC-04 then runs in that drilled view. Each test name is independent,
 * so the CI output still reads cleanly.
 */

const FIXTURE_NAME = "at-0038.krs";
const HINT_TEXT = "Cmd/Ctrl+Click to jump";
// The hint the VS Code toolbar adds to the viewer (`VscodeToolbarExtras`, #3312).
const HINT_SELECTOR = '[data-testid="vscode-jump-hint"]';
// Settle after the TC-02 drill click, so the viewer's debounced compile
// (300ms) has drawn the drilled view before it is read.
const DRILL_REACQUIRE_SLEEP_MS = 1000;

// Identifiers in the AT-0038 fixture (see run-webview-tests.mjs). Lines
// are 1-indexed to match what `TextEditor.getCoordinates()` returns.
const FIXTURE_LINE = {
  OrderService: 2,
  OrderManagement: 3,
} as const;

// Where the cursor is parked before each Cmd/Ctrl+Click, so that landing on
// the expected line proves the jump happened. Line 1 is the fixture's
// `system ECommerce {` header, which is not the target of any jump here.
const CURSOR_PARK_LINE = 1;

describe("AT-0037-9 / AT-0038 (WebView) — bidirectional editor ↔ SVG preview", function () {
  this.timeout(SUITE_TIMEOUT_MS);

  let driver: WebDriver;
  let ctx: FrameContext;

  async function readEditorLine(): Promise<number> {
    return readEditorCursorLine(ctx, FIXTURE_NAME);
  }

  // Move the cursor to `CURSOR_PARK_LINE` and confirm it got there, so the
  // subsequent "cursor reached `expectedLine`" assertion cannot pass just
  // because a previous test already left it there. TC-03 used to assert
  // line 2 while AT-0037-9 had parked the cursor on line 2 itself, so it
  // stayed green through the whole LSP 3.17/3.18 breakage in which
  // `karasu/positionOfNode` never completed at all (Issue #2456). Leaves the
  // driver outside the WebView frame; callers re-enter it.
  async function parkCursorAwayFrom(expectedLine: number): Promise<void> {
    assert.notStrictEqual(
      expectedLine,
      CURSOR_PARK_LINE,
      `cannot park the cursor on line ${CURSOR_PARK_LINE} and then assert the jump lands there`,
    );
    await leaveWebViewFrame(ctx, { swallowErrors: false });
    const editor = (await new EditorView().openEditor(FIXTURE_NAME, 0)) as TextEditor;
    await editor.moveCursor(CURSOR_PARK_LINE, 1);
    const [parked] = await editor.getCoordinates();
    assert.strictEqual(parked, CURSOR_PARK_LINE, "failed to park the cursor before the click");
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
    await parkCursorAwayFrom(expectedLine);
    let lastLine = CURSOR_PARK_LINE;
    try {
      await driver.wait(
        async () => {
          await ensureWebViewFrame(ctx);
          await dispatchClick(driver, selector, { ctrlKey: true });
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
    ctx = await openFixtureAndPreview({
      envVar: "KARASU_E2E_FIXTURE_KRS_AT0038",
      fixtureName: FIXTURE_NAME,
    });
    driver = ctx.driver;
  });

  beforeEach(async () => {
    await ensureWebViewFrame(ctx);
  });

  after(async () => {
    await leaveWebViewFrame(ctx);
    await new EditorView().closeAllEditors();
  });

  it("AT-0037-9: editor cursor on a node identifier highlights the matching SVG node", async () => {
    // Move the .krs editor cursor onto OrderService (line 2, col 11).
    // The cursor watcher in extension.ts debounces by 150 ms, asks the
    // LSP for the node id, and posts a `highlight` message that adds
    // `karasu-highlighted` to the matching `<g data-node-id>`.
    await leaveWebViewFrame(ctx, { swallowErrors: false });
    const editorView = new EditorView();
    const editor = (await editorView.openEditor(FIXTURE_NAME, 0)) as TextEditor;
    await editor.moveCursor(FIXTURE_LINE.OrderService, 11);

    await ensureWebViewFrame(ctx);

    // Same call-time interpolation trap as at-0039's cursor poll: `lastClass`
    // has to be read into the message when the failure is thrown, not when
    // `driver.wait` is called, or every failure reports the initializer.
    let lastClass = "";
    try {
      await driver.wait(
        async () => {
          lastClass = (await driver.executeScript(
            "const el = document.querySelector('[data-node-id=\"OrderService\"]');" +
              'return el ? el.getAttribute("class") || "" : "";',
          )) as string;
          return lastClass.includes("karasu-highlighted");
        },
        ELEMENT_TIMEOUT_MS,
        '[data-node-id="OrderService"] never picked up class "karasu-highlighted"',
      );
    } catch (err) {
      throw new Error(
        '[data-node-id="OrderService"] never picked up class "karasu-highlighted"; ' +
          `last class was "${lastClass}". Original: ${(err as Error).message}`,
        { cause: err },
      );
    }

    assert.ok(
      lastClass.includes("karasu-highlighted"),
      `expected [data-node-id="OrderService"]'s class to contain "karasu-highlighted"; saw: "${lastClass}"`,
    );
  });

  it("TC-01: shows the hint text on the root view", async () => {
    const hint = await driver.wait(until.elementLocated(By.css(HINT_SELECTOR)), ELEMENT_TIMEOUT_MS);
    assert.strictEqual(
      await hint.isDisplayed(),
      true,
      "the jump hint should be visible at root view",
    );
    const text = await hint.getText();
    assert.ok(
      text.includes(HINT_TEXT),
      `the jump hint should contain "${HINT_TEXT}" at root; saw: ${text}`,
    );
  });

  it("#3252: the preview carries the edge hover rules", async () => {
    await driver.wait(
      until.elementLocated(By.css(".preview-container svg .krs-edge__hitline")),
      ELEMENT_TIMEOUT_MS,
    );
    const selectors = (await driver.executeScript(
      "const out = [];" +
        "for (const sheet of Array.from(document.styleSheets)) {" +
        "  let rules; try { rules = sheet.cssRules; } catch (e) { continue; }" +
        "  const walk = (list) => { for (const r of Array.from(list)) {" +
        "    if (r.selectorText) out.push(r.selectorText);" +
        "    if (r.cssRules) walk(r.cssRules);" +
        "  } };" +
        "  walk(rules);" +
        "}" +
        "return out.filter(s => s.includes('krs-edge'));",
    )) as string[];
    // The highlight on the hovered edge, and the dim on every other edge.
    assert.ok(
      selectors.some((sel) => sel.includes(".krs-edge:hover")),
      `no .krs-edge:hover rule reached the webview; saw: ${JSON.stringify(selectors)}`,
    );
    assert.ok(
      selectors.some(
        (sel) => sel.includes(":has(.krs-edge:hover)") && sel.includes(":not(:hover)"),
      ),
      `no peer-dim rule reached the webview; saw: ${JSON.stringify(selectors)}`,
    );
  });

  it("TC-03: Cmd/Ctrl+Click on a parent node moves the editor cursor without drilling", async () => {
    // The root view's breadcrumb is the system's label alone.
    let beforeBreadcrumb = "";
    await driver.wait(
      async () => {
        beforeBreadcrumb = await readBreadcrumb(driver);
        return breadcrumbSegments(beforeBreadcrumb).length === 1;
      },
      ELEMENT_TIMEOUT_MS,
      "expected to start at the root view",
    );

    const selector = '[data-node-id="OrderService"][data-has-children="true"]';
    await driver.wait(until.elementLocated(By.css(selector)), ELEMENT_TIMEOUT_MS);

    await clickAndAwaitCursor(selector, FIXTURE_LINE.OrderService, "OrderService");

    const afterBreadcrumb = await readBreadcrumb(driver);
    assert.strictEqual(
      afterBreadcrumb,
      beforeBreadcrumb,
      `Cmd/Ctrl+Click should not drill the preview; breadcrumb went from "${beforeBreadcrumb}" to "${afterBreadcrumb}"`,
    );
  });

  it("TC-02: keeps the hint visible after plain-clicking a parent node to drill in", async () => {
    await dispatchClick(driver, '[data-node-id="OrderService"][data-has-children="true"]');

    // The drill happens in place; settle for the viewer's compile.
    await reacquireFrame(ctx, DRILL_REACQUIRE_SLEEP_MS);

    let lastBreadcrumb = "";
    try {
      await driver.wait(
        async () => {
          lastBreadcrumb = await readBreadcrumb(driver);
          return breadcrumbSegments(lastBreadcrumb).length > 1;
        },
        ELEMENT_TIMEOUT_MS,
        "breadcrumb did not advance past the root after drill click",
      );
    } catch (err) {
      throw new Error(
        `breadcrumb did not advance past the root after drill click; last seen: "${lastBreadcrumb}". Original: ${(err as Error).message}`,
        { cause: err },
      );
    }

    const hint = await driver.wait(until.elementLocated(By.css(HINT_SELECTOR)), ELEMENT_TIMEOUT_MS);
    assert.strictEqual(
      await hint.isDisplayed(),
      true,
      "the jump hint should remain visible after drilling into OrderService",
    );
    const text = await hint.getText();
    assert.ok(
      text.includes(HINT_TEXT),
      `the jump hint should still contain "${HINT_TEXT}" after drill-down; saw: ${text}`,
    );
  });

  it("TC-04: Cmd/Ctrl+Click on a leaf node moves the editor cursor without changing the view", async () => {
    const beforeBreadcrumb = await readBreadcrumb(driver);
    assert.ok(
      breadcrumbSegments(beforeBreadcrumb).length > 1,
      `TC-04 expects to start in a drilled view; breadcrumb was "${beforeBreadcrumb}"`,
    );

    const leafSelector = '[data-node-id="OrderManagement"]';
    await driver.wait(until.elementLocated(By.css(leafSelector)), ELEMENT_TIMEOUT_MS);

    await clickAndAwaitCursor(leafSelector, FIXTURE_LINE.OrderManagement, "OrderManagement");

    const afterBreadcrumb = await readBreadcrumb(driver);
    assert.strictEqual(
      afterBreadcrumb,
      beforeBreadcrumb,
      `Cmd/Ctrl+Click on a leaf should not change the preview view; breadcrumb went from "${beforeBreadcrumb}" to "${afterBreadcrumb}"`,
    );
  });

  // TPL-2996: the preview reads the open buffer, not the file on disk, and a
  // change keeps the drilled view (#2996 decision 3). Runs last: it leaves the
  // preview drilled into OrderService (TC-02) and reverts its own edit, so
  // `after()` can close the editors without a save prompt.
  it("TPL-2996: an unsaved edit reaches the preview and keeps the drilled view", async () => {
    const beforeBreadcrumb = await readBreadcrumb(driver);
    assert.ok(
      breadcrumbSegments(beforeBreadcrumb).length > 1,
      `expected to start drilled into OrderService; breadcrumb was "${beforeBreadcrumb}"`,
    );

    await leaveWebViewFrame(ctx, { swallowErrors: false });
    const editor = (await new EditorView().openEditor(FIXTURE_NAME, 0)) as TextEditor;
    try {
      // One more domain inside OrderService, on the same line so no other
      // line moves. Not saved.
      await editor.setTextAtLine(
        FIXTURE_LINE.OrderManagement,
        "    domain OrderManagement {} domain Payments {}",
      );
      assert.strictEqual(await editor.isDirty(), true, "the edit should stay unsaved");

      await ensureWebViewFrame(ctx);
      await driver.wait(
        until.elementLocated(By.css('.preview-container [data-node-id="Payments"]')),
        ELEMENT_TIMEOUT_MS,
        "the unsaved domain never appeared in the preview",
      );
      const afterBreadcrumb = await readBreadcrumb(driver);
      assert.strictEqual(
        afterBreadcrumb,
        beforeBreadcrumb,
        `the edit should keep the drilled view; breadcrumb went from "${beforeBreadcrumb}" to "${afterBreadcrumb}"`,
      );
    } finally {
      await leaveWebViewFrame(ctx);
      await new EditorView().openEditor(FIXTURE_NAME, 0);
      await new Workbench().executeCommand("File: Revert File");
    }
  });
});
