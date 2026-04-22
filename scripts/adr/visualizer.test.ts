import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadParsed } from "./extractor.ts";
import { findDependsOnCycles, renderMarkdown, renderMermaid } from "./visualizer.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "adr-visualizer-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeAdr(file: string, fm: string, heading: string): void {
  writeFileSync(join(tmp, file), `---\n${fm}\n---\n\n# ${heading}\n\nbody\n`);
}

function seed(): void {
  writeAdr(
    "20260101-01-a.md",
    `id: ADR-20260101-01
title: Foundational
status: accepted
date: 2026-01-01`,
    "ADR-20260101-01: Foundational",
  );
  writeAdr(
    "20260101-02-b.md",
    `id: ADR-20260101-02
title: Depends on A
status: accepted
date: 2026-01-01
depends_on:
  - ADR-20260101-01`,
    "ADR-20260101-02: Depends on A",
  );
  writeAdr(
    "20260101-03-c.md",
    `id: ADR-20260101-03
title: Old
status: superseded
date: 2026-01-01
superseded_by: ADR-20260101-04`,
    "ADR-20260101-03: Old",
  );
  writeAdr(
    "20260101-04-d.md",
    `id: ADR-20260101-04
title: New
status: accepted
date: 2026-01-01
supersedes:
  - ADR-20260101-03`,
    "ADR-20260101-04: New",
  );
}

describe("renderMermaid", () => {
  it("emits a flowchart with every ADR as a node", () => {
    seed();
    const out = renderMermaid(loadParsed(tmp));
    expect(out).toMatch(/^flowchart TD/);
    expect(out).toContain("ADR_20260101_01");
    expect(out).toContain("ADR_20260101_04");
  });

  it("renders depends_on as solid arrow, supersedes as dashed", () => {
    seed();
    const out = renderMermaid(loadParsed(tmp));
    expect(out).toContain("ADR_20260101_02 --> ADR_20260101_01");
    expect(out).toContain("ADR_20260101_04 -.supersedes.-> ADR_20260101_03");
  });

  it("attaches status classes to nodes", () => {
    seed();
    const out = renderMermaid(loadParsed(tmp));
    expect(out).toContain("class ADR_20260101_01 accepted");
    expect(out).toContain("class ADR_20260101_03 superseded");
  });

  it("truncates long titles", () => {
    writeAdr(
      "20260101-01-long.md",
      `id: ADR-20260101-01
title: ${"x".repeat(80)}
status: accepted
date: 2026-01-01`,
      `ADR-20260101-01: ${"x".repeat(80)}`,
    );
    const out = renderMermaid(loadParsed(tmp));
    expect(out).toContain(`${"x".repeat(47)}...`);
  });
});

describe("findDependsOnCycles", () => {
  it("returns empty when the graph is acyclic", () => {
    seed();
    expect(findDependsOnCycles(loadParsed(tmp))).toEqual([]);
  });

  it("detects a simple two-node cycle", () => {
    writeAdr(
      "20260101-01-a.md",
      `id: ADR-20260101-01
title: A
status: accepted
date: 2026-01-01
depends_on:
  - ADR-20260101-02`,
      "ADR-20260101-01: A",
    );
    writeAdr(
      "20260101-02-b.md",
      `id: ADR-20260101-02
title: B
status: accepted
date: 2026-01-01
depends_on:
  - ADR-20260101-01`,
      "ADR-20260101-02: B",
    );
    const cycles = findDependsOnCycles(loadParsed(tmp));
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]).toContain("ADR-20260101-01");
    expect(cycles[0]).toContain("ADR-20260101-02");
  });
});

describe("renderMarkdown", () => {
  it("wraps the Mermaid output in a fenced block with a header", () => {
    seed();
    const out = renderMarkdown(loadParsed(tmp));
    expect(out).toMatch(/^# ADR Dependency Graph/);
    expect(out).toContain("```mermaid");
    expect(out).toContain("flowchart TD");
    expect(out.trimEnd().endsWith("```")).toBe(true);
  });
});
