import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const HOOK = resolve(import.meta.dirname, "converge-after-ready.sh");
const work = mkdtempSync(join(tmpdir(), "converge-hook-"));

afterAll(() => rmSync(work, { recursive: true, force: true }));

interface PrView {
  number: number;
  isDraft: boolean;
  labels: { name: string }[];
  body: string;
}

const READY: PrView = { number: 12, isDraft: false, labels: [], body: "Closes #11" };

let stubCount = 0;

/**
 * A fake gh that records its argv and prints the given PR view, or fails when
 * `view` is null.
 */
function stubGh(view: PrView | null): { bin: string; argsFile: string } {
  stubCount += 1;
  const bin = join(work, `gh-${stubCount}`);
  const argsFile = join(work, `gh-${stubCount}.args`);
  const viewFile = join(work, `gh-${stubCount}.json`);
  writeFileSync(viewFile, JSON.stringify(view));
  const body =
    view === null
      ? `printf '%s\\n' "$*" > '${argsFile}'\nexit 1\n`
      : `printf '%s\\n' "$*" > '${argsFile}'\ncat '${viewFile}'\n`;
  writeFileSync(bin, `#!/usr/bin/env bash\n${body}`);
  chmodSync(bin, 0o755);
  return { bin, argsFile };
}

function runHook(command: string, gh: { bin: string }): string {
  const input = JSON.stringify({
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_input: { command },
    cwd: work,
  });
  const result = spawnSync("bash", [HOOK], {
    input,
    encoding: "utf8",
    env: { ...process.env, CONVERGE_HOOK_GH: gh.bin },
  });
  expect(result.status).toBe(0);
  return result.stdout;
}

function context(stdout: string): string {
  const parsed = JSON.parse(stdout) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
  return parsed.hookSpecificOutput.additionalContext;
}

describe("converge-after-ready hook", () => {
  it("stays silent and never calls gh for commands without gh pr ready", () => {
    const gh = stubGh(READY);
    expect(runHook("gh pr view 12 --json state", gh)).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
  });

  it("hands the readied PR over to /coderabbit-converge", () => {
    const gh = stubGh(READY);
    const ctx = context(runHook("gh pr ready 12", gh));
    expect(ctx).toContain("PR #12 is out of draft");
    expect(ctx).toContain("/coderabbit-converge on #12");
    expect(ctx).toContain("takes precedence");
    expect(readFileSync(gh.argsFile, "utf8").trim()).toBe(
      "pr view 12 --json number,isDraft,labels,body",
    );
  });

  it("reads the selector of the first gh pr ready in a compound command", () => {
    const gh = stubGh(READY);
    runHook(`cd /tmp && gh pr ready 12 && gh issue edit 11 --add-label "status: in-review"`, gh);
    expect(readFileSync(gh.argsFile, "utf8").trim()).toBe(
      "pr view 12 --json number,isDraft,labels,body",
    );
  });

  it("falls back to the current branch's PR when the selector is a shell variable", () => {
    const gh = stubGh(READY);
    context(runHook(`gh pr ready "$PR"`, gh));
    expect(readFileSync(gh.argsFile, "utf8").trim()).toBe(
      "pr view --json number,isDraft,labels,body",
    );
  });

  it("stays silent for gh pr ready --undo", () => {
    const gh = stubGh(READY);
    expect(runHook("gh pr ready 12 --undo", gh)).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
  });

  it("stays silent when the PR is still a draft (the ready call failed)", () => {
    const gh = stubGh({ ...READY, isDraft: true });
    expect(runHook("gh pr ready 12", gh)).toBe("");
  });

  it.each(["skip-coderabbit", "adr-auto-merge"])("stays silent for a PR labelled %s", (label) => {
    const gh = stubGh({ ...READY, labels: [{ name: "bug" }, { name: label }] });
    expect(runHook("gh pr ready 12", gh)).toBe("");
  });

  it("stays silent when the body carries the ignore command on its own line", () => {
    const gh = stubGh({ ...READY, body: "Fix a typo.\n\n@coderabbitai ignore  \n" });
    expect(runHook("gh pr ready 12", gh)).toBe("");
  });

  it("does not treat a quoted mention of the ignore command as opting out", () => {
    const gh = stubGh({ ...READY, body: "Do not use `@coderabbitai ignore` here." });
    expect(context(runHook("gh pr ready 12", gh))).toContain("PR #12");
  });

  it("gives the conditional reminder when gh cannot read the PR", () => {
    const gh = stubGh(null);
    const ctx = context(runHook("gh pr ready 12", gh));
    expect(ctx).toContain("/coderabbit-converge");
    expect(ctx).toContain("skip-coderabbit / adr-auto-merge");
  });
});
