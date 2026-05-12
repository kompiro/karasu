import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { TABLES, blockFor, applyBlock, regenerate, type Locale } from "./gen-docs.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

describe("reference docs codegen", () => {
  it("the committed spec docs are up to date (run `pnpm gen:reference` if this fails)", () => {
    const { stale } = regenerate({ root: repoRoot, check: true });
    expect(stale).toEqual([]);
  });

  it("every table has en + ja files, headers, and a non-empty body", () => {
    for (const spec of TABLES) {
      for (const locale of ["en", "ja"] as const) {
        expect(spec.file[locale]).toMatch(/^docs\/spec\/.+\.md$/);
        expect(spec.headers[locale].length).toBeGreaterThanOrEqual(2);
        const rows = spec.rows(locale);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
          expect(row.length).toBe(spec.headers[locale].length);
          for (const cell of row) expect(cell.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("blockFor renders a GFM table wrapped in matching markers", () => {
    const spec = TABLES[0];
    const block = blockFor(spec, "en");
    const lines = block.split("\n");
    expect(lines[0]).toMatch(new RegExp(`^<!-- gen:reference:${spec.id}\\b.*-->$`));
    expect(lines.at(-1)).toBe(`<!-- /gen:reference:${spec.id} -->`);
    // header + separator + one row per data entry
    expect(lines[1]).toBe(`| ${spec.headers.en.join(" | ")} |`);
    expect(lines[2]).toMatch(/^\|(-{3,}\|)+$/);
    expect(lines.length).toBe(2 + spec.rows("en").length + 2);
  });

  it("applyBlock replaces only the marked region and leaves surrounding prose intact", () => {
    const spec = TABLES[0];
    const content = [
      "## Heading",
      "",
      "before",
      `<!-- gen:reference:${spec.id} — stale note -->`,
      "| Old | Table |",
      "|-----|-------|",
      "| x | y |",
      `<!-- /gen:reference:${spec.id} -->`,
      "",
      "after",
      "",
    ].join("\n");
    const out = applyBlock(content, spec, "en" as Locale);
    expect(out.startsWith("## Heading\n\nbefore\n")).toBe(true);
    expect(out.endsWith("\n\nafter\n")).toBe(true);
    expect(out).not.toContain("| Old | Table |");
    expect(out).toContain(blockFor(spec, "en"));
  });

  it("applyBlock throws when the markers are missing", () => {
    expect(() => applyBlock("no markers here", TABLES[0], "en")).toThrow(/markers not found/);
  });
});
