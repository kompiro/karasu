import { ComposeTranslator } from "./compose.js";
import { DbTranslator } from "./db.js";
import { K8sTranslator } from "./k8s.js";
import { OpenApiTranslator } from "./openapi.js";
import type { Translator, TranslatorContext } from "./translator.js";

/** Input formats accepted by {@link translateInfraConfig}. */
export type TranslateFormat = "compose" | "k8s" | "openapi" | "db";

/** A valid `.krs` identifier — used to validate the `system` wrapper name. */
export const SYSTEM_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Wrap translator output in a `system <Name> { ... }` block, indenting the
 * body by two spaces. Blank lines are preserved as blank (no trailing spaces).
 *
 * Throws if `name` is not a valid `.krs` identifier — emitting an unquoted
 * name with whitespace or punctuation would produce a syntactically invalid
 * `.krs` file. Programmatic callers must pass a validated name.
 */
export function wrapInSystem(body: string, name: string): string {
  if (!SYSTEM_NAME_PATTERN.test(name)) {
    throw new Error(
      `system name "${name}" is not a valid identifier (expected [A-Za-z_][A-Za-z0-9_]*)`,
    );
  }
  const trimmed = body.replace(/\n+$/, "");
  if (trimmed.length === 0) {
    return `system ${name} {\n}\n`;
  }
  const indented = trimmed
    .split("\n")
    .map((line) => (line.length === 0 ? "" : `  ${line}`))
    .join("\n");
  return `system ${name} {\n${indented}\n}\n`;
}

/** Options for {@link translateInfraConfig}. */
export interface TranslateInfraOptions {
  /** Input format. */
  from: TranslateFormat;
  /** Base name of the input (no extension) — see {@link TranslatorContext.inputName}. */
  inputName?: string;
  /** Raw `karasu.map.yaml` content, when available. */
  mapFile?: string;
  /** Service name for openapi format. */
  service?: string;
  /** Database name for db format. */
  database?: string;
  /** Emission granularity (openapi / db only). */
  granularity?: "resource" | "operation" | "aggregate" | "table";
  /** Emit `usecase` → `resource` bindings (openapi / db only). */
  emitBindings?: boolean;
  /** Decorate emitted operations with `<verb>:<crud>` (openapi / db only). */
  emitCrudDecoration?: boolean;
  /** Wrap output in `system <name> { ... }` (openapi / db only). */
  system?: string;
}

/** Result of {@link translateInfraConfig}. */
export interface TranslateResult {
  /** The generated `.krs` scaffold. */
  krs: string;
  /** Non-fatal warnings collected during translation (e.g. unresolved realizes). */
  warnings: string[];
}

function translatorFor(format: TranslateFormat): Translator {
  switch (format) {
    case "compose":
      return new ComposeTranslator();
    case "k8s":
      return new K8sTranslator();
    case "openapi":
      return new OpenApiTranslator();
    case "db":
      return new DbTranslator();
  }
}

/**
 * Translate an infra config or API spec into a `.krs` scaffold.
 *
 * This is the host-agnostic entry point shared by the `karasu translate` CLI
 * and the App: it picks the translator, runs it, optionally wraps the output
 * in a `system` block, and returns warnings as data instead of writing to
 * `process.stderr`. Throws when the input cannot be parsed.
 */
export async function translateInfraConfig(
  input: string,
  options: TranslateInfraOptions,
): Promise<TranslateResult> {
  const warnings: string[] = [];
  const context: TranslatorContext = {
    inputName: options.inputName,
    mapFile: options.mapFile,
    service: options.service,
    database: options.database,
    granularity: options.granularity,
    emitBindings: options.emitBindings,
    emitCrudDecoration: options.emitCrudDecoration,
    onWarning: (message) => warnings.push(message),
  };

  let krs = await translatorFor(options.from).translate(input, context);

  if (options.system !== undefined) {
    if (options.from === "openapi" || options.from === "db") {
      krs = wrapInSystem(krs, options.system);
    } else {
      warnings.push("--system is only supported with --from openapi or --from db; ignoring.");
    }
  }

  return { krs, warnings };
}
