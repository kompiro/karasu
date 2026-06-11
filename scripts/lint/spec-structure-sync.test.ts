import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { check, comparePair, extractHeadings, SPEC_PAIRS } from "./spec-structure-sync";

const REPO_ROOT = resolve(__dirname, "..", "..");

describe("spec-structure-sync validator", () => {
  it("real repo: every en/ja spec pair has identical heading structure", () => {
    const problems = check(REPO_ROOT);
    expect(problems.map((p) => `${p.en}\n${p.message}`)).toEqual([]);
  });

  it("covers the documented spec pairs", () => {
    expect(SPEC_PAIRS.map((p) => p.en)).toEqual([
      "docs/spec/syntax.md",
      "docs/spec/style.md",
      "docs/spec/tags-annotations.md",
      "docs/concepts.md",
    ]);
  });
});

describe("extractHeadings", () => {
  it("extracts heading level, text, and line number", () => {
    const headings = extractHeadings(["# Title", "", "body", "## Section", "### Sub"].join("\n"));
    expect(headings).toEqual([
      { level: 1, text: "Title", line: 1 },
      { level: 2, text: "Section", line: 4 },
      { level: 3, text: "Sub", line: 5 },
    ]);
  });

  it("ignores # lines inside fenced code blocks", () => {
    const headings = extractHeadings(
      ["# Real", "```", "# not a heading", "```", "~~~", "## also not", "~~~", "## Real 2"].join(
        "\n",
      ),
    );
    expect(headings.map((h) => h.text)).toEqual(["Real", "Real 2"]);
  });

  it("ignores #hashtag lines without a space", () => {
    expect(extractHeadings("#anchor\n#### H4")).toEqual([{ level: 4, text: "H4", line: 2 }]);
  });
});

describe("comparePair", () => {
  const pair = { en: "en.md", ja: "ja.md" };

  it("accepts identical level sequences with different heading text", () => {
    const en = "# Title\n## Section\n### Sub";
    const ja = "# タイトル\n## セクション\n### サブ";
    expect(comparePair(pair, en, ja)).toBeNull();
  });

  it("reports a missing trailing section", () => {
    const en = "# Title\n## A\n### A-1";
    const ja = "# タイトル\n## A";
    const problem = comparePair(pair, en, ja);
    expect(problem?.message).toContain("diverges at heading #3");
    expect(problem?.message).toContain("en has 3, ja has 2");
    expect(problem?.message).toContain("### A-1");
  });

  it("reports a level mismatch at the first divergence", () => {
    const en = "# T\n## A\n## B";
    const ja = "# T\n### A\n## B";
    const problem = comparePair(pair, en, ja);
    expect(problem?.message).toContain("diverges at heading #2");
    expect(problem?.message).toContain("en.md:2 ## A");
    expect(problem?.message).toContain("ja.md:2 ### A");
  });
});
