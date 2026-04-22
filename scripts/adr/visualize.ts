/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { fileURLToPath } from "node:url";
import { closure, effectiveSet, loadParsed, scopeSlice } from "./extractor.ts";
import { renderMarkdown } from "./visualizer.ts";

interface CliArgs {
  mode: "all" | "effective" | "slice" | "closure";
  dir: string;
  packages: string[];
  domains: string[];
  adrId: string | null;
}

function parseArgs(argv: string[]): CliArgs | { error: string } {
  const args = argv.slice(2);
  let mode: CliArgs["mode"] = "all";
  let dir = "docs/adr";
  const packages: string[] = [];
  const domains: string[] = [];
  let adrId: string | null = null;

  for (const raw of args) {
    if (raw === "--effective") {
      mode = "effective";
    } else if (raw.startsWith("--dir=")) {
      dir = raw.slice("--dir=".length);
    } else if (raw.startsWith("--package=")) {
      mode = "slice";
      packages.push(...raw.slice("--package=".length).split(",").filter(Boolean));
    } else if (raw.startsWith("--domain=")) {
      mode = "slice";
      domains.push(...raw.slice("--domain=".length).split(",").filter(Boolean));
    } else if (raw.startsWith("--closure=")) {
      mode = "closure";
      adrId = raw.slice("--closure=".length);
    } else if (raw === "--help" || raw === "-h") {
      return {
        error: `usage: visualize.ts [options]
  (no flags)             — full graph of all ADRs
  --effective            — limit to ADRs with status=accepted and no superseded_by
  --package=X --domain=Y — limit to scope slice + transitive depends_on
  --closure=ADR-X        — limit to one ADR and its transitive depends_on

Options:
  --dir=<path>           default: docs/adr`,
      };
    } else {
      return { error: `unknown option: ${raw}` };
    }
  }

  if (mode === "closure" && adrId === null) {
    return { error: "--closure requires an ADR id" };
  }

  return { mode, dir, packages, domains, adrId };
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    console.error(parsed.error);
    return 2;
  }
  const all = loadParsed(parsed.dir);
  try {
    let subset;
    if (parsed.mode === "effective") {
      subset = effectiveSet(all);
    } else if (parsed.mode === "slice") {
      subset = scopeSlice(all, { packages: parsed.packages, domains: parsed.domains });
    } else if (parsed.mode === "closure") {
      subset = closure(all, parsed.adrId!);
    } else {
      subset = all;
    }
    process.stdout.write(renderMarkdown(subset));
    return 0;
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv));
}
