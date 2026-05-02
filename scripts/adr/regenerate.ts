/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AdrConfigInvalidError, AdrConfigMissingError, loadConfig } from "./config.ts";
import { buildGeneratedFiles, loadAdrs } from "./regenerator.ts";

interface CliArgs {
  dir: string;
  outDir: string;
  check: boolean;
}

function parseArgs(argv: string[], defaultDir: string): CliArgs | { error: string } {
  const args = argv.slice(2);
  let dir = defaultDir;
  let outDir = defaultDir;
  let check = false;
  for (const raw of args) {
    if (raw === "--check") {
      check = true;
    } else if (raw.startsWith("--dir=")) {
      dir = raw.slice("--dir=".length);
    } else if (raw.startsWith("--out-dir=")) {
      outDir = raw.slice("--out-dir=".length);
    } else if (raw === "--help" || raw === "-h") {
      return {
        error: `usage: regenerate.ts [options]
  (no flags)         — rewrite docs/adr/effective.md, graph.md, and graph/<topic>.md
  --check            — compare generated output with on-disk files; exit 1 if stale

Options:
  --dir=<path>       input ADR directory (default: docs/adr)
  --out-dir=<path>   output directory      (default: docs/adr)`,
      };
    } else {
      return { error: `unknown option: ${raw}` };
    }
  }
  return { dir, outDir, check };
}

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function main(argv: string[]): number {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    if (e instanceof AdrConfigMissingError || e instanceof AdrConfigInvalidError) {
      console.error(e.message);
      return 1;
    }
    throw e;
  }
  const parsed = parseArgs(argv, config.paths.adrDir);
  if ("error" in parsed) {
    console.error(parsed.error);
    return 2;
  }
  const adrs = loadAdrs(parsed.dir, config);
  const files = buildGeneratedFiles(adrs, config);

  if (parsed.check) {
    const stale: string[] = [];
    for (const f of files) {
      const onDisk = readFileOrNull(join(parsed.outDir, f.relativePath));
      if (onDisk !== f.contents) stale.push(f.relativePath);
    }
    if (stale.length > 0) {
      console.error(
        `ADR generated files are out of date — run \`pnpm adr:regenerate\` and commit:`,
      );
      for (const s of stale) console.error(`  ✗ ${s}`);
      return 1;
    }
    console.log(`All ${files.length} generated ADR file(s) are up to date.`);
    return 0;
  }

  for (const f of files) {
    const full = join(parsed.outDir, f.relativePath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.contents);
  }
  console.log(`Wrote ${files.length} file(s) under ${parsed.outDir}/:`);
  for (const f of files) console.log(`  ${f.relativePath}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv));
}
