import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildGeneratedFiles, loadAdrs } from "./regenerator.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "adr-regenerator-"));
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
title: Active Core
status: accepted
date: 2026-01-01
topic: core-concepts`,
    "ADR-20260101-01: Active Core",
  );
  writeAdr(
    "20260101-02-b.md",
    `id: ADR-20260101-02
title: Old
status: superseded
date: 2026-01-01
topic: parser
superseded_by: ADR-20260101-03`,
    "ADR-20260101-02: Old",
  );
  writeAdr(
    "20260101-03-c.md",
    `id: ADR-20260101-03
title: New Parser
status: accepted
date: 2026-01-01
topic: parser
supersedes:
  - ADR-20260101-02`,
    "ADR-20260101-03: New Parser",
  );
}

describe("buildGeneratedFiles", () => {
  it("produces effective.md, graph.md, and one graph/<topic>.md per topic", () => {
    seed();
    const files = buildGeneratedFiles(loadAdrs(tmp));
    const paths = files.map((f) => f.relativePath).sort();
    expect(paths).toContain("effective.md");
    expect(paths).toContain("graph.md");
    expect(paths).toContain("graph/core-concepts.md");
    expect(paths).toContain("graph/parser.md");
  });

  it("effective.md excludes superseded ADRs and groups by topic", () => {
    seed();
    const files = buildGeneratedFiles(loadAdrs(tmp));
    const eff = files.find((f) => f.relativePath === "effective.md");
    expect(eff).toBeDefined();
    const body = eff!.contents;
    // Topic headings present
    expect(body).toContain("## core-concepts");
    expect(body).toContain("## parser");
    // Accepted ADRs listed
    expect(body).toContain("ADR-20260101-01");
    expect(body).toContain("ADR-20260101-03");
    // Superseded ADR not listed (body references use ADR id followed by a close-bracket / em-dash)
    expect(body).not.toContain("ADR-20260101-02](");
  });

  it("header notes the effective / total count", () => {
    seed();
    const files = buildGeneratedFiles(loadAdrs(tmp));
    const eff = files.find((f) => f.relativePath === "effective.md")!;
    expect(eff.contents).toMatch(/2 of 3 ADRs/);
  });

  it("produces deterministic output for the same input", () => {
    seed();
    const first = buildGeneratedFiles(loadAdrs(tmp));
    const second = buildGeneratedFiles(loadAdrs(tmp));
    expect(first).toEqual(second);
  });
});
