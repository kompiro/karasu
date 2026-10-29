import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { baseWorktreePath, changedFiles, mergeBase, withBaseWorktree } from "./base-worktree.ts";

const repo = mkdtempSync(join(tmpdir(), "pr-shots-repo-"));
afterAll(() => rmSync(repo, { recursive: true, force: true }));

function git(...args: string[]): string {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

git("init", "-q", "-b", "main");
git("config", "user.email", "test@example.com");
git("config", "user.name", "test");
writeFileSync(join(repo, "model.krs"), "before\n");
git("add", ".");
git("commit", "-q", "-m", "base");
const BASE = git("rev-parse", "HEAD");
git("checkout", "-q", "-b", "feat/x");
writeFileSync(join(repo, "model.krs"), "after\n");
writeFileSync(join(repo, "added.md"), "new\n");
git("add", ".");
git("commit", "-q", "-m", "change");
git("checkout", "-q", "main");
writeFileSync(join(repo, "main-only.txt"), "later on main\n");
git("add", ".");
git("commit", "-q", "-m", "main moves on");
git("checkout", "-q", "feat/x");

const worktrees = () => git("worktree", "list");

describe("base worktree", () => {
  it("resolves the merge base and the branch's own diff, main's later commits aside", () => {
    expect(mergeBase(repo, "main")).toBe(BASE);
    expect(changedFiles(repo, BASE).sort()).toEqual(["added.md", "model.krs"]);
  });

  it("counts uncommitted and untracked files, since HEAD's side renders the working tree", () => {
    writeFileSync(join(repo, "draft.md"), "not yet added\n");
    try {
      expect(changedFiles(repo, BASE).sort()).toEqual(["added.md", "draft.md", "model.krs"]);
    } finally {
      rmSync(join(repo, "draft.md"));
    }
  });

  it("places the checkout under .claude/worktrees of the main checkout, per run", () => {
    expect(baseWorktreePath(repo, BASE, 4242)).toMatch(
      new RegExp(`/\\.claude/worktrees/pr-shots-base-${BASE.slice(0, 12)}-4242$`),
    );
    expect(baseWorktreePath(repo, BASE)).toMatch(new RegExp(`-${process.pid}$`));
  });

  it("checks out the base, installs it, and removes it afterwards", async () => {
    const installed: string[] = [];
    const seen = await withBaseWorktree(
      repo,
      BASE,
      async (dir) => {
        expect(worktrees()).toContain(dir);
        return readFileSync(join(dir, "model.krs"), "utf8");
      },
      { install: (dir) => installed.push(dir) },
    );
    expect(seen).toBe("before\n");
    expect(installed).toEqual([baseWorktreePath(repo, BASE)]);
    expect(existsSync(baseWorktreePath(repo, BASE))).toBe(false);
    expect(worktrees()).not.toContain("pr-shots-base");
  });

  it("removes the checkout when the work fails", async () => {
    await expect(
      withBaseWorktree(
        repo,
        BASE,
        async () => {
          throw new Error("render failed");
        },
        { install: () => {} },
      ),
    ).rejects.toThrow("render failed");
    expect(worktrees()).not.toContain("pr-shots-base");
  });

  it("removes what a killed run left behind, and keeps a live run's checkout", async () => {
    const deadPid = spawnSync("true").pid ?? 0;
    const dead = baseWorktreePath(repo, BASE, deadPid);
    const live = baseWorktreePath(repo, BASE, process.ppid);
    git("worktree", "add", "--detach", dead, BASE);
    git("worktree", "add", "--detach", live, BASE);
    try {
      await withBaseWorktree(repo, BASE, async () => undefined, { install: () => {} });
      expect(existsSync(dead)).toBe(false);
      expect(existsSync(live)).toBe(true);
    } finally {
      git("worktree", "remove", "--force", live);
    }
    expect(worktrees()).not.toContain("pr-shots-base");
  });

  it("replaces a directory git no longer tracks", async () => {
    const dead = baseWorktreePath(repo, BASE, spawnSync("true").pid ?? 0);
    mkdirSync(dead, { recursive: true });
    writeFileSync(join(dead, "half-installed"), "");
    await withBaseWorktree(repo, BASE, async () => undefined, { install: () => {} });
    expect(existsSync(dead)).toBe(false);
  });
});
