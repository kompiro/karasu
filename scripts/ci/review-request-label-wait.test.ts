import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// A Low ADR PR opens as non-draft with `gh pr create --label "risk: low"`
// (`.claude/rules/adr.md`, Issue #3504). gh adds the label in a call after the
// PR is opened, so `review-request.yml` has to wait before it reads the labels
// on `opened` / `reopened`, or it labels the PR `risk: high` first. A draft got
// its label before `ready_for_review`, so that event reads them at once.

const workflow = readFileSync(
  resolve(import.meta.dirname, "../../.github/workflows/review-request.yml"),
  "utf-8",
);
const run = /^ {8}run: \|\n((?: {10}.*\n|\n)+)/m.exec(workflow)?.[1] ?? "";

describe("review-request.yml label wait", () => {
  it("still runs on a PR that opens as non-draft", () => {
    expect(workflow).toMatch(/types: \[opened, reopened, ready_for_review\]/);
  });

  it("waits before reading the labels unless the PR left draft", () => {
    const wait = run.indexOf('if [ "$ACTION" != "ready_for_review" ]; then\n            sleep ');
    const read = run.indexOf("gh pr view");
    expect(wait).toBeGreaterThanOrEqual(0);
    expect(read).toBeGreaterThan(wait);
  });

  it("reads the action from the event", () => {
    expect(workflow).toContain("ACTION: ${{ github.event.action }}");
  });
});
