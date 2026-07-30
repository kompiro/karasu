import { describe, it, expect } from "vitest";
import { Parser, LOGICAL_KEYWORDS } from "../parser/parser.js";
import { KRS_KEYWORD_NAMES } from "../lexer/lexer.js";
import { REFERENCE_DATA } from "./reference-data.js";

// Reference-data ↔ **parser** agreement (#2158, TPL-2158).
//
// `reference-spec-sync.test.ts` fences `REFERENCE_DATA` against the prose and
// tables of `docs/spec/*.md`. That cannot cover the node-kind catalog, because
// the `### Logical structure` / `### Infra layer` tables are *generated from
// `REFERENCE_DATA` itself* (`<!-- gen:reference:node-kinds-* -->`) — the check
// is circular and passes no matter how far the catalog has drifted. #2158 is
// what that blind spot hid: `entity` was missing from the catalog (so from the
// panel AND the generated table), `client` never listed `capability`,
// `resource` never listed `operations`, and `service` / `domain` still
// advertised `team` — a property ADR-14 removed, which is now a hard error.
//
// So this file measures the parser instead of reading a document: it declares
// each kind with each property in a minimal `.krs` and asserts the catalog and
// the parser agree in BOTH directions. Unlike the doc axis (where the catalog
// is allowed to lead the prose — see TPL-1296), a property list is a
// promise about what the parser accepts, so an extra entry is as wrong as a
// missing one.

/** Kinds the parser only recognizes inside an infra block, so not in `LOGICAL_KEYWORDS`. */
const INFRA_LEAF_KINDS = ["table", "queue-item", "bucket"];

/**
 * One writable form per property keyword. Every logical-node property the
 * lexer knows must appear here — `covers every property keyword the lexer
 * knows` below fails when a new keyword lands without a decision.
 */
const PROPERTY_SNIPPETS: Record<string, string> = {
  label: 'label "L"',
  description: 'description "D"',
  link: 'link "https://example.com" "L"',
  role: 'role "R"',
  handles: "handles SomeDomain",
  delivers: "delivers SomeClient",
  team: 'team "T"',
  resource: 'resource localStorage "prefs"',
  capability: "capability camera",
  operations: "operations read",
  table: "table SomeDB.SomeTable",
};

/**
 * Lexer keywords that are not a logical node's property: node/block keywords,
 * and properties that belong to the `deploy` / `organization` / `legend`
 * grammars (fenced by their own kind tables, not by `nodeKinds`).
 */
const NOT_A_LOGICAL_NODE_PROPERTY = new Set([
  // logical node / infra block keywords
  ...LOGICAL_KEYWORDS,
  ...INFRA_LEAF_KINDS,
  // deploy grammar
  "deploy",
  "war",
  "jar",
  "oci",
  "lambda",
  "function",
  "assets",
  "job",
  "artifact",
  "runtime",
  "realizes",
  "schedule",
  "image",
  "type",
  // organization grammar
  "organization",
  "member",
  "owns",
  "slack",
  "github",
  // grouping / import / legend grammar
  "boundary",
  "contains",
  "import",
  "from",
  "legend",
  "swatch",
  "ref",
]);

/** One declaration per node kind, for the containment matrix below. */
const CHILD_DECLS: Record<string, string> = {
  system: "system Sub {}",
  user: "user U2 {}",
  client: "client C2 {}",
  service: "service Sv2 {}",
  domain: "domain D2 {}",
  entity: "entity E2 {}",
  usecase: "usecase U2 {}",
  resource: "resource R2 {}",
  database: "database DB2 {}",
  queue: "queue Q2 {}",
  storage: "storage St2 {}",
  table: "table T2 {}",
  bucket: "bucket B2 {}",
};

/**
 * How to write `child` inside `parent`, or `undefined` when the pair cannot be
 * written at all. The one irregular case is `queue-item`: it has no keyword of
 * its own — inside a `queue` block the `queue` keyword declares one (so a
 * nested `queue` block is unwritable there), and outside one there is no way to
 * spell it.
 */
function childDecl(parent: string, child: string): string | undefined {
  if (parent === "queue") {
    if (child === "queue-item") return "queue QI {}";
    if (child === "queue") return undefined;
  } else if (child === "queue-item") {
    return undefined;
  }
  return CHILD_DECLS[child];
}

/** Wraps a property line in the shallowest source that declares `kind`. */
const CONTEXT: Record<string, (body: string) => string> = {
  system: (b) => `system S {\n${b}\n}`,
  user: (b) => `system S {\n  user U {\n${b}\n  }\n}`,
  client: (b) => `system S {\n  client C {\n${b}\n  }\n}`,
  service: (b) => `system S {\n  service Sv {\n${b}\n  }\n}`,
  domain: (b) => `system S {\n  service Sv {\n    domain D {\n${b}\n    }\n  }\n}`,
  entity: (b) =>
    `system S {\n  service Sv {\n    domain D {\n      entity E {\n${b}\n      }\n    }\n  }\n}`,
  usecase: (b) =>
    `system S {\n  service Sv {\n    domain D {\n      usecase U {\n${b}\n      }\n    }\n  }\n}`,
  resource: (b) =>
    `system S {\n  service Sv {\n    domain D {\n      usecase U {\n        resource R {\n${b}\n        }\n      }\n    }\n  }\n}`,
  database: (b) => `system S {\n  database DB {\n${b}\n  }\n}`,
  table: (b) => `system S {\n  database DB {\n    table T {\n${b}\n    }\n  }\n}`,
  queue: (b) => `system S {\n  queue Q {\n${b}\n  }\n}`,
  "queue-item": (b) => `system S {\n  queue Q {\n    queue QI {\n${b}\n    }\n  }\n}`,
  storage: (b) => `system S {\n  storage St {\n${b}\n  }\n}`,
  bucket: (b) => `system S {\n  storage St {\n    bucket B {\n${b}\n    }\n  }\n}`,
};

/**
 * Diagnostic codes that mean "the parser rejected this property here". Warnings
 * are ignored on purpose: `handles SomeDomain` legitimately warns
 * (`unresolved-handles`) in a minimal model, and that is still acceptance.
 */
const REJECTION_CODES = new Set([
  "property-not-for-node-kind",
  "unexpected-token-in-block",
  "team-property-removed",
  "expected-string-after",
  "expected-id-after",
  "expected-id-or-string",
  "client-resource-invalid-kind",
]);

/** Does the parser accept `property` inside a `kind` block? */
function parserAccepts(kind: string, property: string): boolean {
  const source = CONTEXT[kind]!(`    ${PROPERTY_SNIPPETS[property]!}`);
  return !Parser.parse(source).diagnostics.some(
    (d) => d.severity === "error" && REJECTION_CODES.has(d.code),
  );
}

describe("REFERENCE_DATA.nodeKinds ↔ parser", () => {
  it("lists exactly the node kinds the parser declares", () => {
    const expected = [...LOGICAL_KEYWORDS, ...INFRA_LEAF_KINDS].sort();
    const listed = REFERENCE_DATA.nodeKinds.map((k) => k.kind).sort();
    expect(listed).toEqual(expected);
  });

  it("has a parse context for every listed kind (so the matrix below is exhaustive)", () => {
    const uncovered = REFERENCE_DATA.nodeKinds.map((k) => k.kind).filter((k) => !CONTEXT[k]);
    expect(uncovered).toEqual([]);
  });

  it("covers every property keyword the lexer knows", () => {
    const uncovered = KRS_KEYWORD_NAMES.filter(
      (k) => !NOT_A_LOGICAL_NODE_PROPERTY.has(k) && !PROPERTY_SNIPPETS[k],
    );
    expect(uncovered).toEqual([]);
  });

  it.each(REFERENCE_DATA.nodeKinds.map((k) => k.kind))(
    "`%s`: every listed property parses, and every property that parses is listed",
    (kind) => {
      const listed = new Set(REFERENCE_DATA.nodeKinds.find((k) => k.kind === kind)!.properties);
      const accepted = Object.keys(PROPERTY_SNIPPETS).filter((p) => parserAccepts(kind, p));

      // Advertised but rejected — e.g. `team` on service / domain (ADR-14).
      expect([...listed].filter((p) => !accepted.includes(p))).toEqual([]);
      // Accepted but unadvertised — e.g. `capability` on client (#2158).
      expect(accepted.filter((p) => !listed.has(p))).toEqual([]);
    },
  );

  it.each(REFERENCE_DATA.nodeKinds.map((k) => k.kind))(
    "`%s`: canContain matches exactly the children the parser accepts without `node-not-in-context`",
    (kind) => {
      // Since #2165 the parser derives the containment rule from `canContain`
      // itself (`LOGICAL_CONTAINMENT`) and warns with `node-not-in-context`
      // outside it, so this column is enforced rather than merely documented —
      // and can be fenced in both directions. A nesting counts as "allowed"
      // when it draws neither that warning nor a hard placement error
      // (`entity-not-in-domain` / `infra-not-in-context` and friends).
      // `canContain: []` infers as `never[]` under `satisfies`, so widen it.
      const listed = new Set<string>(
        REFERENCE_DATA.nodeKinds.find((k) => k.kind === kind)!.canContain as readonly string[],
      );
      const allowed = REFERENCE_DATA.nodeKinds
        .map((k) => k.kind)
        .filter((child) => {
          const decl = childDecl(kind, child);
          if (decl === undefined) return false;
          const diagnostics = Parser.parse(CONTEXT[kind]!(`    ${decl}`)).diagnostics;
          return !diagnostics.some(
            (d) => d.code === "node-not-in-context" || d.severity === "error",
          );
        });

      // Listed but warned/rejected — the table promises a nesting the parser
      // does not actually treat as meaningful.
      expect([...listed].filter((c) => !allowed.includes(c))).toEqual([]);
      // Allowed but unlisted — a nesting carries meaning nothing documents.
      expect(allowed.filter((c) => !listed.has(c))).toEqual([]);
    },
  );
});
