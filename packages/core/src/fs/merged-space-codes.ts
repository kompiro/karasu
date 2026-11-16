import type { DiagnosticCode } from "../types/ast.js";

/**
 * Diagnostics that are only decidable after the cross-file merge: reference
 * existence first (Issue #2032), and since #2221 the declaration-multiplicity
 * verdicts too (`duplicate-*`, `node-id-multiple-locations`). Their per-file
 * verdict is dropped during Pass 1 and re-derived against the merged model in
 * `resolve()`.
 *
 * Adding a code here carries a precondition: the rebuild only sees declarations
 * that reached `krsFile`. For a multiplicity verdict that means a collision
 * confined to a file only some of which is named-imported is dropped and not
 * re-derived — deliberately, since those declarations are not in the project's
 * model at all (the editor still reports them per file, the LSP parsing each
 * document on its own). A code whose verdict must survive for un-merged
 * declarations does not belong in this set.
 *
 * Still load-bearing after #2410, though for a narrower set of files: a file that
 * *has* imports now produces no verdict to drop, because the validators decline
 * to decide there. What this strip catches is the **import-less leaf** — a file
 * with no imports of its own whose `contains` / `owns` target is only satisfied
 * once the importing file's wildcard or `system` reopen adds the node. Its
 * per-file verdict is real and wrong, and only this strip removes it.
 */
export const MERGED_SPACE_REFERENCE_CODES = [
  "contains-target-not-found",
  "owns-target-not-found",
  // Ambiguity is decided against the same declared-node space as existence,
  // so it is import-coupled for the same reason (#2088 / ADR-2410).
  "owns-target-ambiguous",
  "contains-target-ambiguous",
  "realizes-target-ambiguous",
  // Co-ownership became a merged-model verdict when ownerIndex moved to the
  // rebuild pattern (#2548): two files each owning the same node is a fact no
  // single file can see, and the entry file's per-file infos would otherwise
  // double the rebuild's (same shape as duplicate-boundary-assignment below).
  "duplicate-owner-assignment",
  // The physical dot-notation refs (#2078). Shared infra is *canonically*
  // declared in a dedicated file every slice imports (§S4.5), so a per-file
  // verdict would warn on the recommended layout: every `resource ArticleDB.x`
  // in `reader.krs` would look unresolved because the block lives in
  // `infra.krs`. Suppressed per file, re-derived against the merged tree in `resolve()`.
  "unresolved-resource-ref",
  "unresolved-table-ref",
  // `facet` declarations merge across files, so uniqueness is a property of the
  // merged namespace. Suppressed per file and re-derived in `resolve()` — otherwise a
  // duplicate split across two files would go unreported, and a duplicate inside
  // one file would be reported twice (#2065 Part B).
  "duplicate-facet-id",
  // Multi-membership is a property of the merged declarations for the same
  // reason, and fails in the more dangerous direction: two files each listing
  // one boundary for the same node is a fact no single file can see, so a
  // per-file verdict does not over-report — it reports nothing at all
  // (#2221, TPL-2221).
  "duplicate-boundary-assignment",
  // Same reasoning, reachable since #2246: a reopened `system` (or infra block)
  // carries its scoped `boundary` blocks across, so two files can now declare
  // the same id in one scope. Neither file sees the collision alone.
  "duplicate-boundary-id",
  // Which ids are declared at more than one path is a merged-model fact for the
  // same reason (#2596): `system Legacy { service Search }` in one file and
  // `system Next { service Search }` in another collide in a way neither file
  // can see, so the per-file verdict reported nothing at all while the index
  // silently kept whichever file merged first. Re-derived in `resolve()` together with
  // the index it explains.
  "node-id-multiple-locations",
] as const satisfies readonly DiagnosticCode[];

/** A diagnostic decided on the merged model only (see {@link MERGED_SPACE_REFERENCE_CODES}). */
export type MergedSpaceReferenceCode = (typeof MERGED_SPACE_REFERENCE_CODES)[number];

export const MERGED_SPACE_REFERENCE_CODE_SET: ReadonlySet<DiagnosticCode> = new Set(
  MERGED_SPACE_REFERENCE_CODES,
);
