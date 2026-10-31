import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Fences the pre-release path of vscode-release.yml (#2940) where it touches
// the stable release. Text checks on purpose, like release-workflow.test.ts:
// the invariants are a few expressions and names, and reading them as text
// keeps this test free of a YAML dependency.

const workflow = readFileSync(
  resolve(import.meta.dirname, "../../.github/workflows/vscode-release.yml"),
  "utf8",
);

describe("vscode-release.yml pre-release path", () => {
  it("never reports a pre-release as a stable publish, which `record` would tag", () => {
    expect(workflow).toContain(
      "published: ${{ steps.publish.outcome == 'success' && steps.channel.outputs.pre_release != 'true' }}",
    );
  });

  it("counts `schedule` only when this file's own cron fired, not a scheduled caller's", () => {
    expect(workflow).toContain(
      "(github.event_name == 'schedule' && contains(github.workflow_ref, '/vscode-release.yml@'))",
    );
  });

  it("tags a pre-release without `@`, so no package tag collector reads it as stable", () => {
    expect(workflow).toContain("TAG: karasu-vscode-pre/${{");
    expect(workflow).not.toMatch(/karasu-vscode-pre@/);
  });

  it("decides the version only after the comparison found a change", () => {
    const compare = workflow.indexOf("- name: Compare with the highest version on the Marketplace");
    const version = workflow.indexOf("- name: Set the pre-release version");
    expect(compare).toBeGreaterThan(-1);
    expect(version).toBeGreaterThan(compare);
    const versionStep = workflow.slice(version, workflow.indexOf("- name:", version + 1));
    expect(versionStep).toContain("if: steps.compare.outputs.publish == 'true'");
  });

  it("fails on a comparison result that is neither `same` nor `changed`", () => {
    const compare = workflow.indexOf("- name: Compare with the highest version on the Marketplace");
    const compareStep = workflow.slice(compare, workflow.indexOf("- name:", compare + 1));
    expect(compareStep).toMatch(/same\)\n[^]*publish=false/);
    expect(compareStep).toMatch(/changed\)\n[^]*publish=true/);
    expect(compareStep).toMatch(/\*\)\n[^]*exit 1/);
  });

  it("bounds the Marketplace download, so a stalled transfer cannot hold the release group", () => {
    const compare = workflow.indexOf("- name: Compare with the highest version on the Marketplace");
    const compareStep = workflow.slice(compare, workflow.indexOf("- name:", compare + 1));
    expect(compareStep).toMatch(/curl [^\n]*--max-time \d+/);
    expect(compareStep).toMatch(/curl [^\n]*--retry-max-time \d+/);
  });

  it("queues every waiting run, so a pre-release never replaces the train's pending call", () => {
    const start = workflow.indexOf("\nconcurrency:\n");
    const block = workflow.slice(start, workflow.indexOf("\npermissions:\n", start));
    expect(block).toContain("  group: vscode-release\n");
    expect(block).toContain("\n  queue: max\n");
  });
});
