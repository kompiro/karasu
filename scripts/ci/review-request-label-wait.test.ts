import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// A Low ADR PR opens as non-draft with `gh pr create --label "risk: low"`
// (`.claude/rules/adr.md`, Issue #3504). gh adds the label in a call after the
// PR is opened, so `review-request.yml` has to wait before it reads the labels
// on `opened` / `reopened`, or it labels the PR `risk: high` first. A draft got
// its label before `ready_for_review`, so that event reads them at once.
//
// The step's script runs here with `sleep` and `gh` replaced by stubs that log
// their arguments; the stub gh answers `pr view` with the number of tier labels.

const workflow = readFileSync(
  resolve(import.meta.dirname, "../../.github/workflows/review-request.yml"),
  "utf-8",
);
const block = /^ {8}run: \|\n((?: {10}.*\n|\n)+)/m.exec(workflow)?.[1] ?? "";
const script = block.replace(/^ {10}/gm, "");

const work = mkdtempSync(join(tmpdir(), "review-request-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const log = join(work, "calls.log");
const stub = (name: string, body: string) => {
  writeFileSync(join(work, name), `#!/usr/bin/env bash\necho "${name} $*" >> '${log}'\n${body}\n`);
  chmodSync(join(work, name), 0o755);
};
stub("sleep", "");
stub("gh", 'if [ "$1 $2" = "pr view" ]; then echo "$FAKE_TIERS"; fi');

function runStep(action: string, tiers: number): string[] {
  rmSync(log, { force: true });
  const result = spawnSync("bash", ["-e", "-c", script], {
    encoding: "utf8",
    env: {
      PATH: `${work}:${process.env.PATH ?? ""}`,
      GH_TOKEN: "t",
      PR: "7",
      REPO: "o/r",
      ACTION: action,
      FAKE_TIERS: String(tiers),
    },
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
}

const slept = (calls: string[]) =>
  calls.filter((c) => c.startsWith("sleep ")).map((c) => Number(c.slice("sleep ".length)));
const labelledHigh = (calls: string[]) =>
  calls.includes("gh pr edit 7 --repo o/r --add-label risk: high");

describe("review-request.yml label wait", () => {
  it("runs on a PR that opens as non-draft", () => {
    expect(workflow).toMatch(/types: \[opened, reopened, ready_for_review\]/);
  });

  it.each(["opened", "reopened"])(
    "on %s, waits before it reads the labels, and leaves a labelled PR alone",
    (action) => {
      const calls = runStep(action, 1);
      expect(slept(calls)).toHaveLength(1);
      expect(slept(calls)[0]).toBeGreaterThanOrEqual(30);
      expect(calls.findIndex((c) => c.startsWith("sleep "))).toBeLessThan(
        calls.findIndex((c) => c.startsWith("gh pr view")),
      );
      expect(labelledHigh(calls)).toBe(false);
    },
  );

  it("on opened, still labels a PR with no tier label High after the wait", () => {
    const calls = runStep("opened", 0);
    expect(slept(calls)).toHaveLength(1);
    expect(labelledHigh(calls)).toBe(true);
  });

  it("on ready_for_review, reads the labels at once", () => {
    const calls = runStep("ready_for_review", 0);
    expect(slept(calls)).toEqual([]);
    expect(labelledHigh(calls)).toBe(true);
  });
});
