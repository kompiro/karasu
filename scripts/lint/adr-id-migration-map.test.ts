import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  adrFiles,
  bareStemMatcher,
  check,
  findBareInText,
  type MapEntry,
} from "./adr-id-migration-map.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "adr-id-map-"));
  mkdirSync(join(tmp, "docs/adr"), { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function entry(over: Partial<MapEntry> = {}): MapEntry {
  return {
    oldId: "ADR-20260312-01",
    oldFile: "20260312-01-monorepo.md",
    newId: "ADR-9001",
    newFile: "9001-monorepo.md",
    source: "reserved-block",
    evidence: "predates issue-driven development; introduced by bulk rename PR #525",
    ...over,
  };
}

function seed(entries: MapEntry[], onDisk: string[]): void {
  writeFileSync(join(tmp, "docs/adr/id-migration-map.json"), JSON.stringify({ entries }, null, 2));
  for (const f of onDisk) writeFileSync(join(tmp, "docs/adr", f), "# adr\n");
}

describe("check", () => {
  it("passes a consistent pre-migration tree", () => {
    seed([entry()], ["20260312-01-monorepo.md"]);
    const r = check(tmp);
    expect(r.errors).toEqual([]);
    expect(r.phase).toBe("pre-migration");
  });

  it("passes a consistent post-migration tree", () => {
    seed([entry()], ["9001-monorepo.md"]);
    const r = check(tmp);
    expect(r.errors).toEqual([]);
    expect(r.phase).toBe("post-migration");
  });

  // A native entry: an ADR born after the migration. Identity record, no rename.
  function native(over: Partial<MapEntry> = {}): MapEntry {
    return {
      oldId: "ADR-2087",
      oldFile: "2087-escape.md",
      newId: "ADR-2087",
      newFile: "2087-escape.md",
      source: "native",
      evidence: "born post-migration; originating Issue #2087",
      ...over,
    };
  }

  it("accepts a native entry alongside migrated ones (stays post-migration)", () => {
    seed([entry(), native()], ["9001-monorepo.md", "2087-escape.md"]);
    const r = check(tmp);
    expect(r.errors).toEqual([]);
    // The native file is on disk under its only name — this must NOT read as a
    // lingering old file and trip the half-migrated alarm.
    expect(r.phase).toBe("post-migration");
  });

  it("rejects a native entry whose oldFile differs from newFile", () => {
    seed([native({ oldFile: "20260312-09-x.md" })], ["2087-escape.md"]);
    expect(check(tmp).errors.some((e) => e.includes("oldFile === newFile"))).toBe(true);
  });

  it("rejects a native entry whose id disagrees with its file number", () => {
    seed([native({ newId: "ADR-9999", oldId: "ADR-9999" })], ["2087-escape.md"]);
    expect(check(tmp).errors.some((e) => e.includes("does not match newFile number"))).toBe(true);
  });

  it("rejects a native entry in the reserved range", () => {
    seed(
      [
        native({
          oldId: "ADR-9050",
          oldFile: "9050-x.md",
          newId: "ADR-9050",
          newFile: "9050-x.md",
        }),
      ],
      ["9050-x.md"],
    );
    expect(check(tmp).errors.some((e) => e.includes("reserved range"))).toBe(true);
  });

  it("rejects a native entry colliding on number with a migrated one", () => {
    seed(
      [entry({ newId: "ADR-2087", newFile: "2087-monorepo.md" }), native()],
      ["2087-monorepo.md", "2087-escape.md"],
    );
    expect(check(tmp).errors.some((e) => e.includes("assigned to both"))).toBe(true);
  });

  it("reports a half-migrated tree as a single clear failure", () => {
    // The most dangerous state: some files renamed, some not. An unrenamed
    // 20260716-02-… parses as ADR-20260716 under issue-number, so a mixed tree
    // produces plausible-but-wrong ids rather than an obvious break.
    seed(
      [
        entry(),
        entry({
          oldId: "ADR-20260312-02",
          oldFile: "20260312-02-b.md",
          newId: "ADR-9002",
          newFile: "9002-b.md",
        }),
      ],
      ["20260312-01-monorepo.md", "9002-b.md"],
    );
    const r = check(tmp);
    expect(r.phase).toBe("half-migrated");
    expect(r.errors.some((e) => e.includes("HALF-MIGRATED"))).toBe(true);
  });

  it("rejects two ADRs mapped to the same number", () => {
    seed(
      [
        entry(),
        entry({ oldId: "ADR-20260312-02", oldFile: "20260312-02-b.md", newFile: "9001-b.md" }),
      ],
      ["20260312-01-monorepo.md", "20260312-02-b.md"],
    );
    expect(check(tmp).errors.some((e) => e.includes("assigned to both"))).toBe(true);
  });

  it("rejects a slug that changed during the rename", () => {
    seed([entry({ newFile: "9001-monorepo-adoption.md" })], ["20260312-01-monorepo.md"]);
    expect(check(tmp).errors.some((e) => e.includes("slug changed"))).toBe(true);
  });

  it("rejects newId that disagrees with newFile", () => {
    seed([entry({ newId: "ADR-9999" })], ["20260312-01-monorepo.md"]);
    expect(check(tmp).errors.some((e) => e.includes("does not match newFile number"))).toBe(true);
  });

  it("rejects an ADR on disk that is absent from the map", () => {
    seed([entry()], ["20260312-01-monorepo.md", "20260401-01-orphan.md"]);
    expect(check(tmp).errors.some((e) => e.includes("absent from the map"))).toBe(true);
  });

  it("rejects a map entry whose file is missing from disk", () => {
    seed(
      [
        entry(),
        entry({
          oldFile: "20260312-09-ghost.md",
          oldId: "ADR-20260312-09",
          newFile: "9009-ghost.md",
          newId: "ADR-9009",
        }),
      ],
      ["20260312-01-monorepo.md"],
    );
    expect(check(tmp).errors.some((e) => e.includes("missing from"))).toBe(true);
  });

  it("rejects a reserved-block number outside the reserved range", () => {
    seed([entry({ newId: "ADR-1234", newFile: "1234-monorepo.md" })], ["20260312-01-monorepo.md"]);
    expect(check(tmp).errors.some((e) => e.includes("outside"))).toBe(true);
  });

  it("rejects a non-reserved source that lands inside the reserved range", () => {
    seed([entry({ source: "issue" })], ["20260312-01-monorepo.md"]);
    expect(check(tmp).errors.some((e) => e.includes("inside the reserved range"))).toBe(true);
  });

  it("requires evidence on every entry", () => {
    seed([entry({ evidence: "" })], ["20260312-01-monorepo.md"]);
    expect(check(tmp).errors.some((e) => e.includes("evidence is required"))).toBe(true);
  });

  it("ignores README / TEMPLATE / generated indexes", () => {
    seed(
      [entry()],
      ["20260312-01-monorepo.md", "README.md", "TEMPLATE.md", "effective.md", "graph.md"],
    );
    expect(check(tmp).errors).toEqual([]);
  });
});

describe("adrFiles", () => {
  it("excludes the non-ADR files from the real repo", () => {
    const files = adrFiles(REPO_ROOT);
    expect(files).not.toContain("README.md");
    expect(files).not.toContain("TEMPLATE.md");
    expect(files).not.toContain("effective.md");
    expect(files).not.toContain("graph.md");
    expect(files.length).toBeGreaterThan(200);
  });
});

describe("findBareInText", () => {
  // 20260419-01 -> ADR-644, 20260626-01 -> ADR-1783
  const entries: MapEntry[] = [
    {
      oldId: "ADR-20260419-01",
      oldFile: "20260419-01-translate-db-aggregate-grouping.md",
      newId: "ADR-644",
      newFile: "644-translate-db-aggregate-grouping.md",
      source: "issue",
      evidence: "x",
    },
    {
      oldId: "ADR-20260626-01",
      oldFile: "20260626-01-karasu-nest-hosted-preview.md",
      newId: "ADR-1783",
      newFile: "1783-karasu-nest-hosted-preview.md",
      source: "issue",
      evidence: "x",
    },
  ];
  const matcher = bareStemMatcher(entries);

  const stems = (t: string) => findBareInText(t, matcher).map((h) => h.stem);

  it("flags a bare stem the main rename missed", () => {
    const hits = findBareInText("捨てていた（ADR-643 / 20260419-01）", matcher);
    expect(hits).toEqual([{ stem: "20260419-01", newId: "ADR-644" }]);
  });

  it("flags every occurrence, not just the first", () => {
    expect(stems("| 1783? | 20260626-01 | 20260626-01 |")).toEqual(["20260626-01", "20260626-01"]);
  });

  it("does NOT match an ADR- prefixed id (the main pass owns those)", () => {
    expect(stems("see ADR-20260419-01 for details")).toEqual([]);
  });

  it("does NOT match the filename form (the main pass owns those)", () => {
    expect(stems("[link](20260419-01-translate-db-aggregate-grouping.md)")).toEqual([]);
  });

  it("does NOT match a TPL id sharing the same digits", () => {
    expect(stems("see TPL-20260419-01 for the perspective")).toEqual([]);
  });

  it("does NOT match a path segment", () => {
    expect(stems("docs/adr/20260419-01/notes")).toEqual([]);
  });

  it("does NOT match a longer dotted token like a meta filename", () => {
    expect(stems("`20260419-01.meta.yaml`")).toEqual([]);
  });

  it("does NOT match a stem that is not a known old ADR", () => {
    // Same shape, but no entry maps it — a random date pair must be left alone.
    expect(stems("build 20261231-99 completed")).toEqual([]);
  });

  it("returns nothing when there are no entries", () => {
    expect(findBareInText("20260419-01", bareStemMatcher([]))).toEqual([]);
  });
});
