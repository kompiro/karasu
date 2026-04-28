import { defineConfig } from "@vscode/test-cli";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  label: "karasu-vscode-smoke",
  files: "out/suite/**/*.test.js",
  workspaceFolder: path.join(here, "fixtures/workspace"),
  extensionDevelopmentPath: path.join(here, "..", "vscode"),
  // Pin to a known-good VS Code version so CI cache hits don't mask
  // breakage in upstream stable. Bump intentionally when validating a new release.
  version: "1.117.0",
  mocha: {
    ui: "bdd",
    timeout: 60_000,
    color: true,
  },
});
