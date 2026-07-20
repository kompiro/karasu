import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adrFiles, check, type MapEntry } from "./adr-id-migration-map.ts";

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
