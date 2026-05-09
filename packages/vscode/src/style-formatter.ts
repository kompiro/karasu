import * as vscode from "vscode";
import { tidyStyleSheet } from "@karasu-tools/core";

/**
 * `DocumentFormattingEditProvider` for `.krs.style` files. Runs the
 * shared `tidyStyleSheet` core (the same code path the CLI subcommand
 * and the App toolbar button use) and produces a single full-document
 * replacement edit when the result differs from the buffer.
 */
export const styleFormattingProvider: vscode.DocumentFormattingEditProvider = {
  provideDocumentFormattingEdits(document) {
    const input = document.getText();
    const result = tidyStyleSheet(input);
    if (!result.changed) return [];

    const lastLine = document.lineCount - 1;
    const fullRange = new vscode.Range(
      new vscode.Position(0, 0),
      document.lineAt(lastLine).range.end,
    );
    return [vscode.TextEdit.replace(fullRange, result.output)];
  },
};
