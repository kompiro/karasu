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
//     stance of ADR-20260514-01.
// ---------------------------------------------------------------------------

import type { Diagnostic, KrsFile, KrsNode, OrganizationBlock, TeamNode } from "../types/ast.js";

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
// intentionally excludes user / resource / usecase (TPL-20260623-02: the
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
