import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkGenerated } from "./check-generated.ts";
import { type Commit, judgeFreshness, WINDOW_HOURS, windowCommits } from "./check-freshness.ts";
import type { ConfigTexts } from "./generated.ts";
import { compareTrees, generatorVersionAt, type Tree } from "./regenerate-at.ts";

const CONFIGS: ConfigTexts = {
  adr: readFileSync(resolve(__dirname, "../../adr.config.json"), "utf-8"),
  tpl: readFileSync(resolve(__dirname, "../../tpl.config.json"), "utf-8"),
};
const tree = (entries: Record<string, string>): Tree => new Map(Object.entries(entries));
const GENERATED = tree({
  "docs/adr/effective.md": "e",
  "docs/adr/graph.md": "g",
  "docs/adr/graph/parser.md": "p",
  "docs/test-perspectives/index.md": "i",
});

const check = (nameStatus: string, over: Partial<Parameters<typeof checkGenerated>[0]> = {}) =>
  checkGenerated({
    baseConfigs: CONFIGS,
    headConfigs: CONFIGS,
    nameStatus,
    regenerate: () => GENERATED,
    committed: () => GENERATED,
    ...over,
  });

describe("compareTrees", () => {
  it("is empty for identical trees", () => {
    expect(compareTrees(GENERATED, new Map(GENERATED))).toEqual([]);
  });

  it("names missing, extra and different files", () => {
    const committed = tree({
      "docs/adr/effective.md": "e",
      "docs/adr/graph.md": "hand-edited",
      "docs/adr/graph/extra.md": "x",
      "docs/test-perspectives/index.md": "i",
    });
    expect(compareTrees(GENERATED, committed)).toEqual([
      "docs/adr/graph.md: differs from a regeneration",
      "docs/adr/graph/extra.md: not written by the generator",
      "docs/adr/graph/parser.md: missing (the generator writes it)",
    ]);
  });
});

describe("checkGenerated", () => {
  it("passes a regular PR without comparing the stale index", () => {
    const result = check("A\0docs/adr/3416-x.md\0", { committed: () => tree({}) });
    expect(result).toEqual({ kind: "regular", errors: [] });
  });

  it("passes a regeneration PR that holds exactly the generator's output", () => {
    expect(check("M\0docs/adr/effective.md\0")).toEqual({ kind: "regeneration", errors: [] });
  });

  it("fails a regeneration PR with a hand-edited, stale or extra generated file", () => {
    const committed = tree({ ...Object.fromEntries(GENERATED), "docs/adr/graph/extra.md": "x" });
    const result = check("A\0docs/adr/graph/extra.md\0", { committed: () => committed });
    expect(result.kind).toBe("regeneration");
    expect(result.errors[0]).toMatch(/extra\.md: not written by the generator/);
  });

  it("fails a regeneration PR that deletes a generated file", () => {
    const committed = tree({
      "docs/adr/effective.md": "e",
      "docs/adr/graph.md": "g",
      "docs/test-perspectives/index.md": "i",
    });
    expect(check("D\0docs/adr/graph/parser.md\0", { committed: () => committed }).errors).toEqual([
      expect.stringMatching(/parser\.md: missing/),
    ]);
  });

  it("passes a regeneration PR that changes only the TPL index", () => {
    expect(check("A\0docs/test-perspectives/index.md\0")).toEqual({
      kind: "regeneration",
      errors: [],
    });
  });

  it("fails a regeneration PR whose TPL index is hand-edited", () => {
    const committed = tree({ ...Object.fromEntries(GENERATED), "docs/test-perspectives/index.md": "x" });
    const result = check("M\0docs/test-perspectives/index.md\0", { committed: () => committed });
    expect(result.errors).toEqual([expect.stringMatching(/index\.md: differs from a regeneration/)]);
  });

  it("fails a PR that adds a TPL and writes the TPL index", () => {
    const result = check(
      "A\0docs/test-perspectives/TPL-3289-x.md\0M\0docs/test-perspectives/index.md\0",
    );
    expect(result.kind).toBe("mixed");
  });

  it("fails a PR that mixes generated files with other changes", () => {
    const result = check("A\0docs/adr/3416-x.md\0M\0docs/adr/effective.md\0");
    expect(result.kind).toBe("mixed");
    expect(result.errors[0]).toMatch(/drop them from this PR/);
  });

  it("fails any PR whose head the generator cannot run on", () => {
    const broken = () => {
      throw Object.assign(new Error("exit 1"), { stderr: "TypeError: boom" });
    };
    expect(check("M\0package.json\0", { regenerate: broken }).errors).toEqual([
      expect.stringMatching(/regenerating the head's inputs failed.*boom/),
    ]);
  });

  it("fails when the config is missing on one side", () => {
    expect(check("", { baseConfigs: { ...CONFIGS, adr: null } }).errors[0]).toMatch(
      /adr\.config\.json is missing/,
    );
  });
});

describe("windowCommits", () => {
  const now = 1_000_000;
  const at = (hoursAgo: number, sha = `c${hoursAgo}`): Commit => ({
    sha,
    time: now - hoursAgo * 3600,
  });

  it("keeps the commits inside the window and the newest one at or before the boundary", () => {
    const history = [at(1), at(20), at(49), at(51), at(70)];
    expect(windowCommits(history, now).map((c) => c.sha)).toEqual(["c1", "c20", "c49", "c51"]);
  });

  it("keeps everything when the history is younger than the window", () => {
    expect(windowCommits([at(1), at(2)], now)).toHaveLength(2);
  });

  it("keeps only the head when it is older than the window", () => {
    expect(windowCommits([at(WINDOW_HOURS + 10), at(100)], now).map((c) => c.sha)).toEqual(["c60"]);
  });
});

describe("judgeFreshness", () => {
  const commits: Commit[] = [
    { sha: "head", time: 3 },
    { sha: "adr-merged", time: 2 },
    { sha: "boundary", time: 1 },
  ];
  const keys: Record<string, string> = { head: "k2", "adr-merged": "k2", boundary: "k1" };

  it("is fresh when the index matches the inputs of a commit in the window", () => {
    const tried: string[] = [];
    const result = judgeFreshness({
      candidates: commits,
      key: (sha) => keys[sha],
      matches: (sha) => (tried.push(sha), sha === "boundary"),
      generatorChanged: null,
    });
    expect(result).toEqual({ state: "fresh", reflects: commits[2] });
    // `adr-merged` has the head's inputs, so it is not regenerated again.
    expect(tried).toEqual(["head", "boundary"]);
  });

  it("is stale when no commit in the window matches", () => {
    expect(
      judgeFreshness({
        candidates: commits,
        key: (sha) => keys[sha],
        matches: () => false,
        generatorChanged: null,
      }),
    ).toEqual({ state: "stale" });
  });

  it("skips the judgement when the generator changed in the window and nothing matches", () => {
    expect(
      judgeFreshness({
        candidates: commits,
        key: (sha) => keys[sha],
        matches: () => false,
        generatorChanged: "@kompiro/tpl-tools",
      }),
    ).toEqual({
      state: "skipped",
      reason: `the @kompiro/tpl-tools version changed within the last ${WINDOW_HOURS} hours`,
    });
  });

  it("is fresh, not skipped, when a commit matches though the generator changed", () => {
    expect(
      judgeFreshness({
        candidates: commits,
        key: (sha) => keys[sha],
        matches: (sha) => sha === "head",
        generatorChanged: "@kompiro/tpl-tools",
      }).state,
    ).toBe("fresh");
  });
});

describe("generatorVersionAt", () => {
  it("reads each generator's version from the repo's lockfile", () => {
    expect(generatorVersionAt("HEAD", "adr")).toMatch(/^\d+\.\d+\.\d+/);
    expect(generatorVersionAt("HEAD", "tpl")).toMatch(/^\d+\.\d+\.\d+/);
  });
});
