import type { OrganizationBlock, TeamNode } from "../types/ast.js";

/**
 * OrgViewPath identifies the drill-down position in the org hierarchy.
 * [] = all teams (top-level), ["teamId"] = team view, ["teamId", "subTeamId"] = sub-team view
 */
export type OrgViewPath = string[];

export interface OrgViewSlice {
  teams: TeamNode[];
  focusedTeam: TeamNode | null;
  ancestorChain: TeamNode[];
}

function findTeamById(teams: TeamNode[], id: string): TeamNode | null {
  for (const team of teams) {
    if (team.id === id) return team;
    const found = findTeamById(team.teams, id);
    if (found) return found;
  }
  return null;
}

export function extractOrgView(
  organizations: OrganizationBlock[],
  path: OrgViewPath,
): OrgViewSlice {
  const allTopLevelTeams = organizations.flatMap((org) => org.teams);

  if (path.length === 0) {
    return {
      teams: allTopLevelTeams,
      focusedTeam: null,
      ancestorChain: [],
    };
  }

  // Walk the path to find the focused team and build ancestor chain
  const ancestorChain: TeamNode[] = [];
  let currentTeams = allTopLevelTeams;
  let focusedTeam: TeamNode | null = null;

  for (const segment of path) {
    const found = currentTeams.find((t) => t.id === segment) ?? findTeamById(currentTeams, segment);
    if (!found) {
      return { teams: allTopLevelTeams, focusedTeam: null, ancestorChain: [] };
    }
    if (focusedTeam) {
      ancestorChain.push(focusedTeam);
    }
    focusedTeam = found;
    currentTeams = found.teams;
  }

  return {
    teams: focusedTeam?.teams ?? [],
    focusedTeam,
    ancestorChain,
  };
}
