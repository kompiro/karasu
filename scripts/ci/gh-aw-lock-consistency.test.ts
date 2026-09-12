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

// Keyed `repo@version`, so one repository may hold several entries at once:
// gh-aw does not prune the lock when a pin moves. A pin is therefore correct
// when it matches *some* entry exactly, not when it matches the first entry
// carrying its repository.
const lockEntries = Object.values(lock.entries);

const lockedRepoNames = [...new Set(lockEntries.map((entry) => entry.repo))].sort();

function entriesFor(repo: string): LockEntry[] {
  return lockEntries.filter((entry) => entry.repo === repo);
}

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

/** Every `uses:` reference in a compiled workflow, in file order. */
function usesRefs(text: string): string[] {
  return [...text.matchAll(/^\s*uses:\s*(\S+)/gm)].map((match) => match[1]);
}

describe("gh-aw lock files", () => {
  it("has a lock entry for the setup action", () => {
    // Without it nothing below can be checked at all, so fail loudly here
    // rather than letting the other cases pass vacuously.
    expect(lockedRepoNames).toContain(SETUP_REPO);
  });

  it("pins every locked action at a sha and version recorded in the actions lock", () => {
    const unlocked = lockedRepoNames.flatMap((repo) => {
      const entries = entriesFor(repo);
      return pinsOf(repo)
        .filter((pin) => !entries.some((e) => e.sha === pin.sha && e.version === pin.version))
        .map(
          (pin) =>
            `${pin.workflow}: ${repo}@${pin.sha} # ${pin.version} (actions-lock.json: ` +
            `${entries.map((e) => `${e.sha} # ${e.version}`).join(", ")})`,
        );
    });
    // A `uses:` bump that was not produced by `gh aw compile` lands here: its
    // sha and version pair is in no entry, because nothing wrote one. The fix
    // is to regenerate, never to edit either side by hand.
    expect(unlocked).toEqual([]);
  });

  it("pins every action to a commit sha, lock entry or not", () => {
    // `actions-lock.json` records only the actions gh-aw resolved for this
    // repository; the `actions/*` steps come from the compiler's own defaults
    // and have no entry here by design. So "has a lock entry" cannot be the
    // rule for every pin. What does hold for all of them is the pin itself:
    // a compiled workflow never carries a floating tag, whoever wrote the line.
    const floating = workflows.flatMap((workflow) =>
      usesRefs(workflow.text)
        // Local actions (`./.github/actions/...`) are the repository's own
        // tree and are not pinned by sha.
        .filter((ref) => !ref.startsWith("./") && !/@[0-9a-f]{40}$/.test(ref))
        .map((ref) => `${workflow.name}: ${ref}`),
    );
    expect(floating).toEqual([]);
  });

  it("references the setup action from every compiled workflow", () => {
    // Guards the regex above: a compiler output format change that stopped
    // matching would otherwise make the comparison silently trivial.
    const setupPins = pinsOf(SETUP_REPO);
    const withoutSetup = workflows
      .filter((workflow) => !setupPins.some((pin) => pin.workflow === workflow.name))
      .map((workflow) => workflow.name);
    expect(withoutSetup).toEqual([]);
  });

  it("compiles each workflow with the setup version that workflow pins", () => {
    // Per workflow rather than against the lock as a whole: the compiler stamps
    // its own version here, so this is what says the compiler that wrote the
    // file and the setup action it installs are one release. Comparing against
    // a single lock entry would go wrong the moment the lock carries two.
    const mismatches = workflows.flatMap((workflow) => {
      const compiled = compilerVersion(workflow.text) ?? "(absent)";
      const pinned = [
        ...new Set(
          pinsOf(SETUP_REPO)
            .filter((pin) => pin.workflow === workflow.name)
            .map((pin) => pin.version),
        ),
      ];
      return pinned.every((version) => version === compiled)
        ? []
        : [`${workflow.name}: compiler_version=${compiled}, setup=${pinned.join(", ")}`];
    });
    expect(mismatches).toEqual([]);
  });
});
