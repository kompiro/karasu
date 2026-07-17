import { SYSTEM_NAME_PATTERN } from "./index.js";

/**
 * The raw, string-typed shape commander hands the `translate` action —
 * before `--from` / `--granularity` / `--system` have been validated against
 * their allowed value sets.
 */
export interface RawTranslateCliOptions {
  from: string;
  map?: string;
  output?: string;
  service?: string;
  database?: string;
  granularity?: string;
  emitBindings?: boolean;
  emitCrudDecoration?: boolean;
  system?: string;
}

/** The validated, defaulted options ready to pass to `translate()`. */
interface ResolvedTranslateOptions {
  from: "compose" | "k8s" | "openapi" | "db" | "wrangler";
  map?: string;
  output?: string;
  service?: string;
  database?: string;
  granularity?: "resource" | "operation" | "aggregate" | "table";
  emitBindings: boolean;
  emitCrudDecoration: boolean;
  system?: string;
}

type ResolveTranslateCliOptionsResult =
  | { ok: true; options: ResolvedTranslateOptions; warnings: string[] }
  | { ok: false; message: string; warnings: string[] };

/**
 * Pure `--from` / `--granularity` / `--emit-bindings` / `--emit-crud-decoration`
 * / `--system` cross-validation for the `translate` CLI command, extracted
 * from the commander action so it is unit-testable without going through
 * `program.parseAsync`.
 *
 * Mirrors the original inline ladder's control flow exactly: each `Error:`
 * branch stops the ladder immediately (returning `ok: false` with that
 * branch's message — combined-error inputs surface the *first* applicable
 * error, matching the original code's behavior once `process.exit` halts
 * execution), while `Warning:` branches are non-fatal and accumulate into
 * `warnings` as the ladder continues. Callers are responsible for writing
 * `warnings` (in order) and, on `ok: false`, `message` to stderr and calling
 * `process.exit(1)` — this function performs no I/O itself.
 */
export function resolveTranslateCliOptions(
  raw: RawTranslateCliOptions,
): ResolveTranslateCliOptionsResult {
  const warnings: string[] = [];

  if (
    raw.from !== "compose" &&
    raw.from !== "k8s" &&
    raw.from !== "openapi" &&
    raw.from !== "db" &&
    raw.from !== "wrangler"
  ) {
    return {
      ok: false,
      message: `Error: --from must be "compose", "k8s", "openapi", "db", or "wrangler"\n`,
      warnings,
    };
  }

  let granularity: "resource" | "operation" | "aggregate" | "table" | undefined;
  if (raw.granularity === undefined) {
    granularity = undefined;
  } else if (raw.from === "openapi") {
    if (raw.granularity === "resource" || raw.granularity === "operation") {
      granularity = raw.granularity;
    } else {
      return {
        ok: false,
        message: `Error: --granularity for --from openapi must be "resource" or "operation"\n`,
        warnings,
      };
    }
  } else if (raw.from === "db") {
    if (raw.granularity === "aggregate" || raw.granularity === "table") {
      granularity = raw.granularity;
    } else {
      return {
        ok: false,
        message: `Error: --granularity for --from db must be "aggregate" or "table"\n`,
        warnings,
      };
    }
  } else {
    return {
      ok: false,
      message: `Error: --granularity is only valid with --from openapi or --from db\n`,
      warnings,
    };
  }

  let emitBindings = raw.emitBindings ?? false;
  let emitCrudDecoration = raw.emitCrudDecoration ?? false;
  if (emitCrudDecoration) emitBindings = true;
  if (emitBindings || emitCrudDecoration) {
    if (raw.from !== "openapi" && raw.from !== "db") {
      warnings.push(
        `Warning: --emit-bindings / --emit-crud-decoration are only supported with --from openapi or --from db; ignoring.\n`,
      );
      emitBindings = false;
      emitCrudDecoration = false;
    } else if (granularity === "operation" || granularity === "table") {
      warnings.push(
        `Warning: --emit-bindings / --emit-crud-decoration are ignored with --granularity ${granularity}.\n`,
      );
      emitBindings = false;
      emitCrudDecoration = false;
    }
  }

  const system: string | undefined = raw.system;
  if (system !== undefined && !SYSTEM_NAME_PATTERN.test(system)) {
    return {
      ok: false,
      message: `Error: --system value "${system}" is not a valid identifier (expected [A-Za-z_][A-Za-z0-9_]*)\n`,
      warnings,
    };
  }

  return {
    ok: true,
    options: {
      from: raw.from,
      map: raw.map,
      output: raw.output,
      service: raw.service,
      database: raw.database,
      granularity,
      emitBindings,
      emitCrudDecoration,
      system,
    },
    warnings,
  };
}
