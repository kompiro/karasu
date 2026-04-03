import { describe, it, expect } from "vitest";
import { renderOrgView } from "./org-renderer.js";
import type { OrgViewSlice } from "../view/org-view-extract.js";
import type { ResolvedNodeStyle, ResolvedStyles } from "../types/style.js";
import type { TeamNode, MemberNode, OrgNode } from "../types/ast.js";

const mockLoc = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
};

const DEFAULT_STYLE: ResolvedNodeStyle = {
  backgroundColor: "#374151",
  color: "#F9FAFB",
  borderColor: "#4B5563",
  borderWidth: 2,
  borderStyle: "solid",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: "bold",
  fontFamily: "sans-serif",
  opacity: 1.0,
  shape: "box",
};

const DEFAULT_EDGE_STYLE = {
  color: "#94A3B8",
  strokeWidth: 1.5,
  fontSize: 11,
  strokeStyle: "solid" as const,
};

function makeStyles(nodeMap: Map<string, ResolvedNodeStyle> = new Map()): ResolvedStyles {
  return {
    nodes: nodeMap,
    edges: new Map(),
    defaultNodeStyle: DEFAULT_STYLE,
    defaultEdgeStyle: DEFAULT_EDGE_STYLE,
  };
}

function makeTeam(
  id: string,
  opts: {
    label?: string;
    members?: {
      id: string;
      label?: string;
      slack?: string;
      github?: string;
      description?: string;
    }[];
    teams?: TeamNode[];
    owns?: string[];
  } = {},
): TeamNode {
  const children: OrgNode[] = [
    ...(opts.members ?? []).map(
      (m): MemberNode => ({
        kind: "member",
        id: m.id,
        label: m.label,
        properties: {
          links: [],
          slack: m.slack,
          github: m.github,
          description: m.description,
        },
        children: [],
        loc: mockLoc,
      }),
    ),
    ...(opts.teams ?? []),
  ];
  return {
    kind: "team",
    id,
    label: opts.label,
    properties: { links: [], owns: opts.owns ?? [] },
    children,
    loc: mockLoc,
  };
}

describe("renderOrgView", () => {
  describe("top-level (focusedTeam === null)", () => {
    it("renders empty state when no teams", () => {
      const slice: OrgViewSlice = { teams: [], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles());
      expect(svg).toContain("No teams defined");
      expect(svg).toContain("<svg");
    });

    it("renders team cards in a grid", () => {
      const teams = [
        makeTeam("backend", { label: "Backend" }),
        makeTeam("frontend", { label: "Frontend" }),
      ];
      const slice: OrgViewSlice = { teams, focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles());
      expect(svg).toContain("Backend");
      expect(svg).toContain("Frontend");
      expect(svg).toContain('data-node-id="backend"');
      expect(svg).toContain('data-node-id="frontend"');
    });

    it("shows member and sub-team counts on team card", () => {
      const team = makeTeam("backend", {
        members: [{ id: "alice" }, { id: "bob" }],
        teams: [makeTeam("sre")],
      });
      const slice: OrgViewSlice = { teams: [team], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles());
      expect(svg).toContain("2 members");
      expect(svg).toContain("1 sub-team");
      expect(svg).toContain('data-has-children="true"');
    });

    it("renders owned services as clickable data-owned-service-button elements", () => {
      const team = makeTeam("backend", { owns: ["OrderService", "PaymentService"] });
      const slice: OrgViewSlice = { teams: [team], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles());
      expect(svg).toContain('data-owned-service-button="OrderService"');
      expect(svg).toContain('data-owned-service-button="PaymentService"');
      expect(svg).toContain("→ OrderService");
      expect(svg).toContain("→ PaymentService");
    });

    it("shows at most 3 owned service buttons with overflow count (no members)", () => {
      const team = makeTeam("backend", { owns: ["A", "B", "C", "D"] });
      const slice: OrgViewSlice = { teams: [team], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles());
      expect(svg).toContain('data-owned-service-button="A"');
      expect(svg).toContain('data-owned-service-button="B"');
      expect(svg).toContain('data-owned-service-button="C"');
      expect(svg).not.toContain('data-owned-service-button="D"');
      expect(svg).toContain("+1 more");
    });

    it("caps visible owns at 2 when overflow and countText both present to avoid overlap", () => {
      const team = makeTeam("backend", { owns: ["A", "B", "C", "D"] });
      team.children.push({
        kind: "member",
        id: "alice",
        label: "Alice",
        properties: { links: [] },
        children: [],
        loc: mockLoc,
      });
      const slice: OrgViewSlice = { teams: [team], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles());
      expect(svg).toContain('data-owned-service-button="A"');
      expect(svg).toContain('data-owned-service-button="B"');
      expect(svg).not.toContain('data-owned-service-button="C"');
      expect(svg).toContain("+2 more");
      expect(svg).toContain("1 member");
    });

    it("renders more than 3 cards in grid rows", () => {
      const teams = Array.from({ length: 5 }, (_, i) => makeTeam(`team${i}`));
      const slice: OrgViewSlice = { teams, focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles());
      expect(svg).toContain('data-node-id="team0"');
      expect(svg).toContain('data-node-id="team4"');
    });

    it("uses styleMap when available", () => {
      const team = makeTeam("backend");
      const customStyle: ResolvedNodeStyle = { ...DEFAULT_STYLE, backgroundColor: "#FF0000" };
      const styleMap = new Map([["backend", customStyle]]);
      const slice: OrgViewSlice = { teams: [team], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles(styleMap));
      expect(svg).toContain("#FF0000");
    });
  });

  describe("drill-down (focusedTeam !== null)", () => {
    it("renders empty state when focused team has no members or sub-teams", () => {
      const team = makeTeam("backend");
      const slice: OrgViewSlice = { teams: [], focusedTeam: team, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles());
      expect(svg).toContain("No members");
    });

    it("renders member cards for focused team members", () => {
      const team = makeTeam("backend", {
        members: [
          { id: "alice", label: "Alice" },
          { id: "bob", label: "Bob" },
        ],
      });
      const slice: OrgViewSlice = {
        teams: [],
        focusedTeam: team,
        ancestorChain: [],
      };
      const svg = renderOrgView(slice, makeStyles());
      expect(svg).toContain("Alice");
      expect(svg).toContain("Bob");
      expect(svg).toContain('data-node-id="alice"');
      expect(svg).toContain('data-node-id="bob"');
    });

    it("shows slack and github on member card", () => {
      const team = makeTeam("backend", {
        members: [{ id: "alice", slack: "@alice", github: "alice-gh" }],
      });
      const slice: OrgViewSlice = { teams: [], focusedTeam: team, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles());
      expect(svg).toContain("@alice · alice-gh");
    });

    it("shows description on member card (truncated at 40 chars)", () => {
      const team = makeTeam("backend", {
        members: [
          {
            id: "alice",
            description: "This is a very long description that exceeds forty characters in total",
          },
        ],
      });
      const slice: OrgViewSlice = { teams: [], focusedTeam: team, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles());
      expect(svg).toContain("This is a very long description that exc");
      expect(svg).not.toContain("exceeds forty characters in total");
    });

    it("renders sub-team cards alongside member cards", () => {
      const team = makeTeam("backend", {
        members: [{ id: "alice" }],
        teams: [makeTeam("sre", { label: "SRE" })],
      });
      const slice: OrgViewSlice = {
        teams: [makeTeam("sre", { label: "SRE" })],
        focusedTeam: team,
        ancestorChain: [],
      };
      const svg = renderOrgView(slice, makeStyles());
      expect(svg).toContain('data-node-id="alice"');
      expect(svg).toContain('data-node-id="sre"');
    });
  });

  describe("icon mode", () => {
    it("renders 160px wide cards for teams", () => {
      const teams = [makeTeam("backend", { label: "Backend" })];
      const slice: OrgViewSlice = { teams, focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles(), "icon");
      expect(svg).toContain('width="160"');
      expect(svg).toContain("Backend");
    });

    it("renders team label in icon card", () => {
      const teams = [makeTeam("alpha", { label: "Alpha Team" })];
      const slice: OrgViewSlice = { teams, focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles(), "icon");
      expect(svg).toContain('data-node-id="alpha"');
      expect(svg).toContain("Alpha Team");
    });

    it("shows member count as description in team icon card", () => {
      const team = makeTeam("ops", {
        members: [{ id: "alice" }, { id: "bob" }],
      });
      const slice: OrgViewSlice = { teams: [team], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles(), "icon");
      expect(svg).toContain("2 members");
    });

    it("renders 56px card height when team has no members or sub-teams", () => {
      const team = makeTeam("empty-team");
      const slice: OrgViewSlice = { teams: [team], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles(), "icon");
      expect(svg).toContain('height="56"');
    });

    it("renders 100px card height when team has members", () => {
      const team = makeTeam("ops", { members: [{ id: "alice" }] });
      const slice: OrgViewSlice = { teams: [team], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles(), "icon");
      expect(svg).toContain('height="100"');
    });

    it("renders member icon cards in drill-down", () => {
      const team = makeTeam("backend", {
        members: [{ id: "alice", label: "Alice" }],
      });
      const slice: OrgViewSlice = { teams: [], focusedTeam: team, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles(), "icon");
      expect(svg).toContain('data-node-id="alice"');
      expect(svg).toContain("Alice");
    });

    it("renders empty state in icon mode", () => {
      const slice: OrgViewSlice = { teams: [], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles(), "icon");
      expect(svg).toContain("No teams defined");
    });

    it("truncates wide CJK team label that exceeds card width", () => {
      // "プラットフォームチーム" = 11 katakana × 11.25px = ~124px > 116px label max
      // effective text budget = 116 - 7.5 (ellipsis) = 108.5px → fits 9 chars (101.25px)
      const team = makeTeam("platform", { label: "プラットフォームチーム" });
      const slice: OrgViewSlice = { teams: [team], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles(), "icon");
      expect(svg).toContain("プラットフォームチ…");
      expect(svg).not.toContain("プラットフォームチーム");
    });

    it("does not truncate ASCII label within card width", () => {
      const team = makeTeam("backend", { label: "Backend Team" });
      const slice: OrgViewSlice = { teams: [team], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, makeStyles(), "icon");
      expect(svg).toContain("Backend Team");
    });
  });
});
