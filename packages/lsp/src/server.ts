import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  RequestType,
  CompletionItem,
  CompletionItemKind,
  Location,
  Hover,
  TextEdit,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Parser, format, FormatError, tidyStyleSheet } from "@karasu-tools/core";
import type { Locale } from "@karasu-tools/i18n";
import { computeDiagnostics } from "./diagnostics.js";
import { resolveLspLocale } from "./locale.js";
import {
  findNodeAtPosition,
  findRangeOfNode,
  collectAllIdentifiers,
  getNodeDescription,
  getWordAtPosition,
} from "./position-resolver.js";
import { buildDocumentSymbols } from "./document-symbols.js";

// ─── Custom LSP request types ─────────────────────────────────────────────────

export const NodeAtPositionRequest = new RequestType<
  { uri: string; position: { line: number; character: number } },
  { nodeId: string | null },
  void
>("karasu/nodeAtPosition");

export const PositionOfNodeRequest = new RequestType<
  { uri: string; nodeId: string },
  {
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    } | null;
  },
  void
>("karasu/positionOfNode");

// ─── Server setup ─────────────────────────────────────────────────────────────

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// The editor's display language, resolved once from the `initialize`
// request. Diagnostics are formatted in this locale; defaults to English
// until `onInitialize` runs.
let locale: Locale = "en";

connection.onInitialize((params: InitializeParams): InitializeResult => {
  locale = resolveLspLocale(params);
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { resolveProvider: false },
      definitionProvider: true,
      hoverProvider: true,
      documentSymbolProvider: true,
      documentFormattingProvider: true,
    },
  };
});

documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

// ─── Formatting ───────────────────────────────────────────────────────────────

connection.onDocumentFormatting((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const src = doc.getText();

  // Route by language: `.krs` uses the source formatter, `.krs.style` uses
  // the Tidy passes from `@karasu-tools/core`. Both are exposed through the
  // same LSP request so VS Code sees a single document-formatting provider
  // (avoiding the "configure default formatter" dialog when more than one
  // is registered).
  let formatted: string;
  if (doc.languageId === "krs-style") {
    formatted = tidyStyleSheet(src).output;
  } else {
    try {
      formatted = format(src);
    } catch (e) {
      if (e instanceof FormatError) return [];
      throw e;
    }
  }

  if (formatted === src) return [];
  const lastLine = doc.lineCount - 1;
  const lastChar = doc.getText().split("\n").at(-1)?.length ?? 0;
  const fullRange: Range = {
    start: { line: 0, character: 0 },
    end: { line: lastLine, character: lastChar },
  };
  return [TextEdit.replace(fullRange, formatted)];
});

documents.onDidClose((event) => {
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

// ─── Custom request handlers ──────────────────────────────────────────────────

connection.onRequest(NodeAtPositionRequest, ({ uri, position }) => {
  const doc = documents.get(uri);
  if (!doc) return { nodeId: null };

  const parseResult = Parser.parse(doc.getText());
  return { nodeId: findNodeAtPosition(parseResult.value, position) };
});

connection.onRequest(PositionOfNodeRequest, ({ uri, nodeId }) => {
  const doc = documents.get(uri);
  if (!doc) return { range: null };

  const parseResult = Parser.parse(doc.getText());
  return { range: findRangeOfNode(parseResult.value, nodeId) };
});

// ─── Completion ───────────────────────────────────────────────────────────────

const KRS_KEYWORDS = [
  "system",
  "service",
  "client",
  "domain",
  "usecase",
  "resource",
  "user",
  "deploy",
  "war",
  "jar",
  "oci",
  "lambda",
  "function",
  "assets",
  "job",
  "artifact",
  "store",
  "organization",
  "member",
  "label",
  "description",
  "team",
  "role",
  "link",
  "runtime",
  "realizes",
  "schedule",
  "image",
  "type",
  "owns",
  "slack",
  "github",
];

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const parseResult = Parser.parse(doc.getText());
  const identifiers = collectAllIdentifiers(parseResult.value);

  const keywordItems: CompletionItem[] = KRS_KEYWORDS.map((kw) => ({
    label: kw,
    kind: CompletionItemKind.Keyword,
  }));

  const seen = new Set<string>();
  const identifierItems: CompletionItem[] = [];
  for (const id of identifiers) {
    if (!seen.has(id)) {
      seen.add(id);
      identifierItems.push({ label: id, kind: CompletionItemKind.Reference });
    }
  }

  return [...keywordItems, ...identifierItems];
});

// ─── Definition ───────────────────────────────────────────────────────────────

connection.onDefinition((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const word = getWordAtPosition(doc.getText(), params.position);
  if (!word) return null;

  const parseResult = Parser.parse(doc.getText());

  // Same-file lookup
  const range = findRangeOfNode(parseResult.value, word);
  if (range) return Location.create(params.textDocument.uri, range);

  // Cross-file lookup: recursively search all imports (named, wildcard, transitive)
  const visited = new Set<string>([fileURLToPath(params.textDocument.uri)]);
  const result = findDefinitionInImports(
    parseResult.value.nodeImports,
    word,
    params.textDocument.uri,
    visited,
  );
  return result;
});

/**
 * Recursively search imported files for a node definition.
 * Handles named imports, wildcard imports (file and directory), and transitive imports.
 */
function findDefinitionInImports(
  nodeImports: ReturnType<typeof Parser.parse>["value"]["nodeImports"],
  word: string,
  baseUri: string,
  visited: Set<string>,
): Location | null {
  for (const imp of nodeImports) {
    if (imp.path === "") continue;

    // Directory import: expand to individual .krs files and search each
    if (imp.path.endsWith("/")) {
      const dirUri = resolveImportUri(baseUri, imp.path);
      const dirPath = fileURLToPath(dirUri);
      let entries: string[];
      try {
        entries = fs
          .readdirSync(dirPath)
          .filter((name) => name.endsWith(".krs"))
          .sort()
          .map((name) => path.join(dirPath, name));
      } catch {
        continue;
      }
      for (const filePath of entries) {
        if (visited.has(filePath)) continue;
        visited.add(filePath);
        let text: string;
        try {
          text = fs.readFileSync(filePath, "utf-8");
        } catch {
          continue;
        }
        let parsed;
        try {
          parsed = Parser.parse(text);
        } catch {
          continue;
        }
        const fileUri = pathToFileURL(filePath).toString();
        const range = findRangeOfNode(parsed.value, word);
        if (range) return Location.create(fileUri, range);
        const nested = findDefinitionInImports(parsed.value.nodeImports, word, fileUri, visited);
        if (nested) return nested;
      }
      continue;
    }

    const isNamed = imp.ids.length > 0;
    // For named imports, only search files that declare the target id.
    // After path-import support (#927) `imp.ids` is `string[][]`; check both
    // bare entries (`["Foo"]`) and the leaf segment of multi-segment paths
    // (`["A", "B", "Foo"]`) — the user can only place a cursor on a single
    // identifier token, so we match against the final segment.
    if (isNamed && !imp.ids.some((segments) => segments[segments.length - 1] === word)) continue;

    const importedUri = resolveImportUri(baseUri, imp.path);
    const importedFilePath = fileURLToPath(importedUri);
    if (visited.has(importedFilePath)) continue;
    visited.add(importedFilePath);

    let importedText: string;
    try {
      importedText = fs.readFileSync(importedFilePath, "utf-8");
    } catch {
      continue;
    }

    let importedParse;
    try {
      importedParse = Parser.parse(importedText);
    } catch {
      continue;
    }
    const importedRange = findRangeOfNode(importedParse.value, word);
    if (importedRange) return Location.create(importedUri, importedRange);

    // Recurse into this file's imports (transitive)
    const nested = findDefinitionInImports(
      importedParse.value.nodeImports,
      word,
      importedUri,
      visited,
    );
    if (nested) return nested;
  }
  return null;
}

// ─── Hover ────────────────────────────────────────────────────────────────────

connection.onHover((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  // Use the identifier under the cursor so that hovering over any reference
  // to a node (e.g. in an edge declaration) shows THAT node's description,
  // not the description of the enclosing (parent) node.
  const word = getWordAtPosition(doc.getText(), params.position);
  if (!word) return null;

  const parseResult = Parser.parse(doc.getText());
  const description = getNodeDescription(parseResult.value, word);
  if (!description) return null;

  return { contents: { kind: "markdown", value: description } } satisfies Hover;
});

// ─── Document Symbols ─────────────────────────────────────────────────────────

connection.onDocumentSymbol((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const parseResult = Parser.parse(doc.getText());
  return buildDocumentSymbols(parseResult.value);
});

// ─── Diagnostics ─────────────────────────────────────────────────────────────

function validateDocument(document: TextDocument): void {
  const diagnostics = computeDiagnostics(
    document.getText(),
    document.languageId === "krs-style",
    locale,
  );
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve a relative import path to a file:// URI. */
function resolveImportUri(documentUri: string, importPath: string): string {
  const documentFilePath = fileURLToPath(documentUri);
  const dir = path.dirname(documentFilePath);
  const resolved = path.resolve(dir, importPath);
  return pathToFileURL(resolved).toString();
}

documents.listen(connection);
connection.listen();
