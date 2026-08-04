import { describe, it, expect } from "vitest";
import { compile } from "../index.js";
import { Parser } from "../parser/parser.js";
import { StyleParser } from "../parser/style-parser.js";
import { computeSpecificity } from "../parser/style-parser.js";
import { resolveStyles } from "./style-resolver.js";
import { analyze } from "./warnings.js";
import { formatSelector } from "../style/serialize.js";

// Facet style selectors, `[facets=<id>]` (#2175, tags-and-facets Part B slice 3).
//
// This is the styling hook the arbitrary-name tag / annotation selectors are
// being deprecated in favour of. Two properties carry that migration and are
// asserted first: the new form matches on element-side membership (no facet
// index reaches the style resolver — the locality the by-reference facet form
// was rejected for), and it scores exactly what the tag selector it replaces
// scored, so a half-migrated sheet does not change which rule wins.

const MODEL = `
facet pii {
  label "Personal data"
}
facet gdpr {
  label "GDPR"
}

system Shop {
  service Payments {
    facets pii
  }
  service Search {}
  database Vault {
    facets pii, gdpr
  }
}
`;

function parseModel(source = MODEL) {
  const { value, diagnostics } = Parser.parse(source);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return value;
}

function sheet(css: string) {
  const result = StyleParser.parse(css);
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return result.value;
}

describe("[facets=<id>] selector — matching", () => {
  it("styles the members of a facet and leaves non-members alone", () => {
    const file = parseModel();
    const styles = resolveStyles(file.systems, [sheet(`[facets=pii] { color: #111111; }`)]);
    expect(styles.nodes.get("Payments")?.color).toBe("#111111");
    expect(styles.nodes.get("Vault")?.color).toBe("#111111");
    expect(styles.nodes.get("Search")?.color).not.toBe("#111111");
  });

  it("compounds with a kind", () => {
    const file = parseModel();
    const styles = resolveStyles(file.systems, [sheet(`database[facets=pii] { color: #222222; }`)]);
    expect(styles.nodes.get("Vault")?.color).toBe("#222222");
    // Payments is in `pii` but is a service — the kind half must still bind.
    expect(styles.nodes.get("Payments")?.color).not.toBe("#222222");
  });

  it("ANDs repeated predicates, like tags", () => {
    const file = parseModel();
    const styles = resolveStyles(file.systems, [
      sheet(`[facets=pii][facets=gdpr] { color: #333333; }`),
    ]);
    expect(styles.nodes.get("Vault")?.color).toBe("#333333");
    // In `pii` but not `gdpr` — one of two is not a match.
    expect(styles.nodes.get("Payments")?.color).not.toBe("#333333");
  });

  it("matches nothing when the model declares no facets at all", () => {
    const file = parseModel(`system Shop {\n  service Payments {}\n}\n`);
    const styles = resolveStyles(file.systems, [sheet(`[facets=pii] { color: #444444; }`)]);
    expect(styles.nodes.get("Payments")?.color).not.toBe("#444444");
  });

  it("does not widen to every edge when written on an edge selector", () => {
    // `facets` is a node property in v1, so `edge[facets=…]` matches nothing.
    // Ignoring the predicate instead would silently style ALL edges.
    const file = parseModel(`
      system Shop {
        service A {}
        service B {}
        A -> B "call"
      }
    `);
    const styles = resolveStyles(file.systems, [sheet(`edge[facets=pii] { stroke-width: 4px; }`)]);
    expect(styles.edges.size).toBeGreaterThan(0);
    for (const style of styles.edges.values()) {
      expect(style.strokeWidth).not.toBe(4);
    }
  });
});

describe("[facets=<id>] selector — cascade", () => {
  // The migration constraint: rewriting `[pci] { … }` to `[facets=pci] { … }`
  // must not change which rule wins, or a sheet could only be migrated in one
  // atomic commit (TPL-2175).
  it("scores 10, the same as the tag selector it replaces", () => {
    expect(computeSpecificity({ tags: [], annotations: [], facets: ["pii"] })).toBe(10);
    expect(computeSpecificity({ tags: ["pii"], annotations: [], facets: [] })).toBe(10);
  });

  it("scores 11 with a kind, matching `kind[tag]`", () => {
    expect(
      computeSpecificity({ nodeType: "database", tags: [], annotations: [], facets: ["pii"] }),
    ).toBe(11);
  });

  it("loses to an id selector and beats a bare kind selector", () => {
    const file = parseModel();
    const styles = resolveStyles(file.systems, [
      sheet(`service { color: #aaaaaa; }\n[facets=pii] { color: #bbbbbb; }`),
      sheet(`#Payments { color: #cccccc; }`),
    ]);
    expect(styles.nodes.get("Payments")?.color).toBe("#cccccc");
    expect(styles.nodes.get("Search")?.color).toBe("#aaaaaa");
  });

  it("ties with the tag selector, so declaration order decides", () => {
    const file = parseModel(`
      facet pii { label "PII" }
      system Shop {
        service Payments [legacy] { facets pii }
      }
    `);
    const later = resolveStyles(file.systems, [
      sheet(`[legacy] { color: #111111; }\n[facets=pii] { color: #222222; }`),
    ]);
    expect(later.nodes.get("Payments")?.color).toBe("#222222");

    const earlier = resolveStyles(file.systems, [
      sheet(`[facets=pii] { color: #222222; }\n[legacy] { color: #111111; }`),
    ]);
    expect(earlier.nodes.get("Payments")?.color).toBe("#111111");
  });
});

describe("[facets=<id>] selector — serialization", () => {
  it("round-trips through formatSelector", () => {
    const parsed = sheet(`database[facets=pii][facets=gdpr]@deprecated { color: #111111; }`);
    expect(formatSelector(parsed.rules[0].selector)).toBe(
      "database[facets=pii][facets=gdpr]@deprecated",
    );
  });

  it("keeps `[facets=x]` and `[x]` distinct", () => {
    // They score the same but mean different things; a serializer that dropped
    // the `facets=` prefix would fuse them in the style-conflict grouping.
    expect(formatSelector(sheet(`[facets=pii] {}`).rules[0].selector)).toBe("[facets=pii]");
    expect(formatSelector(sheet(`[pii] {}`).rules[0].selector)).toBe("[pii]");
  });
});

describe("arbitrary-name selector deprecation (#2175)", () => {
  const analyzeSheets = (css: string, model = MODEL) =>
    analyze(parseModel(model), [StyleParser.parse(css).value], 0);

  it("warns on a tag selector whose name is outside the tool vocabulary", () => {
    const warnings = analyzeSheets(`[pci] { color: #111111; }`).filter(
      (w) => w.kind === "style-tag-selector-not-builtin",
    );
    expect(warnings).toHaveLength(1);
    if (warnings[0].kind !== "style-tag-selector-not-builtin") throw new Error("kind mismatch");
    expect(warnings[0].params.tag).toBe("pci");
    expect(warnings[0].params.selector).toBe("[pci]");
  });

  it("warns on an annotation selector whose name is outside the builtin set", () => {
    const warnings = analyzeSheets(`service@canary { color: #111111; }`).filter(
      (w) => w.kind === "style-annotation-selector-not-builtin",
    );
    expect(warnings).toHaveLength(1);
    if (warnings[0].kind !== "style-annotation-selector-not-builtin") {
      throw new Error("kind mismatch");
    }
    expect(warnings[0].params.annotation).toBe("canary");
  });

  it("stays silent for builtin, system-assigned and inferred-shape tag names", () => {
    const css = `
      [external] { color: #111111; }
      [cyclic] { color: #222222; }
      resource[table] { color: #333333; }
      client[mobile] { color: #444444; }
      @deprecated { color: #555555; }
    `;
    expect(
      analyzeSheets(css).filter(
        (w) =>
          w.kind === "style-tag-selector-not-builtin" ||
          w.kind === "style-annotation-selector-not-builtin",
      ),
    ).toEqual([]);
  });

  it("stays silent for the facet selector — that is the migration target", () => {
    expect(
      analyzeSheets(`[facets=pii] { color: #111111; }`).filter((w) => w.kind.startsWith("style-")),
    ).toEqual([]);
  });

  it("does not warn about system sheets the author cannot edit", () => {
    // `systemSheetCount` sheets are the builtin theme and any injected theme.
    const arbitrary = StyleParser.parse(`[pci] { color: #111111; }`).value;
    const warnings = analyze(parseModel(), [arbitrary], 1).filter((w) =>
      w.kind.startsWith("style-"),
    );
    expect(warnings).toEqual([]);
  });

  it("warns on the model side AND the style side for one name", () => {
    // Two edits, so two warnings. Reporting once would leave the other site
    // unfound (TPL-2175).
    const model = `
      system Shop {
        service Payments [pci] {}
      }
    `;
    const warnings = analyzeSheets(`[pci] { color: #111111; }`, model);
    expect(warnings.some((w) => w.kind === "tag-not-builtin")).toBe(true);
    expect(warnings.some((w) => w.kind === "style-tag-selector-not-builtin")).toBe(true);
  });

  it("still applies the deprecated rule — v1.x behaviour is unchanged", () => {
    // The deprecation is an announcement. Dropping the rule now would silently
    // change how existing models look; disablement is v2.0.
    const file = parseModel(`
      system Shop {
        service Payments [pci] {}
      }
    `);
    const styles = resolveStyles(file.systems, [sheet(`[pci] { color: #111111; }`)]);
    expect(styles.nodes.get("Payments")?.color).toBe("#111111");
  });
});

describe("[facets=<id>] reaches the compiled SVG", () => {
  it("paints facet members through the normal compile path", () => {
    const result = compile(MODEL, {
      diagramType: "system",
      styleSource: `[facets=pii] { background-color: #123456; }`,
    });
    expect(result.svg).toContain("#123456");
  });
});
