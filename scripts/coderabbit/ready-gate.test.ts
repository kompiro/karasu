import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const WRAPPER_DIR = resolve(import.meta.dirname, "../bin");
const SESSION_PATH = resolve(import.meta.dirname, "session-path.sh");
const work = mkdtempSync(join(tmpdir(), "ready-gate-"));
const repo = join(work, "repo");
mkdirSync(repo);

afterAll(() => rmSync(work, { recursive: true, force: true }));

// Isolate the fixture repository from the caller's git: no inherited GIT_*
// variables (a hook would point them at the real repository) and no global or
// system config (commit.gpgsign, core.hooksPath, ...).
const isolated: NodeJS.ProcessEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};
delete isolated.KARASU_LOCAL_REVIEW_SKIPPED;

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

/**
 * A directory holding a fake "real" gh. It appends each argv to a log, prints
 * the PR view for `pr view` (or fails when `view` is null), and succeeds for
 * everything else. It never reaches GitHub.
 */
function fakeGh(view: PrView | null): { dir: string; log: string } {
  const dir = fresh("realgh");
  mkdirSync(dir);
  const log = join(dir, "calls.log");
  const viewFile = join(dir, "view.json");
  writeFileSync(viewFile, JSON.stringify(view));
  const onView = view === null ? "exit 1" : `cat '${viewFile}'; exit 0`;
  writeFileSync(
    join(dir, "gh"),
    [
      "#!/usr/bin/env bash",
      `printf '%s\\n' "$*" >> '${log}'`,
      `if [ "$1 $2" = "pr view" ]; then ${onView}; fi`,
      "echo real-gh-ran",
      "",
    ].join("\n"),
  );
  chmodSync(join(dir, "gh"), 0o755);
  return { dir, log };
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

/** Runs a shell command line the way a session's Bash would: the wrapper first on PATH. */
function run(
  line: string,
  gh: { dir: string },
  reviewsDir: string,
  extraEnv: Record<string, string> = {},
) {
  return spawnSync("bash", ["-c", line], {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...isolated,
      ...extraEnv,
      PATH: `${WRAPPER_DIR}:${gh.dir}:${isolated.PATH ?? ""}`,
      CODERABBIT_REVIEWS_DIR: reviewsDir,
    },
  });
}

const calls = (gh: { log: string }) =>
  existsSync(gh.log) ? readFileSync(gh.log, "utf8").trim().split("\n") : [];
const reachedRealGh = (gh: { log: string }, args: string) => calls(gh).includes(args);

const reviewedWork = () => reviews({ head: WORK, state: "complete" });

describe("gh wrapper: everything else", () => {
  it("passes other commands to the real gh untouched, without consulting the gate", () => {
    const gh = fakeGh(DRAFT);
    const result = run("gh issue list --limit 1", gh, reviews());
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("real-gh-ran");
    expect(calls(gh)).toEqual(["issue list --limit 1"]);
  });

  it("runs the real gh with the wrapper removed from PATH, so a nested gh does not loop back", () => {
    const gh = fakeGh(DRAFT);
    writeFileSync(join(gh.dir, "gh"), '#!/usr/bin/env bash\necho "PATH=$PATH"\n');
    const result = run("gh --version", gh, reviews());
    expect(result.status).toBe(0);
    const path = result.stdout
      .trim()
      .replace(/^PATH=/, "")
      .split(":");
    expect(path).not.toContain(WRAPPER_DIR);
    expect(path).toContain(gh.dir);
  });

  it("fails with 127 when no real gh is on PATH", () => {
    // A PATH with what the wrapper itself needs (bash, dirname) and no gh.
    const tools = fresh("tools");
    mkdirSync(tools);
    for (const tool of ["bash", "dirname"]) {
      const target = execFileSync("bash", ["-c", `command -v ${tool}`], {
        encoding: "utf8",
      }).trim();
      symlinkSync(target, join(tools, tool));
    }
    const result = spawnSync(join(tools, "bash"), ["-c", "gh --version"], {
      cwd: repo,
      encoding: "utf8",
      env: { ...isolated, PATH: `${WRAPPER_DIR}:${tools}` },
    });
    expect(result.status).toBe(127);
    expect(result.stderr).toContain("gh: not found on PATH");
  });
});

describe("gh wrapper: gh pr ready", () => {
  it("runs the ready when a completed CLI review covers an earlier commit of the branch", () => {
    const gh = fakeGh(DRAFT);
    const result = run("gh pr ready 12", gh, reviewedWork());
    expect(result.status).toBe(0);
    expect(reachedRealGh(gh, "pr ready 12")).toBe(true);
  });

  it("refuses the ready when no CLI review exists, naming both steps and the skip", () => {
    const gh = fakeGh(DRAFT);
    const result = run("gh pr ready 12", gh, reviews());
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PR #12");
    expect(result.stderr).toContain("/engineering:code-review");
    expect(result.stderr).toContain(
      "coderabbit review --agent --deep --base origin/main --committed",
    );
    expect(result.stderr).toContain("KARASU_LOCAL_REVIEW_SKIPPED=<reason> gh pr ready 12");
    expect(reachedRealGh(gh, "pr ready 12")).toBe(false);
  });

  it.each([
    [
      "only reviews a commit already on the base branch",
      () => reviews({ head: BASE, state: "complete" }),
    ],
    ["did not complete", () => reviews({ head: WORK, state: "running" }, { head: HEAD })],
    [
      "reviewed a commit outside the PR's head",
      () =>
        reviews({
          head: git("commit-tree", "-p", BASE, "-m", "elsewhere", `${BASE}^{tree}`),
          state: "complete",
        }),
    ],
  ])("refuses when the review %s", (_why, store) => {
    const gh = fakeGh(DRAFT);
    const result = run("gh pr ready 12", gh, store());
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PR #12");
  });

  // The point of the wrapper: it sees gh's real arguments, however the line was built.
  it.each([
    ['cmd="gh pr re""ady 12"; eval "$cmd"', "a command built by string concatenation and eval"],
    ["printf 'echo x\\ngh pr ready 12\\n' > ship.sh && bash ship.sh", "a script file"],
    ["echo 12 | xargs gh pr ready", "xargs"],
    ["env -u FOO timeout -s INT 15 gh pr ready 12", "wrappers with options"],
    ["if true; then gh pr  ready 12; fi", "a compound command with doubled spaces"],
    ["gh pr create --draft --title x && gh pr ready 12", "after an allowed draft create"],
    [
      "KARASU_LOCAL_REVIEW_SKIPPED=reason KARASU_LOCAL_REVIEW_SKIPPED= gh pr ready 12",
      "the last, empty skip assignment",
    ],
  ])("refuses a ready reached through %s", (line) => {
    const gh = fakeGh(DRAFT);
    const result = run(line, gh, reviews());
    expect(result.stderr).toContain("gh pr ready was refused");
    expect(reachedRealGh(gh, "pr ready 12")).toBe(false);
  });

  it.each(["skip-coderabbit", "adr-auto-merge", "risk: low"])(
    "refuses a PR labelled %s too: every tier records the CLI run (#3286)",
    (label) => {
      const gh = fakeGh({ ...DRAFT, labels: [{ name: label }] });
      expect(run("gh pr ready 12", gh, reviews()).stderr).toContain("gh pr ready was refused");
      expect(reachedRealGh(gh, "pr ready 12")).toBe(false);
    },
  );

  it("runs the ready for a PR that is not a draft", () => {
    expect(run("gh pr ready 12", fakeGh({ ...DRAFT, isDraft: false }), reviews()).status).toBe(0);
  });

  it("runs a deliberate skip that names a reason", () => {
    const gh = fakeGh(DRAFT);
    const result = run(
      "KARASU_LOCAL_REVIEW_SKIPPED=cli-not-authenticated gh pr ready 12",
      gh,
      reviews(),
    );
    expect(result.status).toBe(0);
    expect(calls(gh)).toEqual(["pr ready 12"]);
  });

  it.each([
    "KARASU_LOCAL_REVIEW_SKIPPED= gh pr ready 12",
    'KARASU_LOCAL_REVIEW_SKIPPED="  " gh pr ready 12',
  ])("does not count a skip without a reason: %s", (line) => {
    expect(run(line, fakeGh(DRAFT), reviews()).status).toBe(1);
  });

  it.each([
    "gh pr ready 12 --undo",
    "gh pr ready 12 --repo kompiro/other",
    "gh pr ready -R kompiro/other 12",
    "gh pr ready -R=kompiro/other 12",
    "gh pr ready -Rkompiro/other 12",
  ])("runs `%s` without consulting the PR", (line) => {
    const gh = fakeGh(DRAFT);
    expect(run(line, gh, reviews()).status).toBe(0);
    expect(calls(gh).some((c) => c.startsWith("pr view"))).toBe(false);
  });

  it("fails open when gh cannot read the PR", () => {
    const gh = fakeGh(null);
    expect(run("gh pr ready 12", gh, reviews()).status).toBe(0);
    expect(reachedRealGh(gh, "pr ready 12")).toBe(true);
  });

  it("fails open when review records exist but none can be read (the CLI format changed)", () => {
    const store = reviews({ head: "", state: "complete", gitJson: '{"reviewedCommit": "abc"}' });
    expect(run("gh pr ready 12", fakeGh(DRAFT), store).status).toBe(0);
  });
});

describe("gh wrapper: gh pr create", () => {
  it.each([
    "gh pr create --draft --title x --body-file b.md",
    "gh pr create -d --fill",
    "gh pr create -dw",
    "gh pr create -tTitle -d",
    "gh pr create --draft=true --title x",
    "gh pr create -d=true --title x",
    "gh pr create -d=false -d",
  ])("runs a draft create: %s", (line) => {
    const gh = fakeGh(DRAFT);
    expect(run(line, gh, reviews()).status).toBe(0);
    expect(calls(gh)).toHaveLength(1);
  });

  it.each([
    ["gh pr create --title x --body-file b.md", "without --draft"],
    [
      'gh pr create --title x --body "Please use --draft next time"',
      "with --draft only in the body",
    ],
    ['cmd="gh pr cre""ate --title x"; eval "$cmd"', "built by eval"],
    ["gh pr create --body --draft --title x", "where --draft is the value of --body"],
    ["gh pr create -t -d", "where -d is the value of -t"],
    ["gh pr create --draft=false --title x", "with --draft=false"],
    ["gh pr create --title x -- --draft", "with --draft after --"],
    ["gh pr create -d=false --title x", "with -d=false"],
    ["gh pr create -wd=false", "with -d=false at the end of a cluster"],
    ["gh pr create -d -d=false", "where a later -d=false wins"],
    ["gh pr create -t=-d", "where -d is the attached value of -t"],
  ])("refuses a create %s", (line) => {
    const gh = fakeGh(DRAFT);
    const result = run(line, gh, reviews());
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("gh pr create --draft");
    expect(calls(gh)).toEqual([]);
  });

  // A create without --draft skips gh pr ready, so it is held to the same
  // review: a Low ADR PR is opened this way (#3504).
  it.each([
    'gh pr create --label "risk: low" --title x --body-file b.md',
    "gh pr create --base main --title x",
    "gh pr create --base=main --title x",
    "gh pr create -B main --title x",
    "gh pr create -Bmain --title x",
    "gh pr create --head chore/1-example --title x",
  ])("runs a create without --draft once the CLI reviewed the branch: %s", (line) => {
    const gh = fakeGh(DRAFT);
    expect(run(line, gh, reviewedWork()).status).toBe(0);
    expect(calls(gh)).toHaveLength(1);
  });

  it("names the CLI review and the skip when it refuses a create without --draft", () => {
    const result = run("gh pr create --title x", fakeGh(DRAFT), reviews());
    expect(result.stderr).toContain(
      "coderabbit review --agent --deep --base origin/main --committed",
    );
    expect(result.stderr).toContain("KARASU_LOCAL_REVIEW_SKIPPED=<reason> gh pr create");
  });

  it.each([
    ["the review only covers the base branch", "gh pr create --title x", BASE],
    ["--head names a branch the review is not on", "gh pr create --head main --title x", WORK],
    ["-H names a branch the review is not on", "gh pr create -Hmain --title x", WORK],
  ])("refuses a create without --draft when %s", (_why, line, reviewed) => {
    const gh = fakeGh(DRAFT);
    const result = run(line, gh, reviews({ head: reviewed, state: "complete" }));
    expect(result.status).toBe(1);
    expect(calls(gh)).toEqual([]);
  });

  it("runs a create without --draft on a deliberate skip that names a reason", () => {
    const gh = fakeGh(DRAFT);
    const line = "KARASU_LOCAL_REVIEW_SKIPPED=cli-out-of-quota gh pr create --title x";
    expect(run(line, gh, reviews()).status).toBe(0);
    expect(calls(gh)).toEqual(["pr create --title x"]);
  });

  it("does not count a skip without a reason for a create", () => {
    expect(
      run("KARASU_LOCAL_REVIEW_SKIPPED= gh pr create --title x", fakeGh(DRAFT), reviews()).status,
    ).toBe(1);
  });
});

describe("bash 3.2 compatibility", () => {
  // macOS ships bash 3.2, where expanding an empty array under `set -u` fails
  // with "unbound variable". In these scripts that failure lands in an
  // `|| exit 0`, which would silently switch the gate off.
  it.each(["../bin/gh", "ready-gate.sh", "session-path.sh", "converge-after-ready.sh"])(
    "%s expands no array in a way that fails on an empty one",
    (file) => {
      const source = readFileSync(resolve(import.meta.dirname, file), "utf8");
      const unsafe = source
        .split("\n")
        .filter((line) => /(?<!\+)"\$\{\w+\[@\]\}"|\$\{#\w+\[@\]\}/.test(line))
        .filter((line) => !/\$\{\w+\[@\]\+"\$\{\w+\[@\]\}"\}/.test(line));
      expect(unsafe).toEqual([]);
    },
  );
});

describe("session-path.sh", () => {
  it("puts the wrapper first on PATH once, however often SessionStart runs", () => {
    const envFile = fresh("envfile");
    const projectDir = resolve(import.meta.dirname, "../..");
    for (let i = 0; i < 2; i++) {
      execFileSync("bash", [SESSION_PATH], {
        env: { ...isolated, CLAUDE_ENV_FILE: envFile, CLAUDE_PROJECT_DIR: projectDir },
      });
    }
    const result = spawnSync(
      "bash",
      ["-c", `source '${envFile}'; source '${envFile}'; echo "$PATH"; type -p gh`],
      { encoding: "utf8", env: { ...isolated, PATH: "/usr/bin:/bin" } },
    );
    const [path, gh] = result.stdout.trim().split("\n");
    expect(path.split(":").filter((entry) => entry === WRAPPER_DIR)).toHaveLength(1);
    expect(path.split(":")[0]).toBe(WRAPPER_DIR);
    expect(gh).toBe(join(WRAPPER_DIR, "gh"));
  });

  it("does nothing outside a SessionStart hook (no CLAUDE_ENV_FILE)", () => {
    const result = spawnSync("bash", [SESSION_PATH], {
      encoding: "utf8",
      env: { ...isolated, CLAUDE_ENV_FILE: "" },
    });
    expect(result.status).toBe(0);
  });
});
