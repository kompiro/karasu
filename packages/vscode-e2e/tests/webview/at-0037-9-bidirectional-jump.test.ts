import * as assert from "node:assert";
import {
  EditorView,
  TextEditor,
  VSBrowser,
  type WebDriver,
  WebView,
  Workbench,
} from "vscode-extension-tester";

/**
 * AT-0037-9 (WebView E2E — Phase 3, bidirectional jump editor → SVG side).
 *
 * Phase 4 wired the editor's selection change to the karasu preview: when
 * the cursor lands on a node identifier, the LSP's `karasu/nodeAtPosition`
 * request resolves to that node id and the extension posts a `highlight`
 * message to the WebView, which toggles `class="karasu-highlighted"` on
 * the matching `<g data-node-id="…">`.
 *
 * The "click an SVG node and jump the editor" half of AT-0037-9 is now
 * covered by AT-0038 TC-03/TC-04 (Cmd/Ctrl+Click → editor jump) and
 * AT-0039 TC-01 (plain click on leaf → detail panel; the original Phase 4
 * "plain click jumps editor" expectation pre-dates Phase 6, #250). What
 * is NOT covered elsewhere is the editor → SVG direction; that is what
 * this suite locks in.
 *
 * Uses its own fixture `KARASU_E2E_FIXTURE_KRS_AT0037` (same content as
 * the AT-0038 fixture, but at a separate path), opened via
 * `VSBrowser.openResources(...)` rather than the "File: Open File..."
 * simple-dialog. The simple-dialog path stalls on the second open in a
 * single VS Code session — the dialog appears with the path typed in,
 * but `confirm()` does not advance to the workspace. `openResources`
 * shells out to `code -r <path>` against the already-running instance,
 * so it sidesteps the dialog entirely. AT-0038 and AT-0039 still use
 * the simple-dialog because they each see a clean state when they run
 * (this suite no longer leaves a dialog interaction behind).
 * `OrderService` lives at line 2 col 11 (1-indexed) which is what
 * `TextEditor.moveCursor` accepts.
 *
 * Implementation notes:
 *
 *   1. The cursor watcher in `extension.ts` debounces by 150 ms before
 *      issuing the LSP request, so the test polls the WebView class
 *      list inside `driver.wait` rather than asserting once.
 *   2. The WebView's `highlight` handler adds `.karasu-highlighted`
 *      without removing other classes; we read `getAttribute("class")`
 *      and check `.includes("karasu-highlighted")` rather than
 *      requiring exact equality.
 *   3. Moving the cursor needs the .krs editor active; reading the
 *      WebView DOM needs the preview active and the frame switched.
 *      We focus each in turn.
 */

const PREVIEW_TITLE = "karasu Preview";
const FIXTURE_NAME = "at-0037.krs";
const ELEMENT_TIMEOUT_MS = 15_000;

// `OrderService` identifier: line 2, column 11 in the AT-0038 fixture
// (1-indexed, matching `TextEditor.moveCursor`).
//
// system ECommerce {
//   service OrderService {
// 0123456789012345678
//            ^ col 11
const ORDER_SERVICE_LINE = 2;
const ORDER_SERVICE_COL = 11;

describe("AT-0037-9 (WebView) — editor cursor highlights the matching SVG node", function () {
  this.timeout(240_000);

  let driver: WebDriver;
  let webview: WebView;

  before(async () => {
    const fixturePath = process.env.KARASU_E2E_FIXTURE_KRS_AT0037;
    if (!fixturePath) {
      throw new Error("KARASU_E2E_FIXTURE_KRS_AT0037 env var was not set by run-webview-tests.mjs");
    }

    driver = VSBrowser.instance.driver;
    const editorView = new EditorView();
    const workbench = new Workbench();

    // Open the fixture via the VS Code CLI (`code -r <path>`) instead of
    // the workbench File: Open File... simple-dialog. The simple-dialog
    // is reliable on a fresh session but stalls on a second open in the
    // same run, which broke the AT-0037-9 → AT-0038 sequence on CI.
    await VSBrowser.instance.openResources(fixturePath);

    await driver.wait(
      async () => {
        const titles = await editorView.getOpenEditorTitles();
        return titles.some((t) => t.includes(FIXTURE_NAME));
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
  });

  after(async () => {
    try {
      await webview.switchBack();
    } catch {
      // already detached
    }
    await new EditorView().closeAllEditors();
  });

  it('highlights `[data-node-id="OrderService"]` in the SVG when the editor cursor lands on the OrderService identifier', async () => {
    const editorView = new EditorView();

    // Step 1: focus the .krs editor and move the cursor onto OrderService.
    const editor = (await editorView.openEditor(FIXTURE_NAME, 0)) as TextEditor;
    await editor.moveCursor(ORDER_SERVICE_LINE, ORDER_SERVICE_COL);

    // Step 2: refocus the preview and enter the WebView iframe.
    await editorView.openEditor(PREVIEW_TITLE, 1);
    await driver.sleep(300);
    await webview.switchToFrame();

    try {
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
        '[data-node-id="OrderService"] never picked up class "karasu-highlighted"',
      );

      assert.ok(
        lastClass.includes("karasu-highlighted"),
        `expected class to contain "karasu-highlighted"; saw: "${lastClass}"`,
      );
    } finally {
      await webview.switchBack();
    }
  });
});
