// The "before" checkout (Issue #3359, design "案 1-A"): a detached worktree at
// the merge base, installed just enough to load its `packages/core`, and
// removed when the run ends, failed or interrupted. It has no branch, so a
// leftover would sit in `git worktree list` looking like someone's work.
//
// It lives where every worktree here lives, `.claude/worktrees/` of the main
// checkout (CLAUDE.md), not inside the worktree the script runs from. The
// path carries the run's host and pid: parallel sessions on branches forked
// from the same main commit would otherwise share it and delete each other's
// checkout, and a pid means nothing outside its own host (two containers can
// mount the same checkout).

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";

function git(cwd: string, args: readonly string[]): string {
  // quotePath off: a non-ASCII path would otherwise come back quoted and escaped.
  const result = spawnSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

/** The commit HEAD forked from `ref` at (`origin/main` unless `--base` says otherwise). */
export function mergeBase(cwd: string, ref: string): string {
  return git(cwd, ["merge-base", ref, "HEAD"]);
}

export function headSha(cwd: string): string {
  return git(cwd, ["rev-parse", "HEAD"]);
}

/**
 * Paths that differ from `base`, repo-relative: committed, uncommitted and
 * untracked alike. HEAD's side renders the working tree, so the candidates
 * have to come from the same tree (an acceptance record written but not yet
 * committed is still this branch's model).
 */
export function changedFiles(cwd: string, base: string): string[] {
  const tracked = git(cwd, ["diff", "--name-only", base]).split("\n");
  const untracked = git(cwd, ["ls-files", "--others", "--exclude-standard"]).split("\n");
  return [...new Set([...tracked, ...untracked].filter(Boolean))];
}

function worktreesDir(cwd: string): string {
  const commonDir = resolve(cwd, git(cwd, ["rev-parse", "--git-common-dir"]));
  return join(dirname(commonDir), ".claude/worktrees");
}

const HOST = hostname().replace(/[^A-Za-z0-9.-]+/g, "-") || "host";

/** `.claude/worktrees/pr-shots-base-<sha12>-<host>-<pid>` under the main checkout. */
export function baseWorktreePath(cwd: string, sha: string, pid = process.pid): string {
  return join(worktreesDir(cwd), `pr-shots-base-${sha.slice(0, 12)}-${HOST}-${pid}`);
}

const LEFTOVER_RE = /^pr-shots-base-[0-9a-f]{12}-(.+)-(\d+)$/;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Installs only core and what it depends on. `--ignore-scripts` keeps the
 * root `prepare` (lefthook) from rewiring the repository's hooks to a
 * checkout that is about to disappear.
 */
function installCore(dir: string): void {
  const args = [
    "install",
    "--frozen-lockfile",
    "--prefer-offline",
    "--ignore-scripts",
    "--filter",
    "@karasu-tools/core...",
  ];
  const result = spawnSync("pnpm", args, { cwd: dir, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(" ")} failed in ${dir}:\n${result.stderr || result.stdout}`);
  }
}

function removeWorktree(cwd: string, dir: string): void {
  spawnSync("git", ["worktree", "remove", "--force", dir], { cwd });
  // A directory git no longer tracks (a prune ran, a removal stopped halfway)
  // survives `worktree remove`, and would make the next `worktree add` fail.
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  spawnSync("git", ["worktree", "prune"], { cwd });
}

/**
 * Removes the checkouts that killed runs on this host left behind: their pid
 * is gone, or is this run's own (a pid reused after a restart; nothing this
 * run owns exists yet). Another host's checkouts are never touched, since
 * their pids cannot be checked from here.
 */
function removeLeftovers(cwd: string): void {
  const dir = worktreesDir(cwd);
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const match = LEFTOVER_RE.exec(name);
    if (match === null || match[1] !== HOST) continue;
    const pid = Number(match[2]);
    if (pid === process.pid || !isAlive(pid)) removeWorktree(cwd, join(dir, name));
  }
}

export interface BaseWorktreeOptions {
  /** Prepares the checkout before `fn` runs. Tests pass a no-op. */
  install?: (dir: string) => void;
}

/**
 * Runs `fn` with a detached checkout of `sha`, then removes it. Checkouts
 * that killed runs left behind are removed first, not reused: their install
 * may be half done.
 */
export async function withBaseWorktree<T>(
  cwd: string,
  sha: string,
  fn: (dir: string) => Promise<T>,
  { install = installCore }: BaseWorktreeOptions = {},
): Promise<T> {
  removeLeftovers(cwd);
  const dir = baseWorktreePath(cwd, sha);

  const cleanup = () => removeWorktree(cwd, dir);
  const onSignal = (signal: NodeJS.Signals) => {
    cleanup();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    git(cwd, ["worktree", "add", "--detach", dir, sha]);
    install(dir);
    return await fn(dir);
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    cleanup();
  }
}
