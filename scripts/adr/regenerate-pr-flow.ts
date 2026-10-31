// The decisions and the order of `pnpm adr:regenerate-pr` (Issue #3416,
// docs/design/regenerate-adr-index-daily-pr.md "実装の指針" step 1). GitHub, git
// and the clock come in through interfaces, so the flow is tested without a
// network; `regenerate-pr.ts` supplies the real ones.
//
// PRs do not carry the generated ADR index. Once a day a Claude routine runs the
// script; a human can run the same thing by hand. It:
//
// 1. merges yesterday's regeneration PR if it is still open and ready;
// 2. regenerates from `origin/main` in its own worktree, so the caller's
//    checkout is never touched;
// 3. pushes the result to `chore/adr-regenerate` with a lease, opens or reuses
//    the PR, and labels it exactly `risk: low`;
// 4. waits for the required checks and `Review tier`, then merges through REST
//    with the head SHA pinned.
//
// Merging is safe because of the required `Validate` check, which lets a
// generated-only diff through only when it is exactly a regeneration, not
// because of anything this script decides.

import {
  type AdrPaths,
  type DiffVerdict,
  classifyGeneratedDiff,
  parseNameStatus,
  readAdrPaths,
  sameOutputs,
} from "./generated.ts";

export const REPO = "kompiro/karasu";
export const BRANCH = "chore/adr-regenerate";
export const BASE = "main";
/** Present in every regeneration PR's body: one of the four marks that identify it. */
export const MARKER = "<!-- adr-regenerate -->";
export const TITLE = "chore(adr): regenerate the ADR index";
export const LOW_LABEL = "risk: low";
/** Inside the routine's 30-minute background limit, counted from the start of the run. */
export const DEADLINE_MS = 25 * 60 * 1000;
const POLL_MS = 30 * 1000;
/** How long to wait for `delete_branch_on_merge` after merging yesterday's PR. */
const BRANCH_GONE_MS = 2 * 60 * 1000;
/** Not a ruleset check, but a PR that fails it is not ready to merge. */
const REVIEW_TIER = "Review tier";
const ACTIONS_APP = "github-actions";

export type Outcome = "merged" | "waited" | "closed" | "nothing" | "failed";

export const EXIT_CODES: Readonly<Record<Outcome, number>> = {
  merged: 0,
  closed: 0,
  nothing: 0,
  waited: 3,
  failed: 1,
};

export interface Pull {
  number: number;
  state: string;
  body: string | null;
  html_url: string;
  labels: { name: string }[];
  base: { ref: string };
  head: { ref: string; sha: string; repo: { full_name: string } | null };
}

export interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  /** The slug of the app that created the run. */
  app: string;
}

export type MergeResult = { ok: true } | { ok: false; message: string };

/** The GitHub REST calls the script makes. */
export interface GitHub {
  openPulls(): Pull[];
  pull(n: number): Pull;
  createPull(body: string): Pull;
  closePull(n: number): void;
  addLabel(n: number, name: string): void;
  removeLabel(n: number, name: string): void;
  /** The SHA `chore/adr-regenerate` points at on GitHub, or null when it does not exist. */
  branchSha(): string | null;
  /** The status check contexts the ruleset on `main` requires. */
  requiredChecks(): string[];
  checkRuns(sha: string): CheckRun[];
  merge(n: number, sha: string): MergeResult;
}

/** The git and file-system side: the caller's repo and the script's own worktree. */
export interface Workspace {
  fetchMain(): void;
  /** Fetches a PR's head and returns the SHA that arrived. */
  fetchPull(n: number): string;
  /** `adr.config.json` at a revision, or null when the file is not there. */
  config(rev: string): string | null;
  mergeBase(a: string, b: string): string;
  /** `git diff --no-renames --name-status -z <a> <b>`. */
  nameStatus(a: string, b: string): string;
  worktreeExists(): boolean;
  /** Adds the worktree, detached at `origin/main`, and installs its dependencies. */
  addWorktree(): void;
  /** Clears the directory outputs and runs `adr regenerate` in the worktree. */
  regenerate(paths: AdrPaths): void;
  /**
   * Stages the generated paths and commits them. Returns the commit, or null when
   * nothing changed. Throws when the generator wrote outside the generated paths.
   */
  commitGenerated(paths: AdrPaths): string | null;
  /** Pushes the worktree's HEAD to the branch. `lease` null means the branch must not exist. */
  push(lease: string | null): void;
  removeWorktree(): void;
}

export interface Clock {
  now(): number;
  sleep(ms: number): void;
}

export interface Result {
  outcome: Outcome;
  /** The regeneration PR this run left open, closed or merged last. */
  pr?: string;
  /** Yesterday's PR, when this run merged it before regenerating. */
  pickedUp?: string;
  message: string;
}

const isTierLabel = (name: string): boolean => /^risk:/.test(name);

/** The four marks of a regeneration PR (the design's "再生成の PR の見分け方"). */
const isRegenerationPr = (pr: Pull): boolean =>
  (pr.body ?? "").includes(MARKER) &&
  pr.head.ref === BRANCH &&
  pr.head.repo?.full_name === REPO &&
  pr.base.ref === BASE;

/**
 * The open regeneration PR, if any. A PR from this repo's `chore/adr-regenerate`
 * that misses a mark is an error: the script would push over its head. A fork's
 * branch of the same name is not ours to push, so it is ignored, not an error
 * (anyone could otherwise stop the routine by opening one).
 */
export function findRegenerationPr(prs: readonly Pull[]): { pr: Pull | null; errors: string[] } {
  const onBranch = prs.filter((p) => p.head.ref === BRANCH && p.head.repo?.full_name === REPO);
  const errors = onBranch
    .filter((p) => !isRegenerationPr(p))
    .map(
      (p) =>
        `PR #${p.number} (${p.html_url}) is open from ${BRANCH} but is not a regeneration PR ` +
        `(it needs the body marker ${MARKER} and base ${BASE}); close it or move it to another branch`,
    );
  const matches = onBranch.filter(isRegenerationPr);
  if (matches.length > 1) {
    errors.push(
      `more than one open regeneration PR: ${matches.map((p) => `#${p.number}`).join(", ")}`,
    );
  }
  return { pr: errors.length === 0 ? (matches[0] ?? null) : null, errors };
}

/** Whether the tier labels are exactly `risk: low` (a misspelled `risk:` label counts as one). */
export const labelsAreLow = (labels: readonly string[]): boolean => {
  const tiers = labels.filter(isTierLabel);
  return tiers.length === 1 && tiers[0] === LOW_LABEL;
};

/** The label edits that leave exactly `risk: low` among the tier labels. */
export function labelEdits(labels: readonly string[]): { remove: string[]; add: string[] } {
  return {
    remove: labels.filter((l) => isTierLabel(l) && l !== LOW_LABEL),
    add: labels.includes(LOW_LABEL) ? [] : [LOW_LABEL],
  };
}

const PASSING = new Set(["success", "skipped", "neutral"]);

export type ChecksVerdict =
  | { state: "pass" }
  | { state: "pending"; waiting: string[] }
  | { state: "fail"; failed: string[] };

/**
 * Reads the check runs of one head against the names to wait for. Only runs by
 * GitHub Actions count. A name with no run yet is pending; every run of a name
 * must pass (`ci.yml` and `ci-skip.yml` both report `Check`). A cancelled run
 * that a later run of the same name replaced (a `concurrency` cancel) is not a
 * result.
 */
export function judgeChecks(required: readonly string[], runs: readonly CheckRun[]): ChecksVerdict {
  const waiting: string[] = [];
  const failed: string[] = [];
  for (const name of [...new Set(required)]) {
    const own = runs.filter((r) => r.app === ACTIONS_APP && r.name === name);
    const latestStart = own.reduce(
      (m, r) => (r.started_at && r.started_at > m ? r.started_at : m),
      "",
    );
    const counted = own.filter(
      (r) => !(r.conclusion === "cancelled" && (r.started_at ?? "") < latestStart),
    );
    if (counted.length === 0 || counted.some((r) => r.status !== "completed")) {
      waiting.push(name);
    } else if (counted.some((r) => !PASSING.has(r.conclusion ?? ""))) {
      failed.push(`${name} (${counted.map((r) => r.conclusion).join(", ")})`);
    }
  }
  if (failed.length > 0) return { state: "fail", failed };
  if (waiting.length > 0) return { state: "pending", waiting };
  return { state: "pass" };
}

export function prBody(): string {
  return [
    MARKER,
    "",
    "Regenerates the ADR index (`docs/adr/effective.md`, `docs/adr/graph.md`, `docs/adr/graph/`) " +
      "from `main`.",
    "",
    "Opened by `pnpm adr:regenerate-pr` (Issue #3416). The PR changes only generated files; " +
      "the required `Validate` check holds it to an exact regeneration, so it merges without a " +
      "local review record once the required checks and `Review tier` pass.",
    "",
    "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
  ].join("\n");
}

type Readiness =
  | { state: "ready" }
  | { state: "pending"; why: string }
  | { state: "fail"; why: string };

export interface Deps {
  github: GitHub;
  workspace: Workspace;
  clock: Clock;
  log: (message: string) => void;
}

export function regeneratePr(deps: Deps): Result {
  const { github, workspace, clock, log } = deps;
  const deadline = clock.now() + DEADLINE_MS;

  if (workspace.worktreeExists()) {
    return {
      outcome: "failed",
      message:
        "the worktree .claude/worktrees/chore/adr-regenerate already exists: another run is in " +
        "progress, or a previous run left it. If no run is in progress, remove it with " +
        "`git worktree remove --force .claude/worktrees/chore/adr-regenerate`.",
    };
  }

  const diffKind = (base: string, head: string): DiffVerdict => {
    const mergeBase = workspace.mergeBase(base, head);
    const baseConfig = workspace.config(mergeBase);
    const headConfig = workspace.config(head);
    if (baseConfig === null || headConfig === null) {
      return { kind: "mixed", reasons: ["adr.config.json is missing on one side"], generated: [] };
    }
    return classifyGeneratedDiff({
      base: readAdrPaths(baseConfig),
      head: readAdrPaths(headConfig),
      files: parseNameStatus(workspace.nameStatus(mergeBase, head)),
    });
  };

  /** The merge conditions, read fresh from GitHub for the head this run expects. */
  const readiness = (n: number, sha: string): Readiness => {
    const pr = github.pull(n);
    if (pr.state !== "open" || !isRegenerationPr(pr)) {
      return { state: "fail", why: `PR #${n} is no longer an open regeneration PR` };
    }
    if (pr.head.sha !== sha) {
      return { state: "fail", why: `PR #${n} head moved to ${pr.head.sha} (expected ${sha})` };
    }
    if (!labelsAreLow(pr.labels.map((l) => l.name))) {
      return { state: "fail", why: `PR #${n} tier labels are not exactly "${LOW_LABEL}"` };
    }
    const kind = diffKind("origin/main", sha);
    if (kind.kind !== "regeneration") {
      return {
        state: "fail",
        why: `PR #${n} is not a generated-only diff: ${kind.reasons.join("; ") || kind.kind}`,
      };
    }
    const checks = judgeChecks([...github.requiredChecks(), REVIEW_TIER], github.checkRuns(sha));
    if (checks.state === "fail") {
      return { state: "fail", why: `checks failed on PR #${n}: ${checks.failed.join(", ")}` };
    }
    if (checks.state === "pending") {
      return { state: "pending", why: `waiting for ${checks.waiting.join(", ")}` };
    }
    return { state: "ready" };
  };

  // 1. Yesterday's PR, if it is still open and ready.
  workspace.fetchMain();
  const found = findRegenerationPr(github.openPulls());
  if (found.errors.length > 0) return { outcome: "failed", message: found.errors.join("\n") };
  let pr = found.pr;
  let pickedUp: string | undefined;
  if (pr !== null) {
    const sha = workspace.fetchPull(pr.number);
    const headConfig = workspace.config(sha);
    const mainConfig = workspace.config("origin/main");
    const sameConfig =
      headConfig !== null &&
      mainConfig !== null &&
      sameOutputs(readAdrPaths(headConfig), readAdrPaths(mainConfig));
    if (sha !== pr.head.sha) {
      log(`PR #${pr.number}: fetched ${sha}, GitHub reports ${pr.head.sha}; regenerating instead`);
    } else if (!sameConfig) {
      log(
        `PR #${pr.number}: paths.outputs changed on main since it was made; regenerating instead`,
      );
    } else {
      const ready = readiness(pr.number, sha);
      if (ready.state !== "ready") {
        log(`PR #${pr.number} not merged: ${ready.why}; regenerating over it`);
      } else {
        const merged = github.merge(pr.number, sha);
        if (merged.ok) {
          log(`merged yesterday's PR #${pr.number}`);
          pickedUp = pr.html_url;
          pr = null;
          // `delete_branch_on_merge` removes the branch; a push racing that
          // deletion fails its lease, so wait until it is gone.
          const until = Math.min(deadline, clock.now() + BRANCH_GONE_MS);
          while (github.branchSha() !== null && clock.now() < until) clock.sleep(5000);
          workspace.fetchMain();
        } else {
          log(`PR #${pr.number} could not be merged (${merged.message}); regenerating over it`);
        }
      }
    }
  }

  // 2. Regenerate from origin/main in the script's own worktree.
  const mainConfig = workspace.config("origin/main");
  if (mainConfig === null) {
    return { outcome: "failed", pickedUp, message: "origin/main has no adr.config.json" };
  }
  const paths = readAdrPaths(mainConfig);
  try {
    workspace.addWorktree();
    workspace.regenerate(paths);
    const commit = workspace.commitGenerated(paths);

    if (commit === null) {
      if (pr !== null) {
        github.closePull(pr.number);
        return {
          outcome: "closed",
          pr: pr.html_url,
          pickedUp,
          message: `the index on main is current; closed PR #${pr.number}`,
        };
      }
      return pickedUp !== undefined
        ? {
            outcome: "merged",
            pr: pickedUp,
            pickedUp,
            message: "merged yesterday's PR; main is current",
          }
        : { outcome: "nothing", message: "the index on main is current" };
    }

    const own = diffKind("origin/main", commit);
    if (own.kind !== "regeneration") {
      return {
        outcome: "failed",
        pickedUp,
        message: `the regenerated commit is not a generated-only diff: ${own.reasons.join("; ")}`,
      };
    }

    // 3. Push with a lease read just now, then open or reuse the PR.
    workspace.push(github.branchSha());
    if (pr !== null) {
      const current = github.pull(pr.number);
      if (current.state !== "open" || !isRegenerationPr(current)) pr = null;
    }
    if (pr === null) {
      pr = github.createPull(prBody());
      log(`opened PR #${pr.number}`);
    } else {
      log(`updated PR #${pr.number}`);
    }
    const edits = labelEdits(github.pull(pr.number).labels.map((l) => l.name));
    for (const name of edits.remove) github.removeLabel(pr.number, name);
    for (const name of edits.add) github.addLabel(pr.number, name);

    // 4. Wait for the checks, then merge with the head pinned.
    for (;;) {
      const ready = readiness(pr.number, commit);
      if (ready.state === "fail") {
        return { outcome: "failed", pr: pr.html_url, pickedUp, message: ready.why };
      }
      if (ready.state === "ready") {
        const merged = github.merge(pr.number, commit);
        return merged.ok
          ? { outcome: "merged", pr: pr.html_url, pickedUp, message: `merged PR #${pr.number}` }
          : {
              outcome: "failed",
              pr: pr.html_url,
              pickedUp,
              message: `PR #${pr.number} could not be merged: ${merged.message}`,
            };
      }
      if (clock.now() + POLL_MS > deadline) {
        return {
          outcome: "waited",
          pr: pr.html_url,
          pickedUp,
          message: `waited out (${ready.why}); PR #${pr.number} stays open for the next run`,
        };
      }
      clock.sleep(POLL_MS);
    }
  } finally {
    workspace.removeWorktree();
  }
}
