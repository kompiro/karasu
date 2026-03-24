import { describe, it, expect } from "vitest";
import { renderOrgView } from "./org-renderer.js";
import type { OrgViewSlice } from "../view/org-view-extract.js";
import type { ResolvedNodeStyle } from "../types/style.js";
import type { TeamNode, MemberNode } from "../types/ast.js";

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

function makeTeam(
  id: string,
  opts: {
    label?: string;
    members?: { id: string; label?: string; slack?: string; github?: string; description?: string }[];
    teams?: TeamNode[];
    owns?: string[];
  } = {},
): TeamNode {
  return {
    id,
    label: opts.label,
    properties: { links: [], owns: opts.owns ?? [] },
    members: (opts.members ?? []).map(
      (m): MemberNode => ({
        id: m.id,
        label: m.label,
        properties: {
          links: [],
          slack: m.slack,
          github: m.github,
          description: m.description,
        },
        loc: mockLoc,
      }),
    ),
    teams: opts.teams ?? [],
    loc: mockLoc,
  };
}

describe("renderOrgView", () => {
  describe("top-level (focusedTeam === null)", () => {
    it("renders empty state when no teams", () => {
      const slice: OrgViewSlice = { teams: [], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, new Map(), DEFAULT_STYLE);
      expect(svg).toContain("No teams defined");
      expect(svg).toContain("<svg");
    });

    it("renders team cards in a grid", () => {
      const teams = [
        makeTeam("backend", { label: "Backend" }),
        makeTeam("frontend", { label: "Frontend" }),
      ];
      const slice: OrgViewSlice = { teams, focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, new Map(), DEFAULT_STYLE);
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
      const svg = renderOrgView(slice, new Map(), DEFAULT_STYLE);
      expect(svg).toContain("2 members");
      expect(svg).toContain("1 sub-team");
      expect(svg).toContain('data-has-children="true"');
    });

    it("shows owns text on team card", () => {
      const team = makeTeam("backend", { owns: ["OrderService", "PaymentService"] });
      const slice: OrgViewSlice = { teams: [team], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, new Map(), DEFAULT_STYLE);
      expect(svg).toContain("owns: OrderService, PaymentService");
    });

    it("truncates owns list at 3 items with overflow count", () => {
      const team = makeTeam("backend", { owns: ["A", "B", "C", "D"] });
      const slice: OrgViewSlice = { teams: [team], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, new Map(), DEFAULT_STYLE);
      expect(svg).toContain("A, B, C +1");
    });

    it("renders more than 3 cards in grid rows", () => {
      const teams = Array.from({ length: 5 }, (_, i) => makeTeam(`team${i}`));
      const slice: OrgViewSlice = { teams, focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, new Map(), DEFAULT_STYLE);
      expect(svg).toContain('data-node-id="team0"');
      expect(svg).toContain('data-node-id="team4"');
    });

    it("uses styleMap when available", () => {
      const team = makeTeam("backend");
      const customStyle: ResolvedNodeStyle = { ...DEFAULT_STYLE, backgroundColor: "#FF0000" };
      const styleMap = new Map([["backend", customStyle]]);
      const slice: OrgViewSlice = { teams: [team], focusedTeam: null, ancestorChain: [] };
      const svg = renderOrgView(slice, styleMap, DEFAULT_STYLE);
      expect(svg).toContain("#FF0000");
    });
  });

  describe("drill-down (focusedTeam !== null)", () => {
    it("renders empty state when focused team has no members or sub-teams", () => {
      const team = makeTeam("backend");
      const slice: OrgViewSlice = { teams: [], focusedTeam: team, ancestorChain: [] };
      const svg = renderOrgView(slice, new Map(), DEFAULT_STYLE);
      expect(svg).toContain("No members");
    });

    it("renders member cards for focused team members", () => {
      const team = makeTeam("backend", {
        members: [{ id: "alice", label: "Alice" }, { id: "bob", label: "Bob" }],
      });
      const slice: OrgViewSlice = {
        teams: [],
        focusedTeam: team,
        ancestorChain: [],
      };
      const svg = renderOrgView(slice, new Map(), DEFAULT_STYLE);
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
      const svg = renderOrgView(slice, new Map(), DEFAULT_STYLE);
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
      const svg = renderOrgView(slice, new Map(), DEFAULT_STYLE);
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
      const svg = renderOrgView(slice, new Map(), DEFAULT_STYLE);
      expect(svg).toContain('data-node-id="alice"');
      expect(svg).toContain('data-node-id="sre"');
    });
  });
});
