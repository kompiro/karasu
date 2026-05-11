// Meta-test for TPL-20260510-12 (AST / parser / renderer agreement) — G12-1.
//
// Enforces that every user-facing field declared on BaseNodeFields is preserved
// by the parser for every node kind that extends it. The retrospective origin
// of this gap is #74 (deploy nodes silently lacked `label`); the gap analysis
// (#1233) showed that today this is checked per-kind / per-field by individual
// tests and there is no single invariant that catches a new kind missing a
// field, or a new BaseNodeFields field forgotten on existing kinds.
//
// Two layers of enforcement:
//
//   1. Compile-time — `keyof BaseNodeFields` is compared against an explicit
//      ExpectedKeys union. Adding a field to the interface makes this fail at
//      type-check, forcing a deliberate decision about coverage.
//   2. Runtime — for each (USER_FACING_FIELDS × KIND_FIXTURES) pair, parse a
//      minimal source with the field set and assert the AST node carries it;
//      also parse without the field and assert the default value, so a
//      regression that silently drops the field cannot pass by accident.

import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import type {
  BaseNodeFields,
  ClientNode,
  DatabaseNode,
  KrsFile,
  KrsNode,
  QueueGroupNode,
  ResourceNode,
  StorageNode,
  UsecaseNode,
  UserNode,
} from "../types/ast.js";

// ─── Compile-time guard ────────────────────────────────────────────────────

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

type ExpectedKeys = "id" | "label" | "tags" | "annotations" | "children" | "edges" | "loc";

// If a key is added to BaseNodeFields, this assignment fails — see the file
// header for the required decision (structural vs. user-facing).
const _baseNodeFieldsKeyContract: Equal<keyof BaseNodeFields, ExpectedKeys> = true;
void _baseNodeFieldsKeyContract;

// User-facing fields = parse-time inputs sourced from .krs text.
// Structural fields (id, children, edges, loc) are excluded: id is required and
// covered by existing parser tests; children/edges/loc are not user-input
// scalars but composed by the parser.
type UserFacingField = "label" | "tags" | "annotations";
const USER_FACING_FIELDS = [
  "label",
  "tags",
  "annotations",
] as const satisfies readonly UserFacingField[];

// ─── Per-kind fixtures ─────────────────────────────────────────────────────

interface FieldModifiers {
  label?: string;
  tags?: readonly string[];
  annotations?: readonly string[];
}

interface KindFixture {
  kind: KrsNode["kind"];
  source: (mods: FieldModifiers) => string;
  extract: (file: KrsFile) => KrsNode;
}

// Helpers for rendering the inline `[tags] @annotations` suffix that follows
// the id token in most kinds.
function renderTagAnnotationSuffix(mods: FieldModifiers): string {
  const tagPart = mods.tags && mods.tags.length > 0 ? ` [${mods.tags.join(", ")}]` : "";
  const annPart =
    mods.annotations && mods.annotations.length > 0
      ? " " + mods.annotations.map((a) => `@${a}`).join(" ")
      : "";
  return `${tagPart}${annPart}`;
}

function renderLabelBlock(mods: FieldModifiers): string {
  return mods.label !== undefined ? `\n  label ${JSON.stringify(mods.label)}\n` : "";
}

const KIND_FIXTURES: readonly KindFixture[] = [
  {
    kind: "system",
    source: (mods) => `system Sys${renderTagAnnotationSuffix(mods)} {${renderLabelBlock(mods)}}`,
    extract: (file) => file.systems[0],
  },
  {
    kind: "service",
    source: (mods) => `service Svc${renderTagAnnotationSuffix(mods)} {${renderLabelBlock(mods)}}`,
    extract: (file) => file.services[0],
  },
  {
    kind: "domain",
    source: (mods) => `domain Dom${renderTagAnnotationSuffix(mods)} {${renderLabelBlock(mods)}}`,
    extract: (file) => file.domains[0],
  },
  {
    kind: "usecase",
    source: (mods) =>
      `domain Dom {
  usecase Uc${renderTagAnnotationSuffix(mods)} {${renderLabelBlock(mods)}}
}`,
    extract: (file) => file.domains[0].children[0] as UsecaseNode,
  },
  {
    kind: "resource",
    source: (mods) =>
      `domain Dom {
  usecase Uc {
    resource Res${renderTagAnnotationSuffix(mods)} {${renderLabelBlock(mods)}}
  }
}`,
    extract: (file) => (file.domains[0].children[0] as UsecaseNode).children[0] as ResourceNode,
  },
  {
    kind: "user",
    source: (mods) =>
      `system Sys {
  user U${renderTagAnnotationSuffix(mods)} {${renderLabelBlock(mods)}}
}`,
    extract: (file) => {
      const u = file.systems[0].children.find((c) => c.kind === "user");
      if (!u) throw new Error("user fixture: no user node found");
      return u as UserNode;
    },
  },
  {
    kind: "client",
    source: (mods) => `client C${renderTagAnnotationSuffix(mods)} {${renderLabelBlock(mods)}}`,
    extract: (file) => file.clients[0] as ClientNode,
  },
  {
    kind: "database",
    source: (mods) => `database DB${renderTagAnnotationSuffix(mods)} {${renderLabelBlock(mods)}}`,
    extract: (file) => file.databases[0] as DatabaseNode,
  },
  {
    kind: "queue",
    source: (mods) => `queue Q${renderTagAnnotationSuffix(mods)} {${renderLabelBlock(mods)}}`,
    extract: (file) => file.queues[0] as QueueGroupNode,
  },
  {
    kind: "storage",
    source: (mods) => `storage S${renderTagAnnotationSuffix(mods)} {${renderLabelBlock(mods)}}`,
    extract: (file) => file.storages[0] as StorageNode,
  },
  {
    kind: "table",
    source: (mods) =>
      `database DB {
  table T${renderTagAnnotationSuffix(mods)} {${renderLabelBlock(mods)}}
}`,
    extract: (file) => file.databases[0].children[0],
  },
  {
    kind: "queue-item",
    source: (mods) =>
      `queue Q {
  queue Item${renderTagAnnotationSuffix(mods)} {${renderLabelBlock(mods)}}
}`,
    extract: (file) => file.queues[0].children[0],
  },
  {
    kind: "bucket",
    source: (mods) =>
      `storage S {
  bucket B${renderTagAnnotationSuffix(mods)} {${renderLabelBlock(mods)}}
}`,
    extract: (file) => file.storages[0].children[0],
  },
];

// Compile-time exhaustiveness: every kind in KrsNode["kind"] must appear in
// KIND_FIXTURES. We enforce this via a typed Record of kind → boolean.
type _Covered = (typeof KIND_FIXTURES)[number]["kind"];
const _kindExhaustivenessContract: Equal<_Covered, KrsNode["kind"]> = true;
void _kindExhaustivenessContract;

// ─── Per-field default & set values ────────────────────────────────────────

const FIELD_SET_VALUES: Record<UserFacingField, FieldModifiers> = {
  label: { label: "Coverage Probe" },
  tags: { tags: ["external"] },
  annotations: { annotations: ["deprecated"] },
};

function getField(node: KrsNode, field: UserFacingField): unknown {
  return (node as unknown as Record<string, unknown>)[field];
}

function defaultFor(field: UserFacingField): unknown {
  if (field === "label") return undefined;
  return [];
}

function expectedFor(field: UserFacingField): unknown {
  if (field === "label") return "Coverage Probe";
  if (field === "tags") return ["external"];
  return ["deprecated"];
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("BaseNodeFields × kind coverage (TPL-20260510-12 / G12-1)", () => {
  for (const fixture of KIND_FIXTURES) {
    describe(`kind=${fixture.kind}`, () => {
      it("defaults are correct when no user-facing field is set", () => {
        const src = fixture.source({});
        const result = Parser.parse(src);
        const errors = result.diagnostics.filter((d) => d.severity === "error");
        expect(errors).toHaveLength(0);
        const node = fixture.extract(result.value);
        for (const field of USER_FACING_FIELDS) {
          expect(getField(node, field)).toEqual(defaultFor(field));
        }
      });

      for (const field of USER_FACING_FIELDS) {
        it(`preserves ${field}`, () => {
          const src = fixture.source(FIELD_SET_VALUES[field]);
          const result = Parser.parse(src);
          const errors = result.diagnostics.filter((d) => d.severity === "error");
          expect(errors).toHaveLength(0);
          const node = fixture.extract(result.value);
          expect(getField(node, field)).toEqual(expectedFor(field));
        });
      }
    });
  }
});
