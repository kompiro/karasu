import type { MemberNode, TeamNode } from "../types/ast.js";
import type { OrgViewSlice } from "../view/org-view-extract.js";
import type { DiffState, EdgeDiffMeta, NodeDiffMeta } from "./view-diff.js";

export interface DiffedOrgView {
  /** Union OrgViewSlice — passed to the existing org renderer. */
  slice: OrgViewSlice;
  /** Diff state keyed by team or member id. */
  nodes: Map<string, NodeDiffMeta>;
  /** Diff state keyed by `ownsEdgeKey(teamId, serviceId)`. */
  edges: Map<string, EdgeDiffMeta>;
}

/** Key used by the org-view diff to identify a team → owned-service edge. */
export function ownsEdgeKey(teamId: string, serviceId: string): string {
  return `${teamId}#owns#${serviceId}`;
}

function setDescriptiveStateForTeam(
  team: TeamNode,
  state: "added" | "removed",
  nodes: Map<string, NodeDiffMeta>,
  edges: Map<string, EdgeDiffMeta>,
): void {
  nodes.set(team.id, { state });
  for (const serviceId of team.properties.owns) {
    edges.set(ownsEdgeKey(team.id, serviceId), { state });
  }
  for (const child of team.children) {
    if (child.kind === "team") {
      setDescriptiveStateForTeam(child, state, nodes, edges);
    } else {
      nodes.set(child.id, { state });
    }
  }
}

function memberChanges(before: MemberNode, after: MemberNode): NodeDiffMeta["changes"] | undefined {
  const out: NonNullable<NodeDiffMeta["changes"]> = {};
  if ((before.label ?? "") !== (after.label ?? "")) {
    out.label = { before: before.label, after: after.label };
  }
  const beforeDesc = before.properties.description;
  const afterDesc = after.properties.description;
  if ((beforeDesc ?? "") !== (afterDesc ?? "")) {
    out.description = { before: beforeDesc, after: afterDesc };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function teamScalarChanges(before: TeamNode, after: TeamNode): NodeDiffMeta["changes"] | undefined {
  const out: NonNullable<NodeDiffMeta["changes"]> = {};
  if ((before.label ?? "") !== (after.label ?? "")) {
    out.label = { before: before.label, after: after.label };
  }
  const beforeDesc = before.properties.description;
  const afterDesc = after.properties.description;
  if ((beforeDesc ?? "") !== (afterDesc ?? "")) {
    out.description = { before: beforeDesc, after: afterDesc };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function diffOwns(
  teamId: string,
  beforeOwns: readonly string[],
  afterOwns: readonly string[],
  edges: Map<string, EdgeDiffMeta>,
): { merged: string[]; anyChanged: boolean } {
  const beforeSet = new Set(beforeOwns);
  const afterSet = new Set(afterOwns);
  const merged: string[] = [];
  const seen = new Set<string>();
  let anyChanged = false;

  for (const serviceId of afterOwns) {
    const state: DiffState = beforeSet.has(serviceId) ? "unchanged" : "added";
    if (state === "added") anyChanged = true;
    edges.set(ownsEdgeKey(teamId, serviceId), { state });
    merged.push(serviceId);
    seen.add(serviceId);
  }
  for (const serviceId of beforeOwns) {
    if (seen.has(serviceId)) continue;
    edges.set(ownsEdgeKey(teamId, serviceId), { state: "removed" });
    anyChanged = true;
    merged.push(serviceId);
  }
  // Preserve original ordering when nothing changed.
  if (!anyChanged && afterOwns.length === beforeOwns.length) {
    return { merged: [...afterOwns], anyChanged: false };
  }
  return { merged, anyChanged: afterSet.size !== beforeSet.size || anyChanged };
}

function mergeChildren(
  before: readonly (TeamNode | MemberNode)[],
  after: readonly (TeamNode | MemberNode)[],
  nodes: Map<string, NodeDiffMeta>,
  edges: Map<string, EdgeDiffMeta>,
): (TeamNode | MemberNode)[] {
  const beforeById = new Map(before.map((c) => [c.id, c]));
  const merged: (TeamNode | MemberNode)[] = [];
  const seen = new Set<string>();

  for (const child of after) {
    const prev = beforeById.get(child.id);
    if (prev === undefined) {
      if (child.kind === "team") {
        setDescriptiveStateForTeam(child, "added", nodes, edges);
      } else {
        nodes.set(child.id, { state: "added" });
      }
      merged.push(child);
    } else if (child.kind === "team" && prev.kind === "team") {
      merged.push(mergeTeam(prev, child, nodes, edges));
    } else if (child.kind === "member" && prev.kind === "member") {
      const changes = memberChanges(prev, child);
      nodes.set(child.id, { state: changes ? "changed" : "unchanged", changes });
      merged.push(child);
    } else {
      // Kind flipped (team ↔ member) — treat as remove + add.
      if (prev.kind === "team") {
        setDescriptiveStateForTeam(prev, "removed", nodes, edges);
      } else {
        nodes.set(prev.id, { state: "removed" });
      }
      if (child.kind === "team") {
        setDescriptiveStateForTeam(child, "added", nodes, edges);
      } else {
        nodes.set(child.id, { state: "added" });
      }
      merged.push(prev);
      merged.push(child);
    }
    seen.add(child.id);
  }
  for (const child of before) {
    if (seen.has(child.id)) continue;
    if (child.kind === "team") {
      setDescriptiveStateForTeam(child, "removed", nodes, edges);
    } else {
      nodes.set(child.id, { state: "removed" });
    }
    merged.push(child);
  }
  return merged;
}

function mergeTeam(
  before: TeamNode,
  after: TeamNode,
  nodes: Map<string, NodeDiffMeta>,
  edges: Map<string, EdgeDiffMeta>,
): TeamNode {
  const owns = diffOwns(after.id, before.properties.owns, after.properties.owns, edges);
  const mergedChildren = mergeChildren(before.children, after.children, nodes, edges);
  const scalarChanges = teamScalarChanges(before, after);

  const changes: NodeDiffMeta["changes"] = { ...(scalarChanges ?? {}) };
  const changed = owns.anyChanged || Boolean(scalarChanges);
  nodes.set(after.id, {
    state: changed ? "changed" : "unchanged",
    changes: Object.keys(changes).length > 0 ? changes : undefined,
  });

  return {
    ...after,
    properties: { ...after.properties, owns: owns.merged },
    children: mergedChildren,
  };
}

function mergeTopLevelTeams(
  before: readonly TeamNode[],
  after: readonly TeamNode[],
  nodes: Map<string, NodeDiffMeta>,
  edges: Map<string, EdgeDiffMeta>,
): TeamNode[] {
  const beforeById = new Map(before.map((t) => [t.id, t]));
  const merged: TeamNode[] = [];
  const seen = new Set<string>();

  for (const team of after) {
    const prev = beforeById.get(team.id);
    if (prev === undefined) {
      setDescriptiveStateForTeam(team, "added", nodes, edges);
      merged.push(team);
    } else {
      merged.push(mergeTeam(prev, team, nodes, edges));
    }
    seen.add(team.id);
  }
  for (const team of before) {
    if (seen.has(team.id)) continue;
    setDescriptiveStateForTeam(team, "removed", nodes, edges);
    merged.push(team);
  }
  return merged;
}

/**
 * Produce a union OrgViewSlice of two org view slices plus per-element diff state.
 *
 * The merged slice contains every team / member / owns relationship from either
 * side so the existing org renderer can lay out a single tree in which unchanged
 * elements have stable positions while added / removed elements appear in context.
 *
 * When both sides have `focusedTeam` with the same id, their children are merged.
 * When only one side has a focused team (e.g. the team was added or removed between
 * the two snapshots) the present side is used as the focus and the other is treated
 * as fully added / removed.
 */
export function diffOrgViewSlices(before: OrgViewSlice, after: OrgViewSlice): DiffedOrgView {
  const nodes = new Map<string, NodeDiffMeta>();
  const edges = new Map<string, EdgeDiffMeta>();

  if (before.focusedTeam === null && after.focusedTeam === null) {
    const teams = mergeTopLevelTeams(before.teams, after.teams, nodes, edges);
    return {
      slice: { teams, focusedTeam: null, ancestorChain: [] },
      nodes,
      edges,
    };
  }

  if (before.focusedTeam && after.focusedTeam && before.focusedTeam.id === after.focusedTeam.id) {
    const mergedFocused = mergeTeam(before.focusedTeam, after.focusedTeam, nodes, edges);
    return {
      slice: {
        teams: mergedFocused.children.filter((c): c is TeamNode => c.kind === "team"),
        focusedTeam: mergedFocused,
        ancestorChain: after.ancestorChain,
      },
      nodes,
      edges,
    };
  }

  // Fallback: one side has a focused team the other doesn't.
  const focused = after.focusedTeam ?? before.focusedTeam;
  if (focused === null) {
    // Shouldn't happen given the checks above, but be defensive.
    return {
      slice: { teams: after.teams, focusedTeam: null, ancestorChain: after.ancestorChain },
      nodes,
      edges,
    };
  }
  const state: "added" | "removed" = after.focusedTeam ? "added" : "removed";
  setDescriptiveStateForTeam(focused, state, nodes, edges);
  return {
    slice: {
      teams: focused.children.filter((c): c is TeamNode => c.kind === "team"),
      focusedTeam: focused,
      ancestorChain: (after.focusedTeam ? after : before).ancestorChain,
    },
    nodes,
    edges,
  };
}
