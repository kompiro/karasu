import { fileURLToPath } from "url";
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
import { Parser } from "@karasu-tools/core";
import type { Locale } from "@karasu-tools/i18n";
import { computeDiagnostics } from "./diagnostics.js";
import { findDefinitionInImports } from "./definition-imports.js";
import { formatSource } from "./formatting.js";
import { resolveLspLocale } from "./locale.js";
import {
  findNodeAtPosition,
  findRangeOfNode,
  collectAllIdentifiers,
  getNodeDescription,
  getWordAtPosition,
} from "./position-resolver.js";
import { buildDocumentSymbols } from "./document-symbols.js";
import type { LspPosition, LspRange } from "./lsp-position.js";

// The languageId under which the VS Code extension registers `.krs.style`
// documents (see packages/vscode/src/extension.ts). Style docs are routed
// to the style parser/formatter; everything else is treated as `.krs`.
const STYLE_LANGUAGE_ID = "krs-style";

// ─── Custom LSP request types ─────────────────────────────────────────────────

export const NodeAtPositionRequest = new RequestType<
  { uri: string; position: LspPosition },
  { nodeId: string | null },
  void
>("karasu/nodeAtPosition");

export const PositionOfNodeRequest = new RequestType<
  { uri: string; nodeId: string },
  { range: LspRange | null },
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

  // The `.krs` vs `.krs.style` routing decision lives in `formatting.ts`
  // (`formatSource`); this handler only wraps the result in a full-document
  // TextEdit.
  const formatted = formatSource(src, doc.languageId === STYLE_LANGUAGE_ID);
  if (formatted === null) return [];

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
    document.languageId === STYLE_LANGUAGE_ID,
    locale,
  );
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

documents.listen(connection);
connection.listen();
