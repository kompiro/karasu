import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closure, effectiveSet, format, loadParsed, scopeSlice } from "./extractor.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "adr-extractor-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeAdr(file: string, fm: string, heading: string): void {
  writeFileSync(join(tmp, file), `---\n${fm}\n---\n\n# ${heading}\n\nbody\n`);
}

function seed(): void {
  writeAdr(
    "20260101-01-foundational.md",
    `id: ADR-20260101-01
title: Foundational
status: accepted
topic: core-concepts
date: 2026-01-01
scope:
  packages:
    - core
  concerns:
    - dependencies`,
    "ADR-20260101-01: Foundational",
  );

  writeAdr(
    "20260101-02-depends-on-foundational.md",
    `id: ADR-20260101-02
title: Depends
status: accepted
topic: core-concepts
date: 2026-01-01
depends_on:
  - ADR-20260101-01
scope:
  packages:
    - core
  concerns:
    - security`,
    "ADR-20260101-02: Depends",
  );

  writeAdr(
    "20260101-03-old.md",
    `id: ADR-20260101-03
title: Old
status: superseded
topic: core-concepts
date: 2026-01-01
superseded_by: ADR-20260101-04`,
    "ADR-20260101-03: Old",
  );

  writeAdr(
    "20260101-04-new.md",
    `id: ADR-20260101-04
title: New
status: accepted
topic: core-concepts
date: 2026-01-01
supersedes:
  - ADR-20260101-03
scope:
  packages:
    - app
  concerns:
    - i18n`,
    "ADR-20260101-04: New",
  );

  writeAdr(
    "20260101-05-rejected.md",
    `id: ADR-20260101-05
title: Rejected
status: not_adopted
topic: core-concepts
date: 2026-01-01
scope:
  packages:
    - core
  concerns:
    - dependencies`,
    "ADR-20260101-05: Rejected",
  );
}

describe("effectiveSet", () => {
  it("excludes superseded and not_adopted", () => {
    seed();
    const parsed = loadParsed(tmp);
    const ids = effectiveSet(parsed)
      .map((p) => p.id)
      .sort();
    expect(ids).toEqual(["ADR-20260101-01", "ADR-20260101-02", "ADR-20260101-04"]);
  });
});

describe("scopeSlice", () => {
  it("filters by package intersection and pulls in transitive depends_on", () => {
    seed();
    const parsed = loadParsed(tmp);
    const ids = scopeSlice(parsed, { packages: ["core"] })
      .map((p) => p.id)
      .sort();
    // 01, 02, 05 have package=core; 03 has no scope; 04 has package=app.
    expect(ids).toEqual(["ADR-20260101-01", "ADR-20260101-02", "ADR-20260101-05"]);
  });

  it("filters by concern intersection", () => {
    seed();
    const parsed = loadParsed(tmp);
    const ids = scopeSlice(parsed, { concerns: ["security"] })
      .map((p) => p.id)
      .sort();
    // 02 matches directly (concern=security); 01 is pulled in via depends_on closure.
    expect(ids).toEqual(["ADR-20260101-01", "ADR-20260101-02"]);
  });

  it("throws when called with no filter", () => {
    seed();
    const parsed = loadParsed(tmp);
    expect(() => scopeSlice(parsed, {})).toThrow(/at least one/);
  });

  it("requires BOTH package and concern to match when both specified", () => {
    seed();
    const parsed = loadParsed(tmp);
    // core + i18n: no ADR has both → empty (before closure)
    const ids = scopeSlice(parsed, { packages: ["core"], concerns: ["i18n"] }).map((p) => p.id);
    expect(ids).toEqual([]);
  });
});

describe("closure", () => {
  it("returns the ADR plus transitive depends_on", () => {
    seed();
    const parsed = loadParsed(tmp);
    const ids = closure(parsed, "ADR-20260101-02")
      .map((p) => p.id)
      .sort();
    expect(ids).toEqual(["ADR-20260101-01", "ADR-20260101-02"]);
  });

  it("throws when the starting ADR is unknown", () => {
    seed();
    const parsed = loadParsed(tmp);
    expect(() => closure(parsed, "ADR-99999999-99")).toThrow(/not found/);
  });
});

describe("format", () => {
  it("emits tab-separated list by default", () => {
    seed();
    const parsed = loadParsed(tmp);
    const out = format(effectiveSet(parsed), "list");
    expect(out).toContain("ADR-20260101-01\taccepted\tFoundational");
    expect(out).not.toContain("ADR-20260101-03");
  });

  it("emits markdown links", () => {
    seed();
    const parsed = loadParsed(tmp);
    const out = format(effectiveSet(parsed), "markdown");
    expect(out).toContain("- [ADR-20260101-01](20260101-01-foundational.md) — Foundational");
  });

  it("emits JSON with id / title / status / scope", () => {
    seed();
    const parsed = loadParsed(tmp);
    const out = JSON.parse(format(effectiveSet(parsed), "json"));
    expect(Array.isArray(out)).toBe(true);
    expect(out[0]).toHaveProperty("id");
    expect(out[0]).toHaveProperty("status", "accepted");
  });
});
