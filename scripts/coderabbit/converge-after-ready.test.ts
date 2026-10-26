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
  baseRefName: string;
}

const READY: PrView = { isDraft: false, labels: [], baseRefName: "main" };

/** What gh prints to stderr when `gh pr ready` takes the PR out of draft. */
const marked = (ref: string) => `✓ Pull request ${ref} is marked as "ready for review"\n`;

let stubCount = 0;

/**
 * A fake gh that appends each argv to a file. `pr view` prints the given PR
 * view (or fails when `view` is null); `repo view` prints the default branch.
 */
function stubGh(view: PrView | null, defaultBranch = "main"): { bin: string; argsFile: string } {
  stubCount += 1;
  const bin = join(work, `gh-${stubCount}`);
  const argsFile = join(work, `gh-${stubCount}.args`);
  const viewFile = join(work, `gh-${stubCount}.json`);
  writeFileSync(viewFile, JSON.stringify(view));
  const prView = view === null ? "exit 1" : `cat '${viewFile}'`;
  writeFileSync(
    bin,
    [
      "#!/usr/bin/env bash",
      `printf '%s\\n' "$*" >> '${argsFile}'`,
      `case "$1 $2" in`,
      `  "pr view") ${prView} ;;`,
      `  "repo view") echo '${defaultBranch}' ;;`,
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(bin, 0o755);
  return { bin, argsFile };
}

type Event =
  | { hook_event_name: "PostToolUse"; tool_response: { stdout?: string; stderr?: string } }
  | { hook_event_name: "PostToolUseFailure"; error: string; is_interrupt?: boolean };

const succeeded = (response: { stdout?: string; stderr?: string }): Event => ({
  hook_event_name: "PostToolUse",
  tool_response: { stdout: "", stderr: "", ...response },
});

function runHook(command: string, event: Event, gh: { bin: string }): string {
  const input = JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: work, ...event });
  const result = spawnSync("bash", [HOOK], {
    input,
    encoding: "utf8",
    env: { ...process.env, CONVERGE_HOOK_GH: gh.bin },
  });
  expect(result.status).toBe(0);
  return result.stdout;
}

function context(stdout: string, eventName = "PostToolUse"): string {
  const parsed = JSON.parse(stdout) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  expect(parsed.hookSpecificOutput.hookEventName).toBe(eventName);
  return parsed.hookSpecificOutput.additionalContext;
}

const ghCalls = (gh: { argsFile: string }) => readFileSync(gh.argsFile, "utf8").trim().split("\n");

const readyIn = (ref: string) => succeeded({ stderr: marked(ref) });

describe("converge-after-ready hook", () => {
  it("stays silent and never calls gh for commands without pr ready", () => {
    const gh = stubGh(READY);
    expect(runHook("gh pr view 12 --json state", succeeded({ stdout: "{}" }), gh)).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
  });

  it("hands the readied PR over to /coderabbit-converge", () => {
    const gh = stubGh(READY);
    const ctx = context(runHook("gh pr ready 12", readyIn("kompiro/karasu#12"), gh));
    expect(ctx).toContain("PR kompiro/karasu#12 is out of draft");
    expect(ctx).toContain("/coderabbit-converge");
    expect(ctx).toContain("takes precedence");
    expect(ghCalls(gh)[0]).toBe(
      "pr view 12 --repo kompiro/karasu --json isDraft,labels,baseRefName",
    );
  });

  it("reads the PR from gh's status line, not from the command, for another repository", () => {
    const gh = stubGh(READY);
    const ctx = context(
      runHook(
        `cd /workspaces/tpl-tools && gh pr ready "$PR" && gh pr view "$PR" --json url`,
        succeeded({ stdout: "{}\n", stderr: marked("kompiro/tpl-tools#28") }),
        gh,
      ),
    );
    expect(ctx).toContain("PR kompiro/tpl-tools#28");
    expect(ghCalls(gh)).toEqual([
      "pr view 28 --repo kompiro/tpl-tools --json isDraft,labels,baseRefName",
      "repo view kompiro/tpl-tools --json defaultBranchRef --jq .defaultBranchRef.name",
    ]);
  });

  it("hands over when a later command in the same call fails (PostToolUseFailure)", () => {
    const gh = stubGh(READY);
    const error = `Exit code 8\n${marked("kompiro/karasu#12")}Some checks are still pending\n`;
    const out = runHook(
      "gh pr ready 12 && gh pr checks 12",
      { hook_event_name: "PostToolUseFailure", error },
      gh,
    );
    expect(context(out, "PostToolUseFailure")).toContain("PR kompiro/karasu#12");
  });

  it("stays silent when the user interrupted the call", () => {
    const gh = stubGh(READY);
    const error = `Exit code 130\n${marked("kompiro/karasu#12")}`;
    const event: Event = { hook_event_name: "PostToolUseFailure", error, is_interrupt: true };
    expect(runHook("gh pr ready 12 && sleep 60", event, gh)).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
  });

  it("stays silent when the command only mentions gh pr ready (grep, heredoc)", () => {
    const gh = stubGh(READY);
    const stdout = "docs/process.md:111:11. gh pr ready <PR番号> で draft を外す\n";
    expect(runHook(`grep -rn "gh pr ready" docs/process.md`, succeeded({ stdout }), gh)).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
  });

  it("stays silent when the PR was already ready", () => {
    const gh = stubGh(READY);
    const stderr = `! Pull request kompiro/karasu#12 is already "ready for review"\n`;
    expect(runHook("gh pr ready 12", succeeded({ stderr }), gh)).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
  });

  it("stays silent for gh pr ready --undo", () => {
    const gh = stubGh(READY);
    const stderr = `✓ Pull request kompiro/karasu#12 is converted to "draft"\n`;
    expect(runHook("gh pr ready 12 --undo", succeeded({ stderr }), gh)).toBe("");
  });

  it("stays silent when GitHub still reports a draft", () => {
    const gh = stubGh({ ...READY, isDraft: true });
    expect(runHook("gh pr ready 12", readyIn("kompiro/karasu#12"), gh)).toBe("");
  });

  it("hands over a PR labelled risk: high, among other labels (#3286)", () => {
    const gh = stubGh({ ...READY, labels: [{ name: "bug" }, { name: "risk: high" }] });
    expect(context(runHook("gh pr ready 12", readyIn("kompiro/karasu#12"), gh))).toContain(
      "/coderabbit-converge",
    );
  });

  it.each(["risk: design", "risk: medium", "risk: low"])(
    "stays silent for a PR labelled %s, which has no CodeRabbit rounds",
    (label) => {
      const gh = stubGh({ ...READY, labels: [{ name: "bug" }, { name: label }] });
      expect(runHook("gh pr ready 12", readyIn("kompiro/karasu#12"), gh)).toBe("");
    },
  );

  it("stays silent for a PR whose base is not the default branch (an upper stack layer)", () => {
    const gh = stubGh({ ...READY, baseRefName: "feat/3000-slice-1" });
    expect(runHook("gh pr ready 13", readyIn("kompiro/karasu#13"), gh)).toBe("");
  });

  it("compares the base with the repository's own default branch", () => {
    const gh = stubGh({ ...READY, baseRefName: "trunk" }, "trunk");
    expect(context(runHook("gh pr ready 5", readyIn("kompiro/other#5"), gh))).toContain(
      "PR kompiro/other#5",
    );
  });

  it("stays silent when gh cannot read the PR", () => {
    const gh = stubGh(null);
    expect(runHook("gh pr ready 12", readyIn("kompiro/karasu#12"), gh)).toBe("");
  });
});
