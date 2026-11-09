/* eslint-disable no-console -- CLI entry point; the path written is the output */
// Writes the large synthetic model (packages/core/src/renderer/fixtures/large-model.ts)
// to `<dir>/index.krs`, for a manual step or a benchmark that needs a model of
// real-world size (#3668):
//
//   pnpm bench:large-model <dir>
//   pnpm bench:large-model <dir> --services 40
//   pnpm bench:render <dir>/index.krs

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_OPTIONS,
  generateLargeModel,
  type LargeModelOptions,
} from "../../packages/core/src/renderer/fixtures/large-model.ts";

function parseArgs(argv: string[]): { dir: string; options: LargeModelOptions } {
  let dir: string | undefined;
  const options = { ...DEFAULT_OPTIONS };
  const flags: Record<string, keyof LargeModelOptions> = {
    "--services": "services",
    "--domains": "domainsPerService",
    "--usecases": "usecasesPerDomain",
  };
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let raw: string | undefined;
    const eq = arg.indexOf("=");
    if (arg.startsWith("--") && eq > 0) [arg, raw] = [arg.slice(0, eq), arg.slice(eq + 1)];
    // Own keys only, so a directory named "constructor" is not read as a flag.
    const key = Object.hasOwn(flags, arg) ? flags[arg] : undefined;
    if (key) {
      raw ??= argv[++i];
      if (raw === undefined) throw new Error(`${arg} expects a positive integer`);
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${arg} expects a positive integer, got ${raw}`);
      }
      options[key] = value;
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option ${arg}`);
    } else {
      if (dir !== undefined) throw new Error(`unexpected argument ${arg}`);
      dir = arg;
    }
  }
  if (!dir)
    throw new Error(
      "usage: pnpm bench:large-model <dir> [--services N] [--domains N] [--usecases N]",
    );
  return { dir, options };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { dir, options } = parseArgs(process.argv.slice(2));
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "index.krs");
    writeFileSync(file, generateLargeModel(options));
    console.log(file);
  } catch (error: unknown) {
    console.error(`bench:large-model: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
