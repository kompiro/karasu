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
import { Parser } from "@karasu/core";

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

function validateDocument(document: TextDocument): void {
  const text = document.getText();
  const result = Parser.parse(text);

  const diagnostics: Diagnostic[] = result.diagnostics.map((d) => {
    const start = d.loc
      ? { line: d.loc.start.line - 1, character: d.loc.start.column - 1 }
      : { line: 0, character: 0 };
    const end = d.loc
      ? { line: d.loc.end.line - 1, character: d.loc.end.column - 1 }
      : { line: 0, character: 0 };

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
