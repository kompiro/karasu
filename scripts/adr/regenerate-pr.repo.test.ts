import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BRANCH } from "./regenerate-pr-flow.ts";
import { RELEASE_TAGS, gitWorkspace } from "./regenerate-pr.ts";

// The real git side of `pnpm adr:regenerate-pr`'s push (Issue #3925). The routine
// clones without tags, and the pre-push hook `diagnostic-ids-history` fails
// without a `karasu@*` tag, so every push was refused from 2026-11-09 on. The
// stand-in hook here fails the same way.

const HOOK = `#!/bin/sh
if [ -z "$(git tag --list 'karasu@*')" ]; then
  echo "pre-push: no karasu@* tag"
  exit 1
fi
`;

let dir: string;
let origin: string;
let root: string;
let tree: string;
const savedGitEnv: Record<string, string | undefined> = {};

const git = (cwd: string, args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// A caller's GIT_DIR or GIT_INDEX_FILE (a pre-push hook sets them) must not point
// the throwaway repositories' git at the real one, and the developer's global or
// system config (a `core.hooksPath` would skip the stand-in hook) must not apply.
// gitWorkspace reads process.env.
beforeAll(() => {
  for (const k of Object.keys(process.env).filter((name) => name.startsWith("GIT_"))) {
    savedGitEnv[k] = process.env[k];
    delete process.env[k];
  }
  process.env.GIT_CONFIG_GLOBAL = "/dev/null";
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

afterAll(() => {
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_NOSYSTEM;
  Object.assign(process.env, savedGitEnv);
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "adr-regenerate-pr-"));
  origin = join(dir, "origin.git");
  const seed = join(dir, "seed");
  git(dir, ["init", "-q", "--bare", "-b", "main", origin]);
  git(dir, ["init", "-q", "-b", "main", seed]);
  git(seed, ["config", "user.name", "test"]);
  git(seed, ["config", "user.email", "test@example.com"]);
  writeFileSync(join(seed, "README.md"), "seed\n");
  git(seed, ["add", "."]);
  git(seed, ["commit", "-q", "-m", "seed"]);
  git(seed, ["tag", "karasu@1.0.0"]);
  git(seed, ["push", "-q", origin, "main", "karasu@1.0.0"]);

  // The routine's checkout: no tags, and a pre-push hook that needs one.
  root = join(dir, "root");
  git(dir, ["clone", "-q", "--no-tags", origin, root]);
  git(root, ["config", "user.name", "test"]);
  git(root, ["config", "user.email", "test@example.com"]);
  const hook = join(root, ".git", "hooks", "pre-push");
  writeFileSync(hook, HOOK);
  chmodSync(hook, 0o755);

  // The script's worktree with a regeneration commit, as addWorktree and
  // commitGenerated leave it.
  tree = join(root, ".claude", "worktrees", BRANCH);
  git(root, ["worktree", "add", "-q", "--detach", tree, "origin/main"]);
  writeFileSync(join(tree, "README.md"), "regenerated\n");
  git(tree, ["commit", "-q", "-am", "regenerate"]);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("gitWorkspace push on a clone without tags", { timeout: 30_000 }, () => {
  it("is refused by the hook when the tags are not fetched (the failure in #3925)", () => {
    expect(git(root, ["tag", "--list"])).toBe("");
    let refused: { stdout: string; stderr: string } | undefined;
    try {
      git(tree, ["push", "origin", "HEAD:refs/heads/control"]);
    } catch (e) {
      refused = e as { stdout: string; stderr: string };
    }
    // The hook's reason is on stdout; stderr has only git's own line. That is why
    // a push run with a discarded stdout failed without saying why.
    expect(refused?.stdout).toMatch(/no karasu@\* tag/);
    expect(refused?.stderr).not.toMatch(/no karasu@\* tag/);
    expect(refused?.stderr).toMatch(/failed to push some refs/);
  });

  it("fetches the release tags, so the hook passes and the branch lands", () => {
    gitWorkspace(root).push(null);

    expect(git(root, ["tag", "--list"])).toBe("karasu@1.0.0");
    expect(git(dir, ["--git-dir", origin, "rev-parse", `refs/heads/${BRANCH}`])).toBe(
      git(tree, ["rev-parse", "HEAD"]),
    );
  });

  it("names the hook's reason in the error when the push is still refused", () => {
    // No release tag on origin either: the fetch brings nothing and the hook refuses.
    git(dir, ["--git-dir", origin, "tag", "-d", "karasu@1.0.0"]);
    expect(() => gitWorkspace(root).push(null)).toThrow(
      /git push failed \(exit 1\): .*no karasu@\* tag/,
    );
  });

  it("still honours the lease: a branch that exists is not overwritten by a null lease", () => {
    git(root, ["fetch", "-q", "origin", RELEASE_TAGS]);
    git(root, ["push", "-q", "origin", `origin/main:refs/heads/${BRANCH}`]);
    expect(() => gitWorkspace(root).push(null)).toThrow(/git push failed \(exit 1\): .*stale info/);
  });
});
