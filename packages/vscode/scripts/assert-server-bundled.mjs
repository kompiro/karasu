/* eslint-disable no-console -- build assertion script; stderr reporting is the whole job */
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Fails the vscode build if `out/server.js` (the bundled LSP server) is missing
// or empty. extension.ts falls back to `../lsp/out/server.js` in the dev tree,
// so a broken bundling step (a removed/edited `cpSync` line in package.json)
// stays invisible locally and would only surface once someone installs the
// .vsix. See Issue #1272 and TPL-20260510-15 (dev vs packaged mode parity).

const serverPath = fileURLToPath(new URL("../out/server.js", import.meta.url));

let size;
try {
  size = statSync(serverPath).size;
} catch {
  console.error(
    `[vscode build] ${serverPath} is missing.\n` +
      "The build script must copy the bundled LSP server into out/server.js " +
      "(the `cpSync('../lsp/out/server.js', 'out/server.js')` step in package.json).\n" +
      "Without it the installed .vsix cannot start the language server.",
  );
  process.exit(1);
}

if (size === 0) {
  console.error(`[vscode build] ${serverPath} is empty — the bundled LSP server is broken.`);
  process.exit(1);
}
