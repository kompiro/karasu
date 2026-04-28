import * as assert from "node:assert";
import * as path from "node:path";
import { EditorView, VSBrowser, WebView, Workbench } from "vscode-extension-tester";

/**
 * AT-0039 TC-01 (WebView E2E — Phase 1 PoC).
 *
 * Verifies that the karasu Open Preview command opens the WebView and that
 * the rendered SVG contains the seeded service node. Clicking a leaf node
 * to surface the detail panel is the next-step migration; this PoC stops at
 * "WebView is reachable from the harness" so the runner choice can be
 * validated independently of detail-panel selectors.
 *
 * See `docs/design/vscode-webview-e2e-harness.md` § Phase 1.
 */

const FIXTURE_KRS = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "fixtures",
  "webview-workspace",
  "at-0039.krs",
);

describe("AT-0039 (WebView) — preview is reachable from ExTester", function () {
  this.timeout(240_000);

  before(async () => {
    // The runner launched VS Code with the fixture workspace folder open,
    // so the .krs file is reachable through the workbench. Open it via the
    // file path to make the editor active before triggering the preview
    // command (Workbench.openResources handles workspace-relative paths but
    // is finicky on first boot; the absolute path keeps the smoke check
    // stable on CI).
    await VSBrowser.instance.openResources(FIXTURE_KRS);
    // Settle the workbench before the preview command runs — the activity
    // bar / editor instance can take a beat to mount on first boot.
    await VSBrowser.instance.driver.sleep(2000);
  });

  it("opens the karasu preview WebView and renders the seeded service node", async () => {
    const workbench = new Workbench();
    await workbench.executeCommand("karasu: Open Preview");
    // WebView panels render asynchronously after the command resolves.
    await VSBrowser.instance.driver.sleep(2000);

    // Switch focus into the WebView iframe — ExTester resolves the active
    // WebViewPanel in the editor area.
    const webview = new WebView();
    await webview.switchToFrame();

    try {
      // The renderer emits service node text inside the SVG. Fall back to a
      // raw HTML check because the rendered structure (SVG <text> elements)
      // is not always wrapped in a stable selectable node tree.
      const html = await webview
        .getDriver()
        .executeScript<string>("return document.body.innerHTML;");
      assert.match(
        html,
        /OrderService/,
        "WebView should render the seeded OrderService node label",
      );
    } finally {
      await webview.switchBack();
    }
  });

  after(async () => {
    await new EditorView().closeAllEditors();
  });
});
