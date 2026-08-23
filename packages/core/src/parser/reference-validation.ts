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
  EntityNode,
  FacetBlock,
  KrsFile,
  KrsNode,
  NodeIdPath,
  ResourceNode,
  TeamNode,
} from "../types/ast.js";
import { boundaryScopeKey } from "../types/ast.js";
import {
  ambiguousNodePathCandidates,
  nodePathKey,
  nodePathMatchesSuffix,
  resolveNodePathBySuffix,
} from "./node-path.js";
import { indexDeclaredInfra } from "../spec/infra-index.js";

// Migration-coexistence priority for picking the single winner of a 1:1 index
// when a node is reachable from more than one place during an inverse-Conway
// handoff. The destination (@migration_target) wins, the source (@deprecated)
// loses, and an unmarked entry sits in between. Shared by buildNodePathIndex
// (any indexed candidate → nodePathIndex, parser.ts, since #2550) and
// buildOwnerIndex below (team → ownerIndex) so both 1:1 indices resolve
// duplicates the same way. Ties keep the first occurrence.
export function migrationPriority(annotations: readonly string[]): number {
  return annotations.includes("migration_target") ? 2 : annotations.includes("deprecated") ? 0 : 1;
}

/** One declared node, addressable by its full path (#2088). */
export interface DeclaredNodePath {
  kind: KrsNode["kind"] | "system";
  path: NodeIdPath;
}

/**
 * Every declared node, keyed by its id (the last path segment), each entry
 * carrying the node's kind and full path. Insertion order is declaration
 * order, which downstream winner selection relies on.
 *
 * One walk over every top-level bucket, systems always included and tagged
 * `kind: "system"` — the two reference sites differ only in whether a system
 * itself is a legal target, and they filter at resolution time. Splitting
 * the walk per consumer is how the two ends of a check drift apart
 * (ADR-2442; node ids are unique only among siblings, so a set built by
 * walking and then deleting system ids would also delete a same-named
 * service somewhere else).
 *
 * `owns` keeps systems in its resolution pool even though a team cannot own
 * one, so that `owns <systemId>` reads as the kind refusal it is
 * (`invalid-owns`) rather than as a claim that the system does not exist
 * (#2442). `contains` excludes them for its own reason — a `boundary`
 * groups nodes *within* a system.
 *
 * Derived from the (merged) tree rather than from `nodePathIndex`, which is
 * built per file and only travels across a wildcard import (#2082 /
 * TPL-2032).
 */
export function collectDeclaredNodePaths(file: KrsFile): Map<string, DeclaredNodePath[]> {
  const index = new Map<string, DeclaredNodePath[]>();
  const add = (entry: DeclaredNodePath): void => {
    const id = entry.path[entry.path.length - 1];
    const entries = index.get(id);
    if (entries === undefined) {
      index.set(id, [entry]);
    } else {
      entries.push(entry);
    }
  };
  const walk = (nodes: readonly KrsNode[], prefix: NodeIdPath): void => {
    for (const node of nodes) {
      const path = [...prefix, node.id];
      add({ kind: node.kind, path });
      walk(node.children, path);
    }
  };
  for (const system of file.systems) {
    add({ kind: "system", path: [system.id] });
    walk(system.children, [system.id]);
  }
  walk(file.services, []);
  walk(file.clients, []);
  walk(file.domains, []);
  walk(file.databases, []);
  walk(file.queues, []);
  walk(file.storages, []);
  return index;
}

/**
 * Resolve one reference against the declared-node multimap by the suffix
 * rule (#2088): candidates are the nodes whose id equals the ref's last
 * segment, narrowed to those whose full path ends with the ref. Bare id =
 * length-1 suffix = every node with that id (broadcast preserved).
 */
export function resolveDeclaredRef(
  declared: Map<string, DeclaredNodePath[]>,
  ref: NodeIdPath,
  opts?: { excludeSystems?: boolean },
): DeclaredNodePath[] {
  const candidates = declared.get(ref[ref.length - 1]) ?? [];
  const pool =
    opts?.excludeSystems === true ? candidates.filter((c) => c.kind !== "system") : candidates;
  return resolveNodePathBySuffix(ref, pool);
}

/** Shared shape of the two `*-target-ambiguous` param payloads. */
function ambiguityParams(
  ref: NodeIdPath,
  matches: readonly DeclaredNodePath[],
): { path: string; candidates: Array<{ kind: string; path: string }> } {
  return {
    path: nodePathKey(ref),
    candidates: matches.map((m) => ({ kind: m.kind, path: nodePathKey(m.path) })),
  };
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
  const declared = collectDeclaredNodePaths(file);
  // A model with no node at all says nothing about whether its `owns` lines are
  // wrong: that is the org-only file (a `teams.krs` parsed on its own, or opened
  // directly as the project entry), where every id is declared elsewhere. Kept
  // from the pre-#2032 behaviour deliberately.
  if (declared.size === 0) return [];

  const diagnostics: Diagnostic[] = [];
  const check = (teams: TeamNode[]): void => {
    for (const team of teams) {
      for (const ref of team.properties.owns) {
        const matches = resolveDeclaredRef(declared, ref);
        if (matches.length === 0) {
          diagnostics.push({
            severity: "warning",
            code: "owns-target-not-found",
            params: { ownedId: nodePathKey(ref) },
            loc: team.loc,
          });
          continue;
        }
        // Multi-match: silent when uniform in (kind, depth) — intentional
        // broadcast (migration coexistence, multi-tenant) — and reported as
        // ambiguity otherwise, listing the candidate full paths the author
        // can qualify with (#2088).
        const ambiguous = ambiguousNodePathCandidates(matches);
        if (ambiguous !== undefined) {
          diagnostics.push({
            severity: "warning",
            code: "owns-target-ambiguous",
            params: ambiguityParams(ref, ambiguous),
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
  const declared = collectDeclaredNodePaths(file);
  for (const boundary of file.boundaries) {
    for (const ref of boundary.contains) {
      const matches = resolveDeclaredRef(declared, ref, { excludeSystems: true });
      if (matches.length === 0) {
        diagnostics.push({
          severity: "warning",
          code: "contains-target-not-found",
          params: { memberId: nodePathKey(ref) },
          loc: boundary.loc,
        });
        continue;
      }
      // Same ambiguity rule as `owns` above (#2088).
      const ambiguous = ambiguousNodePathCandidates(matches);
      if (ambiguous !== undefined) {
        diagnostics.push({
          severity: "warning",
          code: "contains-target-ambiguous",
          params: ambiguityParams(ref, ambiguous),
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

  const walk = (node: KrsNode, ancestorIds: NodeIdPath): void => {
    const scopePath = [...ancestorIds, node.id];
    if (node.boundaries !== undefined && node.boundaries.length > 0) {
      // A member ref matches a direct child by the same suffix rule as the
      // top-level form (#2088): the child's full path is the scope path plus
      // its id, so `contains Payment` and `contains Shop.Payment` name the
      // same child of `Shop`. Sibling uniqueness keeps this unambiguous.
      const childPaths = node.children.map((child) => [...scopePath, child.id]);
      for (const boundary of node.boundaries) {
        for (const ref of boundary.contains) {
          if (!childPaths.some((path) => nodePathMatchesSuffix(ref, path))) {
            diagnostics.push({
              severity: "warning",
              code: "contains-target-not-found",
              params: { memberId: nodePathKey(ref) },
              loc: boundary.loc,
            });
          }
        }
      }
    }
    for (const child of node.children) walk(child, scopePath);
  };

  for (const root of roots) walk(root, []);
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

// ---------------------------------------------------------------------------
// Ownership / boundary membership builders (#2178, #2221, #2548).
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

/**
 * Build the 1:1 ownerIndex, keyed by each owned node's **full path**
 * (`nodePathKey`) since #2548 — a path-accepting reference needs a
 * path-keyed index (TPL-1352). Every `owns` ref is expanded through the
 * suffix rule at build time: a bare id claims every node with that id
 * (broadcast, structurally identical to the old bare-id keying), a longer
 * path narrows to exactly the nodes it suffixes. Refs that resolve to
 * nothing add no entry — `owns-target-not-found` is the surface for those.
 *
 * Co-ownership is a structural fact, not an integrity error: an
 * inverse-Conway handoff legitimately has two teams own a node
 * mid-migration. Surface it in the fact-vs-style register (info), like
 * domain-dispersal (ADR-1566). ownerIndex is 1:1, so a single primary owner
 * must be chosen per node: the @migration_target team wins, mirroring
 * buildNodePathIndex's candidate rule; ties keep the first declaration
 * (#1583). The info fires once per conflicting *ref* (not per expanded
 * node) and names the resolved primary after any swap; a team re-claiming a
 * node it already owns (bare + qualified forms of the same node) is
 * idempotent and silent.
 */
export function buildOwnerIndex(file: KrsFile): MembershipResult<Map<string, string>> {
  const diagnostics: Diagnostic[] = [];
  const index = new Map<string, string>();
  // Priority of the team currently stored as the primary owner of each node,
  // so a later @migration_target team can take over the 1:1 ownerIndex slot.
  const priority = new Map<string, number>();
  const declared = collectDeclaredNodePaths(file);

  const indexTeams = (teams: TeamNode[]): void => {
    for (const team of teams) {
      const teamPriority = migrationPriority(team.annotations);
      for (const ref of team.properties.owns) {
        const matches = resolveDeclaredRef(declared, ref);
        // An unresolved ref still records its claim, keyed by the ref as
        // written: an org-only file (or a pre-merge parse) has no tree to
        // resolve against, and a declared fact must not vanish from the
        // derived index (TPL-2161) — co-ownership and migration-priority
        // resolution stay observable there. `owns-target-not-found` is the
        // surface that reports it in files that can decide existence.
        const keys =
          matches.length > 0 ? matches.map((m) => nodePathKey(m.path)) : [nodePathKey(ref)];
        let existingTeam: string | undefined;
        for (const key of keys) {
          const current = index.get(key);
          if (current === undefined) {
            index.set(key, team.id);
            priority.set(key, teamPriority);
            continue;
          }
          if (current === team.id) continue;
          if (teamPriority > priority.get(key)!) {
            index.set(key, team.id);
            priority.set(key, teamPriority);
          }
          existingTeam ??= index.get(key)!;
        }
        if (existingTeam !== undefined) {
          diagnostics.push({
            severity: "info",
            code: "duplicate-owner-assignment",
            params: { nodeId: nodePathKey(ref), existingTeam },
            loc: team.loc,
          });
        }
      }
      indexTeams(team.children.filter((c): c is TeamNode => c.kind === "team"));
    }
  };
  for (const org of file.organizations) {
    indexTeams(org.teams);
  }
  return { membership: index, diagnostics };
}

// Build the 1:N boundaryMembership — since #2548 keyed by each member
// node's **full path** (`nodePathKey`), with every `contains` ref expanded
// through the suffix rule exactly like buildOwnerIndex above (bare id =
// broadcast; unresolved refs add no entry and are `contains-target-not-found`'s
// surface).
//
// Nothing declared is dropped: a node listed in three boundaries gets three
// entries, and the view that can only draw one band picks the primary at
// placement time (`primaryBoundaryOf`) — TPL-2161. Re-listing the *same*
// boundary is idempotent rather than an extra entry.
//
// The info diagnostic states the model fact — this node belongs to more than
// one boundary — and says nothing about how a view resolves it (TPL-1386);
// the resolution rule lives in docs/spec/syntax.md. It fires once per
// *additional distinct* boundary per conflicting ref, so re-listing one
// boundary stays silent: "belongs to more than one" would not be true there.
export function buildBoundaryMembership(file: KrsFile): MembershipResult<Map<string, string[]>> {
  const diagnostics: Diagnostic[] = [];
  const membership = new Map<string, string[]>();
  const declared = collectDeclaredNodePaths(file);
  for (const boundary of file.boundaries) {
    for (const ref of boundary.contains) {
      const matches = resolveDeclaredRef(declared, ref, { excludeSystems: true });
      // Unresolved refs keep their claim under the ref as written, exactly
      // like buildOwnerIndex above (TPL-2161): a member declared in a file
      // this one cannot see must survive until the merged rebuild decides.
      const keys =
        matches.length > 0 ? matches.map((m) => nodePathKey(m.path)) : [nodePathKey(ref)];
      let existingBoundary: string | undefined;
      for (const key of keys) {
        const declaredList = membership.get(key);
        if (declaredList === undefined) {
          membership.set(key, [boundary.id]);
          continue;
        }
        if (declaredList.includes(boundary.id)) continue;
        existingBoundary ??= declaredList[0];
        declaredList.push(boundary.id);
      }
      if (existingBoundary !== undefined) {
        diagnostics.push({
          severity: "info",
          code: "duplicate-boundary-assignment",
          params: { nodeId: nodePathKey(ref), existingBoundary },
          loc: boundary.loc,
        });
      }
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
      // Member refs resolve against direct children by the suffix rule
      // (#2088): a matched ref normalizes to the child's bare id, which
      // stays the membership key — the scope key already carries the path
      // dimension (TPL-1352), and sibling uniqueness makes a multi-match
      // impossible.
      const children = node.children.map((child) => ({
        id: child.id,
        path: [...scopePath, child.id],
      }));
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

        for (const ref of boundary.contains) {
          const match = children.find((child) => nodePathMatchesSuffix(ref, child.path));
          if (match === undefined) continue;
          const memberId = match.id;
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
