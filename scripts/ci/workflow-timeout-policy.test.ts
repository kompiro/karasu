import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the timeout policy decided in ADR-2805: in every workflow that runs a
// test suite, the bound that means "the suite hung" sits on the test step, and
// the job budget above it is what absorbs setup.
//
// The failure this guard exists for: these jobs install their OS packages with
// an unbounded `apt-get` against whatever mirror the runner draws (13m28s on
// the run that prompted #2805, against a 20-minute job budget). With a single
// job-level budget covering setup and tests together, a slow mirror cancels a
// suite in which nothing failed, and the red Required check is indistinguishable
// from a real failure. Nothing in YAML ties a step's bound to its job's, so the
// pairing is asserted here.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOW_DIR = join(REPO_ROOT, ".github/workflows");

/** Workflows whose jobs run a test suite behind unbounded setup. */
const SUITE_WORKFLOWS = ["e2e-nightly.yml", "e2e.yml", "vscode-e2e.yml"];

/**
 * The budgets, in minutes. `stepTimeout` is the real bound — it says how long
 * the suite may run before it counts as hung, and it is the number to revisit
 * when the suite grows. `jobTimeout` only has to clear it with room for setup.
 * Changing either is a policy change: update ADR-2805 in the same PR.
 */
const SUITE_JOBS = [
  { key: "e2e-nightly.yml#e2e", testStep: "Run E2E tests", stepTimeout: 15, jobTimeout: 30 },
  { key: "e2e.yml#e2e", testStep: "Run E2E tests", stepTimeout: 15, jobTimeout: 30 },
  {
    key: "vscode-e2e.yml#vscode-e2e",
    testStep: "Run extension host smoke tests",
    stepTimeout: 10,
    jobTimeout: 20,
  },
  {
    key: "vscode-e2e.yml#vscode-webview-e2e",
    testStep: "Run WebView E2E (ExTester)",
    stepTimeout: 15,
    jobTimeout: 25,
  },
] as const;

/** Jobs in those workflows that run no suite: a single Issues API call. */
const NON_SUITE_JOBS = ["e2e-nightly.yml#notify"];

/**
 * How much of the job budget has to remain once the test step has used all of
 * its own. Below this the job kill races the step kill, and setup slowness is
 * reported as a cancelled job again — the shape #2805 is about.
 */
const MIN_SETUP_MARGIN_MINUTES = 5;

type Step = { readonly name: string | null; timeoutMinutes: number | null };
type Job = { readonly key: string; timeoutMinutes: number | null; readonly steps: Step[] };

/**
 * Extracts `<file>#<job-id>` → job budget + named steps with their own budgets.
 * The workflows are uniformly formatted (job ids at 2 spaces, job keys at 4,
 * step entries at 6, step keys at 8), so a line scan is enough and keeps this
 * guard dependency-free, matching `workflow-runner-policy.test.ts`.
 */
function parseJobs(text: string, file: string): Job[] {
  const jobs: Job[] = [];
  let inJobs = false;
  let currentJob: Job | null = null;
  let currentStep: Step | null = null;

  for (const line of text.split("\n")) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    if (!inJobs) continue;
    if (/^\S/.test(line)) {
      inJobs = false;
      continue;
    }

    const jobId = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobId) {
      currentJob = { key: `${file}#${jobId[1]}`, timeoutMinutes: null, steps: [] };
      currentStep = null;
      jobs.push(currentJob);
      continue;
    }
    if (currentJob === null) continue;

    const jobTimeout = /^ {4}timeout-minutes:\s*(\d+)\s*$/.exec(line);
    if (jobTimeout) {
      currentJob.timeoutMinutes = Number(jobTimeout[1]);
      continue;
    }

    // A new step entry. Unnamed ones (`- uses:` / `- run:`) are collected too,
    // so a step timeout is never attributed to the previous, named step.
    const stepEntry = /^ {6}- (.*)$/.exec(line);
    if (stepEntry) {
      const named = /^name:\s*(.+?)\s*$/.exec(stepEntry[1]);
      currentStep = { name: named === null ? null : named[1], timeoutMinutes: null };
      currentJob.steps.push(currentStep);
      continue;
    }

    const stepTimeout = /^ {8}timeout-minutes:\s*(\d+)\s*$/.exec(line);
    if (stepTimeout && currentStep !== null) {
      currentStep.timeoutMinutes = Number(stepTimeout[1]);
    }
  }

  return jobs;
}

const allJobs = SUITE_WORKFLOWS.flatMap((file) =>
  parseJobs(readFileSync(join(WORKFLOW_DIR, file), "utf8"), file),
);
const jobsByKey = new Map(allJobs.map((job) => [job.key, job]));

describe("suite timeout policy (ADR-2805)", () => {
  it("reads every suite workflow this guard names", () => {
    // Parser sanity: a rename or a reformat that breaks the line scan would
    // otherwise make the assertions below pass vacuously.
    const present = readdirSync(WORKFLOW_DIR);
    expect(SUITE_WORKFLOWS.filter((file) => !present.includes(file))).toEqual([]);
    expect(
      SUITE_WORKFLOWS.filter((file) => !allJobs.some((job) => job.key.startsWith(`${file}#`))),
    ).toEqual([]);
  });

  it("accounts for every job in those workflows", () => {
    // A new suite job landing here without an entry is the drift this catches:
    // it would inherit the single-budget shape #2805 removed.
    const parsed = allJobs.map((job) => job.key).sort();
    const accounted = [...SUITE_JOBS.map((job) => job.key), ...NON_SUITE_JOBS].sort();
    expect(parsed).toEqual(accounted);
  });

  it.each(SUITE_JOBS)("bounds $key on its test step, not only on the job", (expected) => {
    const job = jobsByKey.get(expected.key);
    const step = job?.steps.find((candidate) => candidate.name === expected.testStep);
    expect(step, `step "${expected.testStep}" not found in ${expected.key}`).toBeDefined();
    expect(step?.timeoutMinutes).toBe(expected.stepTimeout);
    expect(job?.timeoutMinutes).toBe(expected.jobTimeout);
  });

  it.each(SUITE_JOBS)("leaves $key setup room beyond the test bound", (expected) => {
    // Read from the YAML rather than the table, so the invariant is checked
    // against the file even when the table above is edited to match it.
    const job = jobsByKey.get(expected.key);
    const step = job?.steps.find((candidate) => candidate.name === expected.testStep);
    const jobBudget = job?.timeoutMinutes ?? 0;
    const stepBudget = step?.timeoutMinutes ?? 0;
    expect(jobBudget - stepBudget).toBeGreaterThanOrEqual(MIN_SETUP_MARGIN_MINUTES);
  });
});
