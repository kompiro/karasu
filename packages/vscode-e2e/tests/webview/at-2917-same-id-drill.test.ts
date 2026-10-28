import * as assert from "node:assert";
import { EditorView, type WebDriver } from "vscode-extension-tester";
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
} from "./harness";

/**
 * AT-2917 (WebView E2E): the multi-system root draws both same-named
 * services, and a click lands on the card that was clicked.
 *
 * Two systems both declare `service Api`. The root canvas carries two
 * `data-node-id="Api"` cards, one per system frame, each with its own
 * `data-node-path`. The viewer (the app's, since #3312) drills by that path
 * and reads the detail panel through the path-keyed metadata map, so:
 *   AT-N-1: the root shows two `Api` cards with distinct `data-node-path`.
 *   AT-N-2: clicking the `Admin.Api` card drills into Admin (breadcrumb
 *           "Admin › Api", Admin's domain drawn, Shop's not).
 *   AT-N-3: clicking Admin's leaf `Ops` opens the panel with Admin's
 *           description, not Shop's same-named leaf's.
 *
 * Selectors address a card by `data-node-path` (TPL-2920): `[data-node-id="Api"]`
 * matches two elements on purpose. The drill happens in place; a settle
 * after the click gives the viewer's compile time to draw. The
 * "File: Open File..." simple-dialog stalls intermittently under xvfb; the
 * shared `openFixtureAndPreview` carries the 3-attempt retry.
 */

const FIXTURE_NAME = "at-2917.krs";

// Settle after the drill click for the viewer's debounced compile (300ms),
// with room to spare on a slow CI runner.
const DRILL_REACQUIRE_SLEEP_MS = 1500;

describe("AT-2917 (WebView) — same-id cards drill and describe their own node", function () {
  this.timeout(SUITE_TIMEOUT_MS);

  let ctx: FrameContext;
  let driver: WebDriver;

  before(async () => {
    ctx = await openFixtureAndPreview({
      envVar: "KARASU_E2E_FIXTURE_KRS_AT2917",
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

  it("AT-N-1: the root draws two Api cards, each with its own data-node-path", async () => {
    const paths = (await driver.executeScript(
      "return Array.from(document.querySelectorAll('.preview-container [data-node-id=\"Api\"]'))" +
        ".map(el => el.getAttribute('data-node-path')).sort();",
    )) as string[];
    assert.deepStrictEqual(
      paths,
      ["Admin.Api", "Shop.Api"],
      `expected one Api card per system frame; saw data-node-path values ${JSON.stringify(paths)}`,
    );
  });

  it("AT-N-3: clicking Admin's leaf opens the panel with Admin's description", async () => {
    await dispatchClick(driver, '.preview-container [data-node-path="Admin.Ops"]');

    let lastBody = "";
    try {
      await driver.wait(
        async () => {
          lastBody = (await driver.executeScript(
            "const p = document.querySelector('.node-detail-panel'); return p ? p.textContent : '';",
          )) as string;
          return lastBody.includes("Admin operations");
        },
        ELEMENT_TIMEOUT_MS,
        "detail panel did not show Admin's description",
      );
    } catch (err) {
      throw new Error(
        `detail panel did not show Admin's description; last body: "${lastBody}". Original: ${(err as Error).message}`,
        { cause: err },
      );
    }
    assert.ok(
      !lastBody.includes("Shop operations"),
      `detail panel should not show Shop's same-named leaf; saw: ${lastBody}`,
    );
    // Close the panel so the drill test below starts from a clean root.
    await dispatchClick(driver, ".node-detail-panel .node-detail-close");
  });

  it("AT-N-2: clicking the Admin.Api card drills into Admin, not into Shop", async () => {
    await dispatchClick(driver, '.preview-container [data-node-path="Admin.Api"]');

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
        "breadcrumb did not advance past the root after the drill click",
      );
    } catch (err) {
      throw new Error(
        `breadcrumb did not advance past the root after the drill click; last seen: "${lastBreadcrumb}". Original: ${(err as Error).message}`,
        { cause: err },
      );
    }
    const segments = breadcrumbSegments(lastBreadcrumb);
    assert.ok(
      segments.includes("Admin") && !segments.includes("Shop"),
      `expected the drill path to run through Admin; breadcrumb was "${lastBreadcrumb}"`,
    );

    const drawn = (await driver.executeScript(
      "return Array.from(document.querySelectorAll('.preview-container [data-node-id]'))" +
        ".map(el => el.getAttribute('data-node-id'));",
    )) as string[];
    assert.ok(
      drawn.includes("Users"),
      `Admin's domain should be drawn; saw ${JSON.stringify(drawn)}`,
    );
    assert.ok(
      !drawn.includes("Orders"),
      `Shop's domain should not be drawn after drilling into Admin; saw ${JSON.stringify(drawn)}`,
    );
  });
});
