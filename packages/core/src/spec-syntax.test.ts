/// <reference types="node" />
// Spec-doc smoke test for TPL-20260510-12 (AST / parser / renderer agreement)
// checklist item 5 — G12-2 (#1234).
//
// `packages/core/src/examples.test.ts` and `builtins/reference.test.ts` cover
// `.krs` files on disk and the in-code sample respectively. This test covers
// the third channel that TPL-12 names: the human-facing syntax reference at
// `docs/spec/syntax.md` (and `docs/spec/style.md` for `.krs.style`). Fenced
// snippets there drift silently from the parser unless something parses them.
//
// Scope: only fences explicitly tagged `krs` or `krs.style`. Untagged blocks
// are documentation prose (file layouts, command examples, etc.) and are
// intentionally not parsed.
//
// Fragment handling: spec snippets are sometimes fragments (e.g. service
// declarations or edges that the parser only accepts inside a `system { ... }`
// block). For `krs` blocks the test parses the snippet standalone; if that
// errors, it retries the snippet wrapped in a minimal `system __SpecSmoke {
// ... }` shell and accepts that result. The block only fails if both attempts
// produce parse errors.
//
// Negative-snippet escape hatch: a fence preceded by an HTML comment of the
// form `<!-- expect-error -->` (on the nearest non-blank line above the
// opening ```) is required to produce a parse error in *both* attempts. This
// lets the spec carry counter-examples without breaking the smoke test.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Parser } from "./parser/parser.js";
import { StyleParser } from "./parser/style-parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

interface SpecBlock {
  doc: string;
  lang: "krs" | "krs.style";
  expectError: boolean;
  // 1-based line number of the opening fence — useful for error messages so a
  // failure points back at the source location instead of the extracted block.
  startLine: number;
  body: string;
}

function extractBlocks(doc: string, content: string): SpecBlock[] {
  const blocks: SpecBlock[] = [];
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(/^```(krs(?:\.style)?)\s*$/);
    if (!fenceMatch) {
      i++;
      continue;
    }
    const lang = fenceMatch[1] as "krs" | "krs.style";
    const startLine = i + 1;
    // Look upward, skipping blank lines, for an HTML comment marker.
    let expectError = false;
    for (let j = i - 1; j >= 0; j--) {
      const probe = lines[j].trim();
      if (probe === "") continue;
      if (probe.includes("<!-- expect-error -->")) expectError = true;
      break;
    }
    const bodyLines: string[] = [];
    i++;
    while (i < lines.length && lines[i] !== "```") {
      bodyLines.push(lines[i]);
      i++;
    }
    blocks.push({ doc, lang, expectError, startLine, body: bodyLines.join("\n") });
    i++;
  }
  return blocks;
}

function readSpec(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf8");
}

const SPEC_DOCS = ["docs/spec/syntax.md", "docs/spec/style.md"] as const;

const ALL_BLOCKS: SpecBlock[] = SPEC_DOCS.flatMap((doc) => extractBlocks(doc, readSpec(doc)));

function krsErrors(source: string): string[] {
  const result = Parser.parse(source);
  return result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

interface AttemptResult {
  attempt: "standalone" | "wrapped";
  errors: string[];
}

function attemptParseKrs(body: string): AttemptResult {
  const standalone = krsErrors(body);
  if (standalone.length === 0) return { attempt: "standalone", errors: [] };
  // Indent each line by two spaces so block-level fragments (services, edges)
  // become valid inside `system { ... }`. Top-level system snippets continue
  // to parse cleanly even when nested — `system A { system B { ... } }` is
  // accepted; the wrapper system only fails the standalone path when the
  // snippet relies on being top-level.
  const indented = body.replace(/^/gm, "  ");
  const wrapped = `system __SpecSmoke {\n${indented}\n}`;
  return { attempt: "wrapped", errors: krsErrors(wrapped) };
}

function parseBlock(block: SpecBlock): AttemptResult {
  if (block.lang === "krs") return attemptParseKrs(block.body);
  const result = StyleParser.parse(block.body, block.doc);
  return {
    attempt: "standalone",
    errors: result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
  };
}

describe("docs/spec smoke parse (TPL-20260510-12 / G12-2)", () => {
  it("finds at least one tagged code block to validate", () => {
    // Sentinel — if the spec is rewritten and the language tags disappear, this
    // test should fail loudly rather than silently turning into a no-op.
    expect(ALL_BLOCKS.length).toBeGreaterThan(0);
  });

  const cleanBlocks = ALL_BLOCKS.filter((b) => !b.expectError);
  const errorBlocks = ALL_BLOCKS.filter((b) => b.expectError);

  it.each(cleanBlocks.map((b) => [`${b.doc}:${b.startLine} \`\`\`${b.lang}`, b]))(
    "parses cleanly: %s",
    (_label, block) => {
      const { errors } = parseBlock(block);
      expect(errors).toEqual([]);
    },
  );

  // Always register the expect-error suite; vitest reports zero tests when
  // `errorBlocks` is empty, which is the desired behavior until the spec adds
  // its first counter-example block.
  it.each(errorBlocks.map((b) => [`${b.doc}:${b.startLine} \`\`\`${b.lang}`, b]))(
    "rejects expect-error block: %s",
    (_label, block) => {
      const { errors } = parseBlock(block);
      expect(errors.length).toBeGreaterThan(0);
    },
  );
});
