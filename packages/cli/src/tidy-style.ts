import * as fs from "node:fs";
import { tidyStyleSheet, type Diagnostic } from "@karasu-tools/core";
import { formatDiagnostic } from "./i18n.js";
import { resolveTargets } from "./find-files.js";
import { readStdin } from "./stdin.js";

interface TidyStyleOptions {
  check?: boolean;
  stdin?: boolean;
  noMerge?: boolean;
}

/**
 * `karasu tidy-style` — normalize one or more `.krs.style` files in
 * place. Defaults to rewriting; `--check` reports drift only and exits
 * non-zero when any file would change.
 *
 * A file with a parse error is left as written (tidying it would delete the
 * declarations the parser refused, #3141): its errors are printed and the
 * command exits non-zero, in either mode.
 */
export async function tidyStyle(files: string[], options: TidyStyleOptions): Promise<void> {
  if (options.stdin) {
    await tidyStyleStdin(options);
    return;
  }

  const targets = resolveTargets(files, ".krs.style");
  if (targets === undefined) return;

  if (targets.length === 0) {
    process.stderr.write("No .krs.style files found.\n");
    process.exit(0);
  }

  let anyChanged = false;
  let anyError = false;

  for (const file of targets) {
    const src = fs.readFileSync(file, "utf8");
    const result = tidyStyleSheet(src, { merge: !options.noMerge });

    if (reportErrors(file, result.diagnostics)) {
      anyError = true;
      continue;
    }
    if (!result.changed) continue;

    anyChanged = true;
    if (options.check) {
      process.stderr.write(`${file}: would be tidied\n`);
    } else {
      fs.writeFileSync(file, result.output, "utf8");
      process.stdout.write(`${file}: tidied\n`);
    }
  }

  if (anyError || (options.check && anyChanged)) process.exit(1);
}

async function tidyStyleStdin(options: TidyStyleOptions): Promise<void> {
  const src = await readStdin();
  const result = tidyStyleSheet(src, { merge: !options.noMerge });
  process.stdout.write(result.output);
  if (reportErrors("stdin", result.diagnostics)) process.exit(1);
}

/** Print `diagnostics`' errors to stderr; whether there were any. */
function reportErrors(name: string, diagnostics: Diagnostic[]): boolean {
  const errors = diagnostics.filter((d) => d.severity === "error");
  for (const d of errors) {
    const line = d.loc?.start.line ?? 1;
    const col = d.loc?.start.column ?? 1;
    process.stderr.write(`${name}:${line}:${col} error: ${formatDiagnostic(d)}\n`);
  }
  return errors.length > 0;
}
