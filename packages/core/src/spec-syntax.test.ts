/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Parser } from "./parser/parser.js";

// Spec-vs-implementation agreement smoke test. The human-facing syntax
// reference (`docs/spec/syntax.md`) embeds `.krs` examples in fenced code
// blocks tagged `krs`. If the spec documents a syntax the parser does not
// accept (or the spec is updated for a syntax that has not landed yet),
// the examples here will fail to parse — surfacing the drift that
// TPL-20260510-12 checklist item 5 calls out.
//
// Only fences explicitly tagged `krs` are extracted. Bare ``` fences are
// often pseudo-grammar productions (`<kind> <id> [<tags>] ...`) or
// non-krs syntax (form templates, etc.) and would not parse as written.
// Authors who want a real example covered by this test should tag the
// fence with `krs`.

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(__dirname, "../../../docs/spec/syntax.md");

interface FencedBlock {
  startLine: number; // 1-based line number of the opening fence
  body: string;
}

function extractKrsBlocks(markdown: string): FencedBlock[] {
  const lines = markdown.split("\n");
  const blocks: FencedBlock[] = [];
  let inside: { startLine: number; bodyLines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inside) {
      if (/^```\s*$/.test(line)) {
        blocks.push({ startLine: inside.startLine, body: inside.bodyLines.join("\n") });
        inside = null;
      } else {
        inside.bodyLines.push(line);
      }
      continue;
    }
    // Opening fence — only pick up `krs` (not `krs.style`, not other langs).
    if (/^```krs\s*$/.test(line)) {
      inside = { startLine: i + 1, bodyLines: [] };
    }
  }
  return blocks;
}

const markdown = readFileSync(specPath, "utf8");
const blocks = extractKrsBlocks(markdown);

describe("docs/spec/syntax.md ↔ parser agreement (TPL-20260510-12 item 5)", () => {
  it("contains at least one `krs` code block to validate", () => {
    expect(blocks.length).toBeGreaterThan(0);
  });

  it.each(blocks.map((b) => [`line ${b.startLine}`, b] as const))(
    "%s: parses without errors",
    (_label, block) => {
      // First try the snippet standalone — many spec examples are complete
      // files with a top-level `system`. If that fails, retry the snippet
      // wrapped in a minimal `system` so fragment-style examples (a bare
      // edge, a few `service`s without a containing system) still validate.
      // A failing parse only counts as a failure if *both* shapes fail.
      const standalone = Parser.parse(block.body);
      const standaloneErrors = standalone.diagnostics.filter((d) => d.severity === "error");
      const wrapped =
        standaloneErrors.length > 0
          ? Parser.parse(`system __Spec__ {\n${block.body}\n}\n`)
          : standalone;
      const wrappedErrors = wrapped.diagnostics.filter((d) => d.severity === "error");

      // The block must parse either standalone or wrapped in a minimal
      // `system`. Encode the location alongside the error codes so that
      // the diff vitest prints on failure tells the spec author exactly
      // which fence drifted, without re-counting line numbers.
      expect({
        block: `syntax.md:${block.startLine}`,
        errors: wrappedErrors.map((e) => e.code),
      }).toEqual({
        block: `syntax.md:${block.startLine}`,
        errors: [],
      });
    },
  );
});
