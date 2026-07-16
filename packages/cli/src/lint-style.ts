import * as fs from "node:fs";
import { StyleParser, validateStyleValues, type Diagnostic } from "@karasu-tools/core";
import { findFilesBySuffix, resolveTargets } from "./find-files.js";
import { formatDiagnostic } from "./i18n.js";
import { readStdin } from "./stdin.js";

interface LintStyleOptions {
  stdin?: boolean;
}

const SKIP = new Set(["node_modules", ".worktrees", ".git", "dist", ".claude"]);

/**
 * `karasu lint-style` — value-level diagnostics for `.krs.style` files
 * (Phase 3 of the style AST roadmap, see
 * `docs/design/style-value-diagnostics.md`).
 *
 * Reports parse diagnostics + value validator diagnostics in the
 * familiar `<file>:<line>:<col> <severity>: <message>` format. Exits
 * non-zero when any error-severity diagnostic is reported (warnings
 * alone do not fail the command).
 */
export async function lintStyle(files: string[], options: LintStyleOptions): Promise<void> {
  if (options.stdin) {
    await lintStdin();
    return;
  }

  const targets = resolveTargets(files, () =>
    findFilesBySuffix(process.cwd(), ".krs.style", SKIP),
  );

  if (targets.length === 0) {
    process.stderr.write("No .krs.style files found.\n");
    process.exit(0);
  }

  let anyError = false;

  for (const file of targets) {
    const src = fs.readFileSync(file, "utf8");
    const diags = collectDiagnostics(src);
    if (diags.length === 0) continue;

    for (const d of diags) {
      const line = d.loc?.start.line ?? 1;
      const col = d.loc?.start.column ?? 1;
      const severity = d.severity;
      const message = formatDiagnostic(d);
      process.stdout.write(`${file}:${line}:${col} ${severity}: ${message}\n`);
      if (d.severity === "error") anyError = true;
    }
  }

  if (anyError) process.exit(1);
}

async function lintStdin(): Promise<void> {
  const src = await readStdin();
  const diags = collectDiagnostics(src);
  let anyError = false;
  for (const d of diags) {
    const line = d.loc?.start.line ?? 1;
    const col = d.loc?.start.column ?? 1;
    process.stdout.write(`stdin:${line}:${col} ${d.severity}: ${formatDiagnostic(d)}\n`);
    if (d.severity === "error") anyError = true;
  }
  if (anyError) process.exit(1);
}

function collectDiagnostics(src: string): Diagnostic[] {
  const parsed = StyleParser.parse(src);
  return [...parsed.diagnostics, ...validateStyleValues(parsed.value)];
}
