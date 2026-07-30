import type {
  KrsNode,
  KrsEdge,
  KrsFile,
  ResourceNode,
  EntityNode,
  TeamNode,
  LegendRefTarget,
} from "../types/ast.js";
import { INFRA_KIND_SET } from "../types/ast.js";
import { isWriteOperation, isReadOperation } from "../spec/operations.js";
import type { StyleSheet, StyleSelector } from "../types/style.js";
import type { Warning } from "../types/warnings.js";
import { collectLegendUsage, legendRefHasUsage } from "../legend/usage.js";
import { buildEntityResolver } from "./resource-entity.js";
import { REFERENCE_DATA } from "../builtins/reference-data.js";

export function analyze(file: KrsFile, sheets: StyleSheet[], systemSheetCount = 1): Warning[] {
  const warnings: Warning[] = [];
  // Built once per pass: detectAnnotationPossibleTypos and
  // detectUnresolvedLegendRefs both consume the same selector index, and
  // analyze() runs per keystroke (app) / per document change (LSP).
  const stylesIndex = indexStyleSelectors(sheets);

  warnings.push(...detectDomainDispersal(file));
  warnings.push(...detectSharedInfraFanIn(file));
  warnings.push(...detectCrossDomainStoreAccess(file));
  warnings.push(...detectUnassignedDomains(file));
  warnings.push(...detectUnassignedServices(file));
  warnings.push(...detectUnassignedClients(file));
  warnings.push(...detectUnresolvedHandles(file));
  warnings.push(...detectUnassignedDatabases(file));
  warnings.push(...detectUnassignedQueues(file));
  warnings.push(...detectUnassignedStorages(file));
  warnings.push(...detectUnassignedUsecases(file));
  warnings.push(...detectUnassignedResources(file));
  warnings.push(...detectEntityAnchorCollisions(file));
  warnings.push(...detectStyleConflicts(sheets, systemSheetCount));
  warnings.push(...detectMissingProperties(file));
  warnings.push(...detectUnresolvedRealizes(file));
  warnings.push(...detectInvalidOwns(file));
  warnings.push(...detectCrossSystemRefs(file));
  warnings.push(...detectUnresolvedEdgeEndpoints(file));
  warnings.push(...detectCyclicDependencies(file));
  warnings.push(...detectDeliversTargetNotClient(file));
  warnings.push(...detectDuplicateClientCapabilities(file));
  warnings.push(...detectAnnotationPossibleTypos(file, stylesIndex));
  warnings.push(...detectTagsNotBuiltin(file));
  warnings.push(...detectAnnotationsNotBuiltin(file));
  warnings.push(...detectUnresolvedLegendRefs(file, stylesIndex));

  return warnings;
}

/**
 * Each `ref` entry in a `legend` block must resolve through the existing
 * style cascade. Emit a warning when the target is not present in any
 * node (annotations / tags / ids / kinds) or style rule selector.
 */
function detectUnresolvedLegendRefs(file: KrsFile, stylesIndex: StyleSelectorIndex): Warning[] {
  if (file.legends.length === 0) return [];

  // Single source of truth for "is this ref's target in use". The renderer
  // consumes the same helper (see legend/usage.ts and svg-builder.ts) so
  // both layers agree on what "resolved" means.
  const usage = collectLegendUsage(file);

  const warnings: Warning[] = [];
  for (const legend of file.legends) {
    for (const entry of legend.entries) {
      if (entry.kind !== "ref") continue;
      if (
        legendRefHasUsage(entry.target, usage) ||
        legendRefMatchesStyle(entry.target, stylesIndex)
      ) {
        continue;
      }
      warnings.push({
        kind: "legend-ref-unresolved",
        params: {
          target: stringifyLegendRefTarget(entry.target),
          ...(legend.title ? { legendTitle: legend.title } : {}),
        },
        loc: entry.loc,
      });
    }
  }
  return warnings;
}

interface StyleSelectorIndex {
  annotations: Set<string>;
  tags: Set<string>;
  ids: Set<string>;
  nodeTypes: Set<string>;
}

function indexStyleSelectors(sheets: StyleSheet[]): StyleSelectorIndex {
  const annotations = new Set<string>();
  const tags = new Set<string>();
  const ids = new Set<string>();
  const nodeTypes = new Set<string>();
  for (const sheet of sheets) {
    for (const rule of sheet.rules) {
      const sel: StyleSelector = rule.selector;
      if (sel.id) ids.add(sel.id);
      if (sel.nodeType) nodeTypes.add(sel.nodeType);
      for (const a of sel.annotations) annotations.add(a);
      for (const t of sel.tags) tags.add(t);
    }
  }
  return { annotations, tags, ids, nodeTypes };
}

function legendRefMatchesStyle(target: LegendRefTarget, styles: StyleSelectorIndex): boolean {
  switch (target.kind) {
    case "annotation":
      return styles.annotations.has(target.name);
    case "tag":
      return styles.tags.has(target.name);
    case "selector": {
      const sel = target.selector;
      if (sel.startsWith("#")) return styles.ids.has(sel.slice(1));
      // `.class` selectors are accepted by the parser for forward
      // compatibility, but `.krs.style` does not have CSS-style classes
      // (see docs/spec/style.md). Always unresolved for now.
      if (sel.startsWith(".")) return false;
      // Bare type selector (`service`, `domain`, etc.).
      return styles.nodeTypes.has(sel);
    }
  }
}

function stringifyLegendRefTarget(target: LegendRefTarget): string {
  switch (target.kind) {
    case "annotation":
      return `@${target.name}`;
    case "tag":
      return `[${target.name}]`;
    case "selector":
      return target.selector;
  }
}

function detectDeliversTargetNotClient(file: KrsFile): Warning[] {
  const clientIds = new Set<string>();
  const services: KrsNode[] = [];

  function walk(nodes: KrsNode[]): void {
    for (const node of nodes) {
      if (node.kind === "client") clientIds.add(node.id);
      if (node.kind === "service") services.push(node);
      walk(node.children);
    }
  }
  for (const system of file.systems) walk(system.children);
  walk(file.services);
  for (const client of file.clients) clientIds.add(client.id);

  const warnings: Warning[] = [];
  for (const service of services) {
    const delivers = (service as KrsNode & { properties: { delivers?: string[] } }).properties
      .delivers;
    if (!delivers) continue;
    for (const targetId of delivers) {
      if (!clientIds.has(targetId)) {
        warnings.push({
          kind: "delivers-target-not-client",
          params: { serviceId: service.id, targetId },
          loc: service.loc,
        });
      }
    }
  }
  return warnings;
}

function detectDuplicateClientCapabilities(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];
  const visit = (node: KrsNode): void => {
    if (node.kind === "client") {
      const seen = new Map<string, true>();
      for (const cap of node.properties.capabilities) {
        if (seen.has(cap.name)) {
          warnings.push({
            kind: "client-capability-duplicate",
            params: { clientId: node.id, name: cap.name },
            loc: cap.loc,
          });
        } else {
          seen.set(cap.name, true);
        }
      }
    }
    for (const child of node.children) visit(child);
  };
  for (const system of file.systems) for (const child of system.children) visit(child);
  for (const client of file.clients) visit(client);
  for (const service of file.services) visit(service);
  return warnings;
}

/**
 * Any annotation identifier still parses in v1.x (docs/spec/tags-annotations.md
 * § Non-builtin annotation names are deprecated (v1.x)). This hint surfaces a
 * *near-miss* of a built-in name — `@depracated` silently losing its badge is
 * the failure mode it exists for (#1499). Fires as `info`, never `warning`.
 *
 * A name that appears in any stylesheet annotation selector is treated as
 * intentionally user-defined and is never hinted, even when it sits close
 * to a built-in. The unconditional v1.x deprecation of non-builtin names is
 * `detectAnnotationsNotBuiltin` (#2159); both coexist during v1.x and are
 * consolidated in v2.0.
 */
function detectAnnotationPossibleTypos(file: KrsFile, stylesIndex: StyleSelectorIndex): Warning[] {
  const builtins = REFERENCE_DATA.annotations.map((a) => a.name);
  const styledAnnotations = stylesIndex.annotations;
  const warnings: Warning[] = [];

  const checkAnnotations = (annotations: string[], nodeId: string, loc: KrsNode["loc"]): void => {
    for (const annotation of annotations) {
      if (builtins.includes(annotation) || styledAnnotations.has(annotation)) continue;
      const suggestion = closestBuiltinAnnotation(annotation, builtins);
      if (suggestion !== undefined) {
        warnings.push({
          kind: "annotation-possible-typo",
          params: { nodeId, annotation, suggestion },
          loc,
        });
      }
    }
  };
  const visit = (node: KrsNode): void => {
    checkAnnotations(node.annotations, node.id, node.loc);
    for (const child of node.children) visit(child);
  };
  // `team` blocks accept the same annotation grammar (added by #1605, after
  // this hint) — walk them too so a near-miss on a team gets the same
  // suggestion it would get on a node, keeping parity with
  // `detectAnnotationsNotBuiltin` (spec: both diagnostics coexist in v1.x).
  const visitTeam = (team: TeamNode): void => {
    checkAnnotations(team.annotations, team.id, team.loc);
    for (const child of team.children) {
      if (child.kind === "team") visitTeam(child);
    }
  };

  for (const system of file.systems) visit(system);
  for (const client of file.clients) visit(client);
  for (const service of file.services) visit(service);
  for (const domain of file.domains) visit(domain);
  for (const database of file.databases) visit(database);
  for (const queue of file.queues) visit(queue);
  for (const storage of file.storages) visit(storage);
  for (const organization of file.organizations) {
    for (const team of organization.teams) visitTeam(team);
  }
  return warnings;
}

/**
 * Tags outside the tool vocabulary that are still legitimate in authored
 * source: the system-assigned tags of docs/spec/tags-annotations.md
 * § System-assigned tags. Most are synthesized after parsing and never
 * appear in `.krs` files, but `[inferred]` is stamped *into* the emitted
 * source by `translate --from db` and persists until curated away —
 * warning on these would flag the tool's own vocabulary as foreign.
 */
export const SYSTEM_ASSIGNED_TAGS = ["implicit", "cyclic", "read", "write", "inferred"];

/**
 * v1.x deprecation for tag names outside the tool vocabulary
 * (docs/design/tags-and-facets.md Part A, #2159). The name is still accepted
 * unchanged — ADR-1314 freezes bare-tag acceptance for v1.x — but syntax
 * v2.0 keeps only tool-owned tags, so every non-builtin use is warned now.
 * Unlike `annotation-possible-typo` there is deliberately **no suppression
 * condition**: a style selector or legend ref proves the name is intentional,
 * but intent does not change the v2.0 outcome, so the deprecation is
 * announced unconditionally. Resolves the TPL-1503 fourth state
 * (accepted, inert, undocumented) into state (2): warned as unknown.
 */
function detectTagsNotBuiltin(file: KrsFile): Warning[] {
  const allowed = new Set<string>([
    ...REFERENCE_DATA.tags.map((t) => t.name),
    ...SYSTEM_ASSIGNED_TAGS,
  ]);
  const warnings: Warning[] = [];

  const checkTags = (tags: string[], nodeId: string, loc: KrsNode["loc"]): void => {
    for (const tag of tags) {
      if (!allowed.has(tag)) {
        warnings.push({ kind: "tag-not-builtin", params: { nodeId, tag }, loc });
      }
    }
  };
  const visit = (node: KrsNode): void => {
    checkTags(node.tags, node.id, node.loc);
    for (const edge of node.edges) {
      checkTags(edge.tags, `${edge.from} -> ${edge.to}`, edge.loc);
    }
    for (const child of node.children) visit(child);
  };

  for (const system of file.systems) visit(system);
  for (const client of file.clients) visit(client);
  for (const service of file.services) visit(service);
  for (const domain of file.domains) visit(domain);
  for (const database of file.databases) visit(database);
  for (const queue of file.queues) visit(queue);
  for (const storage of file.storages) visit(storage);
  return warnings;
}

/**
 * v1.x deprecation for annotation names outside the builtin lifecycle
 * vocabulary — same contract as `detectTagsNotBuiltin` (accepted in v1.x,
 * tool vocabulary only in v2.0, no suppression condition). Subsumes the
 * near-miss case of `annotation-possible-typo`; both diagnostics coexist
 * during v1.x and are consolidated in v2.0. Also covers `team` blocks,
 * which accept the same annotation grammar (spec § Team annotations).
 */
function detectAnnotationsNotBuiltin(file: KrsFile): Warning[] {
  const builtins = new Set<string>(REFERENCE_DATA.annotations.map((a) => a.name));
  const warnings: Warning[] = [];

  const checkAnnotations = (annotations: string[], nodeId: string, loc: KrsNode["loc"]): void => {
    for (const annotation of annotations) {
      if (!builtins.has(annotation)) {
        warnings.push({ kind: "annotation-not-builtin", params: { nodeId, annotation }, loc });
      }
    }
  };
  const visit = (node: KrsNode): void => {
    checkAnnotations(node.annotations, node.id, node.loc);
    for (const child of node.children) visit(child);
  };
  const visitTeam = (team: TeamNode): void => {
    checkAnnotations(team.annotations, team.id, team.loc);
    for (const child of team.children) {
      if (child.kind === "team") visitTeam(child);
    }
  };

  for (const system of file.systems) visit(system);
  for (const client of file.clients) visit(client);
  for (const service of file.services) visit(service);
  for (const domain of file.domains) visit(domain);
  for (const database of file.databases) visit(database);
  for (const queue of file.queues) visit(queue);
  for (const storage of file.storages) visit(storage);
  for (const organization of file.organizations) {
    for (const team of organization.teams) visitTeam(team);
  }
  return warnings;
}

/**
 * Return the built-in annotation name within typo distance of `name`, or
 * undefined when none is close enough. The budget scales with the
 * built-in's length so short names like `new` only match single-edit
 * slips while `migration_target` tolerates two.
 */
function closestBuiltinAnnotation(name: string, builtins: string[]): string | undefined {
  let best: { builtin: string; distance: number } | undefined;
  for (const builtin of builtins) {
    const budget = builtin.length <= 4 ? 1 : 2;
    const distance = levenshtein(name, builtin);
    if (distance <= budget && (best === undefined || distance < best.distance)) {
      best = { builtin, distance };
    }
  }
  return best?.builtin;
}

/**
 * Optimal-string-alignment distance (Levenshtein + adjacent transposition).
 * Transpositions count as one edit so the classic slip `@nwe` sits at
 * distance 1 from `new`, inside the short-name budget.
 */
function levenshtein(a: string, b: string): number {
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prevPrev[j - 2] + 1);
      }
    }
    prevPrev = prev;
    prev = curr;
  }
  return prev[b.length];
}

function detectDomainDispersal(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  // Analyze one scope unit (a system's children, or all top-level services).
  // Detection is keyed by domain id — label is a display name and must not affect identity.
  // Each system is an organizational boundary; cross-system domains are intentional.
  function detectInScope(nodes: KrsNode[]): void {
    const domainToServices = new Map<string, Set<string>>();
    // Record the location of the *last* occurrence of each dispersed domain id
    // so the warning can be anchored in the editor (LSP / Monaco) instead of
    // collapsing to the document start. The last occurrence is the one a
    // reader would treat as the "duplicate".
    const domainToLoc = new Map<string, KrsNode["loc"]>();

    function walk(node: KrsNode, parentServiceId?: string): void {
      if (node.kind === "service") {
        parentServiceId = node.id;
      }
      if (node.kind === "domain" && parentServiceId) {
        if (!domainToServices.has(node.id)) {
          domainToServices.set(node.id, new Set());
        }
        domainToServices.get(node.id)!.add(parentServiceId);
        domainToLoc.set(node.id, node.loc);
      }
      for (const child of node.children) {
        walk(child, parentServiceId);
      }
    }

    for (const node of nodes) {
      walk(node);
    }

    for (const [domainId, services] of domainToServices) {
      if (services.size > 1) {
        warnings.push({
          kind: "domain-dispersal",
          params: { domainId, services: Array.from(services) },
          loc: domainToLoc.get(domainId),
        });
      }
    }
  }

  for (const system of file.systems) {
    detectInScope(system.children);
  }
  if (file.services.length > 0) {
    detectInScope(file.services);
  }

  return warnings;
}

/** Kind + declaration location of an in-scope infra block, keyed by id. */
type InfraInScope = Map<string, { kind: "database" | "queue" | "storage"; loc: KrsNode["loc"] }>;

/**
 * Collect the infra blocks (`database` / `queue` / `storage`) reachable in a
 * scope, excluding `[external]` and `[index]` stores. Shared by the shared-store
 * diagnostics (`detectSharedInfraFanIn`, `detectCrossDomainStoreAccess`) so the
 * exclusion rule and the kind narrowing live in exactly one place
 * (TPL-1720 — keep the resource→store target set synchronized across
 * every consumer).
 *
 * `[external]`: the smell is about owning a shared store, not depending on a
 * managed third-party one. `[index]`: a derived search / secondary index (a read
 * model built from the system of record) is a legitimate shared read surface,
 * not the Database-per-Service smell a shared system-of-record store would be
 * (Issue #1733).
 */
function collectInfraInScope(nodes: KrsNode[]): InfraInScope {
  const infra: InfraInScope = new Map();
  function walk(node: KrsNode): void {
    if (
      INFRA_KIND_SET.has(node.kind) &&
      !node.tags.includes("external") &&
      !node.tags.includes("index")
    ) {
      infra.set(node.id, { kind: node.kind as "database" | "queue" | "storage", loc: node.loc });
    }
    for (const child of node.children) walk(child);
  }
  for (const node of nodes) walk(node);
  return infra;
}

/**
 * Surface the shared-store "fan-in": ≥2 services with a resolved `resource`
 * dependency on the same `database` / `queue` / `storage` within one system
 * scope. Symmetric with `detectDomainDispersal` (same id under ≥2 services),
 * info-register per ADR-1386 — it states a fact (the Database-per-Service
 * smell), it is not a defect.
 *
 * Keyed on *actual sharing*, so — unlike `infra-redeclared-across-files`, which
 * keys on multi-file declaration redundancy — detection is independent of how
 * many files declared the store: `analyze()` runs on the merged `KrsFile`.
 * `[external]` stores are excluded: depending on a managed third-party store is
 * not the Database-per-Service smell.
 */
function detectSharedInfraFanIn(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  // Each system is an organizational boundary; cross-system sharing of a store
  // is intentional and not surfaced. Top-level services form their own scope.
  function detectInScope(nodes: KrsNode[]): void {
    // Infra ids in this scope, `[external]` / `[index]` excluded (see
    // collectInfraInScope for the rationale).
    const infraInScope = collectInfraInScope(nodes);
    const infraToServices = new Map<string, Set<string>>();

    // Resolver over this scope's entities: a bare `resource Order` that resolves
    // to `entity Order { table OrderDB.orders }` counts toward the fan-in on
    // OrderDB just as a physical `resource OrderDB.orders` would (TPL-1720
    // — keep the resource→store target set synchronized across every consumer).
    const resolver = buildEntityResolver(nodes);

    function collectRefs(node: KrsNode, parentServiceId?: string): void {
      if (node.kind === "service") {
        parentServiceId = node.id;
      }
      if (node.kind === "resource" && parentServiceId) {
        const targetId = resolver.resolve(node as ResourceNode).infraParentId;
        if (targetId !== undefined && infraInScope.has(targetId)) {
          if (!infraToServices.has(targetId)) {
            infraToServices.set(targetId, new Set());
          }
          infraToServices.get(targetId)!.add(parentServiceId);
        }
      }
      for (const child of node.children) {
        collectRefs(child, parentServiceId);
      }
    }

    for (const node of nodes) {
      collectRefs(node);
    }

    for (const [infraId, services] of infraToServices) {
      if (services.size > 1) {
        const entry = infraInScope.get(infraId)!;
        warnings.push({
          kind: "shared-infra-fan-in",
          params: { infraId, infraKind: entry.kind, services: Array.from(services) },
          loc: entry.loc,
        });
      }
    }
  }

  for (const system of file.systems) {
    detectInScope(system.children);
  }
  // Top-level (system-less) scope: services live in `file.services`, but
  // top-level infra is bucketed separately in `file.databases` / `queues` /
  // `storages` (not under any service subtree), so feed both in. Without the
  // infra buckets the canonical "top-level store shared by several services"
  // idiom (docs/spec/syntax.md) would never be collected. Each system's own
  // scope already has both, since infra and services are alike `system.children`.
  if (file.services.length > 0) {
    detectInScope([...file.services, ...file.databases, ...file.queues, ...file.storages]);
  }

  return warnings;
}

/**
 * Cross-domain store access (info): a `usecase` in domain A reads/writes an
 * infra leaf owned by a *different* domain B.
 *
 * Ownership is derived from the logical layer — a leaf `infraId.tableId` is
 * owned by every `domain` whose `entity` maps it via `table <InfraId>.<subId>`
 * (ADR-1870). No new syntax: the entity layer is the source of truth,
 * and the physical `table` never carries a domain. Keying is at **leaf
 * granularity** because sibling tables in one `database` can belong to
 * different domains — keying on the whole store would let a reach-in into a
 * co-owned store's foreign table hide behind the accessor being *an* owner of
 * *some* table there.
 *
 * Ownership is a **set** of domains: `owners(leaf) = { D : entity∈D maps leaf }`.
 * The warning fires when `accessingDomain ∉ owners(leaf)` — a single-owner
 * reach-in and a third domain touching a co-owned leaf both fire, while a
 * co-owned leaf's own owners are exempt. `[external]` / `[index]` stores are
 * excluded (symmetric with `shared-infra-fan-in`). Detection runs on the merged
 * `KrsFile` (view-independent) and is scoped per system.
 *
 * Both ownership and access key on the domain **id**, consistent with how the
 * whole model treats domain identity (domain edges, ghost domains, `handles`).
 * A consequence: when the *same* domain id is dispersed across services in one
 * system (the `domain-dispersal` info fact — allowed, not an error), the two
 * dispersed halves are treated as one logical domain, so a usecase in one half
 * reaching into a leaf owned by the other half does **not** fire here (the
 * dispersal itself is what `domain-dispersal` surfaces). Cross-*system* access
 * is out of scope: per-system scoping keeps the id comparison within a single
 * system so identical ids in different systems never conflate (ADR-1911).
 *
 * Paired with but **orthogonal** to `shared-infra-fan-in`: that keys on how
 * many services share a store; this keys on crossing an ownership boundary. The
 * two fire independently on the same store — no double counting, no mutual
 * suppression. The resource→store resolution reuses `buildEntityResolver`, kept
 * in sync with `deriveInfraEdges` / `detectSharedInfraFanIn` /
 * `detectUnassignedResources` (TPL-1720).
 * See ADR-1819 (docs/adr/1819-domain-store-ownership-diagnostic.md).
 */
function detectCrossDomainStoreAccess(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  function detectInScope(nodes: KrsNode[]): void {
    const resolver = buildEntityResolver(nodes);

    // Infra blocks in scope, `[external]` / `[index]` excluded (shared with
    // fan-in via collectInfraInScope). Excluded stores also contribute no
    // ownership, so an entity mapping such a leaf yields no owner and never fires.
    const infraInScope = collectInfraInScope(nodes);

    // owners: leaf key `infraId.tableId` -> set of owning domain ids.
    const owners = new Map<string, Set<string>>();
    function collectOwners(node: KrsNode, domainId?: string): void {
      const nextDomain = node.kind === "domain" ? node.id : domainId;
      if (node.kind === "entity" && nextDomain !== undefined) {
        const tableRef = (node as EntityNode).tableRef;
        if (tableRef !== undefined && infraInScope.has(tableRef.parent)) {
          const key = `${tableRef.parent}.${tableRef.child}`;
          let set = owners.get(key);
          if (!set) owners.set(key, (set = new Set()));
          set.add(nextDomain);
        }
      }
      for (const child of node.children) collectOwners(child, nextDomain);
    }
    for (const node of nodes) collectOwners(node);

    // Aggregate crossing accesses by (accessingDomain, leaf). Multiple usecases
    // in one domain touching the same foreign leaf collapse to one warning; the
    // read/write mode is the union of their accesses.
    interface Agg {
      accessingDomain: string;
      owningDomains: string[];
      infraId: string;
      infraKind: "database" | "queue" | "storage";
      tableId: string;
      hasRead: boolean;
      hasWrite: boolean;
      loc: KrsNode["loc"];
    }
    const agg = new Map<string, Agg>();

    function collectAccess(node: KrsNode, domainId?: string): void {
      const nextDomain = node.kind === "domain" ? node.id : domainId;
      if (node.kind === "resource" && nextDomain !== undefined) {
        const resolved = resolver.resolve(node as ResourceNode);
        const { infraParentId: parent, infraChildId: child } = resolved;
        if (parent !== undefined && child !== undefined && infraInScope.has(parent)) {
          const leafKey = `${parent}.${child}`;
          const ownerSet = owners.get(leafKey);
          if (ownerSet && ownerSet.size > 0 && !ownerSet.has(nextDomain)) {
            const aggKey = `${nextDomain} ${leafKey}`;
            const ops = (node as ResourceNode).properties.operations;
            let entry = agg.get(aggKey);
            if (!entry) {
              entry = {
                accessingDomain: nextDomain,
                owningDomains: Array.from(ownerSet).sort(),
                infraId: parent,
                infraKind: infraInScope.get(parent)!.kind,
                tableId: child,
                hasRead: false,
                hasWrite: false,
                loc: node.loc,
              };
              agg.set(aggKey, entry);
            }
            entry.hasWrite = entry.hasWrite || isWriteOperation(ops);
            entry.hasRead = entry.hasRead || isReadOperation(ops);
            // Point at the last crossing occurrence (mirrors domain-dispersal).
            entry.loc = node.loc;
          }
        }
      }
      for (const child of node.children) collectAccess(child, nextDomain);
    }
    for (const node of nodes) collectAccess(node);

    for (const entry of agg.values()) {
      const mode =
        entry.hasWrite && entry.hasRead ? "readwrite" : entry.hasWrite ? "write" : "read";
      warnings.push({
        kind: "cross-domain-store-access",
        params: {
          accessingDomain: entry.accessingDomain,
          owningDomains: entry.owningDomains,
          infraId: entry.infraId,
          infraKind: entry.infraKind,
          tableId: entry.tableId,
          mode,
        },
        loc: entry.loc,
      });
    }
  }

  for (const system of file.systems) {
    detectInScope(system.children);
  }
  // Top-level (system-less) scope: a top-level domain's usecase can reach into
  // another top-level domain's store, so include `file.domains` alongside the
  // services and the separately-bucketed top-level infra.
  if (file.services.length > 0 || file.domains.length > 0) {
    detectInScope([
      ...file.services,
      ...file.domains,
      ...file.databases,
      ...file.queues,
      ...file.storages,
    ]);
  }

  return warnings;
}

/**
 * Surface a bare `resource <id>` that resolves to no store: not physical
 * dot-notation, not a unique `entity` (the canonical logical form), and not
 * `[external]` (which intentionally has no store). Resolution is model-wide, so
 * the warning is *promoted away* — with zero edits to the usecase — the moment a
 * matching `entity` is declared anywhere (`docs/adr/1870-domain-entity-modeling.md`).
 *
 * Moved here from the parser (which only sees a single declaration): the
 * entity a bare id resolves to may be declared in another domain / service.
 * An ambiguous bare id (>1 matching entity) stays unresolved and warned here;
 * its root-cause collision is reported separately by
 * `detectEntityAnchorCollisions`.
 */
function detectUnassignedResources(file: KrsFile): Warning[] {
  const resolver = buildEntityResolver([...file.systems, ...file.services, ...file.domains]);
  const warnings: Warning[] = [];

  function walk(node: KrsNode): void {
    if (node.kind === "resource") {
      const res = node as ResourceNode;
      if (
        !res.ref &&
        !res.tags.includes("external") &&
        resolver.resolve(res).entityId === undefined
      ) {
        warnings.push({
          kind: "unassigned-resource",
          params: { resourceId: res.id },
          loc: res.loc,
        });
      }
    }
    for (const child of node.children) walk(child);
  }

  for (const root of [...file.systems, ...file.services, ...file.clients, ...file.domains]) {
    walk(root);
  }
  return warnings;
}

function detectUnassignedDomains(file: KrsFile): Warning[] {
  return file.domains.map((domain) => ({
    kind: "unassigned-domain" as const,
    params: {
      domainId: domain.id,
      ...(domain.label ? { label: domain.label } : {}),
    },
    loc: domain.loc,
  }));
}

function detectUnassignedServices(file: KrsFile): Warning[] {
  return file.services.map((service) => ({
    kind: "unassigned-service" as const,
    params: {
      serviceId: service.id,
      ...(service.label ? { label: service.label } : {}),
    },
    loc: service.loc,
  }));
}

function detectUnassignedClients(file: KrsFile): Warning[] {
  return (file.clients ?? []).map((client) => ({
    kind: "unassigned-client" as const,
    params: {
      clientId: client.id,
      ...(client.label ? { label: client.label } : {}),
    },
    loc: client.loc,
  }));
}

/**
 * Validate `handles` cross-references for `client` and `service` nodes.
 *
 * Expose rule (one-hop, recursive):
 *   A node N exposes domain D iff:
 *     1. N has a child `domain D` (self-owned), OR
 *     2. N declares `handles D` AND at least one of N's outgoing communication
 *        edges targets a node that exposes D.
 *
 * For each `handles D` declaration whose D cannot be resolved through the
 * rule, emit an `unresolved-handles` warning. The rule mirrors how the
 * design doc describes the BFF passthrough chain (client → BFF.handles →
 * backend.owns).
 *
 * Implementation notes:
 * - Operates per-system: only edges declared at the same system scope are
 *   considered. Top-level clients/services (file.clients / file.services)
 *   already produce `unassigned-*` warnings; their `handles` declarations
 *   simply have no edges to resolve through.
 * - Memoizes "exposes(node, domain)" inside a single system to keep the
 *   recursion linear in the number of nodes. The recursion is well-founded
 *   because we expand exactly one hop per call (the recursive call resolves
 *   on the *target* side of an edge, and a graph with finite nodes
 *   terminates).
 * - `delivers` is a service-side property and not an edge, so it does not
 *   participate.
 */
function detectUnresolvedHandles(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  for (const system of file.systems) {
    // Build node lookup and outgoing-edge index keyed by source id.
    const nodeById = new Map<string, KrsNode>();
    for (const child of system.children) {
      nodeById.set(child.id, child);
    }
    const outgoingByFrom = new Map<string, string[]>();
    for (const edge of system.edges) {
      let list = outgoingByFrom.get(edge.from);
      if (!list) {
        list = [];
        outgoingByFrom.set(edge.from, list);
      }
      list.push(edge.to);
    }

    // Memoization: nodeId -> domainId -> boolean
    const memo = new Map<string, Map<string, boolean>>();
    const inProgress = new Set<string>(); // cycle guard (key: nodeId|domainId)

    function ownsDomain(node: KrsNode, domainId: string): boolean {
      return node.children.some((c) => c.kind === "domain" && c.id === domainId);
    }

    function declaredHandles(node: KrsNode): string[] | undefined {
      if (node.kind === "client" || node.kind === "service") {
        return node.properties.handles;
      }
      return undefined;
    }

    function exposes(nodeId: string, domainId: string): boolean {
      let domainMap = memo.get(nodeId);
      if (domainMap?.has(domainId)) return domainMap.get(domainId)!;

      const node = nodeById.get(nodeId);
      if (!node) {
        if (!domainMap) {
          domainMap = new Map();
          memo.set(nodeId, domainMap);
        }
        domainMap.set(domainId, false);
        return false;
      }

      // Cycle guard — treat in-progress lookups as not-yet-exposed; this
      // prevents infinite recursion on pathological graphs (e.g. A.handles X
      // pointing to B.handles X pointing back to A).
      const key = `${nodeId}|${domainId}`;
      if (inProgress.has(key)) {
        if (!domainMap) {
          domainMap = new Map();
          memo.set(nodeId, domainMap);
        }
        domainMap.set(domainId, false);
        return false;
      }
      inProgress.add(key);

      // Rule 1: own
      if (ownsDomain(node, domainId)) {
        if (!domainMap) {
          domainMap = new Map();
          memo.set(nodeId, domainMap);
        }
        domainMap.set(domainId, true);
        inProgress.delete(key);
        return true;
      }

      // Rule 2: re-export — the node declared `handles D` AND an outgoing
      // edge target also exposes D.
      const handles = declaredHandles(node);
      if (handles?.includes(domainId)) {
        const targets = outgoingByFrom.get(nodeId) ?? [];
        for (const target of targets) {
          if (exposes(target, domainId)) {
            if (!domainMap) {
              domainMap = new Map();
              memo.set(nodeId, domainMap);
            }
            domainMap.set(domainId, true);
            inProgress.delete(key);
            return true;
          }
        }
      }

      if (!domainMap) {
        domainMap = new Map();
        memo.set(nodeId, domainMap);
      }
      domainMap.set(domainId, false);
      inProgress.delete(key);
      return false;
    }

    // Check every client / service in this system that declares `handles`.
    for (const node of system.children) {
      if (node.kind !== "client" && node.kind !== "service") continue;
      const handles = node.properties.handles;
      if (!handles || handles.length === 0) continue;

      for (const domainId of handles) {
        // For the declaring node itself, "exposes" recurses into rule 2 and
        // walks the outgoing edges. Self-owned domains (rule 1) take
        // precedence and are also tested there.
        if (exposes(node.id, domainId)) continue;

        warnings.push({
          kind: "unresolved-handles",
          params: {
            nodeId: node.id,
            nodeKind: node.kind,
            domainId,
          },
          loc: node.loc,
        });
      }
    }
  }

  return warnings;
}

function detectUnassignedDatabases(file: KrsFile): Warning[] {
  return (file.databases ?? []).map((db) => ({
    kind: "unassigned-database" as const,
    params: {
      databaseId: db.id,
      ...(db.label ? { label: db.label } : {}),
    },
    loc: db.loc,
  }));
}

function detectUnassignedQueues(file: KrsFile): Warning[] {
  return (file.queues ?? []).map((q) => ({
    kind: "unassigned-queue" as const,
    params: {
      queueId: q.id,
      ...(q.label ? { label: q.label } : {}),
    },
    loc: q.loc,
  }));
}

function detectUnassignedStorages(file: KrsFile): Warning[] {
  return (file.storages ?? []).map((s) => ({
    kind: "unassigned-storage" as const,
    params: {
      storageId: s.id,
      ...(s.label ? { label: s.label } : {}),
    },
    loc: s.loc,
  }));
}

function detectUnassignedUsecases(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  function walkServiceChildren(nodes: KrsNode[]): void {
    for (const node of nodes) {
      if (node.kind === "service") {
        for (const child of node.children) {
          if (child.kind === "usecase") {
            warnings.push({
              kind: "unassigned-usecase",
              params: { usecaseId: child.id },
              loc: child.loc,
            });
          }
        }
        // recurse into domains to find nested services (not expected, but safe)
        walkServiceChildren(node.children.filter((c) => c.kind !== "usecase"));
      }
    }
  }

  for (const system of file.systems) {
    walkServiceChildren(system.children);
  }
  walkServiceChildren(file.services);

  return warnings;
}

/**
 * The `entity` deep-link view token addresses a model-wide namespace of
 * {all domain ids} ∪ {all entity ids} (a domain id opens that domain's entity
 * view; an entity id focuses that entity). An id claimed by two targets in
 * that namespace makes `#krs-entity-<id>` ambiguous and produces duplicate DOM
 * ids in the bundled static SVG. Flag it — but only when an entity is involved
 * (two same-id domains across services are the existing domain-dispersal fact,
 * addressed elsewhere), and only for a genuine cross-domain clash: two same-id
 * entities under ONE domain are already a `duplicate-node-id-parent` error, so
 * they are not double-reported here.
 */
function detectEntityAnchorCollisions(file: KrsFile): Warning[] {
  const domainIds = new Set<string>();
  // entity id -> set of DISTINCT owning domain NODES (object identity, not id:
  // the same domain id dispersed across systems is two distinct domain nodes,
  // hence two distinct entity anchors).
  const entityOwnerNodes = new Map<string, Set<KrsNode>>();
  const entityFirstLoc = new Map<string, KrsNode["loc"]>();

  const visit = (node: KrsNode, parentDomain: KrsNode | undefined): void => {
    if (node.kind === "domain") {
      domainIds.add(node.id);
    } else if (node.kind === "entity") {
      let owners = entityOwnerNodes.get(node.id);
      if (!owners) {
        owners = new Set<KrsNode>();
        entityOwnerNodes.set(node.id, owners);
        entityFirstLoc.set(node.id, node.loc);
      }
      if (parentDomain !== undefined) owners.add(parentDomain);
    }
    const childDomain = node.kind === "domain" ? node : parentDomain;
    for (const child of node.children) visit(child, childDomain);
  };

  for (const system of file.systems) {
    for (const child of system.children) visit(child, undefined);
  }
  for (const service of file.services) visit(service, undefined);
  for (const domain of file.domains) visit(domain, undefined);

  const warnings: Warning[] = [];
  for (const [id, loc] of entityFirstLoc) {
    // Two same-id entities under ONE domain node are already a
    // duplicate-node-id-parent error — count DISTINCT owning domain nodes so
    // we warn only on a genuine cross-domain / entity-vs-domain anchor clash.
    const spansMultipleDomains = (entityOwnerNodes.get(id)?.size ?? 0) > 1;
    const clashesWithDomain = domainIds.has(id);
    if (spansMultipleDomains || clashesWithDomain) {
      warnings.push({ kind: "entity-anchor-collision", params: { id }, loc });
    }
  }
  return warnings;
}

function detectStyleConflicts(sheets: StyleSheet[], systemSheetCount = 1): Warning[] {
  // Skip system sheets (built-in + any injected theme sheets) — they are designed to be overridden.
  // Only detect conflicts among user sheets (index systemSheetCount+).
  const userSheets = sheets.slice(systemSheetCount);
  if (userSheets.length <= 1) return [];
  const warnings: Warning[] = [];

  // Group rules by serialized selector, tracking which user sheet they came from
  const selectorToSheets = new Map<string, Set<number>>();

  for (let i = 0; i < userSheets.length; i++) {
    for (const rule of userSheets[i].rules) {
      const key = serializeSelector(rule.selector);
      if (!selectorToSheets.has(key)) {
        selectorToSheets.set(key, new Set());
      }
      selectorToSheets.get(key)!.add(i);
    }
  }

  for (const [selector, sheetIndices] of selectorToSheets) {
    if (sheetIndices.size > 1) {
      warnings.push({
        kind: "style-conflict",
        params: { selector, sheetIndices: Array.from(sheetIndices) },
      });
    }
  }

  return warnings;
}

function detectMissingProperties(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  for (const deploy of file.deploys) {
    for (const node of deploy.nodes) {
      // `store` is a managed data store with no runtime form (its concrete
      // tech is the free-text `type`), so it is exempt from the runtime nudge.
      if (node.kind !== "store" && !node.properties.runtime) {
        warnings.push({
          kind: "missing-runtime",
          params: { nodeId: node.id },
          loc: node.loc,
        });
      }
      if (!node.properties.realizes?.length) {
        warnings.push({
          kind: "missing-realizes",
          params: { nodeId: node.id },
          loc: node.loc,
        });
      }
    }
  }

  return warnings;
}

/**
 * Validate that every `realizes <target>` on a deploy node points to a
 * known logical-side service or domain id.
 *
 * Closes the validation gap reported in Issue #907: previously the parser
 * accepted any identifier after `realizes` and silently disconnected the
 * physical node from the logical layer when the target was a typo. Mirrors
 * the pattern used by `detectInvalidOwns`.
 *
 * Notes:
 * - Skips deploy nodes with empty `realizes` — those are already covered
 *   by `missing-realizes`.
 * - Cross-file imports work transparently because `compileProject` merges
 *   imported files into a single `KrsFile` before analysis runs.
 * - The valid-id set covers `service` and `domain` ids reachable through
 *   `file.systems` plus the top-level `file.services` / `file.domains`
 *   buckets, matching how `realizes` is consumed by `extractDeployView`.
 */
function detectUnresolvedRealizes(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  // Build the set of all valid realize-target IDs: services / domains / clients
  // and the system-level infra nodes (database / queue / storage). A deploy unit
  // may realize a shared store to record its physical form (e.g. a `store` unit
  // realizing a `database`); see ADR-1632. A client is also a deployable
  // logical node (a `war` / `assets` bundle realizes a `client` SPA), so it is a
  // valid target too; see ADR-1720. Leaf sub-resources
  // (table / queue-item / bucket) are NOT valid targets.
  const validIds = new Set<string>();
  function collectIds(nodes: KrsNode[]): void {
    for (const node of nodes) {
      if (
        node.kind === "service" ||
        node.kind === "domain" ||
        node.kind === "client" ||
        INFRA_KIND_SET.has(node.kind)
      ) {
        validIds.add(node.id);
      }
      collectIds(node.children);
    }
  }
  for (const system of file.systems) {
    collectIds(system.children);
  }
  for (const service of file.services) {
    validIds.add(service.id);
    collectIds(service.children);
  }
  for (const domain of file.domains) {
    validIds.add(domain.id);
    collectIds(domain.children);
  }
  for (const client of file.clients) {
    validIds.add(client.id);
    collectIds(client.children);
  }
  // Top-level infra blocks live in their own KrsFile buckets, not in
  // system.children, so add their ids explicitly.
  for (const infra of [...file.databases, ...file.queues, ...file.storages]) {
    validIds.add(infra.id);
  }

  for (const deploy of file.deploys) {
    for (const node of deploy.nodes) {
      const realizes = node.properties.realizes;
      if (!realizes || realizes.length === 0) continue;
      for (const target of realizes) {
        if (!validIds.has(target)) {
          warnings.push({
            kind: "unresolved-realizes",
            params: {
              deployNodeId: node.id,
              deployBlockId: deploy.id,
              target,
            },
            loc: node.loc,
          });
        }
      }
    }
  }

  return warnings;
}

function detectInvalidOwns(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  // Build the set of all valid owns-target IDs: services / domains / clients.
  // A team can own a client (a deployable SPA / mobile app) just as it owns a
  // service or domain; see ADR-1720.
  const validIds = new Set<string>();
  function collectIds(nodes: KrsNode[]): void {
    for (const node of nodes) {
      if (node.kind === "service" || node.kind === "domain" || node.kind === "client") {
        validIds.add(node.id);
      }
      collectIds(node.children);
    }
  }
  for (const system of file.systems) {
    collectIds(system.children);
  }
  for (const service of file.services) {
    validIds.add(service.id);
    collectIds(service.children);
  }
  for (const domain of file.domains) {
    validIds.add(domain.id);
    collectIds(domain.children);
  }
  for (const client of file.clients) {
    validIds.add(client.id);
    collectIds(client.children);
  }

  // Check each owns reference
  function checkTeams(teams: TeamNode[]): void {
    for (const team of teams) {
      for (const ownedId of team.properties.owns) {
        if (!validIds.has(ownedId)) {
          warnings.push({
            kind: "invalid-owns",
            params: { teamId: team.id, ownedId },
            loc: team.loc,
          });
        }
      }
      checkTeams(team.children.filter((c): c is TeamNode => c.kind === "team"));
    }
  }

  for (const org of file.organizations) {
    checkTeams(org.teams);
  }

  return warnings;
}

function detectCrossSystemRefs(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  for (const system of file.systems) {
    // Build set of system IDs with [external] tag explicitly declared as children of this system.
    // A child node with the same ID as the referenced system suppresses the implicit-external warning.
    const explicitExternalIds = new Set(
      system.children.filter((c) => c.tags.includes("external")).map((c) => c.id),
    );

    for (const edge of system.edges) {
      if (!edge.to.includes(".")) continue;

      const [systemId, serviceId] = edge.to.split(".");

      // Suppressed if the referenced system ID is explicitly declared as [external] in the source system
      if (explicitExternalIds.has(systemId)) continue;

      const referencedSystem = file.systems.find((s) => s.id === systemId);
      if (!referencedSystem || !referencedSystem.children.some((c) => c.id === serviceId)) {
        warnings.push({
          kind: "cross-system-ref-unresolved",
          params: { ref: edge.to },
          loc: edge.loc,
        });
      } else {
        warnings.push({
          kind: "cross-system-ref-implicit-external",
          params: {
            ref: edge.to,
            sourceSystemId: system.id,
            sourceNodeId: edge.from,
            targetSystemId: systemId,
          },
          loc: edge.loc,
        });
      }
    }
  }

  return warnings;
}

/**
 * §S6: an authored edge whose endpoint id exists nowhere in the merged model
 * is dropped during view extraction (the resolved endpoint node is kept —
 * TPL-2170). This surfaces that otherwise-silent drop as a warning.
 *
 * Only authored edges are inspected: synthetic edges (implicit service edges,
 * usecase→resource edges) are produced during view extraction and never appear
 * on `KrsFile`. Cross-system dotted refs (`Sys.Svc`) are skipped — they carry a
 * "." and are handled by `detectCrossSystemRefs`.
 */
function detectUnresolvedEdgeEndpoints(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  // Universe of every node id in the merged model, all kinds, all depths.
  // `nodePathIndex` can't be reused here — it only indexes service / domain.
  const allIds = new Set<string>();
  const collectIds = (node: KrsNode): void => {
    allIds.add(node.id);
    for (const child of node.children) collectIds(child);
  };
  for (const system of file.systems) {
    for (const child of system.children) collectIds(child);
  }
  for (const node of [
    ...file.services,
    ...file.domains,
    ...file.clients,
    ...file.databases,
    ...file.queues,
    ...file.storages,
  ]) {
    collectIds(node);
  }

  const checkEdges = (edges: KrsEdge[]): void => {
    for (const edge of edges) {
      for (const endpoint of [edge.from, edge.to]) {
        // Cross-system dotted refs are validated by detectCrossSystemRefs.
        if (endpoint.includes(".")) continue;
        if (!allIds.has(endpoint)) {
          warnings.push({
            kind: "unresolved-edge-endpoint",
            params: { from: edge.from, to: edge.to, unresolvedId: endpoint },
            loc: edge.loc,
          });
        }
      }
    }
  };
  const walkEdges = (node: KrsNode): void => {
    checkEdges(node.edges);
    for (const child of node.children) walkEdges(child);
  };
  for (const system of file.systems) {
    checkEdges(system.edges);
    for (const child of system.children) walkEdges(child);
  }
  for (const node of [
    ...file.services,
    ...file.domains,
    ...file.clients,
    ...file.databases,
    ...file.queues,
    ...file.storages,
  ]) {
    walkEdges(node);
  }

  return warnings;
}

function detectCyclicDependencies(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  function detectInEdges(edges: KrsEdge[]): void {
    // Only inspect sync edges — async cycles are intentional (eventual consistency patterns)
    const syncEdges = edges.filter((e) => e.kind === "sync");
    if (syncEdges.length === 0) return;

    // Build adjacency map: node -> outgoing sync edges
    const adj = new Map<string, KrsEdge[]>();
    for (const edge of syncEdges) {
      if (!adj.has(edge.from)) adj.set(edge.from, []);
      adj.get(edge.from)!.push(edge);
    }

    const WHITE = 0,
      GRAY = 1,
      BLACK = 2;
    const color = new Map<string, number>();

    function dfs(node: string, path: string[]): void {
      color.set(node, GRAY);
      const currentPath = [...path, node];

      for (const edge of adj.get(node) ?? []) {
        const neighbor = edge.to;

        // Self-reference
        if (neighbor === node) {
          edge.cyclic = true;
          warnings.push({
            kind: "cyclic-dependency",
            params: { cyclePath: [node, node] },
            loc: edge.loc,
          });
          continue;
        }

        const neighborColor = color.get(neighbor) ?? WHITE;
        if (neighborColor === GRAY) {
          // Back edge found — mark this edge and all edges in the cycle
          edge.cyclic = true;
          const cycleStartIdx = currentPath.indexOf(neighbor);
          const cyclePath = [...currentPath.slice(cycleStartIdx), neighbor];

          // Mark all edges that form the cycle
          for (let i = 0; i < cyclePath.length - 1; i++) {
            const from = cyclePath[i];
            const to = cyclePath[i + 1];
            for (const cycleEdge of syncEdges.filter((se) => se.from === from && se.to === to)) {
              cycleEdge.cyclic = true;
            }
          }

          warnings.push({
            kind: "cyclic-dependency",
            params: { cyclePath },
            loc: edge.loc,
          });
        } else if (neighborColor === WHITE) {
          dfs(neighbor, currentPath);
        }
      }

      color.set(node, BLACK);
    }

    // Collect all nodes that appear in sync edges
    const nodes = new Set<string>();
    for (const edge of syncEdges) {
      nodes.add(edge.from);
      nodes.add(edge.to);
    }

    for (const node of nodes) {
      if ((color.get(node) ?? WHITE) === WHITE) {
        dfs(node, []);
      }
    }
  }

  function walkNodes(nodes: KrsNode[]): void {
    for (const node of nodes) {
      // Entity relation edges are associations, not dependencies. Self-loops
      // (a self-referential FK) and mutual references are ordinary ER shapes,
      // not architectural cycles — exclude them from cycle detection.
      if (node.kind !== "entity") detectInEdges(node.edges);
      walkNodes(node.children);
    }
  }

  for (const system of file.systems) {
    detectInEdges(system.edges);
    walkNodes(system.children);
  }

  return warnings;
}

function serializeSelector(selector: {
  nodeType?: string;
  tags: string[];
  annotations: string[];
  id?: string;
}): string {
  const parts: string[] = [];
  if (selector.id) parts.push(`#${selector.id}`);
  if (selector.nodeType) parts.push(selector.nodeType);
  for (const tag of selector.tags) parts.push(`[${tag}]`);
  for (const ann of selector.annotations) parts.push(`@${ann}`);
  return parts.join("");
}
