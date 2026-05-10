import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "@kompiro/adr-tools";
import { findRelated, formatRelatedAsMarkdown } from "./related.ts";
import { loadAllTpls } from "./validate.ts";

interface ParsedArgs {
  topic?: string;
  pkg?: string;
  help: boolean;
  positional: string[];
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = [];
  let pkg: string | undefined;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      help = true;
    } else if (arg === "--package" || arg === "-p") {
      pkg = argv[++i];
    } else if (arg.startsWith("--package=")) {
      pkg = arg.slice("--package=".length);
    } else if (arg.startsWith("-")) {
      process.stderr.write(`error: unknown flag "${arg}"\n`);
      process.exit(2);
    } else {
      positional.push(arg);
    }
  }

  return { topic: positional[0], pkg, help, positional };
}

function printUsage(): void {
  process.stdout.write(
    `Usage: pnpm tpl:related <topic> [--package <pkg>]

List active TPLs matching the given topic (and optionally package).
Output is markdown ready to paste into a Design Doc's "Related TPLs" section.

Examples:
  pnpm tpl:related app-ui
  pnpm tpl:related renderer --package core
`,
  );
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

if (!args.topic) {
  printUsage();
  process.stderr.write("\nerror: <topic> is required\n");
  process.exit(2);
}

const cwd = process.cwd();
const tplDir = resolve(cwd, "docs/test-perspectives");
if (!existsSync(tplDir)) {
  process.stderr.write(`error: ${tplDir} not found\n`);
  process.exit(2);
}

const adrConfig = loadConfig(cwd);
if (adrConfig.topics.length > 0 && !adrConfig.topics.includes(args.topic)) {
  process.stderr.write(
    `warning: topic "${args.topic}" is not in the controlled vocabulary\n` +
      `         (valid: ${adrConfig.topics.join(", ")})\n` +
      `         continuing anyway.\n\n`,
  );
}

const all = loadAllTpls(tplDir);
const matched = findRelated(all, { topic: args.topic, pkg: args.pkg });

if (matched.length === 0) {
  process.stderr.write(
    `No active TPLs found for topic "${args.topic}"${args.pkg ? ` and package "${args.pkg}"` : ""}.\n`,
  );
  process.exit(0);
}

process.stdout.write(`${formatRelatedAsMarkdown(matched)}\n`);
