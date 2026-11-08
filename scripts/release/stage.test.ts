import { describe, expect, it } from "vitest";
import { classifyStage, planProblems, readPlan, stageArgs, type PlannedRelease } from "./stage.mts";

// Fences stage.mts (#3240): the plan from `changeset pack` is staged one group
// at a time, and only for packages this release bumped.

const release = (name: string, version: string, tag = "latest"): PlannedRelease => ({
  name,
  version,
  tag,
  tarball: { path: `packages/${name}-${version}.tgz`, integrity: "sha256-x" },
});

describe("readPlan", () => {
  it("keeps the publish releases, group by group, and drops empty groups", () => {
    const plan = readPlan(
      JSON.stringify({
        version: 1,
        plan: [
          [{ kind: "publish", ...release("karasu-skills", "0.3.0"), access: "public" }],
          [{ kind: "tag-only", name: "karasu-vscode", version: "0.5.0" }],
          [{ kind: "publish", ...release("karasu", "0.11.0") }],
        ],
      }),
    );
    expect(plan.map((group) => group.map((r) => r.name))).toEqual([["karasu-skills"], ["karasu"]]);
  });

  it("refuses a plan format it does not know", () => {
    expect(() => readPlan(JSON.stringify({ version: 2, plan: [] }))).toThrow(/unsupported/);
  });
});

describe("planProblems", () => {
  const npmNames = ["karasu", "@karasu-tools/core", "karasu-skills"];

  it("accepts a plan of bumped released packages", () => {
    expect(
      planProblems([[release("karasu-skills", "0.3.0")], [release("karasu", "0.11.0")]], {
        npmNames,
        bumped: [
          { name: "karasu-skills", version: "0.3.0" },
          { name: "karasu", version: "0.11.0" },
        ],
      }),
    ).toEqual([]);
  });

  it("stops on a package RELEASED_PACKAGES does not list", () => {
    expect(
      planProblems([[release("@karasu-tools/new", "0.1.0")]], { npmNames, bumped: null }),
    ).toEqual([expect.stringMatching(/not in RELEASED_PACKAGES/)]);
  });

  it("stops on an unpublished version this release did not bump", () => {
    expect(
      planProblems([[release("@karasu-tools/core", "0.5.0")], [release("karasu", "0.11.0")]], {
        npmNames,
        bumped: [{ name: "karasu", version: "0.11.0" }],
      }),
    ).toEqual([expect.stringMatching(/core@0\.5\.0 .*did not bump it.*patch changeset/)]);
  });

  it("stops on a prerelease under latest", () => {
    expect(
      planProblems([[release("karasu", "0.11.0-next.0")]], { npmNames, bumped: null }),
    ).toEqual([expect.stringMatching(/prerelease/)]);
  });

  it("checks the tag that will be used, so --tag can stage a prerelease", () => {
    const plan = [[release("karasu", "0.11.0-rehearsal.0")]];
    expect(planProblems(plan, { npmNames, bumped: null, tag: "rehearsal" })).toEqual([]);
    expect(planProblems(plan, { npmNames, bumped: null, tag: "latest" })).toHaveLength(1);
  });
});

describe("stageArgs", () => {
  it("leaves latest to npm so its own checks run, and passes any other tag", () => {
    expect(stageArgs("a.tgz", "latest", { inActions: true })).toEqual([
      "stage",
      "publish",
      "a.tgz",
      "--json",
    ]);
    expect(stageArgs("a.tgz", "rehearsal", { inActions: true })).toEqual([
      "stage",
      "publish",
      "a.tgz",
      "--json",
      "--tag",
      "rehearsal",
    ]);
  });

  it("turns provenance off outside GitHub Actions", () => {
    expect(stageArgs("a.tgz", "latest", { inActions: false })).toContain("--provenance=false");
  });
});

describe("classifyStage", () => {
  it("reads the stage id and integrity npm prints", () => {
    const stdout = JSON.stringify({ karasu: { stageId: "1f0e", integrity: "sha512-abc" } });
    expect(classifyStage({ status: 0, stdout, stderr: "" }, "karasu")).toEqual({
      kind: "staged",
      stageId: "1f0e",
      integrity: "sha512-abc",
    });
  });

  it("fails on output without a stage id", () => {
    expect(classifyStage({ status: 0, stdout: "{}", stderr: "" }, "karasu").kind).toBe("failed");
  });

  it("treats an unknown rejection as a failure (TPL-2804)", () => {
    expect(
      classifyStage({ status: 1, stdout: "", stderr: "npm error code E500" }, "karasu"),
    ).toEqual({
      kind: "failed",
      message: "npm error code E500",
    });
  });
});
