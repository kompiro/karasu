// ---------------------------------------------------------------------------
// Team dependency derivation (#2597 slice A / #2635).
//
// The Conway join karasu could already answer but made the reader perform by
// hand: `owns` says which team holds which node, the logical edges say which
// nodes depend on which, so `edge(from, to) × ownership` says which pairs of
// teams have to talk. Nothing new is written in `.krs` to make this appear —
// the same stance ADR-1062 took for the CRUD matrix.
//
// Three choices carry the weight, and each is here because the naive version
// of it is wrong:
//
//   1. **Ownership is read 1:N** (`buildTeamOwnership`, not `ownerIndex`).
//      A 1:1 index resolves co-ownership to a migration primary, which drops
//      the team being handed *away from* — the one an inverse-Conway handoff
//      most needs to coordinate with (TPL-2161).
//   2. **Ownership is inherited** up to the nearest owned ancestor. Dependencies
//      are recorded at domain granularity while `owns` is usually written at
//      service granularity, so without the walk nearly every interesting edge
//      resolves to nothing. Specified in `docs/spec/syntax.md` § team node.
//   3. **Endpoints resolve through the shared resolver** (`resolveEdgeEndpoint`),
//      never through a local re-derivation of the suffix rule. Re-spelling how
//      a reference reaches a node is the drift TPL-2032 / TPL-2577 name; see
//      `endpointNodes` for the one place this reads past `peers(C)` and why.
//
// What the derivation does *not* do is judge. It reports that two teams are
// coupled and how many edges say so; it does not rank, threshold, or advise —
// the same "observe, do not decide" position `docs/concepts.md` takes on cycles.
// ---------------------------------------------------------------------------

import type { EdgeKind, KrsEdge, KrsFile, KrsNode, NodeIdPath, TeamNode } from "../types/ast.js";
import { buildTeamOwnership, type DeclaredNodePath } from "../parser/reference-validation.js";
import { nodePathKey } from "../parser/node-path.js";
import { OWNS_TARGET_KIND_SET } from "../types/ast.js";
import {
  buildEdgeEndpointIndex,
  edgeEndpointRef,
  resolveEdgeEndpoint,
  type EdgeEndpointIndex,
} from "../resolver/edge-endpoint.js";

/**
 * How two teams stand to each other in the org tree.
 *
 * `nested` is not a weaker `cross-team`, it is a different fact: a working
 * group inside its parent team already shares a reporting line, so counting
 * the pair as a cross-team path inflates the graph with coordination that
 * the org structure already provides.
 */
export type TeamDependencyRelation = "cross-team" | "nested";

/** One logical edge that induced a derived dependency. */
export interface TeamDependencyEdge {
  /** Endpoint references as the author wrote them. */
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  /** Full path (`nodePathKey`) each endpoint resolved to. */
  fromPath: string;
  toPath: string;
  /** True when the endpoint's team came from an ancestor rather than its own `owns`. */
  fromInherited: boolean;
  toInherited: boolean;
}

/** One derived dependency between two teams, for one edge kind. */
export interface TeamDependency {
  fromTeam: string;
  toTeam: string;
  /**
   * `sync` and `async` are never folded together: an async edge is deliberate
   * loose coupling and therefore a weaker coordination requirement, the same
   * reason cycle detection excludes it (`docs/concepts.md`). One team pair
   * coupled both ways yields two dependencies.
   */
  kind: EdgeKind;
  relation: TeamDependencyRelation;
  /** Every edge that induced this pair, in declaration order. */
  via: TeamDependencyEdge[];
}

/** An endpoint that names a real node which no team owns, directly or by inheritance. */
export interface UnownedEndpoint {
  /** Full path (`nodePathKey`) of the node. */
  path: string;
  kind: string;
  /** The edges that reached it, in declaration order. */
  via: { from: string; to: string; kind: EdgeKind }[];
}

export interface TeamDependencyReport {
  /** Every declared team, in declaration order — the axis order of any projection. */
  teams: { id: string; label?: string }[];
  dependencies: TeamDependency[];
  /**
   * Endpoints that resolved to a node with no owning team.
   *
   * Surfaced rather than silently dropped: the derivation is only as complete
   * as `owns`, and a sparse graph presented without its remainder reads as
   * "this is the whole model" (TPL-2075 / TPL-2170). `user` endpoints are
   * deliberately absent — an actor is not a team's property
   * (`OWNABLE_LOGICAL_KINDS`), so `user -> client` cannot produce a team
   * dependency. That is the specification, not a gap in the model.
   */
  unowned: UnownedEndpoint[];
}

/**
 * Whether a node could carry an owner at all — itself, or through the ancestor
 * walk `resolveOwners` performs.
 *
 * An endpoint that fails this is not an ownership gap, it is a kind the spec
 * places outside ownership: `owns` accepts service / domain / client and the
 * infra blocks (`OWNS_TARGET_KINDS`), so an actor and a `system` can never be
 * owned and neither has an ownable ancestor to inherit from. Reporting them as
 * unowned would ask the reader to write an `owns` line that `invalid-owns`
 * then refuses — an entry that can never be closed. An infra *leaf* fails on
 * its own kind but passes on its enclosing block, which is exactly right: the
 * block is the ownership unit.
 */
function couldBeOwned(path: NodeIdPath, index: EdgeEndpointIndex): boolean {
  const declared = index.declared;
  for (let length = path.length; length > 0; length--) {
    const id = path[length - 1];
    const prefix = path.slice(0, length);
    const node = (declared.get(id) ?? []).find((d) => nodePathKey(d.path) === nodePathKey(prefix));
    if (node !== undefined && OWNS_TARGET_KIND_SET.has(node.kind)) return true;
  }
  return false;
}

interface TeamTree {
  order: { id: string; label?: string }[];
  rank: Map<string, number>;
  /** Ancestor team ids of each team, nearest first. */
  ancestors: Map<string, string[]>;
}

function buildTeamTree(file: KrsFile): TeamTree {
  const order: { id: string; label?: string }[] = [];
  const rank = new Map<string, number>();
  const ancestors = new Map<string, string[]>();

  const walk = (teams: readonly TeamNode[], chain: string[]): void => {
    for (const team of teams) {
      // A team id declared in two files is one team after the S4 union, so the
      // first declaration fixes its rank and the later one must not re-add it.
      if (!rank.has(team.id)) {
        rank.set(team.id, order.length);
        order.push(team.label === undefined ? { id: team.id } : { id: team.id, label: team.label });
        ancestors.set(team.id, chain);
      }
      walk(
        team.children.filter((c): c is TeamNode => c.kind === "team"),
        [team.id, ...chain],
      );
    }
  };
  for (const org of file.organizations) walk(org.teams, []);
  return { order, rank, ancestors };
}

/** What a node's path resolved to on the ownership relation. */
interface OwnerResolution {
  teams: string[];
  /** True when the owners came from an ancestor's `owns`, not the node's own. */
  inherited: boolean;
}

/**
 * Resolve a node's owning teams, walking up to the nearest owned ancestor.
 *
 * The walk is the whole point (決定 2 of the design, now
 * `docs/spec/syntax.md` § team node): `owns` is written at service
 * granularity while edges are recorded at domain granularity, so a resolver
 * that only reads the node's own entry answers "no owner" for nearly every
 * edge worth deriving. The nearest owned ancestor wins outright — a closer
 * declaration is a more specific statement about that subtree, not something
 * to union with what encloses it.
 */
function resolveOwners(
  path: NodeIdPath,
  ownership: ReadonlyMap<string, string[]>,
): OwnerResolution | undefined {
  for (let length = path.length; length > 0; length--) {
    const owners = ownership.get(nodePathKey(path.slice(0, length)));
    if (owners !== undefined && owners.length > 0) {
      return { teams: owners, inherited: length !== path.length };
    }
  }
  return undefined;
}

/** Every node that can declare edges, paired with the container the edges belong to. */
function collectEdgeContainers(file: KrsFile): KrsNode[] {
  const containers: KrsNode[] = [];
  const walk = (node: KrsNode): void => {
    containers.push(node);
    for (const child of node.children) walk(child);
  };
  for (const system of file.systems) walk(system);
  for (const node of [
    ...file.services,
    ...file.clients,
    ...file.domains,
    ...file.databases,
    ...file.queues,
    ...file.storages,
  ]) {
    walk(node);
  }
  return containers;
}

/**
 * The declared nodes one endpoint reference names.
 *
 * `peers(C)` narrows a reference to what the declaring block can reach, which
 * is the precise answer whenever it applies — it is what tells two same-named
 * nodes in two systems apart. But it deliberately does **not** cover every
 * placement that renders: `docs/spec/syntax.md` § Endpoint scope exempts three,
 * of which `domain` -> `domain` at any distance is the one that matters here.
 * A cross-service domain edge is exactly where a dependency is usually
 * recorded, and it is outside `peers(C)` by construction (the peer set is the
 * declaring service's children), so reading `inScope` alone would derive almost
 * nothing on a real model.
 *
 * So: the scope-narrowed set when it accepts the reference, otherwise the
 * suffix match **confined to the top-level root the edge was declared under**.
 *
 * That confinement keeps the fallback from becoming a second, laxer reach
 * rule. A bare id broadcasts to every node with that id, so an unbounded
 * fallback pairs `Da -> Db` in one system with a same-named `Db` in another
 * and derives a coordination partner no view draws — the checker/view drift
 * TPL-2032 / TPL-2577 name — while inflating the provenance count of a single
 * authored edge on the way. Every placement the scope rule exempts (a
 * `domain` -> `domain` edge, a service-anchored one) lives under one root by
 * construction, so nothing that legitimately renders is lost, and reaching
 * into another system still takes the anchored spelling the branch above
 * already accepts.
 *
 * Whether an out-of-scope edge *draws* is a separate question, owned by
 * `edge-endpoint-not-at-scope`. A dependency the author declared is a fact
 * about the model whether or not a view has somewhere to put it.
 */
function endpointNodes(
  index: EdgeEndpointIndex,
  container: KrsNode,
  endpoint: string,
): readonly DeclaredNodePath[] {
  const resolution = resolveEdgeEndpoint(index, container, edgeEndpointRef(endpoint));
  if (resolution.inScope.length > 0) return resolution.inScope;
  const root = index.pathOf(container)[0];
  return resolution.matches.filter((m) => m.path[0] === root);
}
/**
 * A team id may contain spaces, dots and most punctuation (`team "Team A"`
 * parses), so no printable separator is safe to join on: `"Team" + sep + "A B"`
 * and `"Team A" + sep + "B"` would collide, and the second pair's edges would
 * be appended to the first pair's row while the pair itself vanished. JSON is
 * a total encoding, which is what a composite key needs — the same reason
 * `nodePathKey` exists for paths.
 */
function dependencyKey(fromTeam: string, toTeam: string, kind: EdgeKind): string {
  return JSON.stringify([fromTeam, toTeam, kind]);
}

/**
 * Derive the team-to-team dependencies a model already implies.
 *
 * Takes the **merged** `KrsFile` rather than a compiled system view, for the
 * same reason every reference check does: path keys must come from the tree
 * the ownership index was built against. A compile result's `systems` carries
 * the synthetic `__unassigned__` wrapper, which is a rendering frame and not
 * part of any node's path — reading it here would key the join one segment
 * away from `owns` (TPL-1352). Cross-file `organization` blocks are unioned by
 * the import resolver before this sees them (§S4), so a team declared in one
 * file and the nodes it owns in another join normally.
 */
export function extractTeamDependencies(file: KrsFile): TeamDependencyReport {
  const ownership = buildTeamOwnership(file);
  const tree = buildTeamTree(file);
  const endpointIndex = buildEdgeEndpointIndex(file);

  const dependencies = new Map<string, TeamDependency>();
  const unowned = new Map<string, UnownedEndpoint>();

  const isAncestorPair = (a: string, b: string): boolean =>
    (tree.ancestors.get(a)?.includes(b) ?? false) || (tree.ancestors.get(b)?.includes(a) ?? false);

  const noteUnowned = (match: DeclaredNodePath, edge: KrsEdge): void => {
    if (!couldBeOwned(match.path, endpointIndex)) return;
    const key = nodePathKey(match.path);
    const entry = unowned.get(key);
    const via = { from: edge.from, to: edge.to, kind: edge.kind };
    if (entry === undefined) {
      unowned.set(key, { path: key, kind: match.kind, via: [via] });
    } else {
      entry.via.push(via);
    }
  };

  for (const container of collectEdgeContainers(file)) {
    // Relations inside an `entity` block are associations between conceptual
    // entities, not calls — the same reason cycle detection skips them
    // (`resolver/warnings.ts`). They are also the one endpoint kind
    // `resolveEdgeEndpoint` deliberately declines to scope (ADR-1911 hands
    // that to the entity view), so deriving from them would resolve some
    // relations and silently drop others.
    if (container.kind === "entity") continue;

    for (const edge of container.edges) {
      const fromMatches = endpointNodes(endpointIndex, container, edge.from);
      const toMatches = endpointNodes(endpointIndex, container, edge.to);
      const resolve = (matches: readonly DeclaredNodePath[]) =>
        matches.map((match) => ({ match, owners: resolveOwners(match.path, ownership) }));
      const fromResolved = resolve(fromMatches);
      const toResolved = resolve(toMatches);

      // Gaps are recorded per (endpoint, edge), not per pairing, so a co-owned
      // counterpart on the other end cannot multiply one gap into several. This
      // runs *before* the pairing bails below: an endpoint that named no
      // declared node is `unresolved-edge-endpoint`'s business, but that says
      // nothing about the endpoint on the other end, whose ownership gap is
      // real either way.
      const noted = new Set<string>();
      for (const { match, owners } of [...fromResolved, ...toResolved]) {
        if (owners !== undefined) continue;
        const key = nodePathKey(match.path);
        if (noted.has(key)) continue;
        noted.add(key);
        noteUnowned(match, edge);
      }

      // No pair can be derived when one side names nothing declared. An
      // unresolved *reference* is not an ownership gap, so it adds no entry
      // above either — `unresolved-edge-endpoint` is its surface.
      if (fromMatches.length === 0 || toMatches.length === 0) continue;

      for (const { match: fromMatch, owners: fromOwners } of fromResolved) {
        if (fromOwners === undefined) continue;
        for (const { match: toMatch, owners: toOwners } of toResolved) {
          if (toOwners === undefined) continue;

          for (const fromTeam of fromOwners.teams) {
            for (const toTeam of toOwners.teams) {
              // An edge inside one team's holdings is internal work, not a
              // dependency between teams.
              if (fromTeam === toTeam) continue;
              const key = dependencyKey(fromTeam, toTeam, edge.kind);
              const via: TeamDependencyEdge = {
                from: edge.from,
                to: edge.to,
                kind: edge.kind,
                ...(edge.label === undefined ? {} : { label: edge.label }),
                fromPath: nodePathKey(fromMatch.path),
                toPath: nodePathKey(toMatch.path),
                fromInherited: fromOwners.inherited,
                toInherited: toOwners.inherited,
              };
              const existing = dependencies.get(key);
              if (existing === undefined) {
                dependencies.set(key, {
                  fromTeam,
                  toTeam,
                  kind: edge.kind,
                  relation: isAncestorPair(fromTeam, toTeam) ? "nested" : "cross-team",
                  via: [via],
                });
              } else {
                existing.via.push(via);
              }
            }
          }
        }
      }
    }
  }

  const rankOf = (id: string): number => tree.rank.get(id) ?? tree.order.length;
  const ordered = [...dependencies.values()].sort(
    (a, b) =>
      rankOf(a.fromTeam) - rankOf(b.fromTeam) ||
      rankOf(a.toTeam) - rankOf(b.toTeam) ||
      a.kind.localeCompare(b.kind),
  );

  return {
    teams: tree.order,
    dependencies: ordered,
    unowned: [...unowned.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
}
