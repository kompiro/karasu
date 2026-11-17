// Existence and target checks for the physical dot-notation references, kept
// apart from `reference-validation.ts` (which re-exports it) so that file stays
// inside its line budget. Same merged-space contract as its neighbours there:
// the single-file Parser runs it on the parsed file, and the ImportResolver
// re-runs it on the merged one.

import type { Diagnostic, EntityNode, KrsFile, KrsNode, ResourceNode } from "../types/ast.js";
import {
  indexPhysicalTargets,
  physicalTargetRoots,
  resolvePhysicalRef,
} from "../spec/infra-index.js";

/**
 * Existence check for the two **physical** dot-notation references: a usecase's
 * `resource <Infra>.<Leaf>` and an entity's `table <Infra>.<Leaf>` (#2078).
 *
 * These were the last cross-reference forms with no resolver-side validation
 * (TPL-907). The asymmetry was the tell: a bare `resource Order` that resolves
 * to nothing draws `unassigned-resource`, while the dotted form was taken as
 * resolved on sight — `buildEntityResolver` returns `resource.ref` verbatim
 * without asking whether anything declares it. So a model could reference 35
 * tables of a `database` block that had been deleted outright and render clean,
 * which is exactly how a reverse-engineering merge silently dropped its whole
 * physical layer (#1991).
 *
 * Import-coupled like its neighbours: the block may be declared in a file this
 * one imports — the canonical layout for shared infra is a dedicated file every
 * slice imports (syntax spec §S4.5) — so a single document cannot decide it.
 *
 * **There is deliberately no "no infra declared at all, so say nothing" guard**,
 * unlike `validateOwnsReferences` above. For `owns` an empty model means an
 * org-only file whose targets live elsewhere; here it is the primary failure
 * being detected — the merged model that lost its `database` block declares no
 * infra at all, and a guard would suppress precisely the case this exists for.
 */
export function validatePhysicalRefs(file: KrsFile): Diagnostic[] {
  if (file.nodeImports.length > 0) return [];

  // One index of every `<Parent>.<Child>` target, infra leaves and client
  // storages alike, read through the one resolver (#3794, TPL-1720).
  const targets = indexPhysicalTargets(physicalTargetRoots(file));
  const infra = targets.infra;

  const diagnostics: Diagnostic[] = [];

  /**
   * Which half of an entity's `table X.Y` is missing. A table maps to an infra
   * leaf only: a client's storage is not a table, so `table WebApp.ApiKey`
   * stays unresolved even when the client declares `ApiKey` (#3794).
   */
  const missingTablePart = (infraId: string, subId: string): "block" | "leaf" | undefined => {
    const block = infra.get(infraId);
    if (block === undefined) return "block";
    if (!block.leaves.has(subId)) return "leaf";
    return undefined;
  };

  const walk = (node: KrsNode): void => {
    if (node.kind === "resource") {
      const res = node as ResourceNode;
      // `[external]` marks a store deliberately left outside the model — the
      // same escape hatch `unassigned-resource` honours.
      if (res.ref && !res.tags.includes("external")) {
        const { parent, child } = res.ref;
        const target = resolvePhysicalRef(targets, parent, child);
        if (
          target.kind === "infra"
            ? target.shadowsClient
            : target.kind === "unresolved" && (target.shadowsClient || target.ambiguous)
        ) {
          diagnostics.push({
            severity: "warning",
            code: "resource-target-ambiguous",
            params: {
              ref: `${parent}.${child}`,
              reason:
                target.kind === "unresolved" && target.ambiguous
                  ? "multiple-clients"
                  : "infra-and-client",
            },
            loc: res.loc,
          });
        }
        if (target.kind === "unresolved" && !target.ambiguous) {
          diagnostics.push({
            severity: "warning",
            code: "unresolved-resource-ref",
            params: {
              infraId: parent,
              subId: child,
              missing: target.missing,
              ...(target.parentKind !== undefined ? { parentKind: target.parentKind } : {}),
            },
            loc: res.loc,
          });
        }
      }
    } else if (node.kind === "entity") {
      const entity = node as EntityNode;
      if (entity.tableRef && !entity.tags.includes("external")) {
        const missing = missingTablePart(entity.tableRef.parent, entity.tableRef.child);
        if (missing) {
          diagnostics.push({
            severity: "warning",
            code: "unresolved-table-ref",
            params: {
              entityId: entity.id,
              infraId: entity.tableRef.parent,
              subId: entity.tableRef.child,
              missing,
            },
            loc: entity.loc,
          });
        }
      }
    }
    for (const child of node.children) walk(child);
  };

  for (const root of [
    ...file.systems,
    ...file.services,
    ...file.clients,
    ...file.domains,
  ] as readonly KrsNode[]) {
    walk(root);
  }
  return diagnostics;
}
