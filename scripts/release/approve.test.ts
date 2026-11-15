import { describe, expect, it } from "vitest";
import { checkPassed, findStaged, outOfPlan, type Check, type StagedItem } from "./approve.mts";
import type { PlannedRelease } from "./stage.mts";

// Fences the approval decisions of `pnpm release:approve` (#3240).

const release = (name: string, version: string): PlannedRelease => ({
  name,
  version,
  tag: "latest",
  tarball: { path: `packages/${name}.tgz`, integrity: "sha256-x" },
});

const item = (
  packageName: string,
  version: string,
  id = `${packageName}-${version}`,
): StagedItem => ({
  id,
  packageName,
  version,
  tag: "latest",
});

describe("findStaged", () => {
  it("finds the staged item of a planned release", () => {
    expect(
      findStaged([item("karasu", "0.10.0"), item("karasu", "0.11.0")], release("karasu", "0.11.0"))
        ?.version,
    ).toBe("0.11.0");
    expect(findStaged([], release("karasu", "0.11.0"))).toBeNull();
  });

  it("refuses a version staged twice", () => {
    expect(() =>
      findStaged(
        [item("karasu", "0.11.0", "a"), item("karasu", "0.11.0", "b")],
        release("karasu", "0.11.0"),
      ),
    ).toThrow(/staged 2 times/);
  });
});

describe("outOfPlan", () => {
  it("lists what is staged but not planned, such as a higher version staged by a hijacked run", () => {
    const plan = [[release("karasu-skills", "0.3.0")], [release("karasu", "0.11.0")]];
    expect(
      outOfPlan(
        [item("karasu-skills", "0.3.0"), item("karasu", "0.11.0"), item("karasu", "9.0.0")],
        plan,
      ).map((i) => i.version),
    ).toEqual(["9.0.0"]);
  });
});

describe("checkPassed", () => {
  const same = { missing: [], extra: [], changed: [] };
  const base: Check = {
    release: release("karasu", "0.11.0"),
    staged: item("karasu", "0.11.0"),
    expectedTag: "latest",
    diff: same,
  };

  it("passes a staged version with the expected tag and the same files", () => {
    expect(checkPassed(base)).toBe(true);
  });

  it("fails when the version is not staged, has another tag, or differs", () => {
    expect(checkPassed({ ...base, staged: null, diff: null })).toBe(false);
    expect(checkPassed({ ...base, expectedTag: "rehearsal" })).toBe(false);
    expect(checkPassed({ ...base, diff: { ...same, changed: ["dist/index.js"] } })).toBe(false);
  });
});
