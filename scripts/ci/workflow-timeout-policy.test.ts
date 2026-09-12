import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the timeout policy decided in ADR-2805 and corrected in ADR-2807: in
// every workflow that runs a test suite, the bound that means "the suite hung"
// sits on the test step, and the job budget above it is what absorbs setup.
//
// The failure this guard exists for: these jobs install their OS packages with
// an unbounded `apt-get` against whatever mirror the runner draws (1013s on run
// 34600028141). With a single job-level budget covering setup and tests
// together, a slow mirror cancels a suite in which nothing failed, and the red
// Required check is indistinguishable from a real failure (#2805). A job budget
// that does not clear its own setup plus the step bound brings the same shape
// back, one layer up (#2807). Nothing in YAML ties a step's bound to its job's,
// so the relation is asserted here.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOW_DIR = join(REPO_ROOT, ".github/workflows");

/** Workflows whose jobs run a test suite behind unbounded setup. */
const SUITE_WORKFLOWS = ["e2e-nightly.yml", "e2e.yml", "vscode-e2e.yml"];

/**
 * The budgets, in minutes. `stepTimeout` is the real bound — it says how long
 * the suite may run before it counts as hung, and it is the number to revisit
 * when the suite grows. `jobTimeout` only has to clear it with room for setup.
 * Changing either is a policy change: update ADR-2807 in the same PR.
 */
const SUITE_JOBS = [
  { key: "e2e-nightly.yml#e2e", testStep: "Run E2E tests", stepTimeout: 15, jobTimeout: 35 },
  { key: "e2e.yml#e2e", testStep: "Run E2E tests", stepTimeout: 15, jobTimeout: 35 },
  {
    key: "vscode-e2e.yml#vscode-e2e",
    testStep: "Run extension host smoke tests",
    stepTimeout: 10,
    jobTimeout: 30,
  },
  {
    key: "vscode-e2e.yml#vscode-webview-e2e",
    testStep: "Run WebView E2E (ExTester)",
    stepTimeout: 15,
    jobTimeout: 35,
  },
] as const;

/** Jobs in those workflows that run no suite: a single Issues API call. */
const NON_SUITE_JOBS = ["e2e-nightly.yml#notify"];

/**
 * The worst OS-package install observed on this runner class, rounded up:
 * 1013s in run 34600028141 (`Install Electron + Chromium system dependencies`).
 * Every job here pulls packages from the same mirrors on the same runner class,
 * so the slow-mirror risk is shared and the same allowance applies to all of
 * them — the job that has drawn a fast mirror so far is not safer, it is only
 * unsampled. A job budget below `stepTimeout + this` means the job kill can
 * beat the step kill, which is #2805 again with a bigger number.
 */
const OBSERVED_SETUP_MINUTES = 18;

type Step = { readonly firstKey: string; name: string | null; timeoutMinutes: number | null };
type Job = { readonly key: string; timeoutMinutes: number | null; readonly steps: Step[] };

/** Strips one layer of matching YAML quotes from a scalar. */
function unquote(value: string): string {
  const match = /^(["'])(.*)\1$/.exec(value.trim());
  return match === null ? value.trim() : match[2];
}

/**
 * Extracts `<file>#<job-id>` → job budget + steps with their names and budgets.
 * The workflows are uniformly formatted (job ids at 2 spaces, job keys at 4,
 * step entries at 6, step keys at 8), so a line scan is enough and keeps this
 * guard dependency-free, matching `workflow-runner-policy.test.ts`.
 *
 * Block scalars (`run: |`, `script: |`) are skipped wholesale: their bodies are
 * shell and JavaScript, and a heredoc line at the wrong indentation would
 * otherwise be read as a job or a step.
 */
function parseJobs(text: string, file: string): Job[] {
  const jobs: Job[] = [];
  let inJobs = false;
  let currentJob: Job | null = null;
  let currentStep: Step | null = null;
  let blockScalarIndent: number | null = null;

  for (const line of text.split("\n")) {
    if (blockScalarIndent !== null) {
      // Blank lines and anything indented past the opening key stay inside the
      // scalar; the first line at or above that indentation ends it.
      if (line.trim() === "") continue;
      if (line.length - line.trimStart().length > blockScalarIndent) continue;
      blockScalarIndent = null;
    }

    const blockOpener = /^(\s*)(-\s+)?[A-Za-z0-9_.-]+:\s*[|>][-+0-9]*\s*$/.exec(line);
    if (blockOpener) {
      blockScalarIndent = blockOpener[1].length + (blockOpener[2]?.length ?? 0);
      continue;
    }

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
    // so a step budget is never attributed to the previous, named step.
    const stepEntry = /^ {6}- ([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line);
    if (stepEntry) {
      currentStep = { firstKey: stepEntry[1], name: null, timeoutMinutes: null };
      if (stepEntry[1] === "name") currentStep.name = unquote(stepEntry[2]);
      currentJob.steps.push(currentStep);
      continue;
    }
    if (currentStep === null) continue;

    // `name:` need not be the step's first key — `- id: x` / `name: y` is the
    // same step to Actions, and reordering must not fail this guard.
    const stepName = /^ {8}name:\s*(.+?)\s*$/.exec(line);
    if (stepName && currentStep.name === null) {
      currentStep.name = unquote(stepName[1]);
      continue;
    }

    const stepTimeout = /^ {8}timeout-minutes:\s*(\d+)\s*$/.exec(line);
    if (stepTimeout) currentStep.timeoutMinutes = Number(stepTimeout[1]);
  }

  return jobs;
}

const missingWorkflows = SUITE_WORKFLOWS.filter(
  (file) => !existsSync(join(WORKFLOW_DIR, file)),
).sort();
const allJobs = SUITE_WORKFLOWS.filter((file) => !missingWorkflows.includes(file)).flatMap((file) =>
  parseJobs(readFileSync(join(WORKFLOW_DIR, file), "utf8"), file),
);
const jobsByKey = new Map(allJobs.map((job) => [job.key, job]));

describe("suite timeout policy (ADR-2807)", () => {
  it("reads every suite workflow this guard names", () => {
    // Parser sanity: a rename or a reformat that breaks the line scan would
    // otherwise make the assertions below pass vacuously. Missing files are
    // named here rather than thrown during collection.
    expect(missingWorkflows).toEqual([]);
    expect(
      SUITE_WORKFLOWS.filter((file) => !allJobs.some((job) => job.key.startsWith(`${file}#`))),
    ).toEqual([]);
  });

  it("covers every workflow that runs an E2E suite", () => {
    // A new `*e2e*.yml` inherits the single-budget shape unless it is listed,
    // and nothing else would notice. The `-skip` stubs are paired stubs that
    // report a Required check in seconds (ADR-953), not suites.
    const e2eWorkflows = readdirSync(WORKFLOW_DIR).filter(
      (file) => file.endsWith(".yml") && file.includes("e2e") && !file.endsWith("-skip.yml"),
    );
    expect(e2eWorkflows.filter((file) => !SUITE_WORKFLOWS.includes(file)).sort()).toEqual([]);
  });

  it("accounts for every job in those workflows", () => {
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

  it.each(SUITE_JOBS)("clears $key's setup on top of its test bound", (expected) => {
    // Read from the YAML rather than the table, so the relation is checked
    // against the file even when the table above is edited to match it.
    const job = jobsByKey.get(expected.key);
    const step = job?.steps.find((candidate) => candidate.name === expected.testStep);
    const jobBudget = job?.timeoutMinutes;
    const stepBudget = step?.timeoutMinutes;
    expect(jobBudget, `${expected.key} has no job budget`).toEqual(expect.any(Number));
    expect(stepBudget, `${expected.key} test step has no bound`).toEqual(expect.any(Number));
    expect(jobBudget).toBeGreaterThanOrEqual((stepBudget ?? 0) + OBSERVED_SETUP_MINUTES);
  });
});
