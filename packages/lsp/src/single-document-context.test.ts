import { describe, it, expect } from "vitest";
import {
  Parser,
  analyze,
  EC_PLATFORM_PROJECTS_EN,
  FACET_STYLING_PROJECT_EN,
  FEATURE_SAMPLES_PROJECT,
  GETTING_STARTED_PROJECT_EN,
  MULTI_FILE_SYSTEM_PROJECT_EN,
  type ExampleProject,
} from "@karasu-tools/core";
import { SINGLE_DOCUMENT_CONTEXT } from "./single-document-context.js";

// The ledger is complete by type (a `Record` over `WarningKind`). These checks
// hold its entries to what they claim, over the bundled examples analyzed the
// way the LSP analyzes a document: alone, with no stylesheet.

const PROJECTS: ExampleProject[] = [
  ...EC_PLATFORM_PROJECTS_EN,
  FACET_STYLING_PROJECT_EN,
  FEATURE_SAMPLES_PROJECT,
  GETTING_STARTED_PROJECT_EN,
  MULTI_FILE_SYSTEM_PROJECT_EN,
];

const krsFiles = PROJECTS.flatMap((p) => p.files).filter((f) => f.path.endsWith(".krs"));

describe("SINGLE_DOCUMENT_CONTEXT (TPL-1522)", () => {
  it("gives a reason for every kind that is not plainly sheet-independent", () => {
    const unexplained = Object.entries(SINGLE_DOCUMENT_CONTEXT)
      .filter(([, side]) => side.sheets !== "independent" || side.singleDocument !== undefined)
      .filter(([, side]) => (side.why ?? "").length < 20)
      .map(([kind]) => kind);
    expect(unexplained).toEqual([]);
  });

  it("no kind recorded as sheet-dependent or not analyzed fires without sheets", () => {
    expect(krsFiles.length).toBeGreaterThan(5);
    const fired = new Set(
      krsFiles.flatMap((f) => analyze(Parser.parse(f.content).value, []).map((w) => w.kind)),
    );
    const contradicted = [...fired].filter((kind) =>
      ["dependent", "not-analyzed"].includes(SINGLE_DOCUMENT_CONTEXT[kind].sheets),
    );
    expect(contradicted).toEqual([]);
  });
});
