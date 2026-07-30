// ---------------------------------------------------------------------------
// Reference-existence validation for `boundary … contains` and `team … owns`.
//
// These two diagnostics assert that a referenced id **exists** in the model.
// They are extracted here as pure functions (returning Diagnostic[] instead of
// mutating a Parser instance) so both callers can run them against the id-space
// that is correct for their mode:
//
//   - The single-file Parser validates against the just-parsed KrsFile.
//   - The multi-file ImportResolver suppresses the per-file result and re-runs
//     these against the **merged** KrsFile — otherwise a member/owned id
//     declared in another file would falsely warn even though the merged model
//     resolves it (Issue #2032). Reference existence is only knowable after the
//     cross-file merge, mirroring the "resolution happens at the merged level"
//     stance of ADR-1381.
// ---------------------------------------------------------------------------

import type {
  Diagnostic,
  FacetBlock,
  KrsFile,
  KrsNode,
  OrganizationBlock,
  TeamNode,
} from "../types/ast.js";

export function validateOwnsReferences(
  organizations: OrganizationBlock[],
  nodePathIndex: Map<string, string[]>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const check = (teams: TeamNode[]): void => {
    for (const team of teams) {
      for (const ownedId of team.properties.owns) {
        if (!nodePathIndex.has(ownedId)) {
          diagnostics.push({
            severity: "warning",
            code: "owns-target-not-found",
            params: { ownedId },
            loc: team.loc,
          });
        }
      }
      check(team.children.filter((c): c is TeamNode => c.kind === "team"));
    }
  };
  for (const org of organizations) {
    check(org.teams);
  }
  return diagnostics;
}

// A `boundary` may `contains` any declared node (P2a member scope = all node
// kinds), so — unlike `owns` — there is no kind restriction and thus no
// `invalid-contains`; only existence is checked. This is why we validate
// against *all* declared node ids rather than nodePathIndex, which
// intentionally excludes user / resource / usecase (TPL-1720: the
// valid-target set must enumerate every kind the construct accepts). Only
// system nodes themselves are excluded — a boundary groups nodes *within* a
// system, not systems.
export function validateContainsReferences(file: KrsFile): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const declaredIds = collectContainableIds(file);
  for (const boundary of file.boundaries) {
    for (const memberId of boundary.contains) {
      if (!declaredIds.has(memberId)) {
        diagnostics.push({
          severity: "warning",
          code: "contains-target-not-found",
          params: { memberId },
          loc: boundary.loc,
        });
      }
    }
  }
  return diagnostics;
}

/**
 * Validate `contains` inside *scoped* `boundary` blocks (#2036).
 *
 * The valid target set is narrower than for top-level blocks: a scoped boundary
 * frames the canvas it is written on, so its members are the declaring node's
 * direct children and nothing else. Reporting is what keeps the form honest —
 * without it a member naming a grandchild (or a typo) would simply not be
 * indexed and would vanish without a word (TPL-1503).
 */
export function validateScopedContainsReferences(roots: readonly KrsNode[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const walk = (node: KrsNode): void => {
    if (node.boundaries !== undefined && node.boundaries.length > 0) {
      const childIds = new Set(node.children.map((child) => child.id));
      for (const boundary of node.boundaries) {
        for (const memberId of boundary.contains) {
          if (!childIds.has(memberId)) {
            diagnostics.push({
              severity: "warning",
              code: "contains-target-not-found",
              params: { memberId },
              loc: boundary.loc,
            });
          }
        }
      }
    }
    for (const child of node.children) walk(child);
  };

  for (const root of roots) walk(root);
  return diagnostics;
}

/**
 * `facet` declarations must be uniquely named: a `facets <id>` reference names
 * one declaration, and two declarations of the same id give it two different
 * labels / descriptions to mean (#2065 Part B).
 *
 * Evaluated on the **merged** declaration list, like every other check whose
 * verdict a second file can change (TPL-20260718-02) — here the direction is the
 * opposite of a reference check: per-file evaluation would never false-positive,
 * it would miss the cross-file duplicate entirely. The ImportResolver therefore
 * suppresses the per-file result and re-runs this against the merged file.
 *
 * The *first* declaration is the one that stays addressable, so the diagnostic
 * points at each later re-declaration.
 */
export function validateFacetDeclarations(facets: readonly FacetBlock[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const facet of facets) {
    if (seen.has(facet.id)) {
      diagnostics.push({
        severity: "error",
        code: "duplicate-facet-id",
        params: { facetId: facet.id },
        loc: facet.loc,
      });
      continue;
    }
    seen.add(facet.id);
  }
  return diagnostics;
}

/**
 * Build the node id → facet ids map from the element-side `facets` property.
 *
 * **Every declared membership is kept.** The map is 1:N because multi-membership
 * is a normal state — an `entity` can be both PII and PCI scope — and because a
 * downstream view that can only paint one value per node must resolve that
 * itself rather than have the model layer decide for it (TPL-20260730-01).
 * Nodes without the property never enter the map.
 */
export function buildFacetIndex(roots: readonly KrsNode[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  const walk = (node: KrsNode): void => {
    if (node.facets !== undefined && node.facets.length > 0) {
      let memberships = index.get(node.id);
      if (memberships === undefined) {
        memberships = new Set<string>();
        index.set(node.id, memberships);
      }
      for (const facetId of node.facets) memberships.add(facetId);
    }
    for (const child of node.children) walk(child);
  };

  for (const root of roots) walk(root);
  return index;
}

// Every declared node id that a `boundary` may legitimately contain: all node
// kinds nested anywhere in a system, plus top-level services / clients /
// domains / infra and their descendants. System container ids are excluded
// (a boundary groups nodes *inside* a system).
function collectContainableIds(file: KrsFile): Set<string> {
  const ids = new Set<string>();
  const walk = (nodes: readonly KrsNode[]): void => {
    for (const node of nodes) {
      ids.add(node.id);
      walk(node.children);
    }
  };
  for (const system of file.systems) {
    walk(system.children);
  }
  walk(file.services);
  walk(file.clients);
  walk(file.domains);
  walk(file.databases);
  walk(file.queues);
  walk(file.storages);
  return ids;
}
