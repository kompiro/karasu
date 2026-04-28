import * as path from "node:path";
import * as vscode from "vscode";

const EXTENSION_ID = "karasu.karasu-vscode";
const POLL_INTERVAL_MS = 50;
const DEFAULT_TIMEOUT_MS = 15_000;

export function fixtureUri(relative: string): vscode.Uri {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) throw new Error("workspace not open");
  return vscode.Uri.file(path.join(folders[0].uri.fsPath, relative));
}

export async function openFixture(relative: string): Promise<vscode.TextDocument> {
  const uri = fixtureUri(relative);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
  return doc;
}

/**
 * The language client starts asynchronously on activation. The first LSP
 * request dispatched while the client is still spinning up will reject (or
 * return null). Poll a cheap LSP-backed command until it responds with a
 * non-null payload, so subsequent assertions can run deterministically.
 */
export async function waitForLspReady(
  uri: vscode.Uri,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  if (ext && !ext.isActive) await ext.activate();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        "vscode.executeDocumentSymbolProvider",
        uri,
      );
      if (Array.isArray(symbols)) return;
    } catch {
      // Server not ready yet — keep polling.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`LSP did not become ready for ${uri.toString()} within ${timeoutMs}ms`);
}

export async function waitForDiagnostics(
  uri: vscode.Uri,
  predicate: (diags: readonly vscode.Diagnostic[]) => boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<readonly vscode.Diagnostic[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const diags = vscode.languages.getDiagnostics(uri);
    if (predicate(diags)) return diags;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`diagnostics predicate did not pass for ${uri.toString()} within ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
