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

  if (options.output) {
    writeFileSync(resolve(options.output), result, "utf-8");
  } else {
    process.stdout.write(result);
  }
}
