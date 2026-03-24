import { describe, it, expect } from "vitest";
import { resolveOrgStyles, DEFAULT_ORG_NODE_STYLE } from "./org-styles.js";
import type { OrganizationBlock, TeamNode } from "../types/ast.js";
import type { StyleSheet } from "../types/style.js";
import { StyleParser } from "../parser/style-parser.js";

const mockLoc = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
};

function makeTeam(id: string, members: string[] = [], subTeams: TeamNode[] = []): TeamNode {
  return {
    id,
    properties: { links: [], owns: [] },
    members: members.map((mid) => ({
      id: mid,
      properties: { links: [] },
      loc: mockLoc,
    })),
    teams: subTeams,
    loc: mockLoc,
  };
}

function makeOrg(id: string, teams: TeamNode[]): OrganizationBlock {
  return { id, properties: { links: [] }, teams, loc: mockLoc };
}

function parseStyle(source: string): StyleSheet {
  return StyleParser.parse(source).value;
}

describe("resolveOrgStyles", () => {
  it("returns empty map for empty organizations", () => {
    const result = resolveOrgStyles([], []);
    expect(result.size).toBe(0);
  });

  it("collects team and member nodes with default styles", () => {
    const org = makeOrg("Corp", [makeTeam("backend", ["alice", "bob"])]);
    const result = resolveOrgStyles([org], []);
    expect(result.has("backend")).toBe(true);
    expect(result.has("alice")).toBe(true);
    expect(result.has("bob")).toBe(true);
  });

  it("collects nested sub-team nodes", () => {
    const sre = makeTeam("sre", ["dave"]);
    const backend = makeTeam("backend", [], [sre]);
    const org = makeOrg("Corp", [backend]);
    const result = resolveOrgStyles([org], []);
    expect(result.has("sre")).toBe(true);
    expect(result.has("dave")).toBe(true);
  });

  it("applies style by node ID", () => {
    const org = makeOrg("Corp", [makeTeam("backend")]);
    const sheet = parseStyle(`#backend { background-color: #FF0000; }`);
    const result = resolveOrgStyles([org], [sheet]);
    expect(result.get("backend")?.backgroundColor).toBe("#FF0000");
  });

  it("applies style by node type 'team'", () => {
    const org = makeOrg("Corp", [makeTeam("backend")]);
    const sheet = parseStyle(`team { background-color: #00FF00; }`);
    const result = resolveOrgStyles([org], [sheet]);
    expect(result.get("backend")?.backgroundColor).toBe("#00FF00");
  });

  it("applies style by node type 'member'", () => {
    const org = makeOrg("Corp", [makeTeam("backend", ["alice"])]);
    const sheet = parseStyle(`member { color: #ABCDEF; }`);
    const result = resolveOrgStyles([org], [sheet]);
    expect(result.get("alice")?.color).toBe("#ABCDEF");
  });

  it("does not apply team style to member nodes", () => {
    const org = makeOrg("Corp", [makeTeam("backend", ["alice"])]);
    const sheet = parseStyle(`team { background-color: #FF0000; }`);
    const result = resolveOrgStyles([org], [sheet]);
    expect(result.get("alice")?.backgroundColor).toBe(DEFAULT_ORG_NODE_STYLE.backgroundColor);
  });

  it("collects nodes from multiple organizations", () => {
    const org1 = makeOrg("Corp1", [makeTeam("backend")]);
    const org2 = makeOrg("Corp2", [makeTeam("frontend")]);
    const result = resolveOrgStyles([org1, org2], []);
    expect(result.has("backend")).toBe(true);
    expect(result.has("frontend")).toBe(true);
  });

  it("ID selector overrides type selector (higher specificity)", () => {
    const org = makeOrg("Corp", [makeTeam("backend")]);
    const sheet = parseStyle(
      `team { background-color: #111111; } #backend { background-color: #222222; }`,
    );
    const result = resolveOrgStyles([org], [sheet]);
    expect(result.get("backend")?.backgroundColor).toBe("#222222");
  });
});
