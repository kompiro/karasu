import { describe, expect, it } from "vitest";
import { marker, partialRelease, vscodeSucceeded } from "./confirm.mts";
import type { NpmPackage } from "./release-state.mts";

// Fences the record decisions of release-confirm.yml (#3240).

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
