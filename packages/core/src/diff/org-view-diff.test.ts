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
});
