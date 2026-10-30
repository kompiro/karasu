import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cellTargets,
  check,
  type Input,
  parseIndex,
  readInput,
  relativeLinks,
  SIZE_BUDGET,
} from "./process-index.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

const core = (rows: string[], extra = ""): string =>
  [
    "# karasu — 開発プロセス",
    "",
    extra,
    "### 規約の所在",
    "",
    "| 何をするとき | 正本 | 発火条件 |",
    "| --- | --- | --- |",
    ...rows,
    "",
    "一覧は `.claude/rules/README.md`。",
    "",
  ].join("\n");

const REVIEW_ROW =
  "| PR のレビュー | [docs/process/review.md](process/review.md) | PR ワークフローの手順 8 に入る前 |";
const RULE_ROW = "| 受け入れテスト | `.claude/rules/acceptance.md` | `docs/acceptance/**` の編集 |";

function input(
  processMd: string,
  topics: Record<string, string> = {},
  extra: string[] = [],
): Input {
  const files = new Set([
    "docs/process.md",
    ".claude/rules/acceptance.md",
    ...Object.keys(topics),
    ...extra,
  ]);
  return { processMd, topics: new Map(Object.entries(topics)), exists: (path) => files.has(path) };
}

describe("parseIndex", () => {
  it("reads the source and trigger columns by their header names", () => {
    const parsed = parseIndex(core([REVIEW_ROW, RULE_ROW]));
    expect(parsed).toEqual({
      rows: [
        {
          line: 8,
          source: "[docs/process/review.md](process/review.md)",
          trigger: "PR ワークフローの手順 8 に入る前",
        },
        {
          line: 9,
          source: "`.claude/rules/acceptance.md`",
          trigger: "`docs/acceptance/**` の編集",
        },
      ],
    });
  });

  it("reports a missing heading or a renamed trigger column", () => {
    expect(parseIndex("# x\n")).toEqual({ error: 'no "### 規約の所在" heading' });
    const renamed = core([REVIEW_ROW]).replace("発火条件", "いつ");
    expect(parseIndex(renamed)).toMatchObject({ error: expect.stringContaining('"発火条件"') });
  });
});

describe("cellTargets", () => {
  it("resolves links from docs/ and backticked paths from the root", () => {
    expect(cellTargets("[a](process/review.md)")).toEqual(["docs/process/review.md"]);
    expect(cellTargets("`.claude/rules/adr.md`")).toEqual([".claude/rules/adr.md"]);
    expect(cellTargets("`docs/release.md`")).toEqual(["docs/release.md"]);
  });
});

describe("relativeLinks", () => {
  it("skips external links, bare anchors, and fenced code", () => {
    const md = [
      "[x](https://example.com)",
      "[y](#here)",
      "```",
      "[z](nope.md)",
      "```",
      "[w](../adr/1.md#a)",
    ].join("\n");
    expect(relativeLinks(md)).toEqual([{ line: 6, target: "../adr/1.md" }]);
  });
});

describe("check", () => {
  const review = "# review\n\n[ADR](../adr/1-x.md)\n";

  it("passes an indexed topic with a trigger and resolving links", () => {
    expect(
      check(
        input(core([REVIEW_ROW, RULE_ROW]), { "docs/process/review.md": review }, [
          "docs/adr/1-x.md",
        ]),
      ),
    ).toEqual([]);
  });

  it("fails a topic file that no index row names", () => {
    const problems = check(
      input(core([RULE_ROW]), { "docs/process/review.md": review }, ["docs/adr/1-x.md"]),
    );
    expect(problems).toEqual([
      expect.stringContaining("docs/process/review.md is not in the index"),
    ]);
  });

  it("fails an index row whose file does not exist", () => {
    // The row's link is a relative link too, so the link check reports it as well.
    const problems = check(input(core([REVIEW_ROW])));
    expect(problems).toEqual([
      expect.stringContaining("index row points at docs/process/review.md, which does not exist"),
      expect.stringContaining("resolves to docs/process/review.md, which does not exist"),
    ]);
  });

  it("fails an index row with an empty trigger", () => {
    for (const empty of ["", "—", "-"]) {
      const row = `| PR のレビュー | [docs/process/review.md](process/review.md) | ${empty} |`;
      const problems = check(
        input(core([row]), { "docs/process/review.md": review }, ["docs/adr/1-x.md"]),
      );
      expect(problems).toEqual([expect.stringContaining('no "発火条件"')]);
    }
  });

  it("fails a moved link that did not gain its ../", () => {
    const moved = "# review\n\n[ADR](adr/1-x.md)\n";
    const problems = check(
      input(core([REVIEW_ROW]), { "docs/process/review.md": moved }, ["docs/adr/1-x.md"]),
    );
    expect(problems).toEqual([expect.stringContaining("resolves to docs/process/adr/1-x.md")]);
  });

  it("fails a core over the size budget", () => {
    const heavy = core([RULE_ROW], "x".repeat(SIZE_BUDGET));
    expect(check(input(heavy))).toEqual([expect.stringContaining("over the 16384-byte budget")]);
  });
});

describe("the repository", () => {
  it("keeps docs/process.md indexed, linked, and within budget", () => {
    expect(check(readInput(REPO_ROOT))).toEqual([]);
  });
});
