/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
// Waits for the Low PR merger to merge one Low PR (Issue #3698). The waiting and
// the outcomes are in `await-low-merge-flow.ts`; this file is the real GitHub and
// git they run against. Read-only on GitHub: the session comments and enables
// auto-merge from the outcome (`.claude/rules/adr.md`). Locally it fetches `main`
// and the PR head's objects for the judge's tier check, as the merger does.
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/review/await-low-merge.ts <pr> [--once]
//
// Run it in the background from the repository's checkout: it returns when the PR
// merged or the session has something to do, up to 3 hours. `--once` reads the PR
// once and reports `timeout` with the current verdict when nothing is decided yet.
//
// stdout is one JSON line: { outcome, pr, head, waitedMin, ... }. The outcomes and
// their fields are the `Outcome` type in `await-low-merge-flow.ts`.

import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  DEFAULT_OPTIONS,
  type Deps,
  MERGE_JOB,
  type PrState,
  awaitLowMerge,
} from "./await-low-merge-flow.ts";
import { judge } from "./low-pr-merger-flow.ts";
import { checkTier, gh, ghList, restGitHub } from "./low-pr-merger.ts";
import { BASE, REPO } from "../adr/regenerate-pr-flow.ts";

const PR_FIELDS =
  "{state, merged, mergedAt: .merged_at, mergedBy: .merged_by.login, mergeSha: .merge_commit_sha, " +
  "headSha: .head.sha, headRef: .head.ref, createdAt: .created_at, autoMerge: (.auto_merge != null)}";

const realDeps: Deps = {
  pull: (n) => JSON.parse(gh([`repos/${REPO}/pulls/${n}`, "--jq", PR_FIELDS])) as PrState,
  judge: (n) => {
    // The tier check compares against `origin/main`; a stale one would misjudge the diff.
    execFileSync("git", ["fetch", "--quiet", "--no-tags", "origin", BASE], { stdio: "ignore" });
    const [verdict] = judge({
      github: { ...restGitHub, openPulls: () => [restGitHub.pull(n)] },
      // stdout carries only the result line.
      checkTier: (pr, sha) => checkTier(pr, sha, console.error),
      now: () => Date.now(),
    });
    return verdict ?? null;
  },
  mergerRuns: (from, to) =>
    ghList<{ id: number; url: string }>(
      `repos/${REPO}/actions/workflows/low-pr-merger.yml/runs?created=${from}..${to}&per_page=100`,
      ".workflow_runs[] | {id, url: .html_url}",
    ),
  // `filter=all`: the default lists only the latest attempt, so a re-run whose
  // merge job was skipped would hide the attempt that merged.
  mergeJobs: (runId) =>
    ghList<{ id: number; status: string; conclusion: string | null }>(
      `repos/${REPO}/actions/runs/${runId}/jobs?filter=all&per_page=100`,
      `.jobs[] | select(.name == "${MERGE_JOB}" and .conclusion != "skipped") | {id, status, conclusion}`,
    ).map((job) => ({ ...job, log: () => gh([`repos/${REPO}/actions/jobs/${job.id}/logs`]) })),
  branchExists: (ref) => {
    try {
      gh([`repos/${REPO}/branches/${encodeURIComponent(ref)}`, "--silent"]);
      return true;
    } catch (e) {
      if (/HTTP 404/.test((e as Error).message)) return false;
      throw e;
    }
  },
  now: () => Date.now(),
  sleep: (ms) => sleep(ms),
};

async function main(argv: string[]): Promise<number> {
  const pr = Number(argv[0]);
  if (!Number.isInteger(pr) || pr <= 0) {
    console.error("usage: await-low-merge.ts <pr> [--once]");
    return 2;
  }
  const once = argv.includes("--once");
  const result = await awaitLowMerge(
    realDeps,
    pr,
    once ? { ...DEFAULT_OPTIONS, budgetMs: 0 } : DEFAULT_OPTIONS,
  );
  console.log(JSON.stringify(result));
  return 0;
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
