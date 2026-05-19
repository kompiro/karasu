import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { check, parseConceptFile, parseDerivesFrom } from "./concept-adr-refs";

const REPO_ROOT = resolve(__dirname, "..", "..");

describe("concept-adr-refs validator", () => {
  it("real repo: concepts <-> ADR-topic references are consistent", () => {
    const problems = check(REPO_ROOT);
    const errors = problems.filter((p) => p.kind === "error");
    expect(errors).toEqual([]);
  });

  it("real repo: every concept section carries a Related ADR topics annotation", () => {
    const problems = check(REPO_ROOT);
    const warnings = problems.filter((p) => p.kind === "warning");
    expect(warnings).toEqual([]);
  });
});

describe("parsers", () => {
  it("parseConceptFile extracts anchor and topic list per section", () => {
    const sections = parseConceptFile(
      [
        "# Title",
        "",
        "## Section One",
        "",
        '<a id="section-one"></a>',
        "",
        "narrative",
        "",
        "> Related ADR topics: `alpha`, `beta`",
        "",
        "## Section Two",
        "",
        '<a id="section-two"></a>',
        "",
        "> Related ADR topics: _(none)_",
      ].join("\n"),
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]).toEqual({
      heading: "Section One",
      anchor: "section-one",
      relatedTopics: ["alpha", "beta"],
    });
    expect(sections[1]?.relatedTopics).toEqual([]);
  });

  it("parseDerivesFrom extracts topic + anchor, and handles N/A", () => {
    const entries = parseDerivesFrom(
      [
        "### Topic A",
        "> Derives from (`alpha`): [concepts.md → S](../concepts.md#section-one)",
        "### Topic B",
        "> Derives from (`beta`): N/A — implementation topic, no originating concept section",
      ].join("\n"),
    );
    expect(entries).toEqual([
      {
        topic: "alpha",
        anchor: "section-one",
        raw: "[concepts.md → S](../concepts.md#section-one)",
      },
      {
        topic: "beta",
        anchor: null,
        raw: "N/A — implementation topic, no originating concept section",
      },
    ]);
  });
});

describe("regression rehearsal", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "concept-adr-refs-"));
    mkdirSync(join(dir, "docs", "adr"), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function scaffold(opts: {
    config?: string[];
    conceptsEn?: string;
    conceptsJa?: string;
    readme?: string;
  }): void {
    const config = opts.config ?? ["alpha", "beta"];
    const conceptsEn =
      opts.conceptsEn ??
      [
        "# Core Concepts",
        "",
        "## Section One",
        "",
        '<a id="section-one"></a>',
        "",
        "narrative",
        "",
        "> Related ADR topics: `alpha`",
      ].join("\n");
    const conceptsJa = opts.conceptsJa ?? conceptsEn;
    const readme =
      opts.readme ??
      [
        "# ADR Index",
        "",
        "### Alpha",
        "> Derives from (`alpha`): [concepts.md → S1](../concepts.md#section-one)",
        "",
        "### Beta",
        "> Derives from (`beta`): N/A — implementation topic, no originating concept section",
      ].join("\n");
    writeFileSync(join(dir, "adr.config.json"), JSON.stringify({ topics: config }));
    writeFileSync(join(dir, "docs", "concepts.md"), conceptsEn);
    writeFileSync(join(dir, "docs", "concepts.ja.md"), conceptsJa);
    writeFileSync(join(dir, "docs", "adr", "README.md"), readme);
  }

  it("passes on a consistent fixture", () => {
    scaffold({});
    expect(check(dir).filter((p) => p.kind === "error")).toEqual([]);
  });

  it("flags a topic with no Derives from back-ref", () => {
    scaffold({
      readme: [
        "# ADR Index",
        "",
        "### Alpha",
        "> Derives from (`alpha`): [c](../concepts.md#section-one)",
      ].join("\n"),
    });
    const errors = check(dir).filter((p) => p.kind === "error");
    expect(errors.some((e) => e.message.includes("`beta` has no"))).toBe(true);
  });

  it("flags a Derives from anchor that does not exist in the concept files", () => {
    scaffold({
      readme: [
        "# ADR Index",
        "",
        "### Alpha",
        "> Derives from (`alpha`): [c](../concepts.md#does-not-exist)",
        "",
        "### Beta",
        "> Derives from (`beta`): N/A",
      ].join("\n"),
    });
    const errors = check(dir).filter((p) => p.kind === "error");
    expect(errors.some((e) => e.message.includes("does-not-exist"))).toBe(true);
  });

  it("flags a one-directional reference (concept lists topic, README disagrees)", () => {
    scaffold({
      readme: [
        "# ADR Index",
        "",
        "### Alpha",
        "> Derives from (`alpha`): N/A",
        "",
        "### Beta",
        "> Derives from (`beta`): N/A",
      ].join("\n"),
    });
    const errors = check(dir).filter((p) => p.kind === "error");
    expect(
      errors.some((e) => e.message.includes("section-one") && e.message.includes("alpha")),
    ).toBe(true);
  });

  it("flags an anchor missing from the Japanese mirror", () => {
    scaffold({
      conceptsJa: [
        "# Core Concepts",
        "",
        "## Section One",
        "",
        "> Related ADR topics: `alpha`",
      ].join("\n"),
    });
    const errors = check(dir).filter((p) => p.kind === "error");
    expect(errors.some((e) => e.message.includes("concepts.ja.md"))).toBe(true);
  });

  it("flags an unknown topic referenced from a concept section", () => {
    scaffold({
      conceptsEn: [
        "# Core Concepts",
        "",
        "## Section One",
        "",
        '<a id="section-one"></a>',
        "",
        "> Related ADR topics: `alpha`, `ghost-topic`",
      ].join("\n"),
    });
    const errors = check(dir).filter((p) => p.kind === "error");
    expect(errors.some((e) => e.message.includes("ghost-topic"))).toBe(true);
  });

  it("warns when a section lacks the Related ADR topics annotation", () => {
    scaffold({
      conceptsEn: [
        "# Core Concepts",
        "",
        "## Section One",
        "",
        '<a id="section-one"></a>',
        "",
        "narrative",
      ].join("\n"),
      conceptsJa: [
        "# Core Concepts",
        "",
        "## Section One",
        "",
        '<a id="section-one"></a>',
        "",
        "narrative",
      ].join("\n"),
      readme: [
        "# ADR Index",
        "",
        "### Alpha",
        "> Derives from (`alpha`): N/A",
        "",
        "### Beta",
        "> Derives from (`beta`): N/A",
      ].join("\n"),
    });
    const problems = check(dir);
    expect(problems.some((p) => p.kind === "warning" && p.message.includes("Section One"))).toBe(
      true,
    );
  });
});
