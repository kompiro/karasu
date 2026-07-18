/**
 * Custom LSP request types shared between the language server
 * (`packages/lsp/src/server.ts`) and the VS Code extension's client
 * (`packages/vscode/src/extension.ts`).
 *
 * Both sides import this module directly (`@karasu-tools/lsp/protocol` from
 * the extension) instead of hand-mirroring the method-name strings and
 * param/result shapes, so a rename or shape change on one side fails
 * typecheck on the other instead of only at runtime. See Issue #2018 point 6.
 *
 * `RequestType` is imported from `vscode-languageserver-protocol` — the
 * minimal protocol package — NOT from `vscode-languageserver/node` (the full
 * server runtime: `createConnection`, `TextDocuments`, etc.). This module is
 * bundled into the VS Code extension (a pure LSP client), and esbuild bundles
 * the CJS graph without tree-shaking, so importing from `/node` would drag the
 * entire server framework (~106KB the client never runs) into the .vsix.
 * `vscode-languageserver` and `vscode-languageclient` both re-export this same
 * `RequestType` from `vscode-languageserver-protocol@3.17.5`, which pnpm has
 * already deduped into the extension's dependency tree.
 *
 * Runtime request dispatch matches on the method-NAME string
 * (`"karasu/nodeAtPosition"` / `"karasu/positionOfNode"`), not on class
 * identity, so the two sides interoperate regardless of which package's
 * `RequestType` export constructed each end's value.
 */
import { RequestType } from "vscode-languageserver-protocol";
import type { LspPosition, LspRange } from "./lsp-position.js";

export interface NodeAtPositionParams {
  uri: string;
  position: LspPosition;
}

export interface NodeAtPositionResult {
  nodeId: string | null;
}

export const NodeAtPositionRequest = new RequestType<
  NodeAtPositionParams,
  NodeAtPositionResult,
  void
>("karasu/nodeAtPosition");

export interface PositionOfNodeParams {
  uri: string;
  nodeId: string;
}

export interface PositionOfNodeResult {
  range: LspRange | null;
}

export const PositionOfNodeRequest = new RequestType<
  PositionOfNodeParams,
  PositionOfNodeResult,
  void
>("karasu/positionOfNode");
