/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { fileURLToPath } from "node:url";
import { evaluateAll } from "./assumptions.ts";
import { loadParsed } from "./extractor.ts";

interface CliArgs {
  dir: string;
  repoRoot: string;
  quiet: boolean;
}

function parseArgs(argv: string[]): CliArgs | { error: string } {
  const args = argv.slice(2);
  let dir = "docs/adr";
  let repoRoot = ".";
  let quiet = false;
  for (const raw of args) {
    if (raw === "--quiet") {
      quiet = true;
    } else if (raw.startsWith("--dir=")) {
      dir = raw.slice("--dir=".length);
    } else if (raw.startsWith("--repo-root=")) {
      repoRoot = raw.slice("--repo-root=".length);
    } else if (raw === "--help" || raw === "-h") {
      return {
        error: `usage: check-assumptions.ts [options]
  --dir=<path>         ADR directory (default: docs/adr)
  --repo-root=<path>   repository root that assumption paths are resolved against (default: .)
  --quiet              suppress OK and MANUAL lines; only show failures`,
      };
    } else {
      return { error: `unknown option: ${raw}` };
    }
  }
  return { dir, repoRoot, quiet };
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    console.error(parsed.error);
    return 2;
  }
  const adrs = loadParsed(parsed.dir);
  const results = evaluateAll(adrs, parsed.repoRoot);

  const byStatus = { ok: 0, fail: 0, manual: 0 };
  for (const r of results) {
    byStatus[r.status]++;
    if (parsed.quiet && r.status !== "fail") continue;
    const sym = r.status === "ok" ? "✓" : r.status === "fail" ? "✗" : "?";
    const msg = r.message ? ` — ${r.message}` : "";
    const line = `  ${sym} ${r.adrId} :: ${r.assumption}${msg}`;
    if (r.status === "fail") console.error(line);
    else console.log(line);
  }

  const total = results.length;
  console.log(
    `\nChecked ${total} assumption(s): ${byStatus.ok} OK, ${byStatus.fail} failing, ${byStatus.manual} manual-review.`,
  );

  return byStatus.fail > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv));
}
