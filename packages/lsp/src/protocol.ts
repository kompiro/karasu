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
 * `RequestType` is constructed here via `vscode-languageserver/node`'s
 * re-export of `vscode-languageserver-protocol`. `vscode-languageclient`
 * re-exports the very same class from the identical
 * `vscode-languageserver-protocol` install (pnpm dedupes both onto one
 * `3.17.5` instance), so instances built here are structurally — and by
 * `instanceof` — the same `RequestType` the client side expects.
 */
import { RequestType } from "vscode-languageserver/node";
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
