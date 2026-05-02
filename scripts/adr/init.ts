/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_FILENAME } from "./config.ts";

const TEMPLATE_PATH = join(dirname(fileURLToPath(import.meta.url)), "init.template.json");

export interface InitResult {
  written: boolean;
  path: string;
  message: string;
}

export function runInit(cwd: string = process.cwd()): InitResult {
  const target = join(cwd, CONFIG_FILENAME);
  if (existsSync(target)) {
    return {
      written: false,
      path: target,
      message: `${CONFIG_FILENAME} already exists at ${target}; refusing to overwrite.`,
    };
  }
  const template = readFileSync(TEMPLATE_PATH, "utf8");
  writeFileSync(target, template);
  return {
    written: true,
    path: target,
    message: `Generated ${CONFIG_FILENAME} at ${target}. Edit "topics" and "concerns" for your project.`,
  };
}

function main(argv: string[]): number {
  const cwd = argv[2] ?? process.cwd();
  const result = runInit(cwd);
  if (!result.written) {
    console.error(result.message);
    return 1;
  }
  console.log(result.message);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv));
}
