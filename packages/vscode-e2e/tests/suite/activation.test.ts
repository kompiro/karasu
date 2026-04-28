import * as assert from "node:assert";
import * as vscode from "vscode";

const EXTENSION_ID = "karasu.karasu-vscode";

describe("karasu activation", () => {
  it("activates and registers the openPreview command when a .krs file is opened", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} should be discoverable`);

    const folders = vscode.workspace.workspaceFolders;
    assert.ok(folders && folders.length > 0, "test fixture workspace should be open");

    const sample = vscode.Uri.joinPath(folders[0].uri, "sample.krs");
    const doc = await vscode.workspace.openTextDocument(sample);
    await vscode.window.showTextDocument(doc);

    await ext.activate();
    assert.strictEqual(ext.isActive, true, "extension should be active after activate()");

    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("karasu.openPreview"),
      "karasu.openPreview command should be registered",
    );
  });
});
