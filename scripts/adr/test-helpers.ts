import type { AdrConfig } from "./config.ts";

/**
 * Karasu's vocabulary, frozen at the time of the Phase 1 split (Issue #1077).
 * Used by tests that need a config without doing file I/O. The values mirror
 * the karasu-shipped `adr.config.json` at repo root; if those drift, tests
 * relying on `TEST_CONFIG` will keep using the historical karasu values.
 */
export const TEST_CONFIG: AdrConfig = {
  topics: [
    "core-concepts",
    "parser",
    "resolver",
    "renderer",
    "edges",
    "styling",
    "navigation",
    "app-ui",
    "project",
    "chat-ai",
    "cli",
    "vscode",
    "testing",
    "build",
    "adr-tooling",
  ],
  concerns: ["accessibility", "ci", "dependencies", "deployment", "i18n", "performance", "security"],
  paths: {
    adrDir: "docs/adr",
    outputs: {
      effective: "effective.md",
      graph: "graph.md",
      graphByTopic: "graph/",
    },
  },
};
