import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NodeAtPositionRequest, PositionOfNodeRequest } from "@karasu-tools/lsp/protocol";

// Guards the single invariant that made the LSP 3.17/3.18 "position drift"
// (Issue #2456, ADR-2456) possible: `@karasu-tools/lsp/protocol` and
// `vscode-languageclient` must load the SAME copy of
// `vscode-languageserver-protocol` (and therefore of `vscode-jsonrpc`).
//
// `RequestType` carries a `parameterStructures` field holding one of three
// singletons defined at `vscode-jsonrpc` module scope. `sendRequest` selects
// the encoding with a `switch` on REFERENCE equality against those singletons,
// so a `RequestType` built by a second copy falls through to the default arm
// and throws `Unknown parameter structure auto` before the request is ever
// written to the wire. Every `karasu/*` request dies; every standard LSP
// request keeps working, because those types come from the client's own copy.
//
// The failure surfaces only in ExTester (AT-0037-9 / AT-0038 TC-04 /
// AT-0039 TC-03), which needs a real VS Code and does not run on aarch64.
// This test reproduces the same predicate from module resolution alone, so a
// duplicate is caught by `pnpm test` instead of by an E2E job with an error
// message that points nowhere near the cause. See TPL-2456.

const require = createRequire(import.meta.url);

/** `vscode-languageserver-protocol` as the LanguageClient runtime sees it. */
const clientProtocolPath = createRequire(require.resolve("vscode-languageclient")).resolve(
  "vscode-languageserver-protocol",
);

/** ...and as `packages/lsp/src/protocol.ts` sees it when building RequestTypes. */
const lspProtocolPath = createRequire(
  fileURLToPath(new URL("../../lsp/package.json", import.meta.url)),
).resolve("vscode-languageserver-protocol");

const { ParameterStructures } = require(clientProtocolPath) as {
  ParameterStructures: { is(value: unknown): boolean };
};

// Failures are reported as a string rather than a boolean so the remedy
// travels with the diff: a bare `expected true, got false` says nothing about
// which two copies are installed or what to do about it.
const duplicateHint =
  "NOT ENCODABLE — two copies of vscode-languageserver-protocol are installed, " +
  "so every karasu/* request throws `Unknown parameter structure auto` before " +
  "it is sent. Move vscode-languageclient / vscode-languageserver / " +
  "vscode-languageserver-protocol together (the `lsp` group in " +
  `.github/dependabot.yml). client: ${clientProtocolPath} / ` +
  `lsp: ${lspProtocolPath}`;

describe("custom LSP RequestType identity", () => {
  it("resolves the protocol package to one copy across the client/server boundary", () => {
    expect(lspProtocolPath).toBe(clientProtocolPath);
  });

  it.each([
    ["karasu/positionOfNode", PositionOfNodeRequest],
    ["karasu/nodeAtPosition", NodeAtPositionRequest],
  ])("%s is encodable by the copy of vscode-jsonrpc the client sends through", (_method, type) => {
    // The exact check `computeSingleParam` performs, minus the throw.
    const verdict = ParameterStructures.is(type.parameterStructures) ? "encodable" : duplicateHint;
    expect(verdict).toBe("encodable");
  });
});
