import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Fences the fix for #2982 in release.yml's `release` job. `changeset publish`
// creates annotated tags and ignores a failing `git tag`, so a job without a
// git identity publishes to npm, tags nothing, and skips `record` while the
// run stays green. Text checks on purpose: the invariant is the order of the
// steps, and reading them as text keeps this test free of a YAML dependency.

const workflow = readFileSync(
  resolve(import.meta.dirname, "../../.github/workflows/release.yml"),
  "utf8",
);

const releaseJob = workflow.slice(
  workflow.indexOf("\n  release:\n"),
  workflow.indexOf("\n  record:\n"),
);

const indexOfStep = (name: string): number => releaseJob.indexOf(`- name: ${name}`);

describe("release.yml release job", () => {
  it("sets a git identity before `changeset publish` creates its annotated tags", () => {
    const identity = indexOfStep("Set a git identity for the release tags");
    const publish = indexOfStep("Publish to npm");
    expect(identity).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(identity);
    const identityStep = releaseJob.slice(identity, publish);
    expect(identityStep).toContain("git config user.name");
    expect(identityStep).toContain("git config user.email");
  });

  it("keeps the publish output and fails when a published package has no tag", () => {
    const publish = releaseJob.slice(indexOfStep("Publish to npm"));
    expect(publish).toContain('tee "$RUNNER_TEMP/publish.log"');
    expect(publish).toContain("set -o pipefail");
    const collect = releaseJob.slice(indexOfStep("Collect the tags of what was published"));
    expect(collect).toContain(
      'node scripts/release/published-packages.mts < "$RUNNER_TEMP/publish.log"',
    );
    expect(collect).toContain("exit 1");
  });
});
