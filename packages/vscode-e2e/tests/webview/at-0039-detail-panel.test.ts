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
  isViewActive,
  openFixtureWithRetry,
  openPreviewAndEnterFrame,
  reacquireFrame,
  switchToView,
} from "./harness";

/**
 * AT-0039 / AT-0042-vscode (WebView E2E — Phase 6 detail panel +
 * cross-diagram navigation).
 *
 * AT-0039 coverage:
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
 * AT-0042 coverage (co-located here to share the WebView/fixture):
 *   AT-0042-1: detail panel renders a `data-nav-view="org"` button for
 *              a node owned by a team (resolved via the organization
 *              `owns` block → `ownerIndex`); clicking it switches the
 *              preview to the Org diagram.
 *   AT-0042-2: detail panel renders a `data-nav-view="deploy"` button
 *              for a node with `hasDeployContainer=true`; clicking it
 *              switches the preview to the Deploy diagram.
 *   AT-0042-5: detail panel for a team-owned service with no deploy
 *              container does NOT render the deploy navigation button.
 *
 * TC-05 of AT-0039 (Cmd/Ctrl+Click → editor jump, no panel) is automated
 * by AT-0038 TC-03/TC-04. TC-09 (toolbar hint text) is automated by
 * AT-0038 TC-01.
 *
 * TC-07 of AT-0039 (clicking a Links link opens the URL in the external
 * browser) stays manual: from inside the WebView frame we can verify
 * that the page posts an `openExternal` message to the extension, but
 * cannot observe `vscode.env.openExternal` actually being called by the
 * host without test-only seams in production code (see ADR-20260428-05's
 * "no extension-host stubs" rule).
 *
 * AT-0042-3 (runtime/realizes section above team/role/tags section) is
 * a static layout invariant of the renderer — sections are emitted in
 * fixed source order in `preview-panel.ts`, and no live fixture node
 * carries both runtime/realizes AND team/role/tags simultaneously
 * (services have team; deploy units have runtime/realizes; metadata
 * does not aggregate across them). Verified by code review of
 * `_buildHtml`'s `// Runtime / realizes` and `// Team / role / tags`
 * blocks; see AT-0076 for context.
 *
 * AT-0042-4 is N/A in VSCode per the AT-0042 spec (the extension
 * always provides the team navigation button when team is set).
 *
 * The "File: Open File..." simple-dialog stalls intermittently under
 * xvfb (the shared `openFixtureWithRetry` 3-attempt retry handles it).
 */

const FIXTURE_NAME = "at-0039.krs";

// Lines (1-indexed) match `TextEditor.getCoordinates()`. The Customer
// node identifier in the AT-0039 fixture lives on line 17 (OrderService
// with its description/links/domains, then a one-line UserService, then
// Customer). Team ownership moved to a top-level `organization` block at
// the end of the fixture (ADR-20260614-01 removed the inline property),
// which does not shift the in-system node lines.
const FIXTURE_LINE = {
  Customer: 17,
} as const;

describe("AT-0039 / AT-0042-vscode (WebView) — detail panel + cross-diagram navigation", function () {
  this.timeout(240_000);

  let driver: WebDriver;
  let ctx: FrameContext;

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
    // The Org nav button is keyed on the resolved owner team id (ownerIndex),
    // which is `order-team` for OrderService (owned via the organization block).
    assert.match(text, /order-team/, "panel should mention the owning team");
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

  // NOTE: TC-03 leaves `ctx.inWebViewFrame = false` (focusing the .krs
  // editor rebuilds the WebView). The AT-0042 tests below recover via
  // `beforeEach`'s `ensureWebViewFrame()` and call `switchToView` to
  // restore System view, since the TC-03 rebuild also resets state.
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
    await ctx.webview.switchBack();
    ctx.inWebViewFrame = false;

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

  it("AT-0042-5: detail panel for a service without a deploy block does NOT show the deploy nav button", async () => {
    await switchToView(ctx, "system");
    await closePanelIfOpen();

    // UserService is owned by `user-team` (organization block) but has no
    // matching deploy block, so `meta.hasDeployContainer === false` and the
    // deploy nav button must not be rendered (the org nav button still is).
    await driver.wait(
      until.elementLocated(By.css('[data-info-button="UserService"]')),
      ELEMENT_TIMEOUT_MS,
    );
    await dispatchClickOnSelector('[data-info-button="UserService"]');
    await driver.wait(
      async () => await detailPanelHasVisibleClass(),
      ELEMENT_TIMEOUT_MS,
      "detail panel did not open after clicking UserService ⓘ button",
    );

    const html = await detailPanelHtml();
    assert.match(
      html,
      /data-nav-view="org"/,
      `panel for UserService should still show the team nav button; saw HTML: ${html.slice(0, 400)}`,
    );
    assert.doesNotMatch(
      html,
      /data-nav-view="deploy"/,
      `panel for UserService must NOT show the deploy nav button; saw HTML: ${html.slice(0, 400)}`,
    );
  });

  it("AT-0042-1: clicking the team nav button switches the preview to the Org diagram", async () => {
    await switchToView(ctx, "system");
    await closePanelIfOpen();

    await driver.wait(
      until.elementLocated(By.css('[data-info-button="OrderService"]')),
      ELEMENT_TIMEOUT_MS,
    );
    await dispatchClickOnSelector('[data-info-button="OrderService"]');
    await driver.wait(
      async () => await detailPanelHasVisibleClass(),
      ELEMENT_TIMEOUT_MS,
      "panel did not open before testing team nav button",
    );

    const html = await detailPanelHtml();
    assert.match(
      html,
      /data-nav-view="org"[^>]*data-nav-node="order-team"/,
      `panel should render an org nav button for "order-team"; saw HTML: ${html.slice(0, 600)}`,
    );

    // Click the team nav button. The handler postMessages
    // switchViewAndHighlight, the extension reassigns webview.html, and
    // the iframe needs to be re-acquired (same as the drill flow).
    await driver.executeScript(
      "const btn = document.querySelector('[data-nav-view=\"org\"]');" +
        "if (!btn) throw new Error('org nav button not found');" +
        "btn.click();",
    );
    await reacquireFrame(ctx);

    await driver.wait(
      async () => await isViewActive(driver, "org"),
      ELEMENT_TIMEOUT_MS,
      "org view did not become active after clicking the team nav button",
    );
    assert.strictEqual(
      await isViewActive(driver, "org"),
      true,
      "Org toolbar button should carry the active style after team nav click",
    );
  });

  it("AT-0042-2: clicking the deploy nav button switches the preview to the Deploy diagram", async () => {
    await switchToView(ctx, "system");
    await closePanelIfOpen();

    await driver.wait(
      until.elementLocated(By.css('[data-info-button="OrderService"]')),
      ELEMENT_TIMEOUT_MS,
    );
    await dispatchClickOnSelector('[data-info-button="OrderService"]');
    await driver.wait(
      async () => await detailPanelHasVisibleClass(),
      ELEMENT_TIMEOUT_MS,
      "panel did not open before testing deploy nav button",
    );

    const html = await detailPanelHtml();
    assert.match(
      html,
      /data-nav-view="deploy"[^>]*data-nav-node="OrderService"/,
      `panel should render a deploy nav button for OrderService; saw HTML: ${html.slice(0, 600)}`,
    );

    await driver.executeScript(
      "const btn = document.querySelector('[data-nav-view=\"deploy\"]');" +
        "if (!btn) throw new Error('deploy nav button not found');" +
        "btn.click();",
    );
    await reacquireFrame(ctx);

    await driver.wait(
      async () => await isViewActive(driver, "deploy"),
      ELEMENT_TIMEOUT_MS,
      "deploy view did not become active after clicking the deploy nav button",
    );
    assert.strictEqual(
      await isViewActive(driver, "deploy"),
      true,
      "Deploy toolbar button should carry the active style after deploy nav click",
    );
  });
});
