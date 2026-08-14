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
 * `RequestType` from `vscode-languageserver-protocol`, which pnpm dedupes into
 * a single copy in the extension's dependency tree.
 *
 * That single copy is load-bearing, and is guarded by
 * `packages/vscode/src/protocol-request-identity.test.ts`. Request DISPATCH
 * matches on the method-NAME string, so the receiving end does not care who
 * built the type — but SENDING does: `RequestType.parameterStructures` holds a
 * singleton defined at `vscode-jsonrpc` module scope, and `sendRequest` picks
 * the parameter encoding with a `switch` on reference equality against it. If
 * this module and `vscode-languageclient` ever load two different copies, every
 * `karasu/*` request throws `Unknown parameter structure auto` before reaching
 * the wire, while standard LSP requests keep working. That is the whole of the
 * "LSP 3.17/3.18 position drift" — see ADR-2456 and Issue #2456.
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
