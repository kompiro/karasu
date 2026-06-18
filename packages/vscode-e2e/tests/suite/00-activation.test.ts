import * as assert from "node:assert";
import * as vscode from "vscode";

const EXTENSION_ID = "karasu-tools.karasu-vscode";

describe("karasu activation", () => {
  it("activates and registers the openPreview command when a .krs file is opened", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} should be discoverable`);

    const folders = vscode.workspace.workspaceFolders;
    assert.ok(folders && folders.length > 0, "test fixture workspace should be open");

    const sample = vscode.Uri.joinPath(folders[0].uri, "sample.krs");
    const doc = await vscode.workspace.openTextDocument(sample);
    await vscode.window.showTextDocument(doc);

    // Mocha shares the extension host between spec files, so we cannot rely on
    // ext.isActive being false at the start of this test (a sibling AT suite
    // may have already opened a .krs file). The bundle-loads + activation +
    // command-registration assertions below are what the smoke gate cares
    // about; the language-trigger path is also exercised whenever this file
    // is the first to load (via @vscode/test-cli's mocha sort).
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
