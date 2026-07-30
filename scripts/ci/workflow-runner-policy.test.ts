import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the runner policy decided in ADR-1890 (Ubicloud adoption): every job
// in `.github/workflows/` runs either on the Ubicloud label (compute-bound
// verification work) or on `ubuntu-latest` (secret-bearing publish / deploy
// jobs, API-only jobs, and the paired `-skip` stubs). A new job silently
// landing on a third label — or an existing job drifting off its side of the
// policy — fails here instead of being noticed by a surprise bill or a
// leaked-secret review.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOW_DIR = join(REPO_ROOT, ".github/workflows");

const UBICLOUD = "ubicloud-standard-4-ubuntu-2404";
const GITHUB_HOSTED = "ubuntu-latest";

/** Jobs intentionally on Ubicloud: compute-bound, no publish credentials. */
const UBICLOUD_JOBS = [
  "ci.yml#check",
  "e2e-nightly.yml#e2e",
  "e2e.yml#e2e",
  "vscode-e2e.yml#vscode-e2e",
  "vscode-e2e.yml#vscode-webview-e2e",
  "vscode-screenshots.yml#capture",
];

type JobRunner = { readonly key: string; readonly runsOn: string };

/**
 * Extracts `<file>#<job-id>` → `runs-on` pairs. The workflows are uniformly
 * formatted (job ids at 2 spaces, `runs-on:` at 4), so a line scan is enough
 * and keeps this guard dependency-free.
 */
function readJobRunners(file: string): JobRunner[] {
  const lines = readFileSync(join(WORKFLOW_DIR, file), "utf8").split("\n");
  const jobs: JobRunner[] = [];
  let inJobs = false;
  let currentJob: string | null = null;

  for (const line of lines) {
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
      currentJob = jobId[1];
      continue;
    }

    const runsOn = /^ {4}runs-on:\s*(\S+)\s*$/.exec(line);
    if (runsOn && currentJob) {
      jobs.push({ key: `${file}#${currentJob}`, runsOn: runsOn[1] });
    }
  }

  return jobs;
}

const workflowFiles = readdirSync(WORKFLOW_DIR)
  .filter((name) => name.endsWith(".yml"))
  .sort();
const allJobs = workflowFiles.flatMap(readJobRunners);

describe("GitHub Actions runner policy (ADR-1890)", () => {
  it("finds at least one job per workflow file", () => {
    // Parser sanity: a reformat that breaks the line scan would otherwise make
    // every assertion below pass vacuously.
    const withoutJobs = workflowFiles.filter(
      (file) => !allJobs.some((job) => job.key.startsWith(`${file}#`)),
    );
    expect(withoutJobs).toEqual([]);
  });

  it("uses only the two sanctioned runner labels", () => {
    const unexpected = allJobs
      .filter((job) => job.runsOn !== UBICLOUD && job.runsOn !== GITHUB_HOSTED)
      .map((job) => `${job.key} → ${job.runsOn}`);
    expect(unexpected).toEqual([]);
  });

  it("runs exactly the compute-bound jobs on Ubicloud", () => {
    const onUbicloud = allJobs
      .filter((job) => job.runsOn === UBICLOUD)
      .map((job) => job.key)
      .sort();
    // Adding or removing an entry here is a policy change: update ADR-1890
    // (secret-bearing publish / deploy jobs stay GitHub-hosted) in the same PR.
    expect(onUbicloud).toEqual([...UBICLOUD_JOBS].sort());
  });
});
