import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
      "docs/spec/diagnostics.md",
      "docs/concepts.md",
    ]);
  });
});

describe("check with missing pair files", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "spec-structure-sync-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports a missing pair file as a problem instead of throwing", () => {
    const problems = check(dir);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].message).toContain("pair file missing:");
    expect(problems[0].message).toContain("docs/spec/syntax.md");
  });

  it("names only the missing side when one twin exists", () => {
    mkdirSync(join(dir, "docs", "spec"), { recursive: true });
    writeFileSync(join(dir, "docs", "spec", "syntax.md"), "# T\n");
    const problems = check(dir);
    const syntax = problems.find((p) => p.en === "docs/spec/syntax.md");
    expect(syntax?.message).toBe("pair file missing: docs/spec/syntax.ja.md");
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

  it("does not close a backtick fence with a tilde line or vice versa", () => {
    const headings = extractHeadings(["```", "~~~", "# still fenced", "```", "## Real"].join("\n"));
    expect(headings.map((h) => h.text)).toEqual(["Real"]);
  });

  it("requires the closing fence to be at least as long as the opener", () => {
    const headings = extractHeadings(
      ["````markdown", "```", "# fenced example", "```", "````", "## Real"].join("\n"),
    );
    expect(headings.map((h) => h.text)).toEqual(["Real"]);
  });

  it("does not treat a fence with an info string as a closer", () => {
    const headings = extractHeadings(
      ["```", "# fenced", "``` not-a-closer", "# still fenced", "```", "## Real"].join("\n"),
    );
    expect(headings.map((h) => h.text)).toEqual(["Real"]);
  });

  it("recognizes fences indented up to three spaces", () => {
    const headings = extractHeadings(
      ["- item", "   ```", "   # fenced in list", "   ```", "## Real"].join("\n"),
    );
    expect(headings.map((h) => h.text)).toEqual(["Real"]);
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

  it("reports a missing trailing subsection", () => {
    const en = "# Title\n## A\n### A-1";
    const ja = "# タイトル\n## A";
    const problem = comparePair(pair, en, ja);
    expect(problem?.message).toContain("diverges in section #2 at heading #2");
    expect(problem?.message).toContain("### A-1");
  });

  it("reports a level mismatch", () => {
    const en = "# T\n## A\n### A-1\n## B";
    const ja = "# T\n## A\n#### A-1\n## B";
    const problem = comparePair(pair, en, ja);
    expect(problem?.message).toContain("diverges in section #2 at heading #2");
    expect(problem?.message).toContain("en.md:3 ### A-1");
    expect(problem?.message).toContain("ja.md:3 #### A-1");
  });

  it("catches equal-and-opposite edits in different sections", () => {
    // Flat heading-level multisets are identical; only per-section grouping
    // can tell these apart.
    const en = "# T\n## A\n### extra\n## B";
    const ja = "# T\n## A\n## B\n### extra";
    const problem = comparePair(pair, en, ja);
    expect(problem).not.toBeNull();
    expect(problem?.message).toContain("section: A");
  });
});
