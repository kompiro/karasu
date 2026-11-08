import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The Low PR merger (Issue #3673) judges again whenever a check it waits for
// completes. `workflow_run` lists workflows by name, so a workflow that starts
// reporting a required check, or a renamed one, would leave PRs waiting for the
// 10-minute cron. And the judge runs from `main` with a token while it reads PRs:
// it must stay unable to run their code (TPL-3673).

const DIR = resolve(import.meta.dirname, "../../.github/workflows");
const read = (file: string) => readFileSync(resolve(DIR, file), "utf-8");
const merger = read("low-pr-merger.yml");

/**
 * The ruleset's required checks on `main` (`gh api repos/kompiro/karasu/rules/branches/main`),
 * plus `Review tier`, which the tier check stands for. Update this with the ruleset.
 */
const WAITED_FOR = ["Check", "Validate", "Reference docs", "Playwright", "verify", "Review tier"];

const unquote = (s: string) => s.trim().replace(/^(["'])(.*)\1$/, "$2");

interface Workflow {
  file: string;
  name: string;
  onPullRequest: boolean;
  /** Each job's check name: its `name:`, or its id when it has none. */
  checks: string[];
}

function parse(file: string): Workflow {
  const text = read(file);
  const name = unquote(/^name:(.*)$/m.exec(text)?.[1] ?? file);
  const on = /^on:\n((?:(?: .*)?\n)+)/m.exec(text)?.[1] ?? "";
  const jobsText = text.slice(text.search(/^jobs:/m));
  const checks = [...jobsText.matchAll(/^ {2}([\w-]+):\s*\n((?:(?: {4}.*)?\n)*)/gm)].map(
    ([, id, body]) => unquote(/^ {4}name:(.*)$/m.exec(body)?.[1] ?? id),
  );
  return { file, name, onPullRequest: /^ {2}pull_request:/m.test(on), checks };
}

const workflows = readdirSync(DIR)
  .filter((f) => f.endsWith(".yml"))
  .map(parse);
const listed = (/^ {4}workflows:\n((?: {6}- .*\n)+)/m.exec(merger)?.[1] ?? "")
  .split("\n")
  .filter((l) => l !== "")
  .map((l) => unquote(l.replace(/^ *- /, "")));

describe("low-pr-merger.yml triggers", () => {
  it("lists every PR workflow that reports a check the judge waits for", () => {
    const reporting = workflows
      .filter((w) => w.onPullRequest && w.checks.some((c) => WAITED_FOR.includes(c)))
      .map((w) => w.name);
    expect(reporting.length).toBeGreaterThan(0);
    expect(listed).toEqual(expect.arrayContaining(reporting));
  });

  it("lists only workflows that exist", () => {
    const names = new Set(workflows.map((w) => w.name));
    expect(listed.filter((n) => !names.has(n))).toEqual([]);
  });

  it("has a cron backstop", () => {
    expect(merger).toMatch(/^ {2}schedule:\n {4}- cron: /m);
  });
});

/** Each job's lines, by job id. */
const jobs = new Map(
  [
    ...merger.slice(merger.search(/^jobs:/m)).matchAll(/^ {2}([\w-]+):\s*\n((?:(?: {4}.*)?\n)*)/gm),
  ].map(([, id, body]) => [id, body]),
);
const job = (id: string): string => {
  const body = jobs.get(id);
  if (body === undefined) throw new Error(`low-pr-merger.yml has no job ${id}`);
  return body;
};

describe("low-pr-merger.yml treats PRs as data (TPL-3673)", () => {
  it("is not started by a PR, so a PR cannot change what judges it", () => {
    expect(parse("low-pr-merger.yml").onPullRequest).toBe(false);
    expect(merger).not.toMatch(/pull_request_target/);
  });

  it("checks out only main, without keeping the token, and installs nothing", () => {
    expect([...merger.matchAll(/actions\/checkout@/g)].length).toBe(
      [...merger.matchAll(/ref: main\n {10}(?:fetch-depth: 0\n {10})?persist-credentials: false/g)]
        .length,
    );
    expect(merger).not.toMatch(/\b(?:pnpm|npm|yarn) (?:install|ci|i)\b/);
  });

  it("reads no field of the event that started it", () => {
    expect(merger).not.toMatch(/github\.event\./);
  });

  it("grants nothing at the top, and the judge read access only", () => {
    expect(merger).toMatch(/^permissions: \{\}$/m);
    expect(job("judge")).not.toMatch(/: write\b/);
  });

  it("keeps the App key in the merge job alone, which runs no repository code", () => {
    const holders = [...jobs].filter(([, body]) => /secrets\.|environment:/.test(body));
    expect(holders.map(([id]) => id)).toEqual(["merge"]);
    const merge = job("merge");
    expect(merge).toMatch(/^ {4}environment: low-pr-merger$/m);
    expect(merge).toMatch(/^ {4}permissions: \{\}$/m);
    expect(merge).not.toMatch(/actions\/checkout@|scripts\//);
  });

  it("merges only at the head the judge cleared, after reading the PR again", () => {
    const merge = job("merge");
    expect(merge).toMatch(/pulls\/\$pr\/merge" \\\n\s+-f merge_method=squash -f sha="\$sha"/);
    expect(merge).toContain('"$sha" =~ ^[0-9a-f]{40}$');
    expect(merge).toContain("printf 'open\\tfalse\\t%s\\tmain\\trisk: low' \"$sha\"");
  });

  it("hands the verdicts to a step only through env, never into a script", () => {
    const uses = merger.split("\n").filter((l) => l.includes("needs.judge.outputs.verdicts"));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses)
      expect(line).toMatch(/^ {10}VERDICTS: \$\{\{ needs\.judge\.outputs\.verdicts \}\}$/);
  });

  it("fails the run when a job did not finish or a PR got no conclusion (TPL-2786)", () => {
    const report = job("report");
    expect(report).toMatch(/^ {4}needs: \[judge, merge, notify\]$/m);
    expect(report).toMatch(/^ {4}if: always\(\)$/m);
    expect(report).toContain("UNDECIDED: ${{ needs.judge.outputs.undecided }}");
  });
});
