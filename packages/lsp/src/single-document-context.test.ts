import { describe, it, expect } from "vitest";
import {
  Parser,
  StyleParser,
  analyze,
  getBuiltinStyleSheet,
  type WarningKind,
  EC_PLATFORM_PROJECTS_EN,
  FACET_STYLING_PROJECT_EN,
  FEATURE_SAMPLES_PROJECT,
  GETTING_STARTED_PROJECT_EN,
  MULTI_FILE_SYSTEM_PROJECT_EN,
  type ExampleProject,
} from "@karasu-tools/core";
import { SINGLE_DOCUMENT_CONTEXT } from "./single-document-context.js";

// The ledger is complete by type (a `Record` over `WarningKind`). These checks
// hold its entries to what they claim, analyzing the way the LSP analyzes a
// document: alone, with no stylesheet and its imports unresolved.

const PROJECTS: ExampleProject[] = [
  ...EC_PLATFORM_PROJECTS_EN,
  FACET_STYLING_PROJECT_EN,
  FEATURE_SAMPLES_PROJECT,
  GETTING_STARTED_PROJECT_EN,
  MULTI_FILE_SYSTEM_PROJECT_EN,
];

const krsFiles = PROJECTS.flatMap((p) => p.files).filter((f) => f.path.endsWith(".krs"));

describe("SINGLE_DOCUMENT_CONTEXT (TPL-1522)", () => {
  it("gives a reason for every kind", () => {
    const unexplained = Object.entries(SINGLE_DOCUMENT_CONTEXT)
      .filter(([, side]) => side.why.trim().length < 20)
      .map(([kind]) => kind);
    expect(unexplained).toEqual([]);
  });

  // One document per kind recorded `fires-on-imported-target`, whose target is
  // declared only in the file it imports. The set must match the ledger's, so
  // a kind cannot be recorded there without showing it, nor left out of it
  // while it fires here.
  const IMPORTED_TARGET: Partial<Record<WarningKind, string>> = {
    "unresolved-realizes": `import "model.krs"\ndeploy P {\n  oci app {\n    runtime "k8s"\n    realizes Billing\n  }\n}`,
    "unassigned-domain": `import "org.krs"\ndomain Pay { label "Pay" }`,
    "unassigned-service": `import "org.krs"\nservice Billing { label "Billing" }`,
    "unassigned-client": `import "org.krs"\nclient App [web] { label "App" }`,
    "unassigned-database": `import "org.krs"\ndatabase DB { label "DB" }`,
    "unassigned-queue": `import "org.krs"\nqueue Events { label "Events" }`,
    "unassigned-storage": `import "org.krs"\nstorage Media { label "Media" }`,
    "unresolved-handles": `import "model.krs"\nsystem S {\n  client App [web] {\n    handles Order\n  }\n}`,
    "unassigned-resource": `import "infra.krs"\nsystem S {\n  service A {\n    domain D {\n      usecase U {\n        resource OrdersTable { operations read }\n      }\n    }\n  }\n}`,
    "cross-system-ref-unresolved": `import "billing.krs"\nsystem S {\n  service Web {}\n  Web -> Billing.Api "calls"\n}`,
    "unresolved-edge-endpoint": `import "b.krs"\nsystem S {\n  service Web {}\n  Web -> Api "calls"\n}`,
    "delivers-target-not-client": `import "model.krs"\nsystem S {\n  service Bff {\n    delivers App\n  }\n}`,
    "facet-not-declared": `import "facets.krs"\nsystem S {\n  service A {\n    facets pii\n  }\n}`,
    "legend-ref-unresolved": `import "model.krs"\nlegend "L" {\n  ref [mobile] "Mobile"\n}`,
  };

  it("fixtures exactly the kinds recorded as firing on an imported target", () => {
    const recorded = Object.entries(SINGLE_DOCUMENT_CONTEXT)
      .filter(([, side]) => side.imports === "fires-on-imported-target")
      .map(([kind]) => kind);
    expect(Object.keys(IMPORTED_TARGET).sort()).toEqual(recorded.sort());
  });

  it.each(Object.entries(IMPORTED_TARGET))(
    "%s fires on a target in an imported file",
    (kind, src) => {
      const parsed = Parser.parse(src!);
      expect(parsed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(analyze(parsed.value, []).map((w) => w.kind)).toContain(kind);
    },
  );

  it("legend-ref-unresolved is style-suppressed: a sheet that selects the target silences it", () => {
    expect(SINGLE_DOCUMENT_CONTEXT["legend-ref-unresolved"].sheets).toBe("suppressed");
    const file = Parser.parse(
      `system S { service A {} }\nlegend "L" {\n  ref @planned "Planned"\n}`,
    ).value;
    const kinds = (sheets: ReturnType<typeof getBuiltinStyleSheet>[]) =>
      analyze(file, sheets, 1).map((w) => w.kind);
    const author = StyleParser.parse("@planned { opacity: 0.5; }").value;
    expect(analyze(file, []).map((w) => w.kind)).toContain("legend-ref-unresolved");
    expect(kinds([getBuiltinStyleSheet(), author])).not.toContain("legend-ref-unresolved");
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
