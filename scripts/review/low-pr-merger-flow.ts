// The judge of the Low PR merger (Issue #3673): which open `risk: low` PRs may
// merge, which wait, and which are rejected. GitHub, the tier check and the
// clock come in through interfaces, so the decisions are tested without a
// network; `low-pr-merger.ts` supplies the real ones.
//
// The judge reads everything back from GitHub and never the event that started
// it, so a run started by a look-alike workflow only judges once more
// (TPL-3673). Every decision is for one head SHA: the checks, the tier check and
// the merge that follows all name the same commit.
//
// A PR may merge when all of these hold on its head:
//
// 1. it is open, not a draft, based on `main`, from this repository, and not
//    the daily regeneration PR (the routine merges that one itself);
// 2. its tier labels are exactly `risk: low`;
// 3. `tier.ts check` passes on that head, run from `main`;
// 4. every workflow that reports a ruleset-required check has its latest
//    result `success`;
// 5. GitHub says it is mergeable.
//
// A PR that fails 1 is out of scope and gets no word. A rejection outranks
// waiting: a conflicted PR gets no `pull_request` runs, so it would otherwise
// wait on condition 4 forever. A PR the judge cannot decide is left alone and
// reported (TPL-2786), without stopping the other PRs.

import {
  BASE,
  LOW_LABEL,
  REPO,
  isRegenerationPr,
  labelsAreLow,
} from "../adr/regenerate-pr-flow.ts";

/** How long one head may wait before the wait is reported as stalled. */
export const STALL_MS = 30 * 60 * 1000;
const ACTIONS_APP = "github-actions";

export interface Pull {
  number: number;
  state: string;
  draft: boolean;
  body: string | null;
  html_url: string;
  labels: { name: string }[];
  base: { ref: string };
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  /** Changes with every push, and with label and comment edits. */
  updated_at: string;
  /** Only on a single PR's read: null while GitHub is still computing it. */
  mergeable?: boolean | null;
  mergeable_state?: string;
}

export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  /** The slug of the app that created the run. */
  app: string;
  check_suite_id: number | null;
}

/** A GitHub Actions workflow run, which owns one check suite. */
export interface WorkflowRun {
  id: number;
  /** The workflow file, e.g. `.github/workflows/ci.yml`. */
  path: string;
  event: string;
  check_suite_id: number;
}

/** The GitHub REST reads the judge makes. */
export interface GitHub {
  openPulls(): Pull[];
  pull(n: number): Pull;
  /** The status check contexts the ruleset on `main` requires. */
  requiredChecks(): string[];
  checkRuns(sha: string): CheckRun[];
  workflowRuns(sha: string): WorkflowRun[];
}

/** `tier.ts check` on one head, already reduced to what the judge needs. */
export type TierResult =
  | { state: "pass" }
  | { state: "moved" }
  | { state: "fail"; errors: string[] }
  | { state: "unreadable"; messages: string[] };

export interface Deps {
  github: GitHub;
  /** Fetches the PR head's objects and runs the tier check on `sha`. */
  checkTier(pr: number, sha: string): TierResult;
  now(): number;
}

/**
 * Why a PR waits or is rejected. The notify job of slice B comments from these
 * codes with fixed text, never with text a PR wrote.
 */
type Reason =
  | "labels"
  | "tier"
  | "checks-failed"
  | "conflict"
  | "checks-pending"
  | "checks-stuck"
  | "mergeable-unknown"
  | "head-moved";

const REJECTIONS: ReadonlySet<Reason> = new Set(["labels", "tier", "checks-failed", "conflict"]);

export type Verdict =
  | { pr: number; sha: string; outcome: "out-of-scope"; why: string }
  | { pr: number; sha: string; outcome: "merge" }
  | {
      pr: number;
      sha: string;
      outcome: "wait";
      reasons: Reason[];
      details: string[];
      stalled: boolean;
    }
  | { pr: number; sha: string; outcome: "reject"; reasons: Reason[]; details: string[] }
  | { pr: number; sha: string; outcome: "no-conclusion"; details: string[] };

const isTierLabel = (name: string): boolean => /^risk:/.test(name);

/** Condition 1, or why the PR is out of scope. */
export function outOfScope(pr: Pull): string | null {
  if (pr.state !== "open") return "not open";
  if (pr.draft) return "draft";
  if (pr.base.ref !== BASE) return `base is ${pr.base.ref}`;
  if (pr.head.repo?.full_name !== REPO) return "head is not this repository";
  if (isRegenerationPr(pr)) return "regeneration PR (the routine merges it)";
  return null;
}

export type ChecksVerdict =
  | { state: "pass" }
  | { state: "fail"; failed: string[] }
  /** `stuck`: some workflow's latest result is skipped, cancelled or neutral. */
  | { state: "pending"; waiting: string[]; stuck: boolean }
  /** Check runs whose workflow run could not be found: nothing to count them against. */
  | { state: "unknown"; messages: string[] };

const FAILED = new Set(["failure", "timed_out", "action_required", "startup_failure"]);

/**
 * Condition 4 on one head. Every run of a required name is mapped to the
 * workflow (and event) that produced it, and only each workflow's latest run is
 * read, ordered by run id: `Check` comes from three workflows, so taking the
 * latest by name alone would hide a real failure, and the start times of a
 * draft run and a ready run can come out of order (#3472).
 *
 * Only `success` passes. A docs-and-code PR runs both the real workflow and its
 * skip stub, and the real one can end `skipped` on the draft run while the stub
 * reports `success` (TPL-2643): `skipped`, `cancelled` and `neutral` leave the
 * PR waiting for the run that replaces them.
 */
export function judgeChecks(
  required: readonly string[],
  runs: readonly CheckRun[],
  workflows: readonly WorkflowRun[],
): ChecksVerdict {
  const bySuite = new Map(workflows.map((w) => [w.check_suite_id, w]));
  const waiting: string[] = [];
  const failed: string[] = [];
  const unknown: string[] = [];
  let stuck = false;
  for (const name of [...new Set(required)]) {
    const latest = new Map<string, { run: CheckRun; workflow: WorkflowRun }>();
    for (const run of runs) {
      if (run.app !== ACTIONS_APP || run.name !== name) continue;
      const workflow = run.check_suite_id === null ? undefined : bySuite.get(run.check_suite_id);
      if (workflow === undefined) {
        unknown.push(`check run ${run.id} (${name}) has no workflow run to belong to`);
        continue;
      }
      const key = `${workflow.path} ${workflow.event}`;
      const seen = latest.get(key);
      // A later workflow run wins; within one run, its re-run (a later check run) wins.
      if (
        seen === undefined ||
        workflow.id > seen.workflow.id ||
        (workflow.id === seen.workflow.id && run.id > seen.run.id)
      ) {
        latest.set(key, { run, workflow });
      }
    }
    if (latest.size === 0) {
      waiting.push(name);
      continue;
    }
    for (const { run, workflow } of latest.values()) {
      const where = `${name} from ${workflow.path} (${workflow.event})`;
      if (run.status !== "completed") {
        waiting.push(where);
      } else if (FAILED.has(run.conclusion ?? "")) {
        failed.push(`${where}: ${run.conclusion}`);
      } else if (run.conclusion !== "success") {
        waiting.push(`${where}: ${run.conclusion}`);
        stuck = true;
      }
    }
  }
  // A failure outranks what could not be counted: the PR is rejected either way.
  if (failed.length > 0) return { state: "fail", failed };
  if (unknown.length > 0) return { state: "unknown", messages: unknown };
  if (waiting.length > 0) return { state: "pending", waiting, stuck };
  return { state: "pass" };
}

/** The last time anything happened to the head's check runs, in ms, or null when nothing did. */
function lastActivity(runs: readonly CheckRun[]): number | null {
  const times = runs
    .flatMap((r) => [r.started_at, r.completed_at])
    .filter((t): t is string => t !== null)
    .map((t) => Date.parse(t));
  return times.length === 0 ? null : Math.max(...times);
}

/** Condition 1 and the label the PR was listed by: removing it is how a PR is taken out. */
function scopeOf(pr: Pull): string | null {
  if (!pr.labels.some((l) => l.name === LOW_LABEL)) return `no longer labeled ${LOW_LABEL}`;
  return outOfScope(pr);
}

/** The ruleset's required checks, or why they could not be read. */
type Required = { names: readonly string[] } | { error: string };

function judgeOne(deps: Deps, listed: Pull, required: Required): Verdict {
  const { github } = deps;
  const pr = github.pull(listed.number);
  const sha = pr.head.sha;
  const skip = scopeOf(pr);
  if (skip !== null) return { pr: pr.number, sha, outcome: "out-of-scope", why: skip };

  const reasons: Reason[] = [];
  const details: string[] = [];
  /** What could not be read; a rejection still outranks it. */
  const undecided: string[] = [];

  if (!labelsAreLow(pr.labels.map((l) => l.name))) {
    reasons.push("labels");
    details.push(`tier labels: ${pr.labels.filter((l) => isTierLabel(l.name)).length}`);
  }

  if (pr.mergeable === false) {
    reasons.push("conflict");
    details.push(`mergeable_state: ${pr.mergeable_state ?? "unknown"}`);
  } else if (pr.mergeable !== true) {
    reasons.push("mergeable-unknown");
  }

  const runs = "names" in required ? github.checkRuns(sha) : [];
  const checks: ChecksVerdict =
    "names" in required
      ? judgeChecks(required.names, runs, github.workflowRuns(sha))
      : { state: "unknown", messages: [required.error] };
  if (checks.state === "unknown") {
    undecided.push(...checks.messages);
  } else if (checks.state === "fail") {
    reasons.push("checks-failed");
    details.push(...checks.failed);
  } else if (checks.state === "pending") {
    reasons.push(checks.stuck ? "checks-stuck" : "checks-pending");
    details.push(...checks.waiting);
  }

  const tier = deps.checkTier(pr.number, sha);
  if (tier.state === "moved") {
    reasons.push("head-moved");
  } else if (tier.state === "fail") {
    reasons.push("tier");
    details.push(...tier.errors);
  } else if (tier.state === "unreadable") {
    undecided.push(...tier.messages);
  }

  const rejected = reasons.filter((r) => REJECTIONS.has(r));
  if (rejected.length > 0) {
    return { pr: pr.number, sha, outcome: "reject", reasons: rejected, details };
  }
  if (undecided.length > 0) {
    return { pr: pr.number, sha, outcome: "no-conclusion", details: undecided };
  }
  if (reasons.length > 0) {
    // A head no workflow ever ran on stalls from the PR's last update: a push
    // updates it, while the commit can be dated long before the push.
    const since = lastActivity(runs) ?? Date.parse(pr.updated_at);
    const stalled = Number.isFinite(since) && deps.now() - since >= STALL_MS;
    return { pr: pr.number, sha, outcome: "wait", reasons, details, stalled };
  }
  return { pr: pr.number, sha, outcome: "merge" };
}

/**
 * Judges every open PR labeled `risk: low`. Never throws for one PR: a failure
 * on one is that PR's `no-conclusion`, and the rest are still judged.
 */
export function judge(deps: Deps): Verdict[] {
  const candidates = deps.github
    .openPulls()
    .filter((p) => p.labels.some((l) => l.name === LOW_LABEL))
    .sort((a, b) => a.number - b.number);
  let required: Required;
  try {
    const names = deps.github.requiredChecks();
    required =
      names.length > 0
        ? { names }
        : { error: "required checks: the ruleset on main requires none" };
  } catch (e) {
    // Condition 4 cannot be judged; the other conditions can still reject a PR.
    required = { error: `required checks: ${(e as Error).message}` };
  }
  return candidates.map((p): Verdict => {
    try {
      return judgeOne(deps, p, required);
    } catch (e) {
      return {
        pr: p.number,
        sha: p.head.sha,
        outcome: "no-conclusion",
        details: [(e as Error).message],
      };
    }
  });
}

/**
 * A verdict as later jobs read it: the PR, the head, the outcome and the reason
 * codes. The details and the out-of-scope reason stay in the job summary: they
 * quote what a PR wrote (file paths, label names), and nothing a PR wrote is
 * handed on to a job that can merge or comment (TPL-3673).
 */
export interface VerdictOutput {
  pr: number;
  sha: string;
  outcome: Verdict["outcome"];
  reasons?: Reason[];
  stalled?: boolean;
}

export function toOutput(verdicts: readonly Verdict[]): VerdictOutput[] {
  return verdicts.map((v) => ({
    pr: v.pr,
    sha: v.sha,
    outcome: v.outcome,
    ...(v.outcome === "reject" || v.outcome === "wait" ? { reasons: v.reasons } : {}),
    ...(v.outcome === "wait" ? { stalled: v.stalled } : {}),
  }));
}

const cell = (text: string): string => text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

/** The job summary: one row per PR. Dry run: nothing is merged or commented. */
export function renderSummary(verdicts: readonly Verdict[]): string {
  const lines = [
    "### Low PR merger: judge",
    "",
    verdicts.length === 0 ? "No open PR is labeled `risk: low`." : "| PR | Head | Outcome | Why |",
  ];
  if (verdicts.length > 0) lines.push("| --- | --- | --- | --- |");
  for (const v of verdicts) {
    const why =
      v.outcome === "out-of-scope"
        ? v.why
        : v.outcome === "merge"
          ? ""
          : v.outcome === "wait"
            ? `${v.reasons.join(", ")}${v.stalled ? " (stalled)" : ""}: ${v.details.join("; ")}`
            : v.outcome === "reject"
              ? `${v.reasons.join(", ")}: ${v.details.join("; ")}`
              : v.details.join("; ");
    lines.push(`| #${v.pr} | \`${v.sha.slice(0, 7)}\` | ${v.outcome} | ${cell(why)} |`);
  }
  return `${lines.join("\n")}\n`;
}
