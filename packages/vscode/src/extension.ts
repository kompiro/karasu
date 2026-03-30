import type * as vscode from "vscode";

export function activate(_context: vscode.ExtensionContext): void {
  // Phase 1: language registration is handled declaratively via package.json contributes.
  // No runtime activation logic required at this phase.
}

export function deactivate(): void {
  // Nothing to clean up at this phase.
}
