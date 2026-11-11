// Waits for the Low PR merger to merge one Low PR, and says what the session
// should do when it does not (Issue #3698, slice B of #3673). GitHub, the judge
// and the clock come in through interfaces, so the waiting is tested without a
// network; `await-low-merge.ts` supplies the real ones.
//
// Read-only: it never comments, enables auto-merge or pushes. The session acts
// on the outcome (`.claude/rules/adr.md`).
//
// The verdict on the PR is the merger's own judge, run here on this PR alone:
// the same conditions on the same head, without reading a run's summary.

import { STALL_MS, type Verdict } from "./low-pr-merger-flow.ts";

/** The merge job's name in `low-pr-merger.yml`; its log names each PR it merged. */
export const MERGE_JOB = "Merge cleared Low PRs";

export interface PrState {
  state: string;
  merged: boolean;
  mergedAt: string | null;
  mergedBy: string | null;
  mergeSha: string | null;
  headSha: string;
  headRef: string;
  createdAt: string;
  autoMerge: boolean;
}

export interface MergeJob {
  status: string;
  conclusion: string | null;
  /** Only once the job is completed: GitHub serves no log before that. */
  log(): string;
}

export interface Deps {
  pull(pr: number): PrState;
  /** The merger's judge on this PR alone, or null when it is not labeled `risk: low`. */
  judge(pr: number): Verdict | null;
  /** `Low PR merger` runs created in [from, to], as ids and URLs. */
  mergerRuns(from: string, to: string): { id: number; url: string }[];
  /** The run's merge job, or null when the run had none (skipped or not reached). */
  mergeJob(runId: number): MergeJob | null;
  /** The names of the `push` workflows that ran on a commit. */
  pushWorkflows(sha: string): string[];
  branchExists(ref: string): boolean;
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface Options {
  pollMs: number;
  /** How long a PR the merger could merge may stay open before falling back. */
  settleMs: number;
  /** How long to look for the push workflows on the merge commit. */
  pushWaitMs: number;
  /** The whole wait, after which the outcome is `timeout`. */
  budgetMs: number;
}

export const DEFAULT_OPTIONS: Options = {
  pollMs: 60_000,
  settleMs: STALL_MS,
  pushWaitMs: 5 * 60_000,
  budgetMs: 3 * 60 * 60_000,
};

type Outcome =
  /** The merge job logged this PR: what #3698 records. */
  | {
      outcome: "merged-by-merger";
      run: string;
      mergedBy: string | null;
      mergeSha: string | null;
      /** Empty when none appeared within `pushWaitMs`. */
      pushWorkflows: string[];
      branchDeleted: boolean;
    }
  /** Merged, but no merge job logged it: a person or native auto-merge. */
  | { outcome: "merged-otherwise"; mergedBy: string | null }
  | { outcome: "closed" }
  /** Native auto-merge is on and would merge before the merger: disable it and run again. */
  | { outcome: "auto-merge-enabled" }
  /** The merger does not judge this PR (not `risk: low`, draft, another base...). */
  | { outcome: "out-of-scope"; why: string }
  /** The merger rejects the PR for something on the PR's side: fix it and run again. */
  | { outcome: "fix-pr"; reasons: string[]; details: string[] }
  /** Required checks missing or ended skipped/cancelled for 30 minutes: re-run them, or close and reopen. */
  | { outcome: "checks-stuck"; reasons: string[]; details: string[] }
  /** The merger could merge or cannot decide, and has not merged for `settleMs`: fall back to `--auto`. */
  | { outcome: "fallback"; verdict: string; details: string[] }
  | { outcome: "timeout"; last: string };

export type Result = Outcome & { pr: number; head: string; waitedMin: number };

/** The verdicts under which only the merger, not the PR, stands between the PR and its merge. */
const settled = (v: Verdict): boolean =>
  v.outcome === "merge" ||
  v.outcome === "no-conclusion" ||
  (v.outcome === "wait" && v.reasons.every((r) => r === "mergeable-unknown"));

/**
 * How long before the merge the run that made it can have started. The merge job
 * follows the judge in the same run (10-minute timeouts each), and a queued run
 * waits for at most the one in progress.
 */
const MERGE_WINDOW_MS = 60 * 60_000;

async function whoMerged(deps: Deps, pr: number, p: PrState, opts: Options): Promise<Outcome> {
  const to = Date.parse(p.mergedAt ?? "") || deps.now();
  const from = Math.max(Date.parse(p.createdAt), to - MERGE_WINDOW_MS);
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  const runs = deps.mergerRuns(iso(from), iso(to));
  for (const run of runs) {
    let job = deps.mergeJob(run.id);
    while (job !== null && job.status !== "completed") {
      await deps.sleep(opts.pollMs);
      job = deps.mergeJob(run.id);
    }
    if (job === null) continue;
    if (!new RegExp(`^.*merged #${pr} at `, "m").test(job.log())) continue;
    let pushWorkflows: string[] = [];
    const until = deps.now() + opts.pushWaitMs;
    while (p.mergeSha !== null) {
      pushWorkflows = deps.pushWorkflows(p.mergeSha);
      if (pushWorkflows.length > 0 || deps.now() >= until) break;
      await deps.sleep(opts.pollMs);
    }
    return {
      outcome: "merged-by-merger",
      run: run.url,
      mergedBy: p.mergedBy,
      mergeSha: p.mergeSha,
      pushWorkflows,
      branchDeleted: !deps.branchExists(p.headRef),
    };
  }
  return { outcome: "merged-otherwise", mergedBy: p.mergedBy };
}

/**
 * Polls the PR until the merger merged it or the session has something to do.
 * The 30 minutes before a fallback count from when only the merger was left to
 * act, on the same head: a push starts them again.
 */
export async function awaitLowMerge(
  deps: Deps,
  pr: number,
  opts: Options = DEFAULT_OPTIONS,
): Promise<Result> {
  const start = deps.now();
  let head = "";
  let settledSince: number | null = null;
  let settledHead = "";
  let last = "not read";
  const done = (o: Outcome): Result => ({
    ...o,
    pr,
    head,
    waitedMin: Math.round((deps.now() - start) / 60_000),
  });
  for (;;) {
    const p = deps.pull(pr);
    head = p.headSha;
    if (p.merged) return done(await whoMerged(deps, pr, p, opts));
    if (p.state !== "open") return done({ outcome: "closed" });
    if (p.autoMerge) return done({ outcome: "auto-merge-enabled" });

    const v = deps.judge(pr);
    if (v === null) return done({ outcome: "out-of-scope", why: "not labeled risk: low" });
    if (v.outcome === "out-of-scope") return done({ outcome: "out-of-scope", why: v.why });
    if (v.outcome === "reject") {
      return done({ outcome: "fix-pr", reasons: v.reasons, details: v.details });
    }
    if (v.sha !== settledHead) settledSince = null;
    if (settled(v)) {
      settledSince ??= deps.now();
      settledHead = v.sha;
      if (deps.now() - settledSince >= opts.settleMs) {
        return done({
          outcome: "fallback",
          verdict: v.outcome,
          details: v.outcome === "merge" ? ["the merger has not merged it"] : v.details,
        });
      }
    } else {
      settledSince = null;
      if (v.outcome === "wait" && v.stalled && !v.reasons.includes("head-moved")) {
        return done({ outcome: "checks-stuck", reasons: v.reasons, details: v.details });
      }
    }
    last = v.outcome;
    if (deps.now() - start >= opts.budgetMs) return done({ outcome: "timeout", last });
    await deps.sleep(opts.pollMs);
  }
}
