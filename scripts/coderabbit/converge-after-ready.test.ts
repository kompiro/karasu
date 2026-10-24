import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const HOOK = resolve(import.meta.dirname, "converge-after-ready.sh");
const work = mkdtempSync(join(tmpdir(), "converge-hook-"));

afterAll(() => rmSync(work, { recursive: true, force: true }));

interface PrView {
  isDraft: boolean;
  labels: { name: string }[];
  body: string;
}

const READY: PrView = { isDraft: false, labels: [], body: "Closes #11" };

/** What gh prints to stderr when `gh pr ready` takes the PR out of draft. */
const marked = (ref: string) => `✓ Pull request ${ref} is marked as "ready for review"\n`;

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
  const tail = view === null ? "exit 1" : `cat '${viewFile}'`;
  writeFileSync(bin, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" > '${argsFile}'\n${tail}\n`);
  chmodSync(bin, 0o755);
  return { bin, argsFile };
}

function runHook(
  command: string,
  response: { stdout?: string; stderr?: string },
  gh: { bin: string },
): string {
  const input = JSON.stringify({
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_input: { command },
    tool_response: { stdout: "", stderr: "", interrupted: false, isImage: false, ...response },
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

const ghArgs = (gh: { argsFile: string }) => readFileSync(gh.argsFile, "utf8").trim();

describe("converge-after-ready hook", () => {
  it("stays silent and never calls gh for commands without pr ready", () => {
    const gh = stubGh(READY);
    expect(runHook("gh pr view 12 --json state", { stdout: "{}" }, gh)).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
  });

  it("hands the readied PR over to /coderabbit-converge", () => {
    const gh = stubGh(READY);
    const ctx = context(runHook("gh pr ready 12", { stderr: marked("kompiro/karasu#12") }, gh));
    expect(ctx).toContain("PR kompiro/karasu#12 is out of draft");
    expect(ctx).toContain("/coderabbit-converge");
    expect(ctx).toContain("takes precedence");
    expect(ghArgs(gh)).toBe("pr view 12 --repo kompiro/karasu --json isDraft,labels,body");
  });

  it("reads the PR from gh's status line, not from the command, for another repository", () => {
    const gh = stubGh(READY);
    const ctx = context(
      runHook(
        `cd /workspaces/tpl-tools && gh pr ready "$PR" && gh pr checks "$PR"`,
        { stdout: `${marked("kompiro/tpl-tools#28")}checks pending\n` },
        gh,
      ),
    );
    expect(ctx).toContain("PR kompiro/tpl-tools#28");
    expect(ghArgs(gh)).toBe("pr view 28 --repo kompiro/tpl-tools --json isDraft,labels,body");
  });

  it("stays silent when the command only mentions gh pr ready (grep, heredoc)", () => {
    const gh = stubGh(READY);
    const out = runHook(
      `grep -rn "gh pr ready" docs/process.md`,
      { stdout: "docs/process.md:111:11. gh pr ready <PR番号> で draft を外す\n" },
      gh,
    );
    expect(out).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
  });

  it("stays silent when the PR was already ready", () => {
    const gh = stubGh(READY);
    const stderr = `! Pull request kompiro/karasu#12 is already "ready for review"\n`;
    expect(runHook("gh pr ready 12", { stderr }, gh)).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
  });

  it("stays silent for gh pr ready --undo", () => {
    const gh = stubGh(READY);
    const stderr = '✓ Pull request kompiro/karasu#12 is converted to "draft"\n';
    expect(runHook("gh pr ready 12 --undo", { stderr }, gh)).toBe("");
  });

  it("stays silent when GitHub still reports a draft", () => {
    const gh = stubGh({ ...READY, isDraft: true });
    expect(runHook("gh pr ready 12", { stderr: marked("kompiro/karasu#12") }, gh)).toBe("");
  });

  it.each(["skip-coderabbit", "adr-auto-merge"])("stays silent for a PR labelled %s", (label) => {
    const gh = stubGh({ ...READY, labels: [{ name: "bug" }, { name: label }] });
    expect(runHook("gh pr ready 12", { stderr: marked("kompiro/karasu#12") }, gh)).toBe("");
  });

  it("stays silent when the body carries the ignore command on its own line", () => {
    const gh = stubGh({ ...READY, body: "Fix a typo.\n\n@coderabbitai ignore  \n" });
    expect(runHook("gh pr ready 12", { stderr: marked("kompiro/karasu#12") }, gh)).toBe("");
  });

  it("does not treat a quoted mention of the ignore command as opting out", () => {
    const gh = stubGh({ ...READY, body: "Do not use `@coderabbitai ignore` here." });
    const out = runHook("gh pr ready 12", { stderr: marked("kompiro/karasu#12") }, gh);
    expect(context(out)).toContain("PR kompiro/karasu#12");
  });

  it("stays silent when gh cannot read the PR", () => {
    const gh = stubGh(null);
    expect(runHook("gh pr ready 12", { stderr: marked("kompiro/karasu#12") }, gh)).toBe("");
  });
});
