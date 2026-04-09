import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ComposeTranslator } from "./compose.js";
import { K8sTranslator } from "./k8s.js";
import type { TranslatorContext } from "./translator.js";

export type TranslateFormat = "compose" | "k8s";

export interface TranslateOptions {
  from: TranslateFormat;
  map?: string;
  output?: string;
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
  };

  const translator = options.from === "compose" ? new ComposeTranslator() : new K8sTranslator();

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
