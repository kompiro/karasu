import type { KrsFile, KrsNode, DeployBlock } from "../types/ast.js";
import {
  validateOwnsReferences,
  validateContainsReferences,
  validateScopedContainsReferences,
  validateRealizesReferences,
  declaredNodePathsOnce,
  validatePhysicalRefs,
  validateFacetDeclarations,
  buildFacetIndexByPath,
  facetUnionByBareId,
  buildOwnerIndex,
  buildBoundaryMembership,
  buildScopedBoundaryMembership,
  buildNodePathIndex,
} from "./reference-validation.js";
import { markCyclicEdges } from "./cyclic-dependencies.js";
import type { ParseContext } from "./parse-context.js";

/**
 * The pass `Parser.parseFile` runs once every declaration is read: build the
 * file's indexes (owners, boundary membership, facets, node paths, cyclic
 * edges) onto `file`, then run the per-file duplicate-id and reference checks.
 * Every verdict goes through `ctx.pushDiagnostic`, after the declarations'
 * own diagnostics and in the order the checks run (#3441).
 */
export function finalizeFile(ctx: ParseContext, file: KrsFile): void {
  const ownerResult = buildOwnerIndex(file);
  file.ownerIndex = ownerResult.membership;
  ctx.pushDiagnostic(...ownerResult.diagnostics);
  const topLevelMembership = buildBoundaryMembership(file);
  file.boundaryMembership = topLevelMembership.membership;
  ctx.pushDiagnostic(...topLevelMembership.diagnostics);
  // A sync dependency cycle is a fact about the model, so it is derived here
  // with the other indexes rather than stamped later by `analyze()`: a read
  // pass that wrote the flag made the same `KrsFile` render differently
  // before and after it ran (#2791, TPL-2791). The ImportResolver re-derives
  // it on the merged model, where a cycle split across files appears.
  markCyclicEdges(file);
  const scopedMembership = buildScopedBoundaryMembership([
    ...file.systems,
    ...file.services,
    ...file.clients,
    ...file.domains,
    ...file.databases,
    ...file.queues,
    ...file.storages,
  ]);
  // Same root set as the scoped-boundary walk: `facets` is accepted on every
  // node kind, so the index must reach top-level orphans (a system-less
  // `service` / `client` / `domain` / infra block) and their descendants, not
  // just what hangs off a `system` (TPL-1160 / TPL-1720).
  file.facetIndexByPath = buildFacetIndexByPath([
    ...file.systems,
    ...file.services,
    ...file.clients,
    ...file.domains,
    ...file.databases,
    ...file.queues,
    ...file.storages,
  ]);
  file.facetIndex = facetUnionByBareId(file.facetIndexByPath);
  file.scopedBoundaryMembership = scopedMembership.membership;
  ctx.pushDiagnostic(...scopedMembership.diagnostics);
  // Top-level (system-less) services get the same per-parent duplicate-child
  // check as services nested in a system, so e.g. a usecase and entity
  // sharing an id under a parked service's domain are caught.
  for (const service of file.services) {
    collectNodeIds(ctx, service.children, new Set<string>());
  }
  // Same check for top-level infra blocks. Nested ones are reached via
  // `system.children`, but a system-less `database` / `queue` / `storage`
  // otherwise never gets one — and its leaf children are exactly the members a
  // scoped `boundary` addresses (#2036), which relies on sibling ids being
  // error-unique.
  for (const infra of [...file.databases, ...file.queues, ...file.storages]) {
    collectNodeIds(ctx, infra.children, new Set<string>());
  }
  // The same check once more for the two parents the index walk used to run
  // it from, before that walk moved to `buildNodePathIndex` (#2596): a system's
  // direct children, and a top-level domain's (e.g. a usecase and an entity
  // sharing an id, symmetric with the per-service check inside systems).
  // `duplicate-node-id-parent` stays a per-file verdict — one parent's children
  // are all declared in one place — so it does not travel with the index build
  // to the merged model.
  for (const system of file.systems) {
    collectNodeIds(ctx, system.children, new Set<string>());
  }
  for (const domain of file.domains) {
    collectNodeIds(ctx, domain.children, new Set<string>());
  }
  // Deploy units get their own code rather than `duplicate-node-id-parent`
  // (#2713): `duplicate-node-in-deploy` names the block the collision is in,
  // and docs/spec/diagnostics.md states its rule with no route qualifier —
  // "A node id is duplicated within a `deploy` block". Until now the only
  // emitter was the wildcard-import merge in import-resolver.ts, so a single
  // file declaring `oci app` twice said nothing while the same collision
  // assembled across files was an error.
  for (const deploy of file.deploys) {
    collectDeployNodeIds(ctx, deploy);
  }
  // The index itself is a merge-only verdict, so it is built by the shared
  // function the ImportResolver re-runs on the merged model (#2596).
  const nodePaths = buildNodePathIndex(file);
  file.nodePathIndex = nodePaths.membership;
  file.nodePathRanking = nodePaths.ranking;
  ctx.pushDiagnostic(...nodePaths.diagnostics);
  // One declared-path walk for all the node-reference checks below: each
  // built the same O(nodes) map for itself, on the path the LSP re-runs at
  // every keystroke. Lazy, so the checks that bail on their own guard still
  // cost nothing (#2549).
  const declaredPaths = declaredNodePathsOnce(file);
  ctx.pushDiagnostic(...validateOwnsReferences(file, declaredPaths));
  if (file.boundaries.length > 0) {
    ctx.pushDiagnostic(...validateContainsReferences(file, declaredPaths));
  }
  // Scoped boundaries resolve against direct children, so they are checked
  // per scope rather than against the whole model (#2036).
  ctx.pushDiagnostic(...validateScopedContainsReferences(file));
  // Ambiguity for realizes path refs (#2088 slice C). Existence stays with
  // resolver/warnings.ts; only the ambiguity verdict lives here, on the same
  // import-coupled surface as owns / contains. `handles` has no ambiguity
  // twin, for the reason recorded in reference-validation.ts.
  ctx.pushDiagnostic(...validateRealizesReferences(file, declaredPaths));
  // A `resource` / `table` naming an infra block or leaf nothing declares
  // (#2078). Suppressed and re-derived by the ImportResolver like the checks
  // above, since the block is canonically declared in an imported infra file.
  ctx.pushDiagnostic(...validatePhysicalRefs(file));
  // Declaration uniqueness is a property of the *merged* facet namespace: two
  // files may each declare `facet pii` with different metadata, and only the
  // merge sees that. The ImportResolver suppresses this code per file and
  // re-derives it there; single-file parses (LSP, `Parser.parse`) get the same
  // verdict here (TPL-2032).
  ctx.pushDiagnostic(...validateFacetDeclarations(file.facets));
}

function collectNodeIds(ctx: ParseContext, nodes: KrsNode[], seen: Set<string>): void {
  for (const node of nodes) {
    if (seen.has(node.id)) {
      ctx.pushDiagnostic({
        severity: "error",
        code: "duplicate-node-id-parent",
        params: { nodeId: node.id },
        loc: node.loc,
      });
    } else {
      seen.add(node.id);
    }
    collectNodeIds(ctx, node.children, new Set<string>());
  }
}

/**
 * Per-file half of `duplicate-node-in-deploy` (#2713). A deploy block's units
 * are its immediate children and nothing nests below them, so this is one
 * flat pass rather than the recursive walk `collectNodeIds` does.
 *
 * The verdict is reported on the *repeat*, not on the first declaration: the
 * first spelling is the one every consumer keys, so the later one is what the
 * author has to move or rename. Nothing is dropped here — the merge path
 * drops because it has a target block to keep intact, while a parse keeps the
 * file as written and lets `placeGroupBlock` collapse what it cannot key.
 */
function collectDeployNodeIds(ctx: ParseContext, deploy: DeployBlock): void {
  const seen = new Set<string>();
  for (const node of deploy.nodes) {
    if (seen.has(node.id)) {
      ctx.pushDiagnostic({
        severity: "error",
        code: "duplicate-node-in-deploy",
        params: { nodeId: node.id, deployId: deploy.id },
        loc: node.loc,
      });
    } else {
      seen.add(node.id);
    }
  }
}
