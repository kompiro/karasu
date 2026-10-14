import { describe, expect, it } from "vitest";
import { compileSystemDiff, type SystemDiffCompileResult } from "../compile/compile-diff.js";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";
import { canvasMembershipFor } from "./layout-grouping.js";
import type { LayoutOptions } from "./layout-types.js";

// #3126: on the multi-system root in compare mode only `systems[0]`'s children
// were diffed, and before/after each took *their own* first system as that
// frame, so adding or removing the first system diffed two different systems'
// children against each other. Every frame now diffs its own children, paired
// with the same system on the other side by id (TPL-3126). AT-3126.

const BASE = `
system Shop {
  service Api {}
  service Worker {}
  Api -> Worker
}
system Admin {
  service Console { description "admin" }
  service Jobs {}
  Console -> Jobs
}
`;

const WITH_MAIL = BASE.replace("service Jobs {}", "service Jobs {}\n  service Mail {}");

const diff = async (
  before: string,
  after: string,
  options: {
    groupBy?: "team";
    expandedContainers?: ReadonlySet<string>;
    selectedFacets?: readonly string[];
  } = {},
): Promise<SystemDiffCompileResult> => {
  const fs = new InMemoryFileSystemProvider();
  await fs.writeFile("/before.krs", before);
  await fs.writeFile("/after.krs", after);
  return compileSystemDiff({
    beforeEntryPath: "/before.krs",
    afterEntryPath: "/after.krs",
    fs,
    viewPath: [],
    ...options,
  });
};

/** `data-diff-state` of every card, keyed by its `data-node-path`. */
const cardStates = (svg: string): Record<string, string | null> => {
  const out: Record<string, string | null> = {};
  for (const m of svg.matchAll(/<g [^>]*data-node-path="([^"]+)"[^>]*>/g)) {
    out[m[1]] = /data-diff-state="([^"]+)"/.exec(m[0])?.[1] ?? null;
  }
  return out;
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The first `<rect>` after the element whose opening tag matches `open`. */
const rectAfter = (svg: string, open: RegExp): Box => {
  const m = open.exec(svg);
  if (!m) throw new Error(`no element for ${open}`);
  const rect = /<rect\s[^>]*>/.exec(svg.slice(m.index + m[0].length));
  if (!rect) throw new Error(`no rect after ${open}`);
  const num = (attr: string): number =>
    Number(new RegExp(`\\b${attr}="(-?[\\d.]+)"`).exec(rect[0])?.[1] ?? NaN);
  return { x: num("x"), y: num("y"), w: num("width"), h: num("height") };
};

const cardBox = (svg: string, path: string): Box =>
  rectAfter(svg, new RegExp(`<g [^>]*data-node-path="${path.replace(".", "\\.")}"[^>]*>`));

const frameBox = (svg: string, id: string): Box =>
  rectAfter(svg, new RegExp(`<g [^>]*data-container-id="${id}"[^>]*>`));

const inside = (n: Box, c: Box): boolean =>
  n.x >= c.x && n.y >= c.y && n.x + n.w <= c.x + c.w && n.y + n.h <= c.y + c.h;

describe("root compare mode diffs every system frame by system id (#3126)", () => {
  it("gives a changed child of a non-first system its own state", async () => {
    const r = await diff(BASE, BASE.replace('"admin"', '"admin v2"'));
    expect(cardStates(r.svg)).toMatchObject({
      "Shop.Api": "unchanged",
      "Shop.Worker": "unchanged",
      "Admin.Console": "changed",
      "Admin.Jobs": "unchanged",
    });
    expect(r.nodeDiffByPath.get("Admin.Console")?.changes?.description).toEqual({
      before: "admin",
      after: "admin v2",
    });
  });

  it("keys a changed child of the first system by its system-scoped path", async () => {
    // The first frame's cards are keyed through after's canvas scope, which on
    // the root is `systems[0]`: `Shop.Web`, and `Shop.Api.Orders` for a domain
    // spliced in under its expanded service. An unscoped key would leave both
    // drawn without a state.
    const MODEL = (description: string) => `system Shop {
  service Api {
    domain Orders { description "${description}" }
  }
  service Web { description "${description}" }
}
system Admin {
  service Console {}
}
`;
    const r = await diff(MODEL("v1"), MODEL("v2"), { expandedContainers: new Set(["Api"]) });
    expect(cardStates(r.svg)).toEqual({
      "Shop.Api.Orders": "changed",
      "Shop.Web": "changed",
      "Admin.Console": "unchanged",
    });
    expect([...r.nodeDiffByPath.keys()]).toEqual(
      expect.arrayContaining(["Shop.Api.Orders", "Shop.Web", "Admin.Console"]),
    );
  });

  it("marks a child added to a non-first system as added", async () => {
    const r = await diff(BASE, WITH_MAIL);
    expect(cardStates(r.svg)["Admin.Mail"]).toBe("added");
  });

  it("draws a child removed from a non-first system, inside that system's frame", async () => {
    const r = await diff(WITH_MAIL, BASE);
    expect(cardStates(r.svg)["Admin.Mail"]).toBe("removed");
    expect(inside(cardBox(r.svg, "Admin.Mail"), frameBox(r.svg, "Admin"))).toBe(true);
  });

  it("draws every child of a removed non-first system as removed", async () => {
    const r = await diff(BASE, BASE.replace(/system Admin \{[\s\S]*?\n\}\n/, ""));
    expect(cardStates(r.svg)).toMatchObject({
      "Shop.Api": "unchanged",
      "Admin.Console": "removed",
      "Admin.Jobs": "removed",
    });
  });

  it("leaves the other systems unchanged when a system is added first", async () => {
    const r = await diff(BASE, `system Billing { service Pay {} }\n${BASE}`);
    const states = cardStates(r.svg);
    expect(states).toEqual({
      "Billing.Pay": "added",
      "Shop.Api": "unchanged",
      "Shop.Worker": "unchanged",
      "Admin.Console": "unchanged",
      "Admin.Jobs": "unchanged",
    });
    // The old first system's children stay in their own frame, not Billing's.
    expect(inside(cardBox(r.svg, "Shop.Api"), frameBox(r.svg, "Shop"))).toBe(true);
  });

  it("removes only the first system's children when the first system is removed", async () => {
    const r = await diff(BASE, BASE.replace(/system Shop \{[\s\S]*?\n\}\n/, ""));
    expect(cardStates(r.svg)).toEqual({
      "Admin.Console": "unchanged",
      "Admin.Jobs": "unchanged",
      "Shop.Api": "removed",
      "Shop.Worker": "removed",
    });
    expect(inside(cardBox(r.svg, "Shop.Api"), frameBox(r.svg, "Shop"))).toBe(true);
    expect(inside(cardBox(r.svg, "Admin.Console"), frameBox(r.svg, "Admin"))).toBe(true);
  });

  it("draws every system's children as removed in its own frame when the model is emptied", async () => {
    const r = await diff(BASE, "");
    expect(cardStates(r.svg)).toEqual({
      "Shop.Api": "removed",
      "Shop.Worker": "removed",
      "Admin.Console": "removed",
      "Admin.Jobs": "removed",
    });
    expect(inside(cardBox(r.svg, "Shop.Api"), frameBox(r.svg, "Shop"))).toBe(true);
    expect(inside(cardBox(r.svg, "Admin.Jobs"), frameBox(r.svg, "Admin"))).toBe(true);
  });

  it("gives same-id cards their own states, and the bare id the winner's", async () => {
    const SAME = (adminDescription: string, migration: "Shop" | "Admin") => `
system Shop {
  service Api ${migration === "Shop" ? "@migration_target " : ""}{ description "shop" }
}
system Admin {
  service Api ${migration === "Admin" ? "@migration_target " : ""}{ description "${adminDescription}" }
}
`;
    for (const winner of ["Shop", "Admin"] as const) {
      const r = await diff(SAME("admin", winner), SAME("admin v2", winner));
      expect(cardStates(r.svg)).toEqual({ "Shop.Api": "unchanged", "Admin.Api": "changed" });
      expect(r.nodeDiff.get("Api")?.state).toBe(winner === "Shop" ? "unchanged" : "changed");
    }
  });

  it("returns a child removed from a non-first system to its own team's band", async () => {
    // Shop.Mail shares the id and wins it (first declared), so a backfill keyed
    // by the bare id would look up Shop.Mail, find it unchanged, and leave the
    // removed Admin.Mail out of every band.
    // The after model drops the `owns` with the service, so only the backfill
    // from before can put the removed card back in its band.
    const ORG = (opsOwnsMail: boolean) => `
organization Org {
  team "ops" { ${opsOwnsMail ? "owns Admin.Mail" : ""} }
  team "core" { owns Shop.Mail }
}
`;
    const withShopMail = (krs: string) =>
      krs.replace("service Worker {}", "service Worker {}\n  service Mail {}");
    const r = await diff(withShopMail(WITH_MAIL) + ORG(true), withShopMail(BASE) + ORG(false), {
      groupBy: "team",
    });
    expect(cardStates(r.svg)).toMatchObject({ "Shop.Mail": "unchanged", "Admin.Mail": "removed" });
    const opsFrame = rectAfter(r.svg, /<g [^>]*data-container-id="__group_[^"]*ops[^"]*"[^>]*>/);
    expect(inside(cardBox(r.svg, "Admin.Mail"), opsFrame)).toBe(true);
  });

  it("builds the first frame the same way on both sides when it was not before's first", async () => {
    // Before's first system is Admin; after drops it, so Shop becomes the first
    // frame and carries the in-place expansion of Api. Before's Shop must be
    // expanded too, or its Api reads as removed next to its own frame.
    const SHOP = `system Shop {
  service Api {
    domain Orders {}
  }
  service Web {}
}
`;
    const r = await diff(`system Admin { service Console {} }\n${SHOP}`, SHOP, {
      expandedContainers: new Set(["Api"]),
    });
    expect(cardStates(r.svg)).toEqual({
      "Shop.Api.Orders": "unchanged",
      "Shop.Web": "unchanged",
      "Admin.Console": "removed",
    });
  });

  it("keeps another frame's card on its own path when it shares an expanded member's id", async () => {
    const MODEL = (description: string) => `system Shop {
  service Api {
    domain Orders {}
  }
}
system Admin {
  service Orders { description "${description}" }
}
`;
    const r = await diff(MODEL("v1"), MODEL("v2"), { expandedContainers: new Set(["Api"]) });
    expect(cardStates(r.svg)).toEqual({
      "Shop.Api.Orders": "unchanged",
      "Admin.Orders": "changed",
    });
  });

  it("rings a removed card for a facet only it carried, beside a surviving same-named card", async () => {
    const before = `facet pii {}
system Shop {
  service Mail {}
}
system Admin {
  service Mail { facets pii }
  service Jobs {}
}
`;
    const after = `system Shop {
  service Mail {}
}
system Admin {
  service Jobs {}
}
`;
    const r = await diff(before, after, { selectedFacets: ["pii"] });
    const card = (path: string) =>
      new RegExp(`<g [^>]*data-node-path="${path.replace(".", "\\.")}"[^>]*>`).exec(r.svg)?.[0] ??
      "";
    expect(cardStates(r.svg)).toMatchObject({ "Shop.Mail": "unchanged", "Admin.Mail": "removed" });
    expect(card("Admin.Mail")).toContain('data-facet-member="pii"');
    expect(card("Shop.Mail")).not.toContain('data-facet-member="pii"');
  });

  it("cuts a removed card back to its primary boundary by its own state, not a same-named card's", () => {
    const options = {
      groupBy: "boundary",
      boundaryMembership: new Map([
        ["Shop.Mail", ["a", "b"]],
        ["Admin.Mail", ["a", "b"]],
      ]),
      // The bare id answers with Shop.Mail, which survives.
      nodeDiffState: new Map([["Mail", "unchanged"]]),
      nodeDiffMetaByPath: new Map([
        ["Shop.Mail", { state: "unchanged" }],
        ["Admin.Mail", { state: "removed" }],
      ]),
    } as LayoutOptions;
    expect(canvasMembershipFor(["Admin"], options)?.get("Mail")).toEqual(["a"]);
    expect(canvasMembershipFor(["Shop"], options)?.get("Mail")).toEqual(["a", "b"]);
  });
});
