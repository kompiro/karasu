import type { KrsFile, KrsNode, TeamNode } from "../types/ast.js";

/**
 * Group id → declared `label` for the active "Group by" axis (#2133).
 *
 * Group frames are titled with the group's declared label, falling back to the
 * group id when no label is given (`buildGroupFrames`'s default). The frame
 * *container id* stays `__group_<id>__` either way, so collapse keying and the
 * permalink surface are unaffected.
 *
 * Built per axis so a team id and an unrelated boundary id sharing the same
 * spelling can never borrow each other's label (the axis is a distinguishing
 * dimension — TPL-20260512-01).
 */
export function buildGroupLabelIndex(
  krsFile: KrsFile,
  groupBy: "team" | "boundary" | undefined,
): Map<string, string> | undefined {
  if (groupBy === "team") return buildTeamLabelIndex(krsFile);
  if (groupBy === "boundary") return buildBoundaryLabelIndex(krsFile);
  return undefined;
}

function buildTeamLabelIndex(krsFile: KrsFile): Map<string, string> {
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

function buildBoundaryLabelIndex(krsFile: KrsFile): Map<string, string> {
  const labels = new Map<string, string>();
  // Top-level blocks first, then scoped blocks in declaration order — matching
  // the first-declared-wins register the boundary axis already uses for
  // membership (`duplicate-boundary-assignment`). Scoped blocks reuse the
  // shared `__group_<id>__` container id today, so same-id declarations share
  // one label slot as they share one collapse state (#1884 precedent).
  for (const boundary of krsFile.boundaries) {
    if (boundary.label !== undefined && !labels.has(boundary.id)) {
      labels.set(boundary.id, boundary.label);
    }
  }
  const walk = (node: KrsNode): void => {
    for (const boundary of node.boundaries ?? []) {
      if (boundary.label !== undefined && !labels.has(boundary.id)) {
        labels.set(boundary.id, boundary.label);
      }
    }
    for (const child of node.children) walk(child);
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
  for (const root of roots) walk(root);
  return labels;
}
