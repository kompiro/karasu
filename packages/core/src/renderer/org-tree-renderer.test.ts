import { describe, it, expect } from "vitest";
import { renderOrgTreeView, collectAllTeamIds } from "./org-tree-renderer.js";
import type { OrganizationBlock, TeamNode, MemberNode } from "../types/ast.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_LOC = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
};

function member(id: string, label?: string): MemberNode {
  return {
    kind: "member",
    id,
    label,
    properties: { links: [], slack: undefined, github: undefined },
    children: [],
    loc: EMPTY_LOC,
  };
}

function team(id: string, label?: string, children: (TeamNode | MemberNode)[] = []): TeamNode {
  return {
    kind: "team",
    id,
    label,
    properties: { links: [], owns: [] },
    children,
    loc: EMPTY_LOC,
  };
}

function org(id: string, teams: TeamNode[]): OrganizationBlock {
  return { id, label: id, properties: { links: [] }, teams, loc: EMPTY_LOC };
}

// ---------------------------------------------------------------------------
// collectAllTeamIds
// ---------------------------------------------------------------------------

describe("collectAllTeamIds", () => {
  it("returns empty array for empty organizations", () => {
    expect(collectAllTeamIds([])).toEqual([]);
  });

  it("returns top-level team ids", () => {
    const orgs = [org("o1", [team("eng"), team("product")])];
    expect(collectAllTeamIds(orgs)).toEqual(["eng", "product"]);
  });

  it("returns nested team ids recursively", () => {
    const orgs = [org("o1", [team("eng", "Engineering", [team("backend"), team("frontend")])])];
    const ids = collectAllTeamIds(orgs);
    expect(ids).toContain("eng");
    expect(ids).toContain("backend");
    expect(ids).toContain("frontend");
    expect(ids).toHaveLength(3);
  });

  it("does not include member ids", () => {
    const orgs = [org("o1", [team("eng", "Eng", [member("alice")])])];
    const ids = collectAllTeamIds(orgs);
    expect(ids).toEqual(["eng"]);
    expect(ids).not.toContain("alice");
  });

  it("collects ids across multiple organization blocks", () => {
    const orgs = [org("o1", [team("eng")]), org("o2", [team("product")])];
    expect(collectAllTeamIds(orgs)).toEqual(["eng", "product"]);
  });
});

// ---------------------------------------------------------------------------
// renderOrgTreeView — SVG structure
// ---------------------------------------------------------------------------

describe("renderOrgTreeView", () => {
  it("renders empty-state SVG when no organizations provided", () => {
    const svg = renderOrgTreeView([], new Set());
    expect(svg).toContain("<svg");
    expect(svg).toContain("No teams defined");
  });

  it("renders an SVG element with xmlns", () => {
    const orgs = [org("o1", [team("eng")])];
    const svg = renderOrgTreeView(orgs, new Set());
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("includes team id as data-team-id attribute", () => {
    const orgs = [org("o1", [team("eng", "Engineering")])];
    const svg = renderOrgTreeView(orgs, new Set());
    expect(svg).toContain('data-team-id="eng"');
  });

  it("includes team label text", () => {
    const orgs = [org("o1", [team("eng", "Engineering")])];
    const svg = renderOrgTreeView(orgs, new Set());
    expect(svg).toContain("Engineering");
  });

  it("shows member count label when team has members", () => {
    const orgs = [org("o1", [team("eng", "Eng", [member("alice"), member("bob")])])];
    const svg = renderOrgTreeView(orgs, new Set());
    expect(svg).toContain("2 members");
  });

  it("shows singular 'member' for a single member", () => {
    const orgs = [org("o1", [team("eng", "Eng", [member("alice")])])];
    const svg = renderOrgTreeView(orgs, new Set());
    expect(svg).toContain("1 member");
    expect(svg).not.toContain("1 members");
  });

  it("does not render member cards when team is collapsed", () => {
    const orgs = [org("o1", [team("eng", "Eng", [member("alice", "Alice")])])];
    const svg = renderOrgTreeView(orgs, new Set());
    // Member card data-node-id should not appear
    expect(svg).not.toContain('data-node-id="alice"');
  });

  it("renders member cards when team is expanded", () => {
    const orgs = [org("o1", [team("eng", "Eng", [member("alice", "Alice")])])];
    const svg = renderOrgTreeView(orgs, new Set(["eng"]));
    expect(svg).toContain('data-node-id="alice"');
    expect(svg).toContain("Alice");
  });

  it("renders members in 3-column grid (all in same row for ≤3 members)", () => {
    const orgs = [org("o1", [team("eng", "Eng", [member("a"), member("b"), member("c")])])];
    const svg = renderOrgTreeView(orgs, new Set(["eng"]));
    // All 3 member cards should be present
    expect(svg).toContain('data-node-id="a"');
    expect(svg).toContain('data-node-id="b"');
    expect(svg).toContain('data-node-id="c"');
  });

  it("renders sub-team nodes", () => {
    const orgs = [
      org("o1", [
        team("eng", "Engineering", [team("backend", "Backend"), team("frontend", "Frontend")]),
      ]),
    ];
    const svg = renderOrgTreeView(orgs, new Set());
    expect(svg).toContain('data-team-id="backend"');
    expect(svg).toContain('data-team-id="frontend"');
  });

  it("renders bezier connector paths between parent and child", () => {
    const orgs = [org("o1", [team("eng", "Engineering", [team("backend", "Backend")])])];
    const svg = renderOrgTreeView(orgs, new Set());
    expect(svg).toContain("<path");
    expect(svg).toContain("C "); // bezier curve command
  });

  it("renders connector to member grid when expanded", () => {
    const orgs = [org("o1", [team("eng", "Eng", [member("alice")])])];
    const svg = renderOrgTreeView(orgs, new Set(["eng"]));
    expect(svg).toContain("<path");
  });

  describe("forExport option", () => {
    it("renders all members expanded when forExport is true", () => {
      const orgs = [
        org("o1", [team("eng", "Eng", [member("alice", "Alice"), member("bob", "Bob")])]),
      ];
      // No expandedIds passed, but forExport should still show all
      const svg = renderOrgTreeView(orgs, new Set(), { forExport: true });
      expect(svg).toContain('data-node-id="alice"');
      expect(svg).toContain('data-node-id="bob"');
    });

    it("renders normally without forExport (members hidden when collapsed)", () => {
      const orgs = [org("o1", [team("eng", "Eng", [member("alice", "Alice")])])];
      const svg = renderOrgTreeView(orgs, new Set());
      expect(svg).not.toContain('data-node-id="alice"');
    });
  });

  it("handles multiple top-level teams stacked vertically", () => {
    const orgs = [org("o1", [team("eng", "Engineering")]), org("o2", [team("product", "Product")])];
    const svg = renderOrgTreeView(orgs, new Set());
    expect(svg).toContain('data-team-id="eng"');
    expect(svg).toContain('data-team-id="product"');
  });
});
