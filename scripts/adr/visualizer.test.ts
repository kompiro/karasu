import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadParsed } from "./extractor.ts";
import {
  findDependsOnCycles,
  listTopics,
  renderMarkdown,
  renderMermaid,
  renderMermaidForTopic,
  renderOverview,
  renderTopicMarkdown,
} from "./visualizer.ts";

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
date: 2026-01-01
topic: core-concepts`,
    "ADR-20260101-01: Foundational",
  );
  writeAdr(
    "20260101-02-b.md",
    `id: ADR-20260101-02
title: Depends on A
status: accepted
date: 2026-01-01
topic: parser
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
topic: parser
superseded_by: ADR-20260101-04`,
    "ADR-20260101-03: Old",
  );
  writeAdr(
    "20260101-04-d.md",
    `id: ADR-20260101-04
title: New
status: accepted
date: 2026-01-01
topic: parser
supersedes:
  - ADR-20260101-03`,
    "ADR-20260101-04: New",
  );
}

describe("renderMermaid flat", () => {
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
});

describe("renderMermaid groupByTopic", () => {
  it("wraps nodes in subgraphs sorted by topic slug", () => {
    seed();
    const out = renderMermaid(loadParsed(tmp), { groupByTopic: true });
    expect(out).toContain("subgraph core-concepts");
    expect(out).toContain("subgraph parser");
    // core-concepts should appear before parser alphabetically
    expect(out.indexOf("subgraph core-concepts")).toBeLessThan(out.indexOf("subgraph parser"));
  });
});

describe("renderMermaidForTopic", () => {
  it("includes only in-topic ADRs as first-class nodes", () => {
    seed();
    const out = renderMermaidForTopic(loadParsed(tmp), "parser");
    expect(out).toContain("subgraph parser");
    expect(out).toContain("ADR_20260101_02");
    expect(out).toContain("ADR_20260101_04");
  });

  it("renders cross-topic references as ghost nodes with the other topic tagged", () => {
    seed();
    const out = renderMermaidForTopic(loadParsed(tmp), "parser");
    // ADR-01 is core-concepts but is pulled in as a ghost because ADR-02 depends on it.
    expect(out).toContain("ADR_20260101_01");
    expect(out).toContain("[core-concepts]");
    expect(out).toContain("class ADR_20260101_01 ghost");
  });

  it("handles topics with no ADRs gracefully", () => {
    seed();
    const out = renderMermaidForTopic(loadParsed(tmp), "chat-ai");
    expect(out).toContain("no ADRs in topic: chat-ai");
  });
});

describe("listTopics", () => {
  it("returns sorted unique topics from the parsed set", () => {
    seed();
    expect(listTopics(loadParsed(tmp))).toEqual(["core-concepts", "parser"]);
  });
});

describe("findDependsOnCycles", () => {
  it("returns empty when the graph is acyclic", () => {
    seed();
    expect(findDependsOnCycles(loadParsed(tmp))).toEqual([]);
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

describe("renderOverview", () => {
  it("includes a legend linking each topic to its detail file", () => {
    seed();
    const out = renderOverview(loadParsed(tmp));
    expect(out).toContain("# ADR Dependency Graph — Overview");
    expect(out).toContain("subgraph core-concepts");
    expect(out).toContain("[`core-concepts`](graph/core-concepts.md)");
    expect(out).toContain("[`parser`](graph/parser.md)");
  });
});

describe("renderTopicMarkdown", () => {
  it("links back to the overview and counts topic membership", () => {
    seed();
    const out = renderTopicMarkdown(loadParsed(tmp), "parser");
    expect(out).toContain("# ADR Topic: parser");
    expect(out).toContain("3 ADRs"); // ADR-02, ADR-03, ADR-04
    expect(out).toContain("[overview](../graph.md)");
  });
});
