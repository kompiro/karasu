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

describe("low-pr-merger.yml treats PRs as data (TPL-3673)", () => {
  it("is not started by a PR, so a PR cannot change what judges it", () => {
    expect(parse("low-pr-merger.yml").onPullRequest).toBe(false);
    expect(merger).not.toMatch(/pull_request_target/);
  });

  it("checks out main without keeping the token, and installs nothing", () => {
    expect(merger).toMatch(/ref: main\n/);
    expect(merger).toMatch(/persist-credentials: false/);
    expect(merger).not.toMatch(/\b(?:pnpm|npm|yarn) (?:install|ci|i)\b/);
  });

  it("reads no field of the event that started it", () => {
    expect(merger).not.toMatch(/github\.event\./);
  });

  it("grants the judge read access only", () => {
    expect(merger).toMatch(/^permissions: \{\}$/m);
    expect(merger).not.toMatch(/: write\b/);
  });
});
