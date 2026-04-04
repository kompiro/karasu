import type { OrganizationBlock, TeamNode } from "../types/ast.js";
import type { ViewPath } from "./view-extract.js";

/** @deprecated Use `ViewPath` instead. */
export type OrgViewPath = ViewPath;

export interface OrgViewSlice {
  teams: TeamNode[];
  focusedTeam: TeamNode | null;
  ancestorChain: TeamNode[];
}

function teamChildren(team: TeamNode): TeamNode[] {
  return team.children.filter((c): c is TeamNode => c.kind === "team");
}

function findTeamById(teams: TeamNode[], id: string): TeamNode | null {
  for (const team of teams) {
    if (team.id === id) return team;
    const found = findTeamById(teamChildren(team), id);
    if (found) return found;
  }
  return null;
}

export function extractOrgView(organizations: OrganizationBlock[], path: ViewPath): OrgViewSlice {
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
    currentTeams = teamChildren(found);
  }

  return {
    teams: focusedTeam ? teamChildren(focusedTeam) : [],
    focusedTeam,
    ancestorChain,
  };
}
