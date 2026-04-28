import { defineConfig } from "@vscode/test-cli";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  label: "karasu-vscode-smoke",
  files: "out/suite/**/*.test.js",
  workspaceFolder: path.join(here, "fixtures/workspace"),
  extensionDevelopmentPath: path.join(here, "..", "vscode"),
  // Track upstream stable so each weekly VS Code release is exercised by
  // this suite. The CI cache key intentionally does not pin a version, so
  // a fresh download happens whenever the stable channel ships.
  version: "stable",
  mocha: {
    ui: "bdd",
    timeout: 60_000,
    color: true,
    // Sort spec files by name so `00-activation.test.js` (which asserts the
    // extension is inactive at startup) always runs before any AT suite that
    // would have already activated it.
    sort: true,
  },
});
