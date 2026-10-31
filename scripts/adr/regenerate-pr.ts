/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
// `pnpm adr:regenerate-pr`: opens and merges the PR that brings the generated ADR
// index on `main` up to date (Issue #3416). The flow is in `regenerate-pr-flow.ts`;
// this file is the real GitHub, git and clock it runs against.
//
// Everything on GitHub goes through REST (`gh api`): the routine's proxy refuses
// GraphQL, which every `gh pr` command uses.
//
// Exit codes: 0 merged, closed or nothing to do; 3 waited out (the PR stays and
// tomorrow's run picks it up); 1 anything else (TPL-2786).

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { AdrPaths } from "./generated.ts";
import {
  BASE,
  BRANCH,
  type CheckRun,
  type Clock,
  EXIT_CODES,
  type GitHub,
  type Pull,
  REPO,
  type Result,
  TITLE,
  type Workspace,
  regeneratePr,
} from "./regenerate-pr-flow.ts";

class HttpError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.status = status;
  }
}

function gh(args: string[]): string {
  try {
    return execFileSync("gh", ["api", ...args], {
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? "");
    const status = /HTTP (\d{3})/.exec(stderr);
    throw new HttpError(
      `gh api ${args.join(" ")}: ${stderr.trim()}`,
      status ? Number(status[1]) : null,
    );
  }
}

const ghJson = <T>(args: string[]): T => JSON.parse(gh(args)) as T;

/** Every item of a paginated list endpoint. */
const ghList = <T>(path: string, jq: string): T[] =>
  gh(["--paginate", path, "--jq", `${jq} | tojson`])
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as T);

const restGitHub: GitHub = {
  openPulls: () => ghList<Pull>(`repos/${REPO}/pulls?state=open&per_page=100`, ".[]"),
  pull: (n) => ghJson<Pull>([`repos/${REPO}/pulls/${n}`]),
  createPull: (body) =>
    ghJson<Pull>([
      "-X",
      "POST",
      `repos/${REPO}/pulls`,
      "-f",
      `title=${TITLE}`,
      "-f",
      `head=${BRANCH}`,
      "-f",
      `base=${BASE}`,
      "-f",
      `body=${body}`,
    ]),
  closePull: (n) => void gh(["-X", "PATCH", `repos/${REPO}/pulls/${n}`, "-f", "state=closed"]),
  addLabel: (n, name) =>
    void gh(["-X", "POST", `repos/${REPO}/issues/${n}/labels`, "-f", `labels[]=${name}`]),
  removeLabel: (n, name) =>
    void gh(["-X", "DELETE", `repos/${REPO}/issues/${n}/labels/${encodeURIComponent(name)}`]),
  branchSha: () => {
    try {
      const ref = ghJson<unknown>([`repos/${REPO}/git/ref/heads/${BRANCH}`]);
      // A prefix match comes back as an array; only an exact ref counts.
      return Array.isArray(ref) ? null : ((ref as { object: { sha: string } }).object.sha ?? null);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return null;
      throw e;
    }
  },
  requiredChecks: () =>
    ghList<string>(
      `repos/${REPO}/rules/branches/${BASE}`,
      '.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context',
    ),
  checkRuns: (sha) =>
    ghList<CheckRun>(
      `repos/${REPO}/commits/${sha}/check-runs?filter=latest&per_page=100`,
      ".check_runs[] | {name, status, conclusion, started_at, app: .app.slug}",
    ),
  merge: (n, sha) => {
    try {
      gh([
        "-X",
        "PUT",
        `repos/${REPO}/pulls/${n}/merge`,
        "-f",
        "merge_method=squash",
        "-f",
        `sha=${sha}`,
      ]);
      return { ok: true };
    } catch (e) {
      if (e instanceof HttpError) return { ok: false, message: e.message };
      throw e;
    }
  },
};

function gitIn(cwd: string, args: string[], quiet = false): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: quiet ? ["ignore", "pipe", "ignore"] : ["ignore", "pipe", "inherit"],
  });
}

/** The main checkout that owns the repository, whichever worktree the caller is in. */
function repoRoot(cwd: string): string {
  const common = gitIn(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim();
  if (basename(common) !== ".git") {
    throw new Error(`cannot place the worktree: ${common} is not a .git directory`);
  }
  return dirname(common);
}

function gitWorkspace(root: string): Workspace {
  const tree = join(root, ".claude", "worktrees", BRANCH);
  const git = (args: string[], quiet = false) => gitIn(root, args, quiet);
  const inTree = (args: string[]) => gitIn(tree, args);
  const outputPaths = (paths: AdrPaths) => paths.outputs.map((o) => join(paths.adrDir, o));
  const exec = (cmd: string, args: string[]) =>
    execFileSync(cmd, args, { cwd: tree, stdio: ["ignore", "inherit", "inherit"] });

  return {
    fetchMain: () =>
      void git(["fetch", "--no-tags", "origin", `+refs/heads/${BASE}:refs/remotes/origin/${BASE}`]),
    fetchPull: (n) => {
      git(["fetch", "--no-tags", "origin", `refs/pull/${n}/head`]);
      return git(["rev-parse", "FETCH_HEAD"]).trim();
    },
    config: (rev) => {
      try {
        return git(["show", `${rev}:adr.config.json`], true);
      } catch {
        return null;
      }
    },
    mergeBase: (a, b) => git(["merge-base", a, b]).trim(),
    nameStatus: (a, b) => git(["diff", "--no-renames", "--name-status", "-z", a, b]),
    worktreeExists: () => existsSync(tree),
    addWorktree: () => {
      git(["worktree", "add", "--detach", tree, `origin/${BASE}`]);
      exec("pnpm", ["install", "--frozen-lockfile"]);
    },
    regenerate: (paths) => {
      // A directory output is replaced whole, so a file the generator no longer
      // writes (a topic that lost its last ADR) goes away.
      for (const out of paths.outputs.filter((o) => o.endsWith("/"))) {
        rmSync(join(tree, paths.adrDir, out), { recursive: true, force: true });
      }
      exec("pnpm", ["exec", "adr", "regenerate"]);
    },
    commitGenerated: (paths) => {
      const changed = inTree(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
        .split("\0")
        .filter((l) => l !== "")
        .map((l) => l.slice(3));
      const generated = outputPaths(paths);
      const stray = changed.filter(
        (p) => !generated.some((g) => (g.endsWith("/") ? p.startsWith(g) : p === g)),
      );
      if (stray.length > 0) {
        throw new Error(`the generator changed files outside its outputs: ${stray.join(", ")}`);
      }
      if (changed.length === 0) return null;
      inTree(["add", "-A", "--", ...generated]);
      inTree(["commit", "-m", TITLE]);
      return inTree(["rev-parse", "HEAD"]).trim();
    },
    push: (lease) =>
      void inTree([
        "push",
        `--force-with-lease=${BRANCH}:${lease ?? ""}`,
        "origin",
        `HEAD:refs/heads/${BRANCH}`,
      ]),
    removeWorktree: () => {
      if (!existsSync(tree)) return;
      try {
        git(["worktree", "remove", "--force", tree]);
      } catch {
        rmSync(tree, { recursive: true, force: true });
        git(["worktree", "prune"]);
      }
    },
  };
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
};

function main(): number {
  let result: Result;
  try {
    result = regeneratePr({
      github: restGitHub,
      workspace: gitWorkspace(repoRoot(process.cwd())),
      clock: realClock,
      log: (m) => console.error(`adr:regenerate-pr: ${m}`),
    });
  } catch (e) {
    result = { outcome: "failed", message: e instanceof Error ? e.message : String(e) };
  }
  console.log(JSON.stringify(result));
  return EXIT_CODES[result.outcome];
}

if (process.argv[1]?.endsWith("regenerate-pr.ts")) {
  process.exitCode = main();
}
