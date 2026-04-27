import type { Diagnostic, Warning } from "@karasu-tools/core";

/**
 * Compute a compact fingerprint over the user-visible parts of a compile
 * result (rendered SVG + warnings + diagnostics). Used by view hooks to
 * decide whether to publish a fresh state into React.
 *
 * The earlier optimization compared only `result.svg`, which incorrectly
 * skipped state updates when warnings or diagnostics changed but the
 * graph layout did not — for example, fixing a `handles` typo where the
 * resolved domain produces the same SVG topology. Folding warnings and
 * diagnostics into the fingerprint preserves the "nothing changed → no
 * re-render" optimization while making both directions of warning
 * refresh (clear + appear) reliable. See Issue #891.
 */
export function computeViewResultFingerprint(args: {
  svg: string;
  warnings: readonly Warning[];
  diagnostics: readonly Diagnostic[];
}): string {
  // U+001F (Unit Separator) cannot appear in JSON-encoded strings —
  // JSON.stringify escapes control characters — and karasu's SVG output
  // is plain printable text, so this separator is unambiguous.
  const SEP = "\x1f";
  return `${args.svg}${SEP}${JSON.stringify(args.warnings)}${SEP}${JSON.stringify(args.diagnostics)}`;
}
