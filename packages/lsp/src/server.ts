import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  Diagnostic,
  DiagnosticSeverity,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Parser, StyleParser } from "@karasu/core";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    },
  };
});

documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

documents.onDidClose((event) => {
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

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

documents.listen(connection);
connection.listen();
