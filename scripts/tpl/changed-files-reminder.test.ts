import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const HOOK = resolve(import.meta.dirname, "changed-files-reminder.sh");
const work = realpathSync(mkdtempSync(join(tmpdir(), "tpl-changed-hook-")));

afterAll(() => rmSync(work, { recursive: true, force: true }));

// Isolate the fixture repository from the caller's git (as in
// scripts/git/refuse-commit-on-main.test.ts): no inherited GIT_* variable and
// no global or system config.
const isolated = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

/** The main checkout the hook starts in ($CLAUDE_PROJECT_DIR). */
const project = join(work, "project");
mkdirSync(project);
const git = (...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
    cwd: project,
    encoding: "utf8",
    env: isolated,
  });
git("init", "-q", "-b", "main");
git("commit", "-q", "--allow-empty", "-m", "root");

/** The PR's worktree, with the head branch checked out. */
const worktree = join(work, "wt-feat");
git("worktree", "add", "-q", "-b", "feat/x", worktree);
/** A worktree whose node_modules was never installed. */
const bare = join(work, "wt-bare");
git("worktree", "add", "-q", "-b", "other/bare", bare);

const tplLog = join(worktree, "tpl.log");
const tplOut = join(worktree, "tpl.out");
const tplBin = join(worktree, "node_modules/.bin/tpl");
mkdirSync(join(worktree, "node_modules/.bin"), { recursive: true });
writeFileSync(
  tplBin,
  [
    "#!/usr/bin/env bash",
    `printf '%s|%s\\n' "$PWD" "$*" >> '${tplLog}'`,
    `[ -f '${tplOut}.fail' ] && exit 1`,
    `cat '${tplOut}.err' >&2`,
    `cat '${tplOut}'`,
    "",
  ].join("\n"),
);
chmodSync(tplBin, 0o755);

/** tpl-tools' own zero-match line, pinned against the real binary below. */
const ZERO_MATCH = "No active TPL names a changed file.\n";

/** What the stub tpl prints on stdout and stderr, or a failure. */
function tplPrints(stdout: string | null, stderr = ""): void {
  rmSync(tplLog, { force: true });
  rmSync(`${tplOut}.fail`, { force: true });
  writeFileSync(tplOut, stdout ?? "");
  writeFileSync(`${tplOut}.err`, stderr);
  if (stdout === null) writeFileSync(`${tplOut}.fail`, "");
}

const tplCalls = () => (existsSync(tplLog) ? readFileSync(tplLog, "utf8").trim().split("\n") : []);

let stubCount = 0;

/** A fake gh: `pr view` prints "<head> <base>" as `--jq` would, or fails when null. */
function stubGh(refs: string | null): { bin: string; argsFile: string } {
  stubCount += 1;
  const bin = join(work, `gh-${stubCount}`);
  const argsFile = join(work, `gh-${stubCount}.args`);
  writeFileSync(
    bin,
    [
      "#!/usr/bin/env bash",
      `printf '%s\\n' "$*" >> '${argsFile}'`,
      `case "$1 $2" in`,
      `  "pr view") ${refs === null ? "exit 1" : `echo '${refs}'`} ;;`,
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(bin, 0o755);
  return { bin, argsFile };
}

const PR_URL = "https://github.com/kompiro/karasu/pull/42\n";
const CREATE = "cd .claude/worktrees/feat/x && gh pr create --draft --body-file /tmp/body.md";
const LIST =
  "- [TPL-1755](docs/test-perspectives/TPL-1755-x.md) — edge endpoints · via `packages/core/src/a.ts`\n" +
  "\n4 more of 14; pass --limit 0 to list all.";

type Event =
  | { hook_event_name: "PostToolUse"; tool_response: { stdout?: string; stderr?: string } }
  | { hook_event_name: "PostToolUseFailure"; error: string; is_interrupt?: boolean };

const created = (stdout = PR_URL): Event => ({
  hook_event_name: "PostToolUse",
  tool_response: { stdout, stderr: "" },
});

function runHook(command: string, event: Event, gh: { bin: string }): string {
  // The input cwd points elsewhere on purpose: the hook must find the worktree
  // from the PR's head branch, not from the cwd.
  const input = JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: work, ...event });
  const result = spawnSync("bash", [HOOK], {
    input,
    cwd: project,
    encoding: "utf8",
    env: { ...isolated, CLAUDE_PROJECT_DIR: project, TPL_CHANGED_HOOK_GH: gh.bin },
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

describe("tpl changed-files reminder hook", () => {
  it("lists the matching TPLs from the PR's worktree against its base and asks to cite them", () => {
    tplPrints(LIST);
    const gh = stubGh("feat/x main");
    const ctx = context(runHook(CREATE, created(), gh));
    expect(ctx).toContain("PR kompiro/karasu#42");
    expect(ctx).toContain(LIST);
    expect(ctx).toContain("`pnpm tpl:changed`");
    expect(ctx).toContain("## TPL impact");
    expect(tplCalls()).toEqual([`${worktree}|related --config tpl.config.json --base origin/main`]);
    expect(readFileSync(gh.argsFile, "utf8").trim()).toBe(
      'pr view 42 --repo kompiro/karasu --json headRefName,baseRefName --jq .headRefName + " " + .baseRefName',
    );
  });

  it("diffs a stacked PR against its own base, not main", () => {
    tplPrints(LIST);
    const ctx = context(runHook(CREATE, created(), stubGh("feat/x feat/lower")));
    // tpl:changed already carries --base origin/main; the rerun must not add a second one.
    expect(ctx).toContain("`pnpm tpl:related --base origin/feat/lower`");
    expect(tplCalls()).toEqual([
      `${worktree}|related --config tpl.config.json --base origin/feat/lower`,
    ]);
  });

  it("says so and points to the topic query when no TPL matches", () => {
    tplPrints("", ZERO_MATCH);
    const ctx = context(runHook(CREATE, created(), stubGh("feat/x main")));
    expect(ctx).toContain("No TPL names a file PR kompiro/karasu#42 changes");
    expect(ctx).toContain("pnpm tpl:related <topic>");
  });

  it("stays silent when tpl prints nothing for another reason (a tpl-tools without --base)", () => {
    // tpl-tools before 0.0.14 reads --base's value as a topic and exits 0.
    tplPrints("", 'No active TPLs found for topic "origin/main".\n');
    expect(runHook(CREATE, created(), stubGh("feat/x main"))).toBe("");
  });

  it("stays silent when the PR has no changed files", () => {
    tplPrints("", "No changed files, so no TPL to list.\n");
    expect(runHook(CREATE, created(), stubGh("feat/x main"))).toBe("");
  });

  it("lists on PostToolUseFailure, when a later command in the call failed", () => {
    tplPrints(LIST);
    const event: Event = { hook_event_name: "PostToolUseFailure", error: `Exit code 1\n${PR_URL}` };
    expect(
      context(runHook(`${CREATE} && false`, event, stubGh("feat/x main")), "PostToolUseFailure"),
    ).toContain(LIST);
  });

  it("stays silent and never calls gh when the output carries no PR URL", () => {
    tplPrints(LIST);
    const gh = stubGh("feat/x main");
    expect(
      runHook(`grep -n "gh pr create" docs/process.md`, created("docs/process.md:149\n"), gh),
    ).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
    expect(tplCalls()).toEqual([]);
  });

  it("stays silent and never calls gh for commands without pr create", () => {
    const gh = stubGh("feat/x main");
    expect(runHook("gh pr view 42 --json url", created(), gh)).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
  });

  it("stays silent when no worktree has the head branch checked out", () => {
    tplPrints(LIST);
    expect(runHook(CREATE, created(), stubGh("feat/elsewhere main"))).toBe("");
    expect(tplCalls()).toEqual([]);
  });

  it("does not take a branch whose name only starts with the head branch", () => {
    tplPrints(LIST);
    expect(runHook(CREATE, created(), stubGh("feat main"))).toBe("");
    expect(tplCalls()).toEqual([]);
  });

  it("stays silent when the worktree has no tpl binary installed", () => {
    expect(runHook(CREATE, created(), stubGh("other/bare main"))).toBe("");
  });

  it("stays silent when gh cannot read the PR", () => {
    tplPrints(LIST);
    expect(runHook(CREATE, created(), stubGh(null))).toBe("");
    expect(tplCalls()).toEqual([]);
  });

  it("stays silent when tpl fails (for example, an unknown base ref)", () => {
    tplPrints(null);
    expect(runHook(CREATE, created(), stubGh("feat/x feat/gone"))).toBe("");
    expect(tplCalls()).toHaveLength(1);
  });

  it("stays silent when the user interrupted the call", () => {
    tplPrints(LIST);
    const event: Event = {
      hook_event_name: "PostToolUseFailure",
      error: `Exit code 130\n${PR_URL}`,
      is_interrupt: true,
    };
    expect(runHook(CREATE, event, stubGh("feat/x main"))).toBe("");
  });

  it("reads the PR from the URL, including its repository", () => {
    tplPrints(LIST);
    const gh = stubGh("feat/x main");
    const ctx = context(runHook(CREATE, created("https://github.com/someone/fork/pull/7\n"), gh));
    expect(ctx).toContain("PR someone/fork#7");
    expect(readFileSync(gh.argsFile, "utf8")).toContain("pr view 7 --repo someone/fork");
  });
});

// The stub above stands in for tpl-tools' output contract. Pin the parts the
// hook relies on against the binary this repo installs, so a tpl-tools bump
// that changes them fails here instead of silently changing the hook's answer.
describe("the tpl-tools contract the hook relies on", () => {
  const repoRoot = resolve(import.meta.dirname, "../..");
  const tpl = (...args: string[]) =>
    spawnSync(
      join(repoRoot, "node_modules/.bin/tpl"),
      ["related", "--config", "tpl.config.json", ...args],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: isolated,
      },
    );

  it("prints nothing on stdout and the zero-match line on stderr when no TPL names a changed file", () => {
    // docs/ is outside sourcePrefixes, so no TPL can name it as a key.
    const result = tpl("--changed-files", "docs/process.md");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(ZERO_MATCH);
  });

  it("lists matches on stdout", () => {
    const result = tpl("--changed-files", "packages/core/src/parser/parser.ts", "--limit", "1");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^- \[TPL-\d+\]/);
    expect(result.stderr).toBe("");
  });
});
