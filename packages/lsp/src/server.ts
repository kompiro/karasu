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
  Diagnostic,
  DiagnosticSeverity,
  RequestType,
  CompletionItem,
  CompletionItemKind,
  Location,
  Hover,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Parser, StyleParser } from "@karasu/core";
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

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { resolveProvider: false },
      definitionProvider: true,
      hoverProvider: true,
      documentSymbolProvider: true,
    },
  };
});

documents.onDidChangeContent((change) => {
  validateDocument(change.document);
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

  // Cross-file lookup via @import declarations
  for (const imp of parseResult.value.nodeImports) {
    if (imp.ids.includes(word)) {
      const importedUri = resolveImportUri(params.textDocument.uri, imp.path);
      try {
        const importedText = fs.readFileSync(fileURLToPath(importedUri), "utf-8");
        const importedParse = Parser.parse(importedText);
        const importedRange = findRangeOfNode(importedParse.value, word);
        if (importedRange) return Location.create(importedUri, importedRange);
      } catch {
        // File unreadable — skip
      }
    }
  }

  return null;
});

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

function toLspPosition(line: number, column: number) {
  // Core positions are 1-based; LSP positions are 0-based.
  // Clamp to 0 to guard against synthetic EOF tokens (line: 0, column: 0).
  return {
    line: Math.max(0, line - 1),
    character: Math.max(0, column - 1),
  };
}

function validateDocument(document: TextDocument): void {
  const text = document.getText();
  const parseResult =
    document.languageId === "krs-style" ? StyleParser.parse(text) : Parser.parse(text);

  const diagnostics: Diagnostic[] = parseResult.diagnostics.map((d) => {
    const start = d.loc
      ? toLspPosition(d.loc.start.line, d.loc.start.column)
      : { line: 0, character: 0 };
    const end = d.loc ? toLspPosition(d.loc.end.line, d.loc.end.column) : { line: 0, character: 0 };

    return {
      severity: d.severity === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
      range: { start, end },
      message: d.message,
      source: "karasu",
    };
  });

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
