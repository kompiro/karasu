import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ComposeTranslator } from "./compose.js";
import { DbTranslator } from "./db.js";
import { K8sTranslator } from "./k8s.js";
import { OpenApiTranslator } from "./openapi.js";
import type { TranslatorContext } from "./translator.js";

type TranslateFormat = "compose" | "k8s" | "openapi" | "db";

interface TranslateOptions {
  from: TranslateFormat;
  map?: string;
  output?: string;
  service?: string;
  database?: string;
  granularity?: "resource" | "operation" | "aggregate" | "table";
  emitBindings?: boolean;
  emitCrudDecoration?: boolean;
  system?: string;
}

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

export async function translate(inputFile: string, options: TranslateOptions): Promise<void> {
  const inputPath = resolve(inputFile);
  let content: string;
  try {
    content = readFileSync(inputPath, "utf-8");
  } catch {
    process.stderr.write(`Error: File not found: ${inputFile}\n`);
    process.exit(1);
  }

  const context: TranslatorContext = {
    inputPath,
    mapPath: options.map,
    service: options.service,
    database: options.database,
    granularity: options.granularity,
    emitBindings: options.emitBindings,
    emitCrudDecoration: options.emitCrudDecoration,
  };

  let translator;
  switch (options.from) {
    case "compose":
      translator = new ComposeTranslator();
      break;
    case "k8s":
      translator = new K8sTranslator();
      break;
    case "openapi":
      translator = new OpenApiTranslator();
      break;
    case "db":
      translator = new DbTranslator();
      break;
  }

  let result: string;
  try {
    result = await translator.translate(content, context);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: Failed to parse ${inputFile}: ${message}\n`);
    process.exit(1);
  }

  if (options.system !== undefined) {
    if (options.from === "openapi" || options.from === "db") {
      result = wrapInSystem(result, options.system);
    } else {
      process.stderr.write(
        `Warning: --system is only supported with --from openapi or --from db; ignoring.\n`,
      );
    }
  }

  if (options.output) {
    writeFileSync(resolve(options.output), result, "utf-8");
  } else {
    process.stdout.write(result);
  }
}
