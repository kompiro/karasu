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

/**
 * The login the Low PR merger's GitHub App merges as (`<app slug>[bot]`). A
 * person, and native auto-merge (which merges as whoever enabled it), cannot
 * merge under it, so it alone tells the merger's merges from the rest. The slug
 * comes from the App's name (github.com/settings/apps/low-pr-merger): renaming the
 * App changes it.
 */
export const MERGER_LOGIN = "low-pr-merger[bot]";

export interface PrState {
  state: string;
  merged: boolean;
  mergedBy: string | null;
  mergeSha: string | null;
  headSha: string;
  headRef: string;
  autoMerge: boolean;
}

export interface Deps {
  pull(pr: number): PrState;
  /** The merger's judge on this PR alone, or null when it is not labeled `risk: low`. */
  judge(pr: number): Verdict | null;
  branchExists(ref: string): boolean;
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface Options {
  pollMs: number;
  /** How long a PR the merger could merge may stay open before falling back. */
  settleMs: number;
  /** The whole wait, after which the outcome is `timeout`. */
  budgetMs: number;
}

export const DEFAULT_OPTIONS: Options = {
  pollMs: 60_000,
  settleMs: STALL_MS,
  budgetMs: 3 * 60 * 60_000,
};

type Outcome =
  /**
   * Merged as `MERGER_LOGIN`: what #3698 records. The push workflows on
   * `mergeSha` are read on #3698 later, when they have all started.
   */
  | {
      outcome: "merged-by-merger";
      mergedBy: string;
      mergeSha: string | null;
      branchDeleted: boolean;
    }
  /** Merged by anyone else: a person, native auto-merge, or another app. */
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

function whoMerged(deps: Deps, p: PrState): Outcome {
  if (p.mergedBy !== MERGER_LOGIN) return { outcome: "merged-otherwise", mergedBy: p.mergedBy };
  return {
    outcome: "merged-by-merger",
    mergedBy: p.mergedBy,
    mergeSha: p.mergeSha,
    branchDeleted: !deps.branchExists(p.headRef),
  };
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
  /** One read of the PR: an outcome to return, or the verdict to keep waiting on. */
  const step = (): Outcome | string => {
    const p = deps.pull(pr);
    head = p.headSha;
    if (p.merged) return whoMerged(deps, p);
    if (p.state !== "open") return { outcome: "closed" };
    if (p.autoMerge) return { outcome: "auto-merge-enabled" };

    const v = deps.judge(pr);
    if (v === null) return { outcome: "out-of-scope", why: "not labeled risk: low" };
    // A push between the two reads: read both again rather than pair a head with another's verdict.
    if (v.sha !== p.headSha) return "head-moved";
    if (v.outcome === "out-of-scope") return { outcome: "out-of-scope", why: v.why };
    if (v.outcome === "reject")
      return { outcome: "fix-pr", reasons: v.reasons, details: v.details };
    if (v.sha !== settledHead) settledSince = null;
    if (settled(v)) {
      settledSince ??= deps.now();
      settledHead = v.sha;
      if (deps.now() - settledSince >= opts.settleMs) {
        return {
          outcome: "fallback",
          verdict: v.outcome,
          details: v.outcome === "merge" ? ["the merger has not merged it"] : v.details,
        };
      }
    } else {
      settledSince = null;
      if (v.outcome === "wait" && v.stalled && !v.reasons.includes("head-moved")) {
        return { outcome: "checks-stuck", reasons: v.reasons, details: v.details };
      }
    }
    return v.outcome;
  };
  for (;;) {
    try {
      const result = step();
      if (typeof result !== "string") return done(result);
      last = result;
    } catch (e) {
      // A failed read is retried on the next poll; the wait is hours long.
      last = `error: ${(e as Error).message}`;
    }
    if (deps.now() - start >= opts.budgetMs) return done({ outcome: "timeout", last });
    await deps.sleep(opts.pollMs);
  }
}
