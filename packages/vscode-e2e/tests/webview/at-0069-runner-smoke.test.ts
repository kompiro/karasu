import * as assert from "node:assert";
import { ExtensionsViewItem, VSBrowser, Workbench } from "vscode-extension-tester";

/**
 * AT-0069 (Phase 1 PoC) — runner choice validation.
 *
 * Verifies that the ExTester-driven runner can launch VS Code with the
 * karasu extension installed and that the extension surfaces under its
 * publisher-qualified id (`karasu.karasu-vscode`).
 *
 * Reaching into the WebView iframe and asserting detail-panel DOM is the
 * job of Phase 2 (`karasu.openPreview` + `WebView.switchToFrame()`). The
 * exact selector path under VS Code 1.111 needs hands-on iteration that we
 * keep off CI's hot path. Command-registration coverage stays in
 * `packages/vscode-e2e/tests/suite/00-activation.test.ts` (smoke runner) —
 * duplicating it here would bring no extra signal.
 *
 * Phase 1 success criterion (per `docs/design/vscode-webview-e2e-harness.md`):
 * the runner choice (vscode-extension-tester) is wired correctly and the
 * extension is recognised by VS Code.
 */

describe("AT-0069 (WebView E2E Phase 1) — runner smoke", function () {
  this.timeout(180_000);

  it("launches VS Code with the karasu extension installed", async () => {
    const driver = VSBrowser.instance.driver;

    // Open the Extensions view so the package metadata is observable.
    const workbench = new Workbench();
    await workbench.executeCommand("Extensions: Show Installed Extensions");
    await driver.sleep(1500);

    const sideBar = await workbench.getSideBar();
    const view = await sideBar.getContent();
    const sections = await view.getSections();
    assert.ok(sections.length > 0, "Extensions view should render at least one section");

    const installedSection = sections[0];
    const items = (await installedSection.getVisibleItems()) as ExtensionsViewItem[];
    // Match on (displayName, publisher) from packages/vscode/package.json.
    // Both must be exact "karasu" — testing against substring would falsely
    // accept a hypothetical sibling like "karasu-style" if it ever ships.
    const entries = await Promise.all(
      items.map(async (item) => ({
        title: await item.getTitle(),
        author: await item.getAuthor(),
      })),
    );
    assert.ok(
      entries.some((e) => e.title === "karasu" && e.author === "karasu"),
      `extension karasu (publisher: karasu) should appear among installed extensions; saw: ${entries
        .map((e) => `${e.author}/${e.title}`)
        .join(", ")}`,
    );
  });
});
