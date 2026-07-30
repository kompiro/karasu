import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { KRS_LANGUAGE_VERSION } from "./language-version.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Drift guard between the code constant and the spec docs (ADR-2124,
// TPL-20260511-02): both spec references state the language version as the
// canonical token `.krs language v<version>` (roadmap §version vocabulary).
// If the language version ever moves, the constant and all four docs must
// move in the same PR — this test fails on any partial update.
const SPEC_DOCS = [
  "../../../docs/spec/syntax.md",
  "../../../docs/spec/syntax.ja.md",
  "../../../docs/spec/style.md",
  "../../../docs/spec/style.ja.md",
];

describe("KRS_LANGUAGE_VERSION", () => {
  it("is a major.minor version", () => {
    expect(KRS_LANGUAGE_VERSION).toMatch(/^\d+\.\d+$/);
  });

  it.each(SPEC_DOCS)("%s states the canonical language-version token", (rel) => {
    const doc = readFileSync(resolve(__dirname, rel), "utf8");
    expect(doc).toContain(`.krs language v${KRS_LANGUAGE_VERSION}`);
  });

  // "Stale" means *older than* the shipped version — a doc still describing a
  // language the tool has moved past. A token naming a **higher** version is
  // forward-looking prose, not drift: the spec routinely registers a change to
  // the next major (`Promotion to an error is registered to .krs language
  // v2.0`, roadmap §Syntax 2.0), and flagging those would force the roadmap
  // out of the spec.
  const asNumber = (version: string): number => {
    const [major, minor] = version.split(".").map(Number);
    return major * 1000 + minor;
  };

  it.each(SPEC_DOCS)("%s does not state a stale language version", (rel) => {
    const doc = readFileSync(resolve(__dirname, rel), "utf8");
    const stale = [...doc.matchAll(/\.krs language v(\d+\.\d+)/g)]
      .map((m) => m[1])
      .filter((v) => asNumber(v) < asNumber(KRS_LANGUAGE_VERSION));

    expect(stale).toEqual([]);
  });
});
