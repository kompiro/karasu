import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the three places a gh-aw version is written down so they cannot drift
// apart: `.github/aw/actions-lock.json`, the `uses:` pins inside each compiled
// `.github/workflows/*.lock.yml`, and the `compiler_version` baked into that
// file's `gh-aw-metadata`.
//
// The failure this exists for is not hypothetical. Dependabot reads a
// `.lock.yml` as an ordinary workflow and bumps its `uses:` lines, which is
// exactly the wrong half: the manifest comment, `compiler_version` and the
// actions lock stay on the old release, so the workflow claims to have been
// compiled by a version that never touched it (ADR-2753, #2740). The only way
// to move these files is `gh aw compile` with the new compiler installed, and
// this test is what tells a reviewer whether that happened.
//
// The rule with the procedure is `.claude/rules/dependabot.md`.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOW_DIR = join(REPO_ROOT, ".github/workflows");
const ACTIONS_LOCK = join(REPO_ROOT, ".github/aw/actions-lock.json");

/** The `gh aw compile` pin whose version is also the compiler's own version. */
const SETUP_REPO = "github/gh-aw-actions/setup";

type LockEntry = { readonly repo: string; readonly version: string; readonly sha: string };

type LockFile = { readonly entries: Record<string, LockEntry> };

/** A single `owner/repo@sha # version` pin found in a compiled workflow. */
type Pin = { readonly workflow: string; readonly sha: string; readonly version: string };

const lock: LockFile = JSON.parse(readFileSync(ACTIONS_LOCK, "utf8"));

const lockedRepos = Object.values(lock.entries);

const workflowFiles = readdirSync(WORKFLOW_DIR)
  .filter((name) => name.endsWith(".lock.yml"))
  .sort();

const workflows = workflowFiles.map((name) => ({
  name,
  text: readFileSync(join(WORKFLOW_DIR, name), "utf8"),
}));

/**
 * Every pin of `repo` in the compiled workflows, from both shapes the compiler
 * emits: the `uses:` steps and the "Custom actions used:" manifest comment.
 * Both carry the sha with the human-readable version in a trailing comment, and
 * a partial rewrite that updates one shape and not the other is the drift this
 * file is looking for.
 */
function pinsOf(repo: string): Pin[] {
  const pattern = new RegExp(`${repo}@([0-9a-f]{40})\\s*#\\s*(v[^\\s(]+)`, "g");
  return workflows.flatMap((workflow) =>
    [...workflow.text.matchAll(pattern)].map((match) => ({
      workflow: workflow.name,
      sha: match[1],
      version: match[2],
    })),
  );
}

/** The `compiler_version` baked into the workflow's `gh-aw-metadata` blob. */
function compilerVersion(text: string): string | undefined {
  return /"compiler_version":"([^"]*)"/.exec(text)?.[1];
}

describe("gh-aw lock files", () => {
  it("has a lock entry for the setup action", () => {
    // Without it nothing below can be checked at all, so fail loudly here
    // rather than letting the other cases pass vacuously.
    expect(lockedRepos.map((entry) => entry.repo)).toContain(SETUP_REPO);
  });

  it("pins every locked action at the sha and version recorded in the actions lock", () => {
    const mismatches = lockedRepos.flatMap((entry) =>
      pinsOf(entry.repo)
        .filter((pin) => pin.sha !== entry.sha || pin.version !== entry.version)
        .map(
          (pin) =>
            `${pin.workflow}: ${entry.repo}@${pin.sha} # ${pin.version} ` +
            `(actions-lock.json: ${entry.sha} # ${entry.version})`,
        ),
    );
    // A `uses:` bump that was not produced by `gh aw compile` lands here.
    // The fix is to regenerate, never to edit either side by hand.
    expect(mismatches).toEqual([]);
  });

  it("references the setup action from every compiled workflow", () => {
    // Guards the regex above: a compiler output format change that stopped
    // matching would otherwise make the comparison silently trivial.
    const withoutSetup = workflows
      .filter((workflow) => !pinsOf(SETUP_REPO).some((pin) => pin.workflow === workflow.name))
      .map((workflow) => workflow.name);
    expect(withoutSetup).toEqual([]);
  });

  it("records the compiler version that matches the locked setup version", () => {
    const locked = lockedRepos.find((entry) => entry.repo === SETUP_REPO);
    const mismatches = workflows
      .map((workflow) => ({ name: workflow.name, version: compilerVersion(workflow.text) }))
      .filter((workflow) => workflow.version !== locked?.version)
      .map((workflow) => `${workflow.name}: compiler_version=${workflow.version ?? "(absent)"}`);
    // The compiler stamps its own version here, so a mismatch means the lock
    // file and the compiler that wrote it are different releases.
    expect(mismatches).toEqual([]);
  });
});
