import { describe, expect, it } from "vitest";
import {
  bumpedNpmPackages,
  classifyNpmView,
  isReleaseBranch,
  npmPackagesOf,
  orderViolations,
  pickMergeCommit,
  pickTrain,
  unplannedVersions,
  type NpmPackage,
} from "./release-state.mts";

// Fences the release-commit decisions of #3240 that stage.mts, approve.mts and
// confirm.mts share.

const pkg = (name: string, version: string, workspaceDependencies: string[] = []): NpmPackage => ({
  name,
  dir: `packages/${name}`,
  version,
  workspaceDependencies,
});

describe("npmPackagesOf", () => {
  const manifests: Record<string, object> = {
    "packages/cli": {
      name: "karasu",
      version: "0.11.0",
      dependencies: { "karasu-skills": "workspace:*", yaml: "^2.9.1" },
    },
    "packages/core": { name: "@karasu-tools/core", version: "0.5.0" },
    "packages/vscode": { name: "karasu-vscode", version: "0.5.0", private: true },
    "packages/skills": { name: "karasu-skills", version: "0.3.0" },
  };

  it("keeps the released packages that go to npm, with their workspace dependencies", () => {
    const packages = npmPackagesOf((dir) => (manifests[dir] as never) ?? null);
    expect(packages.map((p) => p.name)).toEqual(["karasu", "@karasu-tools/core", "karasu-skills"]);
    expect(packages[0].workspaceDependencies).toEqual(["karasu-skills"]);
  });

  it("fails when a directory holds another package than RELEASED_PACKAGES says", () => {
    expect(() =>
      npmPackagesOf((dir) =>
        dir === "packages/cli" ? ({ name: "other", version: "1.0.0" } as never) : null,
      ),
    ).toThrow(/expected karasu/);
  });
});

describe("bumpedNpmPackages", () => {
  it("keeps the packages whose version differs from the first parent", () => {
    const parent: Record<string, string> = { karasu: "0.10.0", "karasu-skills": "0.3.0" };
    const bumped = bumpedNpmPackages(
      [pkg("karasu", "0.11.0"), pkg("karasu-skills", "0.3.0"), pkg("@karasu-tools/core", "0.1.0")],
      (name) => parent[name] ?? null,
    );
    expect(bumped.map((p) => p.name)).toEqual(["karasu", "@karasu-tools/core"]);
  });
});

describe("the train", () => {
  it("recognises a release branch", () => {
    expect(isReleaseBranch("chore/release-2026-11-29")).toBe(true);
    expect(isReleaseBranch("feat/x")).toBe(false);
    expect(isReleaseBranch("")).toBe(false);
  });

  it("picks the one open train Issue and its branch", () => {
    expect(
      pickTrain([
        { number: 1, body: "Release branch: `chore/release-2026-11-29`\n" },
        { number: 2, body: "unrelated" },
      ]),
    ).toEqual({ issue: 1, branch: "chore/release-2026-11-29" });
    expect(pickTrain([])).toBeNull();
  });

  it("refuses two open trains", () => {
    const body = (date: string) => `Release branch: \`chore/release-${date}\``;
    expect(() =>
      pickTrain([
        { number: 1, body: body("2026-11-29") },
        { number: 2, body: body("2026-12-27") },
      ]),
    ).toThrow(/more than one/);
  });

  it("takes the merge commit into main", () => {
    expect(pickMergeCommit([])).toBeNull();
    expect(
      pickMergeCommit([
        { baseRefName: "other", mergeCommit: { oid: "a" } },
        { baseRefName: "main", mergeCommit: { oid: "b" } },
      ]),
    ).toBe("b");
  });
});

describe("classifyNpmView", () => {
  it("finds a published version", () => {
    expect(classifyNpmView({ status: 0, stdout: '"0.11.0"\n', stderr: "" }, "0.11.0")).toBe(
      "present",
    );
  });

  it("reads an empty answer and E404 as absent", () => {
    expect(classifyNpmView({ status: 0, stdout: "", stderr: "" }, "0.11.0")).toBe("absent");
    expect(
      classifyNpmView(
        { status: 1, stdout: "", stderr: "npm error code E404\nnpm error 404 Not Found" },
        "0.11.0",
      ),
    ).toBe("absent");
  });

  it("fails on any other error instead of reading it as absent (TPL-2804)", () => {
    expect(() =>
      classifyNpmView({ status: 1, stdout: "", stderr: "npm error code ETIMEDOUT" }, "0.11.0"),
    ).toThrow(/npm view failed/);
    expect(() => classifyNpmView({ status: 0, stdout: '"0.10.0"', stderr: "" }, "0.11.0")).toThrow(
      /npm view answered/,
    );
  });
});

describe("orderViolations", () => {
  const skills = pkg("karasu-skills", "0.3.0");
  const karasu = pkg("karasu", "0.11.0", ["karasu-skills"]);

  it("reports a published package whose pinned dependency is not on npm (TPL-3240)", () => {
    const onNpm = new Set(["karasu@0.11.0"]);
    expect(
      orderViolations([karasu, skills], [karasu, skills], (n, v) => onNpm.has(`${n}@${v}`)),
    ).toEqual([{ pkg: "karasu@0.11.0", missing: "karasu-skills@0.3.0" }]);
  });

  it("is quiet when the dependency is there or the dependent is not published", () => {
    const both = new Set(["karasu@0.11.0", "karasu-skills@0.3.0"]);
    expect(orderViolations([karasu], [karasu, skills], (n, v) => both.has(`${n}@${v}`))).toEqual(
      [],
    );
    expect(orderViolations([karasu], [karasu, skills], () => false)).toEqual([]);
  });
});

describe("unplannedVersions", () => {
  const time = {
    created: "2026-06-01T00:00:00Z",
    "0.9.0": "2026-10-15T00:00:00Z",
    "0.10.0": "2026-10-25T00:00:00Z",
    "0.10.1-next.0": "2026-11-10T00:00:00Z",
    "0.11.0": "2026-11-29T00:00:00Z",
    "0.8.0": "2026-09-01T00:00:00Z",
  };
  const versions = ["0.8.0", "0.9.0", "0.10.0", "0.10.1-next.0", "0.11.0"];

  it("finds a version published after the newest tagged one, under any dist-tag", () => {
    expect(
      unplannedVersions({ time, versions, tagged: ["0.9.0", "0.10.0"], releaseVersion: "0.11.0" }),
    ).toEqual(["0.10.1-next.0"]);
  });

  it("leaves older versions and the release's own version alone", () => {
    const later = versions.filter((v) => v !== "0.10.1-next.0");
    expect(
      unplannedVersions({ time, versions: later, tagged: ["0.10.0"], releaseVersion: "0.11.0" }),
    ).toEqual([]);
  });

  it("skips a version no longer in `versions` (unpublished)", () => {
    expect(
      unplannedVersions({
        time,
        versions: ["0.9.0", "0.10.0", "0.11.0"],
        tagged: ["0.10.0"],
        releaseVersion: "0.11.0",
      }),
    ).toEqual([]);
  });

  it("fails without a tagged version to measure from", () => {
    expect(() =>
      unplannedVersions({ time, versions, tagged: [], releaseVersion: "0.11.0" }),
    ).toThrow(/no tagged version/);
  });
});
