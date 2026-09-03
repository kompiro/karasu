import { describe, expect, it } from "vitest";
import { Parser } from "./parser.js";
import type { Diagnostic, KrsFile } from "../types/ast.js";

/**
 * The five comma-separated value properties read on one grammar (#2551).
 *
 * Before the unification each property carried its own hand-rolled reader, and
 * they had drifted on the axes below: which code a missing element raised,
 * whether the diagnostic landed on the offending comma or on the next token,
 * and whether a list could quietly continue across a line break. This suite
 * states the grammar once and runs every property through it, so the next
 * property added to the family is either on the shared reader or visibly not.
 *
 * Per-property meaning (dedup on `facets`, reference paths on `handles` /
 * `realizes`, CRUD decoration on `operations`) stays in the suites that own
 * those properties; only the list grammar is asserted here.
 */
interface ListProperty {
  /** Two ids this property accepts as list elements. */
  ids: [string, string];
  /** Wraps property lines into a file that declares whatever they reference. */
  source: (lines: string) => string;
  /** The elements the parse recorded, in document order. */
  read: (file: KrsFile) => string[];
}

const PROPERTIES: Record<string, ListProperty> = {
  facets: {
    ids: ["pii", "pci"],
    source: (lines) =>
      `facet pii {}\nfacet pci {}\nsystem Shop {\n  service Api {\n${lines}\n  }\n}\n`,
    read: (f) => f.systems[0]?.children[0]?.facets ?? [],
  },
  delivers: {
    ids: ["WebApp", "AdminUI"],
    source: (lines) =>
      `system Shop {\n  client WebApp [web] {}\n  client AdminUI [web] {}\n  service Api {\n${lines}\n  }\n}\n`,
    read: (f) => {
      const api = f.systems[0]?.children[2];
      return api?.kind === "service" ? (api.properties.delivers ?? []) : [];
    },
  },
  handles: {
    ids: ["Order", "Catalog"],
    source: (lines) =>
      `domain Order {}\ndomain Catalog {}\nsystem Shop {\n  service Api {\n${lines}\n  }\n}\n`,
    read: (f) => {
      const api = f.systems[0]?.children[0];
      return api?.kind === "service"
        ? (api.properties.handles ?? []).map((h) => h.path.join("."))
        : [];
    },
  },
  operations: {
    ids: ["create", "read"],
    source: (lines) =>
      `domain Sales {\n  usecase Order {\n    resource Cart {\n${lines}\n    }\n  }\n}\n`,
    read: (f) => {
      const resource = f.domains[0]?.children[0]?.children[0];
      return resource?.kind === "resource"
        ? (resource.properties.operations ?? []).map((op) => op.verb)
        : [];
    },
  },
  realizes: {
    ids: ["OrderService", "InventoryService"],
    source: (lines) =>
      `system Shop {\n  service OrderService {}\n  service InventoryService {}\n}\ndeploy Production {\n  oci monolith {\n${lines}\n  }\n}\n`,
    read: (f) => (f.deploys[0]?.nodes[0]?.properties.realizes ?? []).map((r) => r.path.join(".")),
  },
};

const errors = (diagnostics: Diagnostic[]): Diagnostic[] =>
  diagnostics.filter((d) => d.severity === "error");

describe.each(Object.entries(PROPERTIES))(
  "the shared comma-list grammar: %s",
  (property, { ids, source, read }) => {
    const [first, second] = ids;
    /** Indents a property line to the depth its block sits at. */
    const line = (value: string) => `    ${property} ${value}`;

    it("reads a comma list, and reads it the same way as repeated lines", () => {
      const commas = Parser.parse(source(line(`${first}, ${second}`)));
      const repeated = Parser.parse(source([line(first), line(second)].join("\n")));
      expect(commas.diagnostics).toEqual([]);
      expect(read(commas.value)).toEqual([first, second]);
      expect(read(commas.value)).toEqual(read(repeated.value));
    });

    it("reports a value-less keyword once, anchored on the keyword", () => {
      const src = source(line(""));
      const result = Parser.parse(src);
      const errs = errors(result.diagnostics);
      expect(errs.map((d) => d.code)).toEqual(["expected-id-after"]);
      expect(errs[0]!.params).toMatchObject({ property });
      expect(errs[0]!.loc!.start.column).toBe(line("").indexOf(property) + 1);
    });

    it("reports a trailing comma on the comma itself and keeps what it read", () => {
      const listLine = line(`${first},`);
      const result = Parser.parse(source(listLine));
      const errs = errors(result.diagnostics);
      expect(errs.map((d) => d.code)).toEqual(["expected-id-after"]);
      // Anchored on the dangling comma. Reporting at the *next* token would put
      // the squiggle on the following line, which is not the line at fault.
      expect(errs[0]!.loc!.start.column).toBe(listLine.indexOf(",") + 1);
      expect(read(result.value)).toEqual([first]);
    });

    it("reports a leading comma on the comma itself and still records what follows", () => {
      const listLine = line(`,${second}`);
      const result = Parser.parse(source(listLine));
      const errs = errors(result.diagnostics);
      expect(errs.map((d) => d.code)).toEqual(["expected-id-after"]);
      // The comma is the character at fault, so it is what the squiggle covers.
      // Anchoring on the keyword instead would report a leading comma and a
      // missing value at the same place, though only one of them is written.
      expect(errs[0]!.loc!.start.column).toBe(listLine.indexOf(",") + 1);
      expect(read(result.value)).toEqual([second]);
    });

    it("does not let a trailing comma swallow the next line", () => {
      const result = Parser.parse(source([line(`${first},`), `    ${second}`].join("\n")));
      // `second` is reported where it sits rather than absorbed as an element.
      expect(read(result.value)).toEqual([first]);
      expect(errors(result.diagnostics).map((d) => d.code)).toEqual([
        "expected-id-after",
        "unexpected-token-in-block",
      ]);
    });

    it("does not continue a list from a comma opening the next line", () => {
      const result = Parser.parse(source([line(first), `    ,${second}`].join("\n")));
      // The mirror image of the trailing comma, and it fails the same way:
      // accepting it silently would extend the model with an element the spec
      // does not say is writable there.
      expect(read(result.value)).toEqual([first]);
      expect(errors(result.diagnostics).length).toBeGreaterThan(0);
    });
  },
);
