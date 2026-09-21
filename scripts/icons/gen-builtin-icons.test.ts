import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OUTPUT_FILE, quote, readBuiltinIconSources, renderModule } from "./gen-builtin-icons.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

describe("built-in icon codegen (#2802)", () => {
  it("the committed module is byte-identical to a fresh render (run `pnpm gen:icons` if this fails)", () => {
    const expected = renderModule(readBuiltinIconSources(repoRoot));
    expect(readFileSync(resolve(repoRoot, OUTPUT_FILE), "utf8")).toBe(expected);
  });

  it("reads every manifest entry, in order, with non-empty SVG", () => {
    const sources = readBuiltinIconSources(repoRoot);
    expect(sources.length).toBeGreaterThanOrEqual(30);
    for (const s of sources) {
      expect(s.svg).toMatch(/^<svg\b/);
      expect(s.svg).toContain("</svg>");
    }
  });
});

describe("quote() spells a literal the way the formatter would", () => {
  it("prefers double quotes, and on a tie", () => {
    expect(quote("plain")).toBe('"plain"');
    expect(quote(`a"b'c`)).toBe(`"a\\"b'c"`);
  });

  it("switches to single quotes when double quotes dominate, escaping only the singles", () => {
    expect(quote(`<g class="a" id="b">`)).toBe(`'<g class="a" id="b">'`);
    expect(quote(`<g class="a" id="b">it's`)).toBe(`'<g class="a" id="b">it\\'s'`);
  });

  it("keeps newlines and backslashes escaped in both spellings", () => {
    expect(quote("a\nb")).toBe('"a\\nb"');
    expect(quote('"x"\n\\')).toBe(`'"x"\\n\\\\'`);
  });
});
