import * as assert from "node:assert";
import { By, EditorView, type TextEditor, type WebDriver, until } from "vscode-extension-tester";
import {
  ELEMENT_TIMEOUT_MS,
  type FrameContext,
  SUITE_TIMEOUT_MS,
  breadcrumbSegments,
  dispatchClick,
  ensureWebViewFrame,
  isViewActive,
  leaveWebViewFrame,
  openFixtureAndPreview,
  readBreadcrumb,
  readEditorCursorLine,
  switchToView,
} from "./harness";

/**
 * AT-0039 / AT-0042-vscode (WebView E2E — Phase 6 detail panel +
 * cross-diagram navigation).
 *
 * Since #3312 the preview is the app's viewer, so the panel under test is
 * the app's `NodeDetailPanel` (`.node-detail-panel`), the tabs are the app's
 * `DiagramTabBar`, and a drill or a view switch happens in place.
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
 *   TC-08 (tooltip suppressed while the panel is open) is retired: the
 *          app's viewer shows no hover description; whether it should is
 *          #3325.
 *
 * AT-0042 coverage (co-located here to share the WebView/fixture):
 *   AT-0042-1: detail panel renders a team navigation button for a node
 *              owned by a team (resolved via the organization `owns` block
 *              → `ownerIndex`); clicking it switches the preview to the
 *              Org diagram.
 *   AT-0042-2: detail panel renders the "View in Deploy diagram" button for
 *              a node with `hasDeployContainer=true`; clicking it switches
 *              the preview to the Deploy diagram.
 *   AT-0042-5: detail panel for a team-owned service with no deploy
 *              container does NOT render the deploy navigation button.
 *
 * TC-05 of AT-0039 (Cmd/Ctrl+Click → editor jump, no panel) is automated
 * by AT-0038 TC-03/TC-04. TC-09 (toolbar hint text) is automated by
 * AT-0038 TC-01.
 *
 * TC-07 of AT-0039 (clicking a Links link opens the URL in the external
 * browser) stays manual: from inside the WebView frame we can verify that
 * the page posts an `openExternal` message to the extension, but cannot
 * observe `vscode.env.openExternal` actually being called by the host
 * without test-only seams in production code (see ADR-926's "no
 * extension-host stubs" rule).
 *
 * AT-0042-3 (runtime/realizes section above team/role/tags section) is a
 * static layout invariant of `NodeDetailPanel`, whose sections are emitted
 * in fixed source order; see AT-0076 for context.
 *
 * AT-0042-4 is N/A in VSCode per the AT-0042 spec (the extension
 * always provides the team navigation button when team is set).
 *
 * The "File: Open File..." simple-dialog stalls intermittently under
 * xvfb (the shared `openFixtureWithRetry` 3-attempt retry handles it).
 *
 * Issue #2068 coverage (detail-panel parity with the app's
 * `NodeDetailPanel`, co-located here rather than under a new AT number
 * since it reuses this suite's fixture and WebView):
 *   - the deploy `store "order-db"` unit (realizing `OrderDB`) gets its
 *     own detail-panel icon distinct from the "■" fallback.
 *   - the `client WebApp` node's `resource`/`capability` declarations
 *     render the panel's Storage resources / Capabilities sections.
 *   - `UserService`'s `@deprecated(until: …)` annotation renders the
 *     panel's Migration intent section.
 * The `usecase`/`domain` icon collision the issue also fixed is pinned by
 * `packages/core/src/builtins/node-detail-fields.test.ts`, rather than by a
 * live click here: reaching a `usecase` node requires drilling into a
 * domain, which would turn `OrderManagement`/`Inventory` into parent nodes
 * and break TC-01's "leaf node" assumption for this shared fixture.
 *
 * Issue #2074: the panel speaks VS Code's display language
 * (`vscode.env.language`, passed to the viewer as its locale). The ExTester
 * harness launches vanilla VS Code, whose display language defaults to
 * English, so the assertions below match the **en** labels ("Storage
 * resources", "Capabilities", "Migration intent", "Jump to editor").
 * Japanese-locale label parity is verified manually (AT-0039 TC-10).
 */

const FIXTURE_NAME = "at-0039.krs";

// Lines (1-indexed) match `TextEditor.getCoordinates()`. The Customer
// node identifier in the AT-0039 fixture lives on line 17 (OrderService
// with its description/links/domains, then a one-line UserService, then
// Customer). Team ownership moved to a top-level `organization` block at
// the end of the fixture (ADR-1564 removed the inline property),
// which does not shift the in-system node lines.
const FIXTURE_LINE = {
  Customer: 17,
} as const;

// Where the cursor is parked before a Jump-to-editor, so landing on the
// target line proves the jump happened. Line 1 is the fixture's `system`
// header and is never a jump target here.
const CURSOR_PARK_LINE = 1;

describe("AT-0039 / AT-0042-vscode (WebView) — detail panel + cross-diagram navigation", function () {
  this.timeout(SUITE_TIMEOUT_MS);

  let driver: WebDriver;
  let ctx: FrameContext;

  // The panel is the app's `NodeDetailPanel` (#3312): present while open,
  // absent once closed.
  async function detailPanelText(): Promise<string> {
    return (await driver.executeScript(
      "const el = document.querySelector('.node-detail-panel');" +
        "return el ? (el.textContent || '') : '';",
    )) as string;
  }

  async function detailPanelHtml(): Promise<string> {
    return (await driver.executeScript(
      "const el = document.querySelector('.node-detail-panel');" +
        "return el ? (el.innerHTML || '') : '';",
    )) as string;
  }

  async function detailPanelIsOpen(): Promise<boolean> {
    return (await driver.executeScript(
      "return document.querySelector('.node-detail-panel') !== null;",
    )) as boolean;
  }

  /** The text of each navigation button in the open panel (team, deploy, jump). */
  async function panelNavButtons(): Promise<string[]> {
    return (await driver.executeScript(
      "return Array.from(document.querySelectorAll('.node-detail-panel .node-detail-nav-btn'))" +
        ".map(b => (b.textContent || '').trim());",
    )) as string[];
  }

  /** Click the panel's navigation button whose text contains `text`. */
  async function clickPanelNavButton(text: string): Promise<void> {
    await driver.executeScript(
      "const btn = Array.from(document.querySelectorAll('.node-detail-panel .node-detail-nav-btn'))" +
        `.find(b => (b.textContent || '').includes(${JSON.stringify(text)}));` +
        `if (!btn) throw new Error('no panel button containing ' + ${JSON.stringify(JSON.stringify(text))});` +
        "btn.click();",
    );
  }

  // AT-0039-specific waits on the detail panel. Kept spec-local (not in the
  // harness): the detail panel is AT-0039 DOM.
  async function awaitPanelVisible(message: string): Promise<void> {
    await driver.wait(async () => await detailPanelIsOpen(), ELEMENT_TIMEOUT_MS, message);
  }

  async function awaitPanelHidden(message: string): Promise<void> {
    await driver.wait(async () => !(await detailPanelIsOpen()), ELEMENT_TIMEOUT_MS, message);
  }

  async function closePanelIfOpen(): Promise<void> {
    if (await detailPanelIsOpen()) {
      await driver.executeScript(
        "const btn = document.querySelector('.node-detail-panel .node-detail-close'); if (btn) btn.click();",
      );
      await awaitPanelHidden("detail panel did not close");
    }
  }

  before(async () => {
    ctx = await openFixtureAndPreview({
      envVar: "KARASU_E2E_FIXTURE_KRS",
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

  it("TC-01: clicking a leaf node (Customer) opens the detail panel", async () => {
    await closePanelIfOpen();

    await driver.wait(
      until.elementLocated(By.css('[data-node-id="Customer"]')),
      ELEMENT_TIMEOUT_MS,
    );
    await dispatchClick(driver, '[data-node-id="Customer"]');

    await awaitPanelVisible("detail panel did not become visible after clicking Customer");

    const text = await detailPanelText();
    assert.match(text, /Customer/, `panel should contain "Customer"; saw: ${text}`);
  });

  it("TC-02: detail panel shows description / links / properties (OrderService via ⓘ)", async () => {
    await closePanelIfOpen();

    await driver.wait(
      until.elementLocated(By.css('[data-info-button="OrderService"]')),
      ELEMENT_TIMEOUT_MS,
    );
    await dispatchClick(driver, '[data-info-button="OrderService"]');

    await awaitPanelVisible("detail panel did not become visible after clicking the ⓘ button");

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
    // The Org nav button navigates by the resolved owner team id (ownerIndex,
    // `order-team` for OrderService) while its text shows that team's declared
    // label (#2157); AT-0042-1 clicks it.
    assert.match(text, /Order Team/, "panel should mention the owning team's label");
    assert.ok(
      (await panelNavButtons()).some((b) => b.includes("Order Team")),
      "panel should offer the owning team as a navigation button",
    );
  });

  it("TC-04: × close button dismisses the panel; click-outside also dismisses it", async () => {
    await closePanelIfOpen();

    await dispatchClick(driver, '[data-node-id="Customer"]');
    await awaitPanelVisible("panel did not open before testing close");

    await driver.executeScript(
      "const btn = document.querySelector('.node-detail-panel .node-detail-close');" +
        "if (!btn) throw new Error('the panel close button was not found');" +
        "btn.click();",
    );
    await awaitPanelHidden("panel did not close after pressing the × button");
    assert.strictEqual(
      await detailPanelIsOpen(),
      false,
      "panel should be hidden after clicking the × button",
    );

    await dispatchClick(driver, '[data-node-id="Customer"]');
    await awaitPanelVisible("panel did not re-open before testing click-outside");

    // A press on the diagram's container itself (no `[data-node-id]`
    // ancestor) is "click outside any node" for the viewer, which dismisses
    // the panel.
    await dispatchClick(driver, ".preview-container");
    await awaitPanelHidden("panel did not close after clicking outside any node");
    assert.strictEqual(
      await detailPanelIsOpen(),
      false,
      "panel should be hidden after clicking outside any node",
    );
  });

  it("TC-06: ⓘ info button on a parent does not drill the preview", async () => {
    await closePanelIfOpen();

    // The root view's breadcrumb is the system's label alone.
    const beforeBreadcrumb = await readBreadcrumb(driver);
    assert.strictEqual(
      breadcrumbSegments(beforeBreadcrumb).length,
      1,
      `expected to start at root, but breadcrumb was "${beforeBreadcrumb}"`,
    );

    await dispatchClick(driver, '[data-info-button="OrderService"]');

    await awaitPanelVisible("detail panel did not open after ⓘ click");

    const afterBreadcrumb = await readBreadcrumb(driver);
    assert.strictEqual(
      afterBreadcrumb,
      beforeBreadcrumb,
      `ⓘ click should not drill the preview; breadcrumb went to "${afterBreadcrumb}"`,
    );

    const text = await detailPanelText();
    assert.match(text, /OrderService/, `panel should mention OrderService; saw: ${text}`);
  });

  // NOTE: TC-03 leaves `ctx.inWebViewFrame = false` (it reads the .krs
  // editor's cursor). The AT-0042 tests below recover via `beforeEach`'s
  // `ensureWebViewFrame()` and call `switchToView` to start from System view.
  it("TC-03: Jump to editor button moves the .krs editor cursor and leaves the panel open", async () => {
    // Park the cursor off the Customer line first, so "cursor reached line 17"
    // proves the jump happened rather than that something earlier left it
    // there — the false-green that kept AT-0038 TC-03 passing through the
    // whole LSP breakage (Issue #2456).
    await leaveWebViewFrame(ctx, { swallowErrors: false });
    const krsEditor = (await new EditorView().openEditor(FIXTURE_NAME, 0)) as TextEditor;
    await krsEditor.moveCursor(CURSOR_PARK_LINE, 1);
    const [parked] = await krsEditor.getCoordinates();
    assert.strictEqual(parked, CURSOR_PARK_LINE, "failed to park the cursor before Jump-to-editor");
    await ensureWebViewFrame(ctx);

    await closePanelIfOpen();

    await dispatchClick(driver, '[data-node-id="Customer"]');
    await awaitPanelVisible("panel did not open before testing Jump to editor");

    await clickPanelNavButton("Jump to editor");

    // Allow the postMessage roundtrip to settle, then assert that the panel
    // is still visible: the jump leaves the panel open.
    await driver.sleep(500);
    assert.strictEqual(
      await detailPanelIsOpen(),
      true,
      "panel should remain visible after Jump-to-editor",
    );

    // Read the editor's coordinates. `readEditorCursorLine` leaves the
    // WebView frame on every iteration.
    //
    // Build the failure message in the catch, NOT as `driver.wait`'s third
    // argument: that argument is a plain string evaluated at call time, so
    // interpolating `lastLine` there always reported the initializer. During
    // the LSP 3.17/3.18 investigation that printed "last seen line 0" on every
    // failure, which read as "the cursor jumped somewhere impossible" when the
    // truth was "the cursor never moved" (Issue #2456).
    let lastLine = 0;
    try {
      await driver.wait(
        async () => {
          const line = await readEditorCursorLine(ctx, FIXTURE_NAME);
          lastLine = line;
          return line === FIXTURE_LINE.Customer;
        },
        ELEMENT_TIMEOUT_MS,
        `editor cursor did not move to Customer line (expected ${FIXTURE_LINE.Customer})`,
      );
    } catch (err) {
      throw new Error(
        `editor cursor did not move to Customer line (expected ${FIXTURE_LINE.Customer}); ` +
          `last seen line ${lastLine}. Original: ${(err as Error).message}`,
        { cause: err },
      );
    }
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
    await dispatchClick(driver, '[data-info-button="UserService"]');
    await awaitPanelVisible("detail panel did not open after clicking UserService ⓘ button");

    const buttons = await panelNavButtons();
    assert.ok(
      buttons.some((b) => b.endsWith("→") && !b.includes("Deploy")),
      `panel for UserService should still show the team nav button; saw: ${JSON.stringify(buttons)}`,
    );
    assert.ok(
      !buttons.some((b) => b.includes("View in Deploy diagram")),
      `panel for UserService must NOT show the deploy nav button; saw: ${JSON.stringify(buttons)}`,
    );
  });

  it("AT-0042-1: clicking the team nav button switches the preview to the Org diagram", async () => {
    await switchToView(ctx, "system");
    await closePanelIfOpen();

    await driver.wait(
      until.elementLocated(By.css('[data-info-button="OrderService"]')),
      ELEMENT_TIMEOUT_MS,
    );
    await dispatchClick(driver, '[data-info-button="OrderService"]');
    await awaitPanelVisible("panel did not open before testing team nav button");

    const buttons = await panelNavButtons();
    assert.ok(
      buttons.some((b) => b.includes("Order Team")),
      `panel should render a nav button for the owning team; saw: ${JSON.stringify(buttons)}`,
    );

    // Click the team nav button; the viewer switches to the Org view in place.
    await clickPanelNavButton("Order Team");

    await driver.wait(
      async () => await isViewActive(driver, "org"),
      ELEMENT_TIMEOUT_MS,
      "org view did not become active after clicking the team nav button",
    );
    assert.strictEqual(
      await isViewActive(driver, "org"),
      true,
      "the Org tab should be selected after team nav click",
    );
  });

  it("AT-0042-2: clicking the deploy nav button switches the preview to the Deploy diagram", async () => {
    await switchToView(ctx, "system");
    await closePanelIfOpen();

    await driver.wait(
      until.elementLocated(By.css('[data-info-button="OrderService"]')),
      ELEMENT_TIMEOUT_MS,
    );
    await dispatchClick(driver, '[data-info-button="OrderService"]');
    await awaitPanelVisible("panel did not open before testing deploy nav button");

    const buttons = await panelNavButtons();
    assert.ok(
      buttons.some((b) => b.includes("View in Deploy diagram")),
      `panel should render a deploy nav button for OrderService; saw: ${JSON.stringify(buttons)}`,
    );

    await clickPanelNavButton("View in Deploy diagram");

    await driver.wait(
      async () => await isViewActive(driver, "deploy"),
      ELEMENT_TIMEOUT_MS,
      "deploy view did not become active after clicking the deploy nav button",
    );
    assert.strictEqual(
      await isViewActive(driver, "deploy"),
      true,
      "the Deploy tab should be selected after deploy nav click",
    );

    // #2818: the jump hands over the node id, and the deploy view marks that
    // node on the container realizing it (`data-realized-node-id`), so the
    // highlight lands on the container — never on `data-container-id`, whose
    // spelling is the container's identity.
    await driver.wait(
      async () =>
        (await driver.executeScript(
          "return document.querySelector('[data-realized-node-id=\"OrderService\"].karasu-highlighted') !== null;",
        )) === true,
      ELEMENT_TIMEOUT_MS,
      "the container realizing OrderService was not highlighted after the deploy nav click",
    );
  });

  // Issue #2068: `store` had no icon entry before this fix, so its panel
  // header always fell back to the generic "■" glyph. `order-db`
  // realizes the logical `database OrderDB` and has no children, so a
  // plain click opens its panel directly (no ⓘ button needed).
  it("#2068: detail panel for a store deploy unit renders its own icon, not the generic fallback", async () => {
    await switchToView(ctx, "deploy");
    await closePanelIfOpen();

    await driver.wait(
      until.elementLocated(By.css('[data-node-id="OrderDB::order-db"]')),
      ELEMENT_TIMEOUT_MS,
    );
    await dispatchClick(driver, '[data-node-id="OrderDB::order-db"]');
    await awaitPanelVisible("detail panel did not open after clicking the order-db store unit");

    const icon = (await driver.executeScript(
      "const el = document.querySelector('.node-detail-panel .node-detail-icon');" +
        "return el ? { svg: el.querySelector('svg') !== null, text: (el.textContent || '').trim() } : null;",
    )) as { svg: boolean; text: string } | null;
    assert.ok(icon, "the store panel should have a header icon");
    assert.ok(
      icon.svg || (icon.text !== "" && icon.text !== "■"),
      `store panel should render its own icon, not the "■" fallback; saw: ${JSON.stringify(icon)}`,
    );
  });

  // Issue #2068: the `client WebApp` node's `resource`/`capability`
  // declarations must render the Storage resources / Capabilities
  // sections, matching the app's `NodeDetailPanel` (previously the webview
  // panel omitted both sections entirely).
  it("#2068: detail panel for a client node shows Storage resources and Capabilities sections", async () => {
    await switchToView(ctx, "system");
    await closePanelIfOpen();

    await driver.wait(until.elementLocated(By.css('[data-node-id="WebApp"]')), ELEMENT_TIMEOUT_MS);
    await dispatchClick(driver, '[data-node-id="WebApp"]');
    await awaitPanelVisible("detail panel did not open after clicking WebApp");

    const html = await detailPanelHtml();
    const text = await detailPanelText();

    assert.match(
      text,
      /Storage resources/,
      `panel should show the resources section title; saw: ${text}`,
    );
    assert.match(text, /localStorage/, `panel should list the localStorage resource; saw: ${text}`);
    assert.match(
      text,
      /preferences/,
      `panel should list the "preferences" resource name; saw: ${text}`,
    );
    assert.match(text, /outbox/, `panel should list the "outbox" resource name; saw: ${text}`);

    assert.match(
      text,
      /Capabilities/,
      `panel should show the capabilities section title; saw: ${text}`,
    );
    assert.match(
      text,
      /QR scanning/,
      `panel should show the camera capability's label; saw: ${text}`,
    );
    assert.match(
      html,
      /<p class="node-detail-capability-description">Used to scan QR codes<\/p>/,
      `panel should render the camera capability's description; saw HTML: ${html.slice(0, 600)}`,
    );

    // #2068 code-review fence: the `geolocation` capability has an explicit
    // empty `label ""`. The panel uses `cap.label ?? cap.name` (nullish),
    // matching the app EXACTLY — an empty-string label is kept as a blank
    // title and must NOT fall through to the name. So the capability's
    // description renders while its name "geolocation" never appears as a
    // title. (With the old `||`, "geolocation" would have shown.)
    assert.match(
      html,
      /<p class="node-detail-capability-description">explicit empty label[^<]*<\/p>/,
      `empty-label capability should still render its description; saw HTML: ${html.slice(0, 800)}`,
    );
    assert.doesNotMatch(
      text,
      /geolocation/,
      `empty-label capability must keep a blank title (?? not ||), never showing its name; saw: ${text}`,
    );
  });

  // Issue #2068: `UserService`'s `@deprecated(until: …)` annotation must
  // render the Migration intent section, matching the app's
  // `NodeDetailPanel` (previously the webview panel omitted it entirely).
  it("#2068: detail panel for a deprecated node shows the Migration intent section", async () => {
    await switchToView(ctx, "system");
    await closePanelIfOpen();

    await driver.wait(
      until.elementLocated(By.css('[data-info-button="UserService"]')),
      ELEMENT_TIMEOUT_MS,
    );
    await dispatchClick(driver, '[data-info-button="UserService"]');
    await awaitPanelVisible("detail panel did not open after clicking the UserService ⓘ button");

    const html = await detailPanelHtml();
    const text = await detailPanelText();

    assert.match(
      text,
      /Migration intent/,
      `panel should show the migration section title; saw: ${text}`,
    );
    assert.match(text, /2026-12-31/, `panel should show the "until" raw value; saw: ${text}`);
    assert.match(
      html,
      /data-until-kind="machine"/,
      `panel should tag the "until" row with its interpreted kind; saw HTML: ${html.slice(0, 600)}`,
    );
  });
});
