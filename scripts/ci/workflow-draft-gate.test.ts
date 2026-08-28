import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the draft skip decided in ADR-2643 (stacked-PR flow): the minute-scale
// jobs do not run while a PR is a draft, because a stack keeps every layer above
// the bottom one in draft and nobody reads a layer until it reaches the bottom.
//
// The pairing this guard exists for: a job skipped by a job-level `if` reports
// **success** to a Required status check. A workflow that kept the draft skip
// but lost `ready_for_review` from its `types:` would therefore let a PR merge
// with a green Required check that no real run ever produced. Neither half is
// safe on its own, and nothing in YAML ties them together.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOW_DIR = join(REPO_ROOT, ".github/workflows");

const DRAFT_GATE = "github.event.pull_request.draft != true";

/** Jobs deliberately skipped on draft PRs: minutes of compute, or a deployment. */
const DRAFT_GATED_JOBS = [
  "ci.yml#check",
  "docs-preview.yml#deploy",
  "e2e.yml#e2e",
  "preview.yml#preview",
  "vscode-e2e.yml#vscode-e2e",
  "vscode-e2e.yml#vscode-webview-e2e",
];

type Job = { readonly key: string; readonly body: string };

/**
 * Extracts `<file>#<job-id>` → job body. The workflows are uniformly formatted
 * (job ids at 2 spaces), so a line scan is enough and keeps this guard
 * dependency-free, matching `workflow-runner-policy.test.ts`.
 */
function readJobs(file: string): Job[] {
  const lines = readFileSync(join(WORKFLOW_DIR, file), "utf8").split("\n");
  const jobs: Job[] = [];
  let inJobs = false;
  let currentKey: string | null = null;
  let currentLines: string[] = [];

  const flush = (): void => {
    if (currentKey !== null) jobs.push({ key: currentKey, body: currentLines.join("\n") });
    currentKey = null;
    currentLines = [];
  };

  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    if (!inJobs) continue;
    if (/^\S/.test(line)) {
      flush();
      inJobs = false;
      continue;
    }

    const jobId = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobId) {
      flush();
      currentKey = `${file}#${jobId[1]}`;
      continue;
    }
    if (currentKey !== null) currentLines.push(line);
  }
  flush();

  return jobs;
}

/** The `types:` list of the workflow's `pull_request` trigger. */
function readPullRequestTypes(file: string): string[] {
  const text = readFileSync(join(WORKFLOW_DIR, file), "utf8");
  const match = /^ {4}types: \[(.+)\]$/m.exec(text);
  return match === null ? [] : match[1].split(",").map((entry) => entry.trim());
}

const workflowFiles = readdirSync(WORKFLOW_DIR)
  .filter((name) => name.endsWith(".yml"))
  .sort();
const allJobs = workflowFiles.flatMap(readJobs);

describe("draft gate on expensive workflows (ADR-2643)", () => {
  it("finds every gated job by name", () => {
    // Parser sanity: a reformat that breaks the line scan would otherwise make
    // the assertions below pass vacuously.
    const keys = new Set(allJobs.map((job) => job.key));
    const missing = DRAFT_GATED_JOBS.filter((key) => !keys.has(key));
    expect(missing).toEqual([]);
  });

  it("skips exactly the minute-scale jobs on draft PRs", () => {
    const gated = allJobs
      .filter((job) => job.body.includes(DRAFT_GATE))
      .map((job) => job.key)
      .sort();
    // Adding or removing an entry here is a policy change: say so in ADR-2643
    // and in the `docs/process.md` stacked-PR section in the same PR.
    expect(gated).toEqual([...DRAFT_GATED_JOBS].sort());
  });

  it("triggers every gated workflow on ready_for_review", () => {
    const files = [...new Set(DRAFT_GATED_JOBS.map((key) => key.split("#")[0]))].sort();
    const withoutTrigger = files.filter(
      (file) => !readPullRequestTypes(file).includes("ready_for_review"),
    );
    // Without this trigger the skipped run's **success** is the last word on
    // the commit: taking the PR out of draft would start nothing, and a
    // Required check would stay green over an unverified diff.
    expect(withoutTrigger).toEqual([]);
  });
});
