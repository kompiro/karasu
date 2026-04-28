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

/**
 * Locate the single occurrence of `name` (matched as a whole word) inside
 * the document and return a `Position` pointing at its first character.
 *
 * Throws if the identifier appears zero times or more than once. Tests use
 * this instead of a raw `text.indexOf(name)` so that an unrelated edit to
 * the fixture (a comment, a renamed sibling node) cannot silently change
 * which occurrence the test targets.
 */
export function findUniqueIdentifier(doc: vscode.TextDocument, name: string): vscode.Position {
  const pattern = new RegExp(`\\b${escapeForRegExp(name)}\\b`, "g");
  const matches: { line: number; character: number }[] = [];
  for (let line = 0; line < doc.lineCount; line++) {
    const text = doc.lineAt(line).text;
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      matches.push({ line, character: m.index });
    }
  }
  if (matches.length === 0) {
    throw new Error(`identifier '${name}' not found in ${doc.uri.fsPath}`);
  }
  if (matches.length > 1) {
    const where = matches.map((p) => `${p.line + 1}:${p.character + 1}`).join(", ");
    throw new Error(
      `identifier '${name}' is not unique in ${doc.uri.fsPath} (found at ${where}); ` +
        `use a fixture with a single occurrence`,
    );
  }
  return new vscode.Position(matches[0].line, matches[0].character);
}

/**
 * Locate `name` (whole-word) on the unique line that matches `lineMatcher`.
 *
 * Use this when the identifier appears multiple times in the fixture (e.g.
 * a declaration plus an edge reference) and the test specifically targets
 * the reference. The matcher must select exactly one line; both that
 * uniqueness and the identifier's uniqueness on the matched line are
 * checked so a fixture edit cannot silently retarget the cursor.
 */
export function findIdentifierOnLine(
  doc: vscode.TextDocument,
  lineMatcher: RegExp | string,
  name: string,
): vscode.Position {
  const predicate =
    typeof lineMatcher === "string"
      ? (text: string) => text.includes(lineMatcher)
      : (text: string) => lineMatcher.test(text);

  const candidates: number[] = [];
  for (let line = 0; line < doc.lineCount; line++) {
    if (predicate(doc.lineAt(line).text)) candidates.push(line);
  }
  if (candidates.length === 0) {
    throw new Error(`no line in ${doc.uri.fsPath} matches ${lineMatcher.toString()}`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `lineMatcher ${lineMatcher.toString()} is not unique in ${doc.uri.fsPath} ` +
        `(matched lines ${candidates.map((l) => l + 1).join(", ")})`,
    );
  }
  const line = candidates[0];
  const lineText = doc.lineAt(line).text;
  const pattern = new RegExp(`\\b${escapeForRegExp(name)}\\b`, "g");
  const matches: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(lineText)) !== null) {
    matches.push(m.index);
  }
  if (matches.length === 0) {
    throw new Error(`identifier '${name}' not found on line ${line + 1} of ${doc.uri.fsPath}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `identifier '${name}' appears ${matches.length} times on line ${line + 1}; ` +
        `narrow lineMatcher or rewrite the fixture`,
    );
  }
  return new vscode.Position(line, matches[0]);
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
