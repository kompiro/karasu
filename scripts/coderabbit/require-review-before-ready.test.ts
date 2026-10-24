import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const HOOK = resolve(import.meta.dirname, "require-review-before-ready.sh");
const work = mkdtempSync(join(tmpdir(), "ready-gate-"));
const repo = join(work, "repo");
mkdirSync(repo);

afterAll(() => rmSync(work, { recursive: true, force: true }));

// Isolate the fixture repository from the caller's git: no inherited GIT_*
// variables (a hook would point them at the real repository) and no global or
// system config (commit.gpgsign, core.hooksPath, ...).
const isolated = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

const git = (...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
    cwd: repo,
    encoding: "utf8",
    env: isolated,
  }).trim();

git("init", "-q", "-b", "main");
git("commit", "-q", "--allow-empty", "-m", "base");
const BASE = git("rev-parse", "HEAD");
git("update-ref", "refs/remotes/origin/main", BASE);
git("switch", "-q", "-c", "chore/1-example");
git("commit", "-q", "--allow-empty", "-m", "work");
const WORK = git("rev-parse", "HEAD");
git("commit", "-q", "--allow-empty", "-m", "fix after the CLI review");
const HEAD = git("rev-parse", "HEAD");

interface PrView {
  number: number;
  isDraft: boolean;
  labels: { name: string }[];
  body: string;
  headRefOid: string;
  baseRefName: string;
}

const DRAFT: PrView = {
  number: 12,
  isDraft: true,
  labels: [],
  body: "Closes #1",
  headRefOid: HEAD,
  baseRefName: "main",
};

let count = 0;
const fresh = (name: string) => join(work, `${name}-${++count}`);

/** A fake gh that records its argv and prints the PR view, or fails when `view` is null. */
function stubGh(view: PrView | null): { bin: string; argsFile: string } {
  const bin = fresh("gh");
  const argsFile = `${bin}.args`;
  const viewFile = `${bin}.json`;
  writeFileSync(viewFile, JSON.stringify(view));
  const tail = view === null ? "exit 1" : `cat '${viewFile}'`;
  writeFileSync(bin, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" > '${argsFile}'\n${tail}\n`);
  chmodSync(bin, 0o755);
  return { bin, argsFile };
}

/** A CLI review store with one record per entry, laid out as the CLI writes it. */
function reviews(...records: { head: string; state?: string; gitJson?: string }[]): string {
  const root = fresh("reviews");
  records.forEach((record, i) => {
    const dir = join(root, "repohash", "branchhash", "reviews", String(1000 + i));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "git.json"), record.gitJson ?? JSON.stringify({ head: record.head }));
    if (record.state !== undefined) {
      writeFileSync(join(dir, ".session-complete-v2"), JSON.stringify({ state: record.state }));
    }
  });
  return root;
}

function runHook(command: string, gh: { bin: string }, reviewsDir: string): string {
  const input = JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: repo });
  const result = spawnSync("bash", [HOOK], {
    input,
    encoding: "utf8",
    env: { ...isolated, READY_GATE_GH: gh.bin, CODERABBIT_REVIEWS_DIR: reviewsDir },
  });
  expect(result.status).toBe(0);
  return result.stdout;
}

function denial(stdout: string): string {
  const parsed = JSON.parse(stdout) as {
    hookSpecificOutput: {
      hookEventName: string;
      permissionDecision: string;
      permissionDecisionReason: string;
    };
  };
  expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
  expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  return parsed.hookSpecificOutput.permissionDecisionReason;
}

const reviewedWork = () => reviews({ head: WORK, state: "complete" });

describe("require-review-before-ready: gh pr ready", () => {
  it("lets the ready through when a completed CLI review covers an earlier commit of the branch", () => {
    const gh = stubGh(DRAFT);
    expect(runHook("gh pr ready 12", gh, reviewedWork())).toBe("");
    expect(readFileSync(gh.argsFile, "utf8").trim()).toBe(
      "pr view 12 --json number,isDraft,labels,body,headRefOid,baseRefName",
    );
  });

  it("refuses the ready when no CLI review exists, naming both review steps", () => {
    const reason = denial(runHook("gh pr ready 12", stubGh(DRAFT), reviews()));
    expect(reason).toContain("PR #12");
    expect(reason).toContain("/engineering:code-review");
    expect(reason).toContain("coderabbit review --agent --deep --base origin/main --committed");
    expect(reason).toContain("KARASU_LOCAL_REVIEW_SKIPPED=<reason> gh pr ready 12");
  });

  it("refuses when the only review covers a commit already on the base branch", () => {
    const store = reviews({ head: BASE, state: "complete" });
    expect(denial(runHook("gh pr ready 12", stubGh(DRAFT), store))).toContain("PR #12");
  });

  it("refuses when the review did not complete", () => {
    const store = reviews({ head: WORK, state: "running" }, { head: HEAD });
    expect(denial(runHook("gh pr ready 12", stubGh(DRAFT), store))).toContain("PR #12");
  });

  it("refuses when the reviewed commit is not on the PR's head", () => {
    const other = git("commit-tree", "-p", BASE, "-m", "elsewhere", `${BASE}^{tree}`);
    const store = reviews({ head: other, state: "complete" });
    expect(denial(runHook("gh pr ready 12", stubGh(DRAFT), store))).toContain("PR #12");
  });

  it("reads the PR of the directory a leading cd moves into", () => {
    const gh = stubGh(DRAFT);
    const input = `cd ${repo} && gh pr ready 12 && gh issue edit 1 --add-label "status: in-review"`;
    expect(runHook(input, gh, reviewedWork())).toBe("");
  });

  it.each(["skip-coderabbit", "adr-auto-merge"])("lets a PR labelled %s through", (label) => {
    const gh = stubGh({ ...DRAFT, labels: [{ name: label }] });
    expect(runHook("gh pr ready 12", gh, reviews())).toBe("");
  });

  it("lets a PR whose body holds the ignore command through", () => {
    const gh = stubGh({ ...DRAFT, body: "Typo.\n\n@coderabbitai ignore\n" });
    expect(runHook("gh pr ready 12", gh, reviews())).toBe("");
  });

  it("lets a PR that is not a draft through", () => {
    expect(runHook("gh pr ready 12", stubGh({ ...DRAFT, isDraft: false }), reviews())).toBe("");
  });

  it("lets a deliberate skip through without asking gh", () => {
    const gh = stubGh(DRAFT);
    const out = runHook(
      "KARASU_LOCAL_REVIEW_SKIPPED=cli-not-authenticated gh pr ready 12",
      gh,
      reviews(),
    );
    expect(out).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
  });

  it.each([
    "gh pr ready 12 --undo",
    "gh pr ready 12 --repo kompiro/other",
    "gh pr ready -R kompiro/other 12",
  ])("lets `%s` through without asking gh", (command) => {
    const gh = stubGh(DRAFT);
    expect(runHook(command, gh, reviews())).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
  });

  it("fails open when gh cannot read the PR", () => {
    expect(runHook("gh pr ready 12", stubGh(null), reviews())).toBe("");
  });

  it("fails open when review records exist but none can be read (the CLI format changed)", () => {
    const store = reviews({ head: "", state: "complete", gitJson: '{"reviewedCommit": "abc"}' });
    expect(runHook("gh pr ready 12", stubGh(DRAFT), store)).toBe("");
  });

  it.each([
    ['grep -rn "gh pr ready" docs/process.md', "a quoted mention"],
    ["cat > notes.md <<'EOF'\ngh pr ready 12\nEOF", "a heredoc body"],
    ["gh pr view 12 --json isDraft", "another gh pr subcommand"],
  ])("ignores %s (%s)", (command) => {
    const gh = stubGh(DRAFT);
    expect(runHook(command, gh, reviews())).toBe("");
    expect(existsSync(gh.argsFile)).toBe(false);
  });
});

describe("require-review-before-ready: gh pr create", () => {
  it.each([
    "gh pr create --draft --title x --body-file b.md",
    "gh pr create -d --fill",
    `gh pr create --title x --body "$(cat <<'EOF'\nSummary\nEOF\n)" --draft`,
  ])("lets a draft through: %s", (command) => {
    expect(runHook(command, stubGh(DRAFT), reviews())).toBe("");
  });

  it("refuses a PR created ready, since it would skip the gate", () => {
    const reason = denial(
      runHook("gh pr create --title x --body-file b.md", stubGh(DRAFT), reviews()),
    );
    expect(reason).toContain("gh pr create --draft");
  });

  it.each([
    [
      "cat > b.md <<'EOF'\nSummary\nEOF\ngh pr create --title x --body-file b.md",
      "after a heredoc",
    ],
    [
      'gh pr create --title x --body "Please use --draft next time"',
      "with --draft only in the body",
    ],
    ["gh pr create --title x # --draft", "with --draft only in a comment"],
  ])("refuses a ready PR created %s", (command) => {
    expect(denial(runHook(command, stubGh(DRAFT), reviews()))).toContain("gh pr create --draft");
  });
});

describe("require-review-before-ready: commands that write a file first", () => {
  it("still gates a ready that follows a heredoc in the same call", () => {
    const command = "cat > notes.md <<'EOF'\nready soon\nEOF\ngh pr ready 12";
    expect(denial(runHook(command, stubGh(DRAFT), reviews()))).toContain("PR #12");
  });
});
