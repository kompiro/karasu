import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BRANCH } from "../adr/regenerate-pr-flow.ts";

// `review-request.yml` labels every untiered PR `risk: high`, except the daily
// ADR index regeneration PR, which its script labels `risk: low` (Issue #3416).
// The branch name lives in the workflow and in the script; if they drift, the
// workflow labels the regeneration PR High and the script never merges it. The
// skip must also require the head to be this repository, or a fork's branch of
// the same name would escape the High label.

const workflow = readFileSync(
  resolve(import.meta.dirname, "../../.github/workflows/review-request.yml"),
  "utf-8",
);
const jobIf = /^ {4}if: >-\n((?: {6}.*\n)+)/m.exec(workflow)?.[1] ?? "";

describe("review-request.yml regeneration skip", () => {
  it("skips the branch the regeneration script pushes", () => {
    expect(jobIf).toContain(`github.event.pull_request.head.ref == '${BRANCH}'`);
  });

  it("skips it only when the head is this repository", () => {
    expect(jobIf).toContain("github.event.pull_request.head.repo.full_name == github.repository");
  });

  it("still leaves drafts to be labelled when they leave draft", () => {
    expect(jobIf).toContain("github.event.pull_request.draft == false");
  });
});
