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

type Job = { readonly key: string; readonly condition: string };

/**
 * Extracts `<file>#<job-id>` → the job-level `if:` expression. The workflows are
 * uniformly formatted (job ids at 2 spaces, job keys at 4), so a line scan is
 * enough and keeps this guard dependency-free, matching
 * `workflow-runner-policy.test.ts`.
 *
 * Only the `if:` value is read, never the surrounding comments or a step's own
 * `if:`: a comment quoting the gate expression next to a deleted job-level `if:`
 * would otherwise read as a gated job.
 */
function parseJobs(text: string, file: string): Job[] {
  const jobs: Job[] = [];
  let inJobs = false;
  let currentKey: string | null = null;
  let condition: string[] = [];
  let inFoldedCondition = false;

  const flush = (): void => {
    if (currentKey !== null) {
      jobs.push({ key: currentKey, condition: condition.join(" ").replace(/\s+/g, " ").trim() });
    }
    currentKey = null;
    condition = [];
    inFoldedCondition = false;
  };

  for (const line of text.split("\n")) {
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
    if (currentKey === null) continue;

    // A folded `if: >-` runs until the next key of the job (4-space indent).
    // Blank lines and lines indented past the block's own indentation are part
    // of the scalar in YAML 1.2, so neither ends the collection.
    if (inFoldedCondition) {
      if (line.trim() === "") continue;
      if (/^ {6,}\S/.test(line)) {
        condition.push(line.trim());
        continue;
      }
      inFoldedCondition = false;
    }

    const jobIf = /^ {4}if:\s*(.*)$/.exec(line);
    if (jobIf) {
      const inline = jobIf[1].trim();
      if (inline === ">-" || inline === ">" || inline === "|") inFoldedCondition = true;
      else condition.push(inline);
    }
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
const allJobs = workflowFiles.flatMap((file) =>
  parseJobs(readFileSync(join(WORKFLOW_DIR, file), "utf8"), file),
);

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
      .filter((job) => job.condition.includes(DRAFT_GATE))
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

describe("parseJobs", () => {
  // The workflows all write the gate the same way today, so these fixtures are
  // the only place the other legal spellings are exercised. A parser that
  // quietly stopped reading one of them would report a gated job as ungated.
  //
  // The gate term sits **after** the awkward line in each fixture. Put it first
  // and the parser has already read it before the construct under test, so both
  // cases pass with a parser that stops there.
  const FIXTURE = `on:
  pull_request:
    types: [opened, ready_for_review]

jobs:
  folded-extra-indent:
    name: Folded, continued past the block indent
    if: >-
      github.event.action != 'closed' &&
        github.event.pull_request.draft != true
    runs-on: ubuntu-latest

  folded-blank-line:
    name: Folded, split by a blank line
    if: >-
      github.event.action != 'closed' &&

      github.event.pull_request.draft != true
    runs-on: ubuntu-latest

  gate-only-in-prose:
    name: Comment and step condition only
    # if: github.event.pull_request.draft != true
    runs-on: ubuntu-latest
    steps:
      - run: echo hello
        if: github.event.pull_request.draft != true
`;

  const gated = parseJobs(FIXTURE, "fixture.yml")
    .filter((job) => job.condition.includes(DRAFT_GATE))
    .map((job) => job.key);

  it("reads a folded condition continued past the block indent", () => {
    expect(gated).toContain("fixture.yml#folded-extra-indent");
  });

  it("reads a folded condition split by a blank line", () => {
    expect(gated).toContain("fixture.yml#folded-blank-line");
  });

  it("ignores the expression in a comment or a step-level if", () => {
    expect(gated).not.toContain("fixture.yml#gate-only-in-prose");
  });
});
