import { describe, it, expect } from "vitest";
import { extractOrgView } from "./org-view-extract.js";
import type { OrganizationBlock, TeamNode, OrgNode } from "../types/ast.js";

const mockLoc = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
};

function makeTeam(
  id: string,
  opts: { members?: { id: string }[]; teams?: TeamNode[]; owns?: string[] } = {},
): TeamNode {
  const children: OrgNode[] = [
    ...(opts.members ?? []).map(
      (m): OrgNode => ({
        kind: "member",
        id: m.id,
        properties: { links: [] },
        children: [],
        loc: mockLoc,
      }),
    ),
    ...(opts.teams ?? []),
  ];
  return {
    kind: "team",
    id,
    annotations: [],
    properties: { links: [], owns: opts.owns ?? [] },
    children,
    loc: mockLoc,
  };
}

function makeOrg(id: string, teams: TeamNode[]): OrganizationBlock {
  return { id, properties: { links: [] }, teams, loc: mockLoc };
}

describe("extractOrgView", () => {
  it("returns empty slice for empty organizations", () => {
    const slice = extractOrgView([], []);
    expect(slice.teams).toHaveLength(0);
    expect(slice.focusedTeam).toBeNull();
    expect(slice.ancestorChain).toHaveLength(0);
  });

  it("flattens all orgs at path=[]", () => {
    const org1 = makeOrg("Org1", [makeTeam("backend"), makeTeam("frontend")]);
    const org2 = makeOrg("Org2", [makeTeam("design")]);
    const slice = extractOrgView([org1, org2], []);
    expect(slice.teams).toHaveLength(3);
    expect(slice.teams.map((t) => t.id)).toEqual(["backend", "frontend", "design"]);
    expect(slice.focusedTeam).toBeNull();
  });

  it("drills into a team", () => {
    const backend = makeTeam("backend", {
      members: [{ id: "alice" }, { id: "bob" }],
      teams: [makeTeam("sre")],
    });
    const org = makeOrg("Corp", [backend, makeTeam("frontend")]);
    const slice = extractOrgView([org], ["backend"]);
    expect(slice.focusedTeam?.id).toBe("backend");
    expect(slice.teams).toHaveLength(1); // sub-teams
    expect(slice.teams[0].id).toBe("sre");
    expect(slice.ancestorChain).toHaveLength(0);
  });

  it("builds ancestorChain for nested drill-down", () => {
    const infra = makeTeam("infra", { members: [{ id: "dave" }] });
    const platform = makeTeam("platform", { teams: [infra] });
    const org = makeOrg("Corp", [platform]);
    const slice = extractOrgView([org], ["platform", "infra"]);
    expect(slice.focusedTeam?.id).toBe("infra");
    expect(slice.ancestorChain).toHaveLength(1);
    expect(slice.ancestorChain[0].id).toBe("platform");
  });

  it("returns top-level fallback for unknown path segment", () => {
    const org = makeOrg("Corp", [makeTeam("backend")]);
    const slice = extractOrgView([org], ["nonexistent"]);
    expect(slice.focusedTeam).toBeNull();
    expect(slice.teams.map((t) => t.id)).toEqual(["backend"]);
  });
});
