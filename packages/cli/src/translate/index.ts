import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { translateInfraConfig, type TranslateFormat } from "@karasu-tools/core";
import { writeOutput } from "../output.js";
import { fileArgumentOrExit } from "../path-arg.js";

// Re-exported for the CLI command layer (`cli/src/index.ts`) and tests, which
// validate `--system` before invoking translate. The implementations live in
// `@karasu-tools/core` so the App can share them.
export { SYSTEM_NAME_PATTERN, wrapInSystem } from "@karasu-tools/core";

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

/**
 * Resolves the `karasu.map.yaml` path: explicit `--map` wins, otherwise look
 * beside the input file. Returns the file content, or undefined when absent.
 */
function readMapFile(inputPath: string, mapPath?: string): string | undefined {
  const resolved = mapPath ? resolve(mapPath) : resolve(dirname(inputPath), "karasu.map.yaml");
  return existsSync(resolved) ? readFileSync(resolved, "utf-8") : undefined;
}

export async function translate(inputFile: string, options: TranslateOptions): Promise<void> {
  const inputPath = resolve(inputFile);
  const kind = fileArgumentOrExit(inputFile, "file");
  if (kind === undefined) return;
  if (kind === "missing") {
    process.stderr.write(`Error: File not found: ${inputFile}\n`);
    process.exit(1);
    return;
  }
  let content: string;
  try {
    content = readFileSync(inputPath, "utf-8");
  } catch (e) {
    // The file is there (stat succeeded), so this is not "not found" (TPL-2942).
    const code = (e as NodeJS.ErrnoException).code;
    process.stderr.write(`Error: cannot read ${inputFile}: ${code ?? String(e)}\n`);
    process.exit(1);
    return;
  }

  let result;
  try {
    result = await translateInfraConfig(content, {
      from: options.from,
      inputName: basename(inputPath, extname(inputPath)),
      mapFile: readMapFile(inputPath, options.map),
      service: options.service,
      database: options.database,
      granularity: options.granularity,
      emitBindings: options.emitBindings,
      emitCrudDecoration: options.emitCrudDecoration,
      system: options.system,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: Failed to parse ${inputFile}: ${message}\n`);
    process.exit(1);
  }

  for (const warning of result.warnings) {
    process.stderr.write(`Warning: ${warning}\n`);
  }

  await writeOutput(result.krs, options.output);
}
