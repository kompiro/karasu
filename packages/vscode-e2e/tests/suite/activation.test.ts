import * as assert from "node:assert";
import * as vscode from "vscode";

const EXTENSION_ID = "karasu.karasu-vscode";

describe("karasu activation", () => {
  it("activates via onLanguage:krs and registers the openPreview command", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} should be discoverable`);
    assert.strictEqual(
      ext.isActive,
      false,
      "extension should not be active before any .krs file is opened",
    );

    const folders = vscode.workspace.workspaceFolders;
    assert.ok(folders && folders.length > 0, "test fixture workspace should be open");

    const sample = vscode.Uri.joinPath(folders[0].uri, "sample.krs");
    const doc = await vscode.workspace.openTextDocument(sample);
    await vscode.window.showTextDocument(doc);

    // Opening a .krs document should trigger onLanguage:krs activation. Wait for
    // it deterministically rather than racing on internal timers.
    await ext.activate();
    assert.strictEqual(
      ext.isActive,
      true,
      "extension should be active after a .krs document is opened",
    );

    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("karasu.openPreview"),
      "karasu.openPreview command should be registered",
    );
  });
});
