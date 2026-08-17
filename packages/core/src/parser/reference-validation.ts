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
//
// Both take the whole `KrsFile` and derive their valid-target set from its
// **tree**. Reading a pre-built index instead leaves the check depending on which
// merge path carried that index: `owns` consulted `nodePathIndex`, which only
// travels across a wildcard import, so a named import warned where `import "…"`
// resolved (#2082).
// ---------------------------------------------------------------------------

import type {
  Diagnostic,
  BoundaryBlock,
  EntityNode,
  FacetBlock,
  KrsFile,
  KrsNode,
  ResourceNode,
  TeamNode,
} from "../types/ast.js";
import { boundaryScopeKey } from "../types/ast.js";
import { indexDeclaredInfra } from "../spec/infra-index.js";

/**
 * Every id that names a declared node, at any depth, from every top-level bucket.
 * `includeSystemIds` is the one axis the two consumers differ on, and it is the
 * whole reason this is one walk rather than two: node ids are unique only among
 * siblings (ADR-927), so a set built by walking and then deleting system ids
 * would also delete a same-named service somewhere else.
 */
function collectDeclaredIds(file: KrsFile, includeSystemIds: boolean): Set<string> {
  const ids = new Set<string>();
  const walk = (nodes: readonly KrsNode[]): void => {
    for (const node of nodes) {
      ids.add(node.id);
      walk(node.children);
    }
  };
  for (const system of file.systems) {
    if (includeSystemIds) ids.add(system.id);
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

/**
 * Every id a `team … owns` may name — **any declared node**, systems included.
 *
 * Not filtered by ownable kind, which is what it used to be and what made it
 * answer "no such *ownable* node" with an existence code: a declared `user` or
 * `entity` was absent from the set, so `owns U` drew "not found" from here *and*
 * "cannot be owned" from `invalid-owns`, two codes for one line (#2442). The
 * existence question is only "is there a node with this id"; whether its kind may
 * be owned is `invalid-owns`' sentence, and it is the one that names the kind.
 *
 * Systems are in the set even though a team cannot own one, so that
 * `owns <systemId>` reads as the kind refusal it is rather than as a claim that
 * the system does not exist. `contains` excludes them for its own reason — a
 * `boundary` groups nodes *within* a system.
 *
 * Derived from the (merged) tree rather than from `nodePathIndex`, which is built
 * per file and only travels across a wildcard import: `mergeNamedImport` merges
 * the node but never its index entry, so `owns` on a named-imported service
 * warned while the identical declaration reached through `import "…"` resolved
 * (#2082). Re-deriving after the merge is not enough on its own — the space
 * re-derived against has to be the merged tree too (TPL-2032).
 */
function collectOwnsResolvableIds(file: KrsFile): Set<string> {
  return collectDeclaredIds(file, true);
}

/**
 * `owns` existence check. Takes the whole file (like
 * {@link validateContainsReferences}) so the Parser and the ImportResolver
 * cannot end up consulting two different id-spaces — the two call sites
 * disagreeing on the space is exactly how #2082 happened.
 *
 * Returns nothing for a file that still has imports to resolve. This diagnostic
 * is import-coupled: the id may be declared in a file this one pulls in, so a
 * document read on its own cannot decide it, and the answer it would give is a
 * false positive (the LSP surfaces parse diagnostics verbatim — TPL-1522, same
 * side as `unresolved-edge-endpoint`). Project mode is unaffected: the merged
 * `KrsFile` the ImportResolver validates carries no `nodeImports`, so it is
 * always decided there, against the merged tree.
 *
 * `validateContainsReferences` below takes the same guard, and `detectInvalidOwns`
 * in the resolver reaches the same place by reporting only targets that resolve
 * (#2410). TPL-1522 carries the ledger of which diagnostic took which route.
 */
export function validateOwnsReferences(file: KrsFile): Diagnostic[] {
  if (file.organizations.length === 0 || file.nodeImports.length > 0) return [];
  const declaredIds = collectOwnsResolvableIds(file);
  // A model with no node at all says nothing about whether its `owns` lines are
  // wrong: that is the org-only file (a `teams.krs` parsed on its own, or opened
  // directly as the project entry), where every id is declared elsewhere. Kept
  // from the pre-#2032 behaviour deliberately.
  if (declaredIds.size === 0) return [];

  const diagnostics: Diagnostic[] = [];
  const check = (teams: TeamNode[]): void => {
    for (const team of teams) {
      for (const ownedId of team.properties.owns) {
        if (!declaredIds.has(ownedId)) {
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
  for (const org of file.organizations) {
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
  // Import-coupled, exactly like `owns` next door (#2410): the member may be
  // declared in a file this one imports, so a document read on its own cannot
  // decide it and would only produce false positives. Project mode is
  // unaffected — the merged `KrsFile` carries no `nodeImports`.
  if (file.nodeImports.length > 0) return [];

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
 *
 * Takes the file rather than a roots array so the import guard below lives in one
 * place: both callers built the identical seven-bucket array, and a guard at each
 * call site is how the two ends of a check drift apart (#2082). Import-coupled
 * for a subtler reason than the top-level form — a cross-file `system` reopen can
 * add the very child a scoped `contains` names, so the declaring node's child set
 * is not final until the merge (#2410).
 */
export function validateScopedContainsReferences(file: KrsFile): Diagnostic[] {
  if (file.nodeImports.length > 0) return [];

  const diagnostics: Diagnostic[] = [];
  const roots: readonly KrsNode[] = [
    ...file.systems,
    ...file.services,
    ...file.clients,
    ...file.domains,
    ...file.databases,
    ...file.queues,
    ...file.storages,
  ];

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

  const infra = indexDeclaredInfra([
    ...file.systems,
    ...file.services,
    ...file.clients,
    ...file.domains,
    ...file.databases,
    ...file.queues,
    ...file.storages,
  ]);

  const diagnostics: Diagnostic[] = [];

  /** Which half is missing decides the repair, so it is reported, not implied. */
  const missingPart = (infraId: string, subId: string): "block" | "leaf" | undefined => {
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
        const missing = missingPart(res.ref.parent, res.ref.child);
        if (missing) {
          diagnostics.push({
            severity: "warning",
            code: "unresolved-resource-ref",
            params: { infraId: res.ref.parent, subId: res.ref.child, missing },
            loc: res.loc,
          });
        }
      }
    } else if (node.kind === "entity") {
      const entity = node as EntityNode;
      if (entity.tableRef && !entity.tags.includes("external")) {
        const missing = missingPart(entity.tableRef.parent, entity.tableRef.child);
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

/**
 * `facet` declarations must be uniquely named: a `facets <id>` reference names
 * one declaration, and two declarations of the same id give it two different
 * labels / descriptions to mean (#2065 Part B).
 *
 * Evaluated on the **merged** declaration list, like every other check whose
 * verdict a second file can change (TPL-2032) — here the direction is the
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
 * itself rather than have the model layer decide for it (TPL-2161).
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
  return collectDeclaredIds(file, false);
}

// ---------------------------------------------------------------------------
// Boundary membership builders (#2178, #2221).
//
// Pure like the validators above, and for the same reason: the answer depends
// on which model you ask. A node listed in `boundary p` in one file and
// `boundary q` in another belongs to both — but neither file can see that, so
// the per-file build reports nothing (TPL-2221). The Parser builds against the
// file it just parsed; the ImportResolver rebuilds against the merged model and
// its diagnostics are the ones a project-mode user sees.
// ---------------------------------------------------------------------------

/** A membership index plus the diagnostics building it produced. */
interface MembershipResult<T> {
  membership: T;
  diagnostics: Diagnostic[];
}
// Build the 1:N boundaryMembership (node id → every declared boundary id, in
// declaration order), the P2b analogue of buildOwnerIndex (#2178).
//
// Nothing declared is dropped: a node listed in three boundaries gets three
// entries, and the view that can only draw one band picks the primary at
// placement time (`primaryBoundaryOf`) — TPL-2161. Re-listing the *same*
// boundary is idempotent rather than an extra entry, so the merge paths can
// union without growing duplicates.
//
// The info diagnostic states the model fact — this node belongs to more than
// one boundary — and says nothing about how a view resolves it (TPL-1386);
// the resolution rule lives in docs/spec/syntax.md. It fires once per
// *additional distinct* boundary, so re-listing one boundary stays silent:
// "belongs to more than one" would not be true there.
export function buildBoundaryMembership(
  boundaries: readonly BoundaryBlock[],
): MembershipResult<Map<string, string[]>> {
  const diagnostics: Diagnostic[] = [];
  const membership = new Map<string, string[]>();
  for (const boundary of boundaries) {
    for (const memberId of boundary.contains) {
      const declared = membership.get(memberId);
      if (declared === undefined) {
        membership.set(memberId, [boundary.id]);
        continue;
      }
      if (declared.includes(boundary.id)) continue;
      diagnostics.push({
        severity: "info",
        code: "duplicate-boundary-assignment",
        params: { nodeId: memberId, existingBoundary: declared[0] },
        loc: boundary.loc,
      });
      declared.push(boundary.id);
    }
  }
  return { membership, diagnostics };
}

/**
 * Build the scope-keyed membership map for `boundary` blocks declared inside
 * node blocks (#2036), the scoped counterpart of {@link buildBoundaryMembership}
 * — and 1:N for the same reason (#2178).
 *
 * The key carries the declaring scope because node ids are unique only among
 * siblings, so `nodeId` alone does not identify a node (TPL-1352).
 *
 * Members resolve against the scope's **direct children** only. That is both
 * the set sibling-uniqueness makes unambiguous — the whole reason this form
 * avoids the top-level ambiguity of #2036 — and the set drawn as top-level
 * nodes on that scope's canvas. A `contains` naming anything else is left
 * unindexed and reported by reference validation, never silently framed.
 */
export function buildScopedBoundaryMembership(
  roots: readonly KrsNode[],
): MembershipResult<Map<string, Map<string, string[]>>> {
  const diagnostics: Diagnostic[] = [];
  const index = new Map<string, Map<string, string[]>>();

  const walk = (node: KrsNode, ancestorIds: string[]): void => {
    const scopePath = [...ancestorIds, node.id];
    if (node.boundaries !== undefined && node.boundaries.length > 0) {
      const childIds = new Set(node.children.map((child) => child.id));
      const membership = new Map<string, string[]>();
      const declaredIds = new Set<string>();

      for (const boundary of node.boundaries) {
        // Same id twice in one scope: the two blocks are indistinguishable,
        // so the second cannot be addressed. Top-level blocks keep their
        // existing merge behaviour (ADR-1974) — only the scoped form is
        // constrained, matching the compatibility rule for the new syntax.
        if (declaredIds.has(boundary.id)) {
          diagnostics.push({
            severity: "error",
            code: "duplicate-boundary-id",
            params: { boundaryId: boundary.id },
            loc: boundary.loc,
          });
          continue;
        }
        declaredIds.add(boundary.id);

        for (const memberId of boundary.contains) {
          if (!childIds.has(memberId)) continue;
          const declared = membership.get(memberId);
          if (declared === undefined) {
            membership.set(memberId, [boundary.id]);
            continue;
          }
          // Multi-membership within one scope: keep both, report the fact
          // (same register as the top-level form, #2178). A repeat of the
          // same boundary is idempotent — `duplicate-boundary-id` above
          // already rejects a second block with this id, so this only
          // catches `contains X` twice inside one block.
          if (declared.includes(boundary.id)) continue;
          diagnostics.push({
            severity: "info",
            code: "duplicate-boundary-assignment",
            params: { nodeId: memberId, existingBoundary: declared[0] },
            loc: boundary.loc,
          });
          declared.push(boundary.id);
        }
      }

      if (membership.size > 0) {
        index.set(boundaryScopeKey(scopePath), membership);
      }
    }

    for (const child of node.children) {
      walk(child, scopePath);
    }
  };

  for (const root of roots) {
    walk(root, []);
  }
  return { membership: index, diagnostics };
}
