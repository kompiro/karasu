import type { Diagnostic, NodeMetadata, Warning } from "@karasu-tools/core";

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
 *
 * Implementation note: this is a **plain string concatenation**, not a
 * hash. It allocates roughly the size of the SVG plus the JSON encoding
 * of warnings/diagnostics on every successful compile, which suits
 * karasu's typical graph size (single-digit MB SVGs at most). A
 * cryptographic hash is unnecessary — the only consumer is `===`
 * inside the same JS realm.
 *
 * Failure-path semantics: the shared `useDebouncedCompile` does **not** reset
 * the stored fingerprint on the error path. That is safe because it gates the
 * success-branch fingerprint check on `!hadErrors.current` for every view, so
 * an error that recovers to byte-identical pre-error content still re-publishes
 * (#1540 unified this guard across system / deploy / org — previously
 * `useDeployView` lacked it).
 */
export function computeViewResultFingerprint(args: {
  svg: string;
  warnings: readonly Warning[];
  diagnostics: readonly Diagnostic[];
  /**
   * Optional. When provided, folds the metadata map into the fingerprint so
   * that edits which change *only* metadata (e.g. a `description` body, a
   * `link` URL, a `capability`'s `label` / `description`) — and therefore
   * produce identical SVG + warnings + diagnostics — still cause a state
   * publish, keeping consumers like `NodeDetailPanel` in sync. Hooks that
   * don't carry `nodeMetadata` (e.g. `useOrgView`) can omit this. See
   * Issue #1032.
   */
  nodeMetadata?: ReadonlyMap<string, NodeMetadata>;
}): string {
  // U+001F (Unit Separator) cannot appear in JSON-encoded strings —
  // JSON.stringify escapes control characters — and karasu's SVG output
  // is plain printable text, so this separator is unambiguous.
  const SEP = "\x1f";
  const metadataSegment = args.nodeMetadata
    ? JSON.stringify(Array.from(args.nodeMetadata.entries()))
    : "";
  return `${args.svg}${SEP}${JSON.stringify(args.warnings)}${SEP}${JSON.stringify(args.diagnostics)}${SEP}${metadataSegment}`;
}
