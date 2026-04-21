import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { extractOrgView } from "../view/org-view-extract.js";
import { diffOrgViewSlices, ownsEdgeKey } from "./org-view-diff.js";

function orgViewOf(krs: string, viewPath: string[] = []) {
  const organizations = Parser.parse(krs).value.organizations;
  return extractOrgView(organizations, viewPath);
}

const BEFORE = `
system Shop {
  service Orders
  service Catalog
}
organization Acme {
  team teamA {
    owns Orders
    member alice { slack "@a" }
  }
  team teamB {
    owns Catalog
    member bob {}
  }
}
`;

const AFTER_ADDED_TEAM = `
system Shop {
  service Orders
  service Catalog
  service Payments
}
organization Acme {
  team teamA {
    owns Orders
    member alice { slack "@a" }
  }
  team teamB {
    owns Catalog
    member bob {}
  }
  team teamC {
    owns Payments
    member carol {}
  }
}
`;

const AFTER_OWNS_MOVED = `
system Shop {
  service Orders
  service Catalog
}
organization Acme {
  team teamA {
    owns Orders
    owns Catalog
    member alice { slack "@a" }
  }
  team teamB {
    member bob {}
  }
}
`;

const AFTER_MEMBER_CHANGED = `
system Shop {
  service Orders
  service Catalog
}
organization Acme {
  team teamA {
    owns Orders
    member alice { slack "@alice-new" label "Alice A" }
  }
  team teamB {
    owns Catalog
    member bob {}
  }
}
`;

describe("diffOrgViewSlices", () => {
  it("marks unchanged when inputs are identical", () => {
    const before = orgViewOf(BEFORE);
    const after = orgViewOf(BEFORE);
    const diff = diffOrgViewSlices(before, after);
    for (const meta of diff.nodes.values()) expect(meta.state).toBe("unchanged");
    for (const meta of diff.edges.values()) expect(meta.state).toBe("unchanged");
  });

  it("flags an added team, its members and owns edge", () => {
    const before = orgViewOf(BEFORE);
    const after = orgViewOf(AFTER_ADDED_TEAM);
    const diff = diffOrgViewSlices(before, after);
    expect(diff.nodes.get("teamC")?.state).toBe("added");
    expect(diff.nodes.get("carol")?.state).toBe("added");
    expect(diff.edges.get(ownsEdgeKey("teamC", "Payments"))?.state).toBe("added");
    expect(diff.nodes.get("teamA")?.state).toBe("unchanged");
  });

  it("flags owns reshuffle as added/removed edges with changed team state", () => {
    const before = orgViewOf(BEFORE);
    const after = orgViewOf(AFTER_OWNS_MOVED);
    const diff = diffOrgViewSlices(before, after);
    expect(diff.edges.get(ownsEdgeKey("teamA", "Catalog"))?.state).toBe("added");
    expect(diff.edges.get(ownsEdgeKey("teamB", "Catalog"))?.state).toBe("removed");
    expect(diff.nodes.get("teamA")?.state).toBe("changed");
    expect(diff.nodes.get("teamB")?.state).toBe("changed");
  });

  it("flags member label/slack change as 'changed'", () => {
    const before = orgViewOf(BEFORE);
    const after = orgViewOf(AFTER_MEMBER_CHANGED);
    const diff = diffOrgViewSlices(before, after);
    expect(diff.nodes.get("alice")?.state).toBe("changed");
    expect(diff.nodes.get("alice")?.changes?.label).toEqual({
      before: undefined,
      after: "Alice A",
    });
  });

  it("keeps removed team visible in the union slice", () => {
    const before = orgViewOf(AFTER_ADDED_TEAM);
    const after = orgViewOf(BEFORE);
    const diff = diffOrgViewSlices(before, after);
    expect(diff.nodes.get("teamC")?.state).toBe("removed");
    expect(diff.slice.teams.map((t) => t.id)).toContain("teamC");
  });

  it("drill-down: diffs children of focused team", () => {
    const before = orgViewOf(AFTER_OWNS_MOVED, ["teamA"]);
    const after = orgViewOf(BEFORE, ["teamA"]);
    const diff = diffOrgViewSlices(before, after);
    expect(diff.edges.get(ownsEdgeKey("teamA", "Catalog"))?.state).toBe("removed");
  });

  it("drill-down: focused team missing on before side is marked added", () => {
    // AFTER_ADDED_TEAM has teamC; BEFORE does not.
    // The drill path resolves on one side only; extract will return a null-focus
    // slice on the side where the team is absent (ancestorChain stays []).
    const beforeSlice = orgViewOf(BEFORE, ["teamC"]);
    const afterSlice = orgViewOf(AFTER_ADDED_TEAM, ["teamC"]);
    // Sanity: only after has the focus; before falls back to root (focusedTeam === null).
    expect(beforeSlice.focusedTeam).toBeNull();
    expect(afterSlice.focusedTeam?.id).toBe("teamC");
    const diff = diffOrgViewSlices(beforeSlice, afterSlice);
    expect(diff.slice.focusedTeam?.id).toBe("teamC");
    expect(diff.nodes.get("teamC")?.state).toBe("added");
    expect(diff.nodes.get("carol")?.state).toBe("added");
    expect(diff.edges.get(ownsEdgeKey("teamC", "Payments"))?.state).toBe("added");
  });

  it("kind flip (member↔team) keeps a single node without id collision", () => {
    const withMember = `
organization Acme {
  team teamA {
    member node1 {}
  }
}
`;
    const withTeam = `
organization Acme {
  team teamA {
    team node1 {
      member inner {}
    }
  }
}
`;
    const before = orgViewOf(withMember);
    const after = orgViewOf(withTeam);
    const diff = diffOrgViewSlices(before, after);
    // Only one node1 entry survives in the merged children to avoid
    // duplicate data-node-id in the rendered SVG.
    const teamA = diff.slice.teams.find((t) => t.id === "teamA");
    const node1Occurrences = teamA?.children.filter((c) => c.id === "node1") ?? [];
    expect(node1Occurrences).toHaveLength(1);
    expect(node1Occurrences[0].kind).toBe("team"); // after-side wins
    expect(diff.nodes.get("node1")?.state).toBe("changed");
  });
});
