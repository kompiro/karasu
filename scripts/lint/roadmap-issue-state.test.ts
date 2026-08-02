import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { check, collectIssueRefs, type IssueState, scopesOf } from "./roadmap-issue-state.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

function link(n: number): string {
  return `[#${n}](https://github.com/kompiro/karasu/issues/${n})`;
}

function states(entries: Record<number, IssueState>): Map<number, IssueState> {
  return new Map(Object.entries(entries).map(([n, s]) => [Number(n), s]));
}

describe("scopesOf", () => {
  it("splits a table row into cells so one cell's wording cannot indict another's link", () => {
    expect(scopesOf(`| **facets** | ${link(2065)} | Part A 着地済み、Part B は進行中 |`)).toEqual([
      " **facets** ",
      ` ${link(2065)} `,
      " Part A 着地済み、Part B は進行中 ",
    ]);
  });

  it("keeps a prose line whole", () => {
    expect(scopesOf("interop は未着手。")).toEqual(["interop は未着手。"]);
  });
});

describe("collectIssueRefs", () => {
  it("collects issue links with their line number", () => {
    const content = `# roadmap\n\n未着手の候補 ${link(1832)}\n`;
    expect(collectIssueRefs(content)).toEqual([
      { number: 1832, lineNo: 3, scope: `未着手の候補 ${link(1832)}` },
    ]);
  });

  it("ignores pull-request links — a merged PR is not drift", () => {
    const content = `PRD（[#1825](https://github.com/kompiro/karasu/pull/1825)）は未着手\n`;
    expect(collectIssueRefs(content)).toEqual([]);
  });
});

describe("check", () => {
  it("flags a cell that calls work not-started while linking a closed issue", () => {
    // The interop drift verbatim: the row survived #1832 being closed not_planned.
    const content = `| **interop** | 未着手の戦略テーマ ${link(1832)} | 評価可能 |\n`;
    const problems = check(content, states({ 1832: "closed" }));
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe("error");
    expect(problems[0].message).toContain("#1832");
    expect(problems[0].message).toContain("but it is closed");
  });

  it("passes the same wording while the issue is still open", () => {
    const content = `| **interop** | 未着手の戦略テーマ ${link(1832)} | 評価可能 |\n`;
    expect(check(content, states({ 1832: "open" }))).toEqual([]);
  });

  it("flags a cell that claims nothing is issued yet while linking an issue", () => {
    const content = `| gap | 未起票。trigger を満たしたら着手 ${link(2172)} | 出典 |\n`;
    const problems = check(content, states({ 2172: "open" }));
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("not issued yet");
  });

  it("does not let one cell's not-started wording indict another cell's closed link", () => {
    const content = `| **interop** | 未着手の戦略テーマ | 出典 ${link(1832)} |\n`;
    expect(check(content, states({ 1832: "closed" }))).toEqual([]);
  });

  it("stays silent on a closed issue referenced as provenance", () => {
    // Closed issues are legitimate lineage links; only a not-started claim refutes them.
    const content = `| gap | 据え置き。corpus で再発したら gate へ | ${link(1567)} finding C |\n`;
    expect(check(content, states({ 1567: "closed" }))).toEqual([]);
  });

  it("treats an unknown issue state as no evidence rather than as drift", () => {
    const content = `未着手 ${link(9999)}\n`;
    expect(check(content, new Map())).toEqual([]);
  });
});

describe("the committed roadmap", () => {
  it("has no self-contradicting cell under the states this guard was written for", () => {
    const content = readFileSync(join(REPO_ROOT, "docs/roadmap.md"), "utf8");
    // Only the issues whose real state is asserted by the surrounding prose;
    // the network run in CI covers the rest.
    const known = states({ 1832: "closed", 1814: "closed", 1567: "closed", 638: "open" });
    expect(check(content, known)).toEqual([]);
  });
});
