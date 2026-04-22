/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { fileURLToPath } from "node:url";
import {
  closure,
  effectiveSet,
  format,
  loadParsed,
  scopeSlice,
  type OutputFormat,
} from "./extractor.ts";

const VALID_FORMATS: readonly OutputFormat[] = ["list", "markdown", "json"] as const;

interface CliArgs {
  subcommand: "effective" | "slice" | "closure";
  format: OutputFormat;
  dir: string;
  packages: string[];
  domains: string[];
  adrId: string | null;
}

function parseArgs(argv: string[]): CliArgs | { error: string } {
  const args = argv.slice(2);
  const sub = args[0];
  if (sub !== "effective" && sub !== "slice" && sub !== "closure") {
    return {
      error: `usage: extract.ts <effective|slice|closure> [options]
  effective               — list ADRs with status=accepted and no superseded_by
  slice --package X --domain Y — ADRs whose scope matches + transitive depends_on
  closure ADR-YYYYMMDD-NN — transitive depends_on closure of the given ADR

Options (all subcommands):
  --format=<list|markdown|json>   default: list
  --dir=<path>                    default: docs/adr
  --package=<name>                repeatable or comma-separated (slice only)
  --domain=<name>                 repeatable or comma-separated (slice only)`,
    };
  }

  let fmt: OutputFormat = "list";
  let dir = "docs/adr";
  const packages: string[] = [];
  const domains: string[] = [];
  let adrId: string | null = null;

  for (const raw of args.slice(1)) {
    if (raw.startsWith("--format=")) {
      const v = raw.slice("--format=".length);
      if (!VALID_FORMATS.includes(v as OutputFormat)) {
        return {
          error: `invalid --format (got ${v}); expected one of ${VALID_FORMATS.join(", ")}`,
        };
      }
      fmt = v as OutputFormat;
    } else if (raw.startsWith("--dir=")) {
      dir = raw.slice("--dir=".length);
    } else if (raw.startsWith("--package=")) {
      packages.push(...raw.slice("--package=".length).split(",").filter(Boolean));
    } else if (raw.startsWith("--domain=")) {
      domains.push(...raw.slice("--domain=".length).split(",").filter(Boolean));
    } else if (raw.startsWith("--")) {
      return { error: `unknown option: ${raw}` };
    } else if (sub === "closure" && adrId === null) {
      adrId = raw;
    } else {
      return { error: `unexpected positional argument: ${raw}` };
    }
  }

  if (sub === "closure" && adrId === null) {
    return { error: "closure requires an ADR id (e.g. ADR-20260422-05)" };
  }

  return { subcommand: sub, format: fmt, dir, packages, domains, adrId };
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    console.error(parsed.error);
    return 2;
  }
  const adrs = loadParsed(parsed.dir);
  try {
    let result;
    if (parsed.subcommand === "effective") {
      result = effectiveSet(adrs);
    } else if (parsed.subcommand === "slice") {
      result = scopeSlice(adrs, { packages: parsed.packages, domains: parsed.domains });
    } else {
      result = closure(adrs, parsed.adrId!);
    }
    process.stdout.write(format(result, parsed.format));
    return 0;
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv));
}
