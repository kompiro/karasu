import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = resolve(import.meta.dirname, "refuse-commit-on-main.sh");
const REPO_ROOT = resolve(import.meta.dirname, "../..");
const repo = mkdtempSync(join(tmpdir(), "refuse-main-"));

afterAll(() => rmSync(repo, { recursive: true, force: true }));

// Read no global or system git config, so a developer's settings (commit.gpgsign,
// core.hooksPath, init.templateDir, ...) cannot reject or alter the fixture
// commits. Identity is then the only thing to supply.
const isolated = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

const git = (...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
    cwd: repo,
    encoding: "utf8",
    env: isolated,
  });

git("init", "-q", "-b", "main");
git("commit", "-q", "--allow-empty", "-m", "root");

const runCheck = () => spawnSync("bash", [SCRIPT], { cwd: repo, encoding: "utf8", env: isolated });

describe("refuse-commit-on-main", () => {
  it("refuses on main and points at a worktree branch", () => {
    git("switch", "-q", "main");
    const result = runCheck();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to commit on main");
    expect(result.stderr).toContain("git worktree add .claude/worktrees/<branch>");
  });

  it("allows a feature branch", () => {
    // -C: each test sets its own HEAD, so the cases do not depend on run order.
    git("switch", "-q", "-C", "chore/3335-example", "main");
    expect(runCheck().status).toBe(0);
  });

  it("allows a detached HEAD (rebase, bisect)", () => {
    git("switch", "-q", "--detach", "main");
    expect(runCheck().status).toBe(0);
  });

  it("is wired to both commit-creating hooks in lefthook.yml", () => {
    const config = readFileSync(join(REPO_ROOT, "lefthook.yml"), "utf8");
    for (const hook of ["pre-commit", "pre-merge-commit"]) {
      const section = config.split(new RegExp(`^${hook}:\\n`, "m"))[1]?.split(/^\S/m)[0] ?? "";
      // The hook name is in the compared value so a failure says which hook lost the wiring.
      expect({ hook, wired: section.includes("scripts/git/refuse-commit-on-main.sh") }).toEqual({
        hook,
        wired: true,
      });
    }
  });
});
