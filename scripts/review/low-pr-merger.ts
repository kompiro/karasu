/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
// The judge job of the Low PR merger (Issue #3673): judges every open `risk: low`
// PR and reports the verdicts. The decisions are in `low-pr-merger-flow.ts`;
// this file is the real GitHub and git they run against.
//
// It runs in a checkout of `main` and treats every PR as data (TPL-3673): a PR's
// head is fetched as objects for `tier.ts` to read, never checked out, installed
// or run. Dependency-free, like `tier.ts`: the workflow runs it with plain `node`.
//
// Output: a table in the job summary, the verdicts as JSON on stdout and, under
// Actions, as the step output `verdicts` (without the details, which quote PRs). It exits 0 even when it could not
// decide some PR: those are verdicts too, and one PR must not stop the judging
// of the others (TPL-2786 is kept by whatever reads the verdicts).
//
//   node scripts/review/low-pr-merger.ts   # from the repository root, with gh logged in

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import {
  type CheckRun,
  type GitHub,
  type Pull,
  type TierResult,
  type WorkflowRun,
  judge,
  renderSummary,
  toOutput,
} from "./low-pr-merger-flow.ts";
import { BASE, REPO } from "../adr/regenerate-pr-flow.ts";
import { checkPr } from "./tier.ts";

function gh(args: string[]): string {
  try {
    return execFileSync("gh", ["api", ...args], {
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? "").trim();
    throw new Error(`gh api ${args.join(" ")}: ${stderr}`, { cause: e });
  }
}

/** Every item of a paginated list endpoint. */
const ghList = <T>(path: string, jq: string): T[] =>
  gh(["--paginate", path, "--jq", `${jq} | tojson`])
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as T);

const PULL_FIELDS =
  "{number, state, draft, body, html_url, updated_at, labels: [.labels[] | {name}], base: {ref: .base.ref}, " +
  "head: {ref: .head.ref, sha: .head.sha, " +
  "repo: (if .head.repo then {full_name: .head.repo.full_name} else null end)}}";

const restGitHub: GitHub = {
  openPulls: () =>
    ghList<Pull>(`repos/${REPO}/pulls?state=open&per_page=100`, `.[] | ${PULL_FIELDS}`),
  // `mergeable` is only on a single PR's read.
  pull: (n) =>
    JSON.parse(
      gh([`repos/${REPO}/pulls/${n}`, "--jq", `${PULL_FIELDS} + {mergeable, mergeable_state}`]),
    ) as Pull,
  requiredChecks: () =>
    ghList<string>(
      `repos/${REPO}/rules/branches/${BASE}`,
      '.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context',
    ),
  // `filter=all`: `latest` folds runs by name, which is the judge's job (judgeChecks).
  checkRuns: (sha) =>
    ghList<CheckRun>(
      `repos/${REPO}/commits/${sha}/check-runs?filter=all&per_page=100`,
      ".check_runs[] | {id, name, status, conclusion, started_at, completed_at, " +
        "app: .app.slug, check_suite_id: .check_suite.id}",
    ),
  workflowRuns: (sha) =>
    ghList<WorkflowRun>(
      `repos/${REPO}/actions/runs?head_sha=${sha}&per_page=100`,
      ".workflow_runs[] | {id, path, event, check_suite_id}",
    ),
};

const git = (...args: string[]): string =>
  execFileSync("git", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });

/** Fetches the PR head's objects (no ref, no checkout) and runs `tier.ts check` on `sha`. */
function checkTier(pr: number, sha: string): TierResult {
  git("fetch", "--quiet", "--no-tags", "origin", `refs/pull/${pr}/head`);
  const result = checkPr(String(pr), sha);
  if (result.state === "moved") return { state: "moved" };
  for (const w of result.waivers)
    console.log(`#${pr} passed by a reason line: ${w.label}: ${w.reason}`);
  if (result.errors.length > 0) return { state: "fail", errors: result.errors };
  if (result.unreadable.length > 0) return { state: "unreadable", messages: result.unreadable };
  return { state: "pass" };
}

function main(): number {
  // The tier check compares against `origin/main`; a stale one would misjudge the diff.
  git("fetch", "--quiet", "--no-tags", "origin", BASE);
  const verdicts = judge({ github: restGitHub, checkTier, now: () => Date.now() });

  const json = JSON.stringify(toOutput(verdicts));
  console.log(JSON.stringify(verdicts, null, 2));
  for (const v of verdicts) {
    if (v.outcome === "no-conclusion") {
      // One line: a newline in the details must not start a workflow command.
      const details = v.details.join("; ").replace(/\s*\n\s*/g, " ");
      console.log(`::warning::PR #${v.pr}: no conclusion: ${details}`);
    }
  }
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, renderSummary(verdicts));
  const output = process.env.GITHUB_OUTPUT;
  if (output) appendFileSync(output, `verdicts=${json}\n`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = main();
}
