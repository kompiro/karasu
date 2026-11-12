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
  /** The run's merge jobs over every attempt, without the skipped ones: a re-run keeps the earlier log. */
  mergeJobs(runId: number): MergeJob[];
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
   * The merge job logged this PR: what #3698 records. The push workflows on
   * `mergeSha` are read on #3698 later, when they have all started.
   */
  | {
      outcome: "merged-by-merger";
      run: string;
      mergedBy: string | null;
      mergeSha: string | null;
      branchDeleted: boolean;
    }
  /** Merged by a person, which includes native auto-merge (merged as whoever enabled it). */
  | { outcome: "merged-otherwise"; mergedBy: string | null }
  /** Merged by an app, but no merge job in the searched runs logged it: #3698 decides. */
  | {
      outcome: "merged-unattributed";
      mergedBy: string;
      mergeSha: string | null;
      searched: string;
      /** The runs with a merge job whose log could not be read. */
      unread: string[];
    }
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
 * waits for at most the one in progress. The run may predate the PR itself.
 */
const MERGE_WINDOW_MS = 60 * 60_000;

const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

async function whoMerged(
  deps: Deps,
  pr: number,
  p: PrState,
  opts: Options,
  deadline: number,
): Promise<Outcome> {
  // An app's login ends in `[bot]`; a person's cannot, and native auto-merge
  // merges as the person who enabled it. Only an app's merge is looked up.
  if (!p.mergedBy?.endsWith("[bot]")) return { outcome: "merged-otherwise", mergedBy: p.mergedBy };
  const to = Date.parse(p.mergedAt ?? "") || deps.now();
  const [from, until] = [iso(to - MERGE_WINDOW_MS), iso(to)];
  const line = new RegExp(`^.*merged #${pr} at `, "m");
  const runs = deps.mergerRuns(from, until);
  for (;;) {
    // Every finished attempt of every run is read before waiting on an unfinished
    // one, and a log that cannot be read does not stop the others being read.
    let running: string | null = null;
    const unread = new Set<string>();
    for (const run of runs) {
      for (const job of deps.mergeJobs(run.id)) {
        if (job.status !== "completed") {
          running ??= `the merge job of ${run.url} is still running`;
          continue;
        }
        let log: string;
        try {
          log = job.log();
        } catch {
          unread.add(run.url);
          continue;
        }
        if (!line.test(log)) continue;
        return {
          outcome: "merged-by-merger",
          run: run.url,
          mergedBy: p.mergedBy,
          mergeSha: p.mergeSha,
          branchDeleted: !deps.branchExists(p.headRef),
        };
      }
    }
    if (running === null) {
      // The merger's run may lie outside the window (a runner that took over an
      // hour to start), or in a log that could not be read: #3698 decides.
      return {
        outcome: "merged-unattributed",
        mergedBy: p.mergedBy,
        mergeSha: p.mergeSha,
        searched: `${from}..${until}`,
        unread: [...unread],
      };
    }
    if (deps.now() >= deadline) return { outcome: "timeout", last: running };
    await deps.sleep(opts.pollMs);
  }
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
  const step = async (): Promise<Outcome | string> => {
    const p = deps.pull(pr);
    head = p.headSha;
    if (p.merged) return whoMerged(deps, pr, p, opts, start + opts.budgetMs);
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
      const result = await step();
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
