import { describe, expect, it } from "vitest";
import { marker, partialRelease, releaseRunFailed, taggable, vscodeSucceeded } from "./confirm.mts";
import type { NpmPackage } from "./release-state.mts";

// Fences the record decisions of release-confirm.yml (#3240).

describe("releaseRunFailed", () => {
  it("passes only when pack, stage and vscode all succeeded", () => {
    expect(releaseRunFailed(["success", "success", "success"])).toBe(false);
  });

  it("fails when pack failed and stage was skipped", () => {
    expect(releaseRunFailed(["failure", "skipped", "success"])).toBe(true);
  });

  it("fails on a missing result", () => {
    expect(releaseRunFailed(["success", null, "success"])).toBe(true);
  });
});

describe("vscodeSucceeded", () => {
  it("reads the reusable workflow's jobs and counts a skipped publish", () => {
    expect(
      vscodeSucceeded([
        { name: "Release", conclusion: "success" },
        { name: "VS Code extension / Build", conclusion: "success" },
        { name: "VS Code extension / Record", conclusion: "skipped" },
      ]),
    ).toBe(true);
  });

  it("is not done while a job failed, runs, or never ran", () => {
    expect(vscodeSucceeded([{ name: "VS Code extension / Build", conclusion: "failure" }])).toBe(
      false,
    );
    expect(vscodeSucceeded([{ name: "VS Code extension / Build", conclusion: null }])).toBe(false);
    expect(vscodeSucceeded([{ name: "Release", conclusion: "success" }])).toBe(false);
  });
});

describe("partialRelease", () => {
  const pkg = (name: string): NpmPackage => ({
    name,
    dir: name,
    version: "1.0.0",
    workspaceDependencies: [],
  });
  const bumped = [pkg("karasu-skills"), pkg("karasu")];

  it("lists what still has to be staged once part of the release is on npm", () => {
    expect(partialRelease(bumped, (p) => p.name === "karasu-skills")).toEqual(["karasu@1.0.0"]);
  });

  it("is empty before anything or after everything is published", () => {
    expect(partialRelease(bumped, () => false)).toEqual([]);
    expect(partialRelease(bumped, () => true)).toEqual([]);
  });
});

describe("marker", () => {
  it("names the kind and the subject, so a new state gets a new comment", () => {
    expect(marker("staged", "karasu@1.0.0")).toBe("<!-- release-confirm:staged:karasu@1.0.0 -->");
    expect(marker("staged", "karasu@1.0.0")).not.toBe(marker("staged", "karasu@1.0.1"));
  });
});

describe("taggable", () => {
  const pkg = (name: string, version: string): NpmPackage => ({
    name,
    dir: name,
    version,
    workspaceDependencies: [],
  });
  const bumped = [pkg("karasu-skills", "0.3.0"), pkg("karasu", "0.11.0")];

  it("pushes only bumped versions that are untagged and on npm", () => {
    expect(
      taggable(["karasu-skills@0.3.0", "karasu@0.11.0"], bumped, (p) => p.name === "karasu-skills"),
    ).toEqual({ accepted: ["karasu-skills@0.3.0"], refused: ["karasu@0.11.0"] });
  });

  it("refuses names the verify job should never hand over", () => {
    const handed = ["karasu@99.0.0", "release-2026-11-29", "karasu-vscode@0.5.0"];
    expect(taggable(handed, bumped, () => true)).toEqual({ accepted: [], refused: handed });
  });
});
