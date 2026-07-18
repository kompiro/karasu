import { describe, it, expect } from "vitest";
import { resolveTranslateCliOptions, type RawTranslateCliOptions } from "./cli-options.js";

/**
 * Unit coverage for the translate CLI's `--from` / `--granularity` /
 * `--emit-bindings` / `--emit-crud-decoration` / `--system` cross-validation
 * ladder, extracted from `index.ts`'s commander action into a pure function
 * (Issue #2016 point 6) so the flag-combination matrix can be exercised
 * directly instead of only through `program.parseAsync`
 * (`cli-arg-validation.test.ts`). Every message asserted here must stay
 * byte-identical to the pre-extraction inline ladder.
 */

function raw(overrides: Partial<RawTranslateCliOptions> = {}): RawTranslateCliOptions {
  return { from: "compose", ...overrides };
}

describe("resolveTranslateCliOptions", () => {
  describe("valid combinations", () => {
    it("accepts --from compose with no other flags and defaults granularity/bindings", () => {
      const result = resolveTranslateCliOptions(raw({ from: "compose" }));
      expect(result).toEqual({
        ok: true,
        options: {
          from: "compose",
          map: undefined,
          output: undefined,
          service: undefined,
          database: undefined,
          granularity: undefined,
          emitBindings: false,
          emitCrudDecoration: false,
          system: undefined,
        },
        warnings: [],
      });
    });

    it("accepts --from k8s", () => {
      const result = resolveTranslateCliOptions(raw({ from: "k8s" }));
      expect(result.ok).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it("accepts --from wrangler", () => {
      const result = resolveTranslateCliOptions(raw({ from: "wrangler" }));
      expect(result.ok).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it("accepts --from openapi --granularity resource", () => {
      const result = resolveTranslateCliOptions(raw({ from: "openapi", granularity: "resource" }));
      expect(result).toMatchObject({
        ok: true,
        options: { granularity: "resource" },
        warnings: [],
      });
    });

    it("accepts --from openapi --granularity operation", () => {
      const result = resolveTranslateCliOptions(raw({ from: "openapi", granularity: "operation" }));
      expect(result).toMatchObject({
        ok: true,
        options: { granularity: "operation" },
        warnings: [],
      });
    });

    it("accepts --from db --granularity aggregate", () => {
      const result = resolveTranslateCliOptions(raw({ from: "db", granularity: "aggregate" }));
      expect(result).toMatchObject({
        ok: true,
        options: { granularity: "aggregate" },
        warnings: [],
      });
    });

    it("accepts --from db --granularity table", () => {
      const result = resolveTranslateCliOptions(raw({ from: "db", granularity: "table" }));
      expect(result).toMatchObject({ ok: true, options: { granularity: "table" }, warnings: [] });
    });

    it("accepts --emit-bindings with --from openapi (default resource granularity)", () => {
      const result = resolveTranslateCliOptions(raw({ from: "openapi", emitBindings: true }));
      expect(result).toMatchObject({
        ok: true,
        options: { emitBindings: true, emitCrudDecoration: false },
        warnings: [],
      });
    });

    it("accepts --emit-bindings with --from db (default aggregate granularity)", () => {
      const result = resolveTranslateCliOptions(raw({ from: "db", emitBindings: true }));
      expect(result).toMatchObject({
        ok: true,
        options: { emitBindings: true },
        warnings: [],
      });
    });

    it("--emit-crud-decoration implies --emit-bindings", () => {
      const result = resolveTranslateCliOptions(raw({ from: "openapi", emitCrudDecoration: true }));
      expect(result).toMatchObject({
        ok: true,
        options: { emitBindings: true, emitCrudDecoration: true },
        warnings: [],
      });
    });

    it("accepts a valid --system identifier with --from openapi", () => {
      const result = resolveTranslateCliOptions(raw({ from: "openapi", system: "Orders" }));
      expect(result).toMatchObject({ ok: true, options: { system: "Orders" }, warnings: [] });
    });

    it("passes through --map / --output / --service / --database verbatim", () => {
      const result = resolveTranslateCliOptions(
        raw({
          from: "openapi",
          map: "karasu.map.yaml",
          output: "out.krs",
          service: "ECommerce",
          database: "OrderDB",
        }),
      );
      expect(result).toMatchObject({
        ok: true,
        options: {
          map: "karasu.map.yaml",
          output: "out.krs",
          service: "ECommerce",
          database: "OrderDB",
        },
      });
    });
  });

  describe("invalid --from", () => {
    it("rejects an unknown --from value", () => {
      const result = resolveTranslateCliOptions(raw({ from: "yaml" }));
      expect(result).toEqual({
        ok: false,
        message: `Error: --from must be "compose", "k8s", "openapi", "db", or "wrangler"\n`,
        warnings: [],
      });
    });
  });

  describe("invalid --granularity", () => {
    it("rejects --granularity for --from openapi outside resource|operation", () => {
      const result = resolveTranslateCliOptions(raw({ from: "openapi", granularity: "table" }));
      expect(result).toEqual({
        ok: false,
        message: `Error: --granularity for --from openapi must be "resource" or "operation"\n`,
        warnings: [],
      });
    });

    it("rejects --granularity for --from db outside aggregate|table", () => {
      const result = resolveTranslateCliOptions(raw({ from: "db", granularity: "operation" }));
      expect(result).toEqual({
        ok: false,
        message: `Error: --granularity for --from db must be "aggregate" or "table"\n`,
        warnings: [],
      });
    });

    it.each(["compose", "k8s", "wrangler"] as const)(
      "rejects --granularity with --from %s",
      (from) => {
        const result = resolveTranslateCliOptions(raw({ from, granularity: "resource" }));
        expect(result).toEqual({
          ok: false,
          message: `Error: --granularity is only valid with --from openapi or --from db\n`,
          warnings: [],
        });
      },
    );
  });

  describe("--emit-bindings / --emit-crud-decoration warning downgrades", () => {
    it.each(["compose", "k8s", "wrangler"] as const)(
      "warns and disables --emit-bindings when --from is %s",
      (from) => {
        const result = resolveTranslateCliOptions(raw({ from, emitBindings: true }));
        expect(result).toMatchObject({
          ok: true,
          options: { emitBindings: false, emitCrudDecoration: false },
          warnings: [
            `Warning: --emit-bindings / --emit-crud-decoration are only supported with --from openapi or --from db; ignoring.\n`,
          ],
        });
      },
    );

    it("warns and disables --emit-crud-decoration when --from is compose", () => {
      const result = resolveTranslateCliOptions(raw({ from: "compose", emitCrudDecoration: true }));
      expect(result).toMatchObject({
        ok: true,
        options: { emitBindings: false, emitCrudDecoration: false },
        warnings: [
          `Warning: --emit-bindings / --emit-crud-decoration are only supported with --from openapi or --from db; ignoring.\n`,
        ],
      });
    });

    it("warns and disables --emit-bindings when --granularity operation is used with openapi", () => {
      const result = resolveTranslateCliOptions(
        raw({ from: "openapi", granularity: "operation", emitBindings: true }),
      );
      expect(result).toMatchObject({
        ok: true,
        options: { emitBindings: false, emitCrudDecoration: false },
        warnings: [
          `Warning: --emit-bindings / --emit-crud-decoration are ignored with --granularity operation.\n`,
        ],
      });
    });

    it("warns and disables --emit-bindings when --granularity table is used with db", () => {
      const result = resolveTranslateCliOptions(
        raw({ from: "db", granularity: "table", emitCrudDecoration: true }),
      );
      expect(result).toMatchObject({
        ok: true,
        options: { emitBindings: false, emitCrudDecoration: false },
        warnings: [
          `Warning: --emit-bindings / --emit-crud-decoration are ignored with --granularity table.\n`,
        ],
      });
    });

    it("does not warn when --emit-bindings is used with --from openapi and default (resource) granularity", () => {
      const result = resolveTranslateCliOptions(raw({ from: "openapi", emitBindings: true }));
      expect(result.warnings).toEqual([]);
    });
  });

  describe("invalid --system", () => {
    it("rejects a --system value that is not a valid identifier", () => {
      const result = resolveTranslateCliOptions(raw({ from: "openapi", system: "not valid" }));
      expect(result).toEqual({
        ok: false,
        message: `Error: --system value "not valid" is not a valid identifier (expected [A-Za-z_][A-Za-z0-9_]*)\n`,
        warnings: [],
      });
    });

    it("rejects a --system value starting with a digit", () => {
      const result = resolveTranslateCliOptions(raw({ from: "openapi", system: "1System" }));
      expect(result).toEqual({
        ok: false,
        message: `Error: --system value "1System" is not a valid identifier (expected [A-Za-z_][A-Za-z0-9_]*)\n`,
        warnings: [],
      });
    });

    it("carries prior warnings through into an --system error result", () => {
      // --emit-bindings is downgraded (warning), then --system fails
      // validation (error): both must surface, warning first.
      const result = resolveTranslateCliOptions(
        raw({ from: "compose", emitBindings: true, system: "bad name" }),
      );
      expect(result).toEqual({
        ok: false,
        message: `Error: --system value "bad name" is not a valid identifier (expected [A-Za-z_][A-Za-z0-9_]*)\n`,
        warnings: [
          `Warning: --emit-bindings / --emit-crud-decoration are only supported with --from openapi or --from db; ignoring.\n`,
        ],
      });
    });
  });

  describe("combined-error inputs surface the first applicable error", () => {
    it("an invalid --from wins over an invalid --system", () => {
      const result = resolveTranslateCliOptions(raw({ from: "yaml", system: "also bad" }));
      expect(result).toEqual({
        ok: false,
        message: `Error: --from must be "compose", "k8s", "openapi", "db", or "wrangler"\n`,
        warnings: [],
      });
    });

    it("an invalid --granularity wins over an invalid --system", () => {
      const result = resolveTranslateCliOptions(
        raw({ from: "openapi", granularity: "table", system: "also bad" }),
      );
      expect(result).toEqual({
        ok: false,
        message: `Error: --granularity for --from openapi must be "resource" or "operation"\n`,
        warnings: [],
      });
    });
  });
});
