import { boundaryScopeKey, scopedBoundaryGroupId } from "../types/ast.js";
import type { KrsFile, KrsNode, TeamNode } from "../types/ast.js";

/**
 * Group id → declared `label` for the active "Group by" axis (#2133).
 *
 * Group frames are titled with the group's declared label, falling back to the
 * bare group id when no label is given.
 *
 * Shaped like the membership indexes it labels: `model` holds model-wide
 * declarations (teams; top-level boundaries) keyed by bare id, `scoped` holds
 * per-scope `boundary` blocks keyed by {@link boundaryScopeKey} whose inner
 * maps are keyed by the scope-qualified group id (`scopedBoundaryGroupId`),
 * matching the axis `boundaryAxisFor` builds — the two key spaces are disjoint
 * by construction. Built per axis so a team id and an unrelated boundary id
 * sharing the same spelling can never borrow each other's label (the axis is a
 * distinguishing dimension — TPL-1352).
 */
export interface GroupLabelIndex {
  /** Model-wide labels: team ids, or top-level boundary ids (bare id keys). */
  model: Map<string, string>;
  /**
   * Labels from scoped `boundary` blocks, keyed by `boundaryScopeKey`; inner
   * maps are keyed by the scope-qualified group id and always carry an entry
   * (declared label, else the bare id) so the qualifier never becomes a title.
   */
  scoped: Map<string, Map<string, string>>;
}

export function buildGroupLabelIndex(
  krsFile: KrsFile,
  groupBy: "team" | "boundary" | undefined,
): GroupLabelIndex | undefined {
  if (groupBy === "team") {
    return { model: buildTeamLabelMap(krsFile), scoped: new Map() };
  }
  if (groupBy === "boundary") return buildBoundaryLabelIndex(krsFile);
  return undefined;
}

/**
 * The labels that apply to the canvas at `scopePath` — the model-wide map plus
 * that canvas's scoped declarations. Scoped entries are keyed by their
 * scope-qualified group id, so the two maps never collide; the union simply
 * covers every group the canvas's axis (`boundaryAxisFor`) can produce.
 */
export function groupLabelsFor(
  index: GroupLabelIndex | undefined,
  scopePath: readonly string[],
): Map<string, string> | undefined {
  if (index === undefined) return undefined;
  const scoped = index.scoped.get(boundaryScopeKey(scopePath));
  if (scoped === undefined || scoped.size === 0) return index.model;
  return new Map([...index.model, ...scoped]);
}

/**
 * Every group id the model *declares* on the axis, labelled or not (all team
 * ids; all boundary ids, top-level and scoped). Diff mode uses this to keep
 * before-side label backfill to groups the after model no longer declares —
 * a group kept but un-labelled must fall back to its id, not resurrect the
 * before label (the #1886 stale-state guard, applied to the label space).
 */
export function declaredGroupIds(
  krsFile: KrsFile,
  groupBy: "team" | "boundary" | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (groupBy === "team") {
    const walk = (teams: readonly TeamNode[]): void => {
      for (const team of teams) {
        ids.add(team.id);
        walk(team.children.filter((c): c is TeamNode => c.kind === "team"));
      }
    };
    for (const org of krsFile.organizations) walk(org.teams);
  } else if (groupBy === "boundary") {
    for (const boundary of krsFile.boundaries) ids.add(boundary.id);
    // Scoped declarations register under their scope-qualified group id — the
    // key the axis and the label maps use — so declaration identity matches
    // group identity ((scope, id), #2036).
    walkNodes(krsFile, (node, scopePath) => {
      for (const boundary of node.boundaries ?? []) {
        ids.add(scopedBoundaryGroupId(scopePath, boundary.id));
      }
    });
  }
  return ids;
}

/**
 * Team id → declared `label`, for every team in the model. Titles group frames
 * under `Group by: team` (via {@link buildGroupLabelIndex}) and, since #2157,
 * also names the owner on each card's `👥` chip — which is drawn on every axis,
 * hence a builder that does not take a `groupBy`.
 */
export function buildTeamLabelIndex(krsFile: KrsFile): Map<string, string> {
  return buildTeamLabelMap(krsFile);
}

function buildTeamLabelMap(krsFile: KrsFile): Map<string, string> {
  const labels = new Map<string, string>();
  const walk = (teams: readonly TeamNode[]): void => {
    for (const team of teams) {
      if (team.label !== undefined && !labels.has(team.id)) labels.set(team.id, team.label);
      walk(team.children.filter((c): c is TeamNode => c.kind === "team"));
    }
  };
  for (const org of krsFile.organizations) walk(org.teams);
  return labels;
}

function buildBoundaryLabelIndex(krsFile: KrsFile): GroupLabelIndex {
  // First-declared-wins within each tier, matching the first-declared-wins
  // register the boundary axis uses for membership (`duplicate-boundary-assignment`).
  const model = new Map<string, string>();
  for (const boundary of krsFile.boundaries) {
    if (boundary.label !== undefined && !model.has(boundary.id)) {
      model.set(boundary.id, boundary.label);
    }
  }
  const scoped = new Map<string, Map<string, string>>();
  walkNodes(krsFile, (node, scopePath) => {
    let entry: Map<string, string> | undefined;
    for (const boundary of node.boundaries ?? []) {
      if (entry === undefined) {
        const key = boundaryScopeKey(scopePath);
        entry = scoped.get(key);
        if (entry === undefined) {
          entry = new Map();
          scoped.set(key, entry);
        }
      }
      // Every scoped boundary gets an entry (label, else its bare id) so the
      // frame-title fallback never shows the scope-qualified group id.
      const groupId = scopedBoundaryGroupId(scopePath, boundary.id);
      if (!entry.has(groupId)) entry.set(groupId, boundary.label ?? boundary.id);
    }
  });
  return { model, scoped };
}

/** Walk every node that can host a scoped `boundary` block, with its scope path. */
function walkNodes(
  krsFile: KrsFile,
  visit: (node: KrsNode, scopePath: readonly string[]) => void,
): void {
  const walk = (node: KrsNode, ancestorIds: string[]): void => {
    const scopePath = [...ancestorIds, node.id];
    visit(node, scopePath);
    for (const child of node.children) walk(child, scopePath);
  };
  const roots = [
    ...krsFile.systems,
    ...krsFile.services,
    ...krsFile.clients,
    ...krsFile.domains,
    ...krsFile.databases,
    ...krsFile.queues,
    ...krsFile.storages,
  ];
  for (const root of roots) walk(root, []);
}
