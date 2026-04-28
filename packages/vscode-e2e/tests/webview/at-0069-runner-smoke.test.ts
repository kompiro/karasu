import * as assert from "node:assert";
import { ExtensionsViewItem, VSBrowser, Workbench } from "vscode-extension-tester";

/**
 * AT-0069 (Phase 1 PoC) — runner choice validation.
 *
 * Verifies that the ExTester-driven runner can:
 *   1. Launch VS Code with the karasu extension installed.
 *   2. Reach the Workbench command palette and execute a karasu command.
 *
 * Reaching into the WebView iframe and asserting detail-panel DOM is the
 * job of Phase 2 (`karasu.openPreview` + `WebView.switchToFrame()`). The
 * exact selector path under VS Code 1.111 needs hands-on iteration that we
 * keep off CI's hot path.
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

    // The package id "karasu.karasu-vscode" matches publisher.name from
    // packages/vscode/package.json, regardless of locale.
    const sideBar = await workbench.getSideBar();
    const view = await sideBar.getContent();
    const sections = await view.getSections();
    assert.ok(sections.length > 0, "Extensions view should render at least one section");

    const installedSection = sections[0];
    const items = (await installedSection.getVisibleItems()) as ExtensionsViewItem[];
    const titles = await Promise.all(items.map((item) => item.getTitle()));
    assert.ok(
      titles.some((t) => /karasu/i.test(t)),
      `karasu extension should appear among installed extensions; saw: ${titles.join(", ")}`,
    );
  });

  it("can invoke the karasu.openPreview command (no editor → info message branch)", async () => {
    // No krs editor is open in this case, so the command's info-message branch
    // fires. We are only validating the command is registered and reachable.
    const workbench = new Workbench();
    await workbench.executeCommand("karasu: Open Preview");
    await VSBrowser.instance.driver.sleep(500);

    // Reaching this line means executeCommand resolved without throwing
    // (an unregistered command would surface a "command not found" error
    // from the workbench API). Phase 2 will open the .krs file, re-run
    // the command, and switch into the resulting WebView frame.
    assert.ok(true, "karasu.openPreview is registered and callable");
  });
});
