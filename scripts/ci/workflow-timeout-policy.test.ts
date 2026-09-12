import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the timeout policy decided in ADR-2805 and corrected in ADR-2807: in
// every workflow that runs a test suite, the bound that means "the suite hung"
// sits on the test step, and the job budget above it is what absorbs setup.
//
// The failure this guard exists for: these jobs install their OS packages with
// an unbounded `apt-get` against whatever mirror the runner draws (1030s of
// setup on run 34600028141). With a single job-level budget covering setup and
// tests together, a slow mirror cancels a suite in which nothing failed, and
// the red Required check is indistinguishable from a real failure (#2805). A
// job budget that does not clear its own setup plus the step bound brings the
// same shape back one layer up (#2807). Nothing in YAML ties a step's bound to
// its job's, so the relation is asserted here.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOW_DIR = join(REPO_ROOT, ".github/workflows");

/** Workflows whose jobs run a test suite behind unbounded setup. */
const SUITE_WORKFLOWS = ["e2e-nightly.yml", "e2e.yml", "vscode-e2e.yml"];

/**
 * The budgets, in minutes. `stepTimeout` is the real bound — it says how long
 * the suite may run before it counts as hung, and it is the number to revisit
 * when the suite grows. `jobTimeout` only has to clear it with room for setup
 * and teardown. Changing either is a policy change: update ADR-2807 in the
 * same PR.
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
 * Worst setup observed on this runner class, job start to test-step start:
 * 1030s on run 34600028141, of which 1013s was `apt-get`. Rounded up to 18.
 *
 * This is one shared number rather than one per job. These jobs pull OS
 * packages from the same mirrors on the same runner class, so a slow mirror is
 * a shared risk and a job that has only drawn fast ones is unsampled, not
 * safer — `e2e-nightly.yml#e2e` has seen 55s for the same install `e2e.yml#e2e`
 * has seen at 830s. A job budget below `stepTimeout + this` means the job kill
 * can beat the step kill, which is #2805 again with a bigger number.
 */
const OBSERVED_SETUP_MINUTES = 18;

/**
 * Room after the test step for the `if: always()` artifact uploads, which is
 * what the tracking Issue and the flake summary tell a reader to open. Measured
 * at 6-20s across passing and failing runs; 2 minutes is the rounded-up
 * allowance, kept explicit so a future budget cut cannot silently eat it.
 */
const TEARDOWN_MINUTES = 2;

type Step = { name: string | null; timeoutMinutes: number | null };
type Job = { readonly key: string; timeoutMinutes: number | null; readonly steps: Step[] };

/** Strips one layer of matching YAML quotes from a scalar. */
function unquote(value: string): string {
  const match = /^(["'])(.*)\1$/.exec(value.trim());
  return match === null ? value.trim() : match[2];
}

/** `|`, `>`, `|-`, `>2` … — the value opens a block scalar. */
const opensBlockScalar = (value: string): boolean => /^[|>][-+0-9]*$/.test(value.trim());

/**
 * Extracts `<file>#<job-id>` → job budget + steps with their names and budgets.
 * The workflows are uniformly formatted (job ids at 2 spaces, job keys at 4,
 * step entries at 6, step keys at 8), so a line scan is enough and keeps this
 * guard dependency-free, matching `workflow-runner-policy.test.ts`.
 *
 * Two shapes this has to get right, both covered by the `parseJobs` tests
 * below: a step entry is collected even when its first key opens a block scalar
 * (`- run: |`), so a later 8-space key cannot land on the previous step; and
 * the body of a block scalar is skipped wholesale, so shell or JavaScript that
 * happens to look like a job or a step is not read as one.
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

    // A step entry. Unnamed ones (`- uses:` / `- run:`) are collected too, so a
    // step budget is never attributed to the previous, named step.
    if (/^ {6}- /.test(line)) {
      currentStep = { name: null, timeoutMinutes: null };
      currentJob.steps.push(currentStep);
      const keyed = /^ {6}- ([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line);
      if (keyed) {
        const [, key, value] = keyed;
        if (key === "name") currentStep.name = unquote(value);
        // The key of a `- run: |` entry sits at column 8, so its body does too.
        if (opensBlockScalar(value)) blockScalarIndent = 8;
      }
      continue;
    }

    const jobKey = /^ {4}([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line);
    if (jobKey) {
      const [, key, value] = jobKey;
      if (key === "timeout-minutes" && /^\d+$/.test(value.trim())) {
        currentJob.timeoutMinutes = Number(value.trim());
      }
      if (opensBlockScalar(value)) blockScalarIndent = 4;
      continue;
    }
    if (currentStep === null) continue;

    const stepKey = /^ {8}([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line);
    if (stepKey) {
      const [, key, value] = stepKey;
      // `name:` need not be the step's first key — `- id: x` / `name: y` is the
      // same step to Actions, and reordering must not fail this guard.
      if (key === "name" && currentStep.name === null) currentStep.name = unquote(value);
      if (key === "timeout-minutes" && /^\d+$/.test(value.trim())) {
        currentStep.timeoutMinutes = Number(value.trim());
      }
      if (opensBlockScalar(value)) blockScalarIndent = 8;
    }
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

  it.each(SUITE_JOBS)("clears $key's setup and teardown around its test bound", (expected) => {
    // Read from the YAML rather than the table, so the relation is checked
    // against the file even when the table above is edited to match it.
    const job = jobsByKey.get(expected.key);
    const step = job?.steps.find((candidate) => candidate.name === expected.testStep);
    const jobBudget = job?.timeoutMinutes;
    const stepBudget = step?.timeoutMinutes;
    expect(jobBudget, `${expected.key} has no job budget`).toEqual(expect.any(Number));
    expect(stepBudget, `${expected.key} test step has no bound`).toEqual(expect.any(Number));
    expect(jobBudget).toBeGreaterThanOrEqual(
      (stepBudget ?? 0) + OBSERVED_SETUP_MINUTES + TEARDOWN_MINUTES,
    );
  });
});

describe("parseJobs", () => {
  // The guard is only as good as this scan, and the three real workflows
  // contain none of the shapes below — so they are fenced here rather than by
  // hand (#2807).
  const parse = (body: string): Job[] => parseJobs(`jobs:\n${body}`, "f.yml");

  it("collects a step whose first key opens a block scalar", () => {
    // `- run: |` used to be skipped, which left the following `name:` and
    // `timeout-minutes:` on the previous step: a suite with no bound at all,
    // reported green.
    const [job] = parse(`  e2e:
    timeout-minutes: 35
    steps:
      - run: pnpm install
      - run: |
          pnpm test
        name: Run E2E tests
        timeout-minutes: 15
`);
    expect(job.steps).toEqual([
      { name: null, timeoutMinutes: null },
      { name: "Run E2E tests", timeoutMinutes: 15 },
    ]);
  });

  it("reads a name that is not the step's first key", () => {
    const [job] = parse(`  e2e:
    steps:
      - id: run-tests
        name: Run E2E tests
        timeout-minutes: 15
`);
    expect(job.steps).toEqual([{ name: "Run E2E tests", timeoutMinutes: 15 }]);
  });

  it("unquotes a quoted step name", () => {
    const [job] = parse(`  e2e:
    steps:
      - name: "Run E2E tests"
        timeout-minutes: 15
`);
    expect(job.steps[0].name).toBe("Run E2E tests");
  });

  it("ignores job- and step-like lines inside a block scalar", () => {
    const jobs = parse(`  e2e:
    steps:
      - name: Seed
        run: |
          cat <<'X'
          phantom:
          - name: not a step
            timeout-minutes: 99
          X
      - name: Run E2E tests
        timeout-minutes: 15
`);
    expect(jobs.map((job) => job.key)).toEqual(["f.yml#e2e"]);
    expect(jobs[0].steps).toEqual([
      { name: "Seed", timeoutMinutes: null },
      { name: "Run E2E tests", timeoutMinutes: 15 },
    ]);
  });

  it("keeps a bound on the step that declares it", () => {
    const [job] = parse(`  e2e:
    steps:
      - uses: actions/checkout@v5
      - name: Run E2E tests
        timeout-minutes: 15
      - uses: actions/upload-artifact@v5
        with:
          name: report
`);
    expect(job.steps).toEqual([
      { name: null, timeoutMinutes: null },
      { name: "Run E2E tests", timeoutMinutes: 15 },
      { name: null, timeoutMinutes: null },
    ]);
  });

  it("separates jobs and reads each job's own budget", () => {
    const jobs = parse(`  first:
    timeout-minutes: 35
    steps:
      - name: Run E2E tests
        timeout-minutes: 15
  second:
    timeout-minutes: 5
    steps:
      - run: echo hi
`);
    expect(jobs.map((job) => [job.key, job.timeoutMinutes])).toEqual([
      ["f.yml#first", 35],
      ["f.yml#second", 5],
    ]);
  });
});
