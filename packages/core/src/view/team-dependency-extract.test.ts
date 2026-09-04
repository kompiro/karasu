import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { ImportResolver } from "../fs/import-resolver.js";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";
import { extractTeamDependencies, type TeamDependency } from "./team-dependency-extract.js";

/**
 * The shape every case below leans on: three services under one system, each
 * held by a team, plus a sub-team, an unowned service, a client nobody owns and
 * an actor. Cross-service dependencies are recorded at domain granularity —
 * which is what makes ownership inheritance load-bearing rather than a nicety.
 */
const MODEL = `
system Shop {
  service Checkout {
    domain Cart {
      Cart -> Authorization "Authorize card"
      Cart --> Picking "Reserve stock"
      Cart -> Pricing "Quote"
    }
    domain Pricing {}
  }
  service Payments {
    domain Authorization {}
    domain Settlement {}
  }
  service Fulfillment {
    domain Picking {}
    domain Shipping {
      Shipping --> Settlement "Settle on ship"
    }
  }
  service Platform {}
  client Storefront [web]
  user Shopper

  Shopper -> Storefront "Browse"
  Storefront -> Checkout "Place order"
  Checkout -> Platform "Read config"
}

organization Shop {
  team checkout {
    label "Checkout Team"
    owns Checkout
  }
  team payments {
    label "Payments Team"
    owns Payments

    team pci {
      label "PCI Working Group"
      owns Settlement
    }
  }
  team fulfillment {
    label "Fulfillment Team"
    owns Fulfillment
  }
}
`;

function report(source: string) {
  return extractTeamDependencies(Parser.parse(source).value);
}

function find(
  deps: TeamDependency[],
  fromTeam: string,
  toTeam: string,
  kind?: string,
): TeamDependency | undefined {
  return deps.find(
    (d) =>
      d.fromTeam === fromTeam && d.toTeam === toTeam && (kind === undefined || d.kind === kind),
  );
}

describe("extractTeamDependencies", () => {
  it("derives one dependency per team pair per edge kind, with the inducing edges as provenance", () => {
    const { dependencies } = report(MODEL);

    const dep = find(dependencies, "checkout", "payments", "sync");
    expect(dep).toBeDefined();
    expect(dep!.relation).toBe("cross-team");
    expect(dep!.via.map((v) => `${v.fromPath} -> ${v.toPath}`)).toEqual([
      "Shop.Checkout.Cart -> Shop.Payments.Authorization",
    ]);
    expect(dep!.via[0].label).toBe("Authorize card");
  });

  it("resolves a domain with no `owns` of its own to its nearest owned ancestor's team", () => {
    const dep = find(report(MODEL).dependencies, "checkout", "payments", "sync")!;
    // Neither Cart nor Authorization carries `owns`; both teams come from the
    // enclosing service, and the derivation says so rather than implying the
    // domain was named in an `owns` line.
    expect(dep.via[0].fromInherited).toBe(true);
    expect(dep.via[0].toInherited).toBe(true);
  });

  it("keeps sync and async as separate dependencies for one team pair", () => {
    const { dependencies } = report(`
system S {
  service A { domain Da { Da -> Db "call"
    Da --> Db "event" } }
  service B { domain Db {} }
}
organization O {
  team ta { owns A }
  team tb { owns B }
}
`);
    expect(dependencies.filter((d) => d.fromTeam === "ta" && d.toTeam === "tb")).toHaveLength(2);
    expect(find(dependencies, "ta", "tb", "sync")).toBeDefined();
    expect(find(dependencies, "ta", "tb", "async")).toBeDefined();
  });

  it("derives no dependency from an edge whose endpoints resolve to the same team", () => {
    const { dependencies } = report(MODEL);
    // `Cart -> Pricing` is Checkout-internal: both sides inherit `checkout`.
    expect(dependencies.some((d) => d.fromTeam === d.toTeam)).toBe(false);
    expect(
      dependencies.every((d) => d.via.every((v) => v.toPath !== "Shop.Checkout.Pricing")),
    ).toBe(true);
  });

  it("marks a pair where one team is nested inside the other as `nested`", () => {
    const dep = find(report(MODEL).dependencies, "fulfillment", "pci", "async");
    expect(dep).toBeDefined();
    // `pci` is a sub-team of `payments`; `fulfillment` is not, so this pair is
    // still a genuine cross-team one. The nested case is checked below.
    expect(dep!.relation).toBe("cross-team");

    const nested = report(`
system S {
  service A { domain Da { Da -> Db "call" } }
  service B { domain Db {} }
}
organization O {
  team parent {
    owns A
    team child { owns B }
  }
}
`);
    expect(nested.dependencies).toHaveLength(1);
    expect(nested.dependencies[0].relation).toBe("nested");
  });

  it("keeps every owner of a co-owned node, so the outgoing team survives a handoff (TPL-2161)", () => {
    const { dependencies } = report(`
system S {
  service Checkout { domain Cart { Cart -> Auth "authorize" } }
  service Payments { domain Auth {} }
}
organization O {
  team checkout { owns Checkout }
  team oldPay { owns Payments }
  team newPay @migration_target { owns Payments }
}
`);
    // `ownerIndex` would collapse Payments to `newPay` (ADR-1583 priority) and
    // the team being handed away from would vanish from the derived graph —
    // exactly the coordination partner a handoff needs.
    expect(find(dependencies, "checkout", "oldPay", "sync")).toBeDefined();
    expect(find(dependencies, "checkout", "newPay", "sync")).toBeDefined();
  });

  it("surfaces endpoints that resolve to no owning team", () => {
    const { unowned } = report(MODEL);
    const paths = unowned.map((u) => u.path);
    expect(paths).toContain("Shop.Platform");
    expect(paths).toContain("Shop.Storefront");
    expect(unowned.find((u) => u.path === "Shop.Platform")!.kind).toBe("service");
  });

  it("does not count a `user` endpoint as unowned — an actor is not ownable", () => {
    const { unowned } = report(MODEL);
    expect(unowned.map((u) => u.path)).not.toContain("Shop.Shopper");
    expect(unowned.every((u) => u.kind !== "user")).toBe(true);
  });

  it("lists every declared team, including ones no edge reaches", () => {
    expect(report(MODEL).teams.map((t) => t.id)).toEqual([
      "checkout",
      "payments",
      "pci",
      "fulfillment",
    ]);
    expect(report(MODEL).teams[2].label).toBe("PCI Working Group");
  });

  it("returns an empty report for a model with no organization", () => {
    const empty = report(`system S { service A { } service B { } A -> B }`);
    expect(empty.teams).toEqual([]);
    expect(empty.dependencies).toEqual([]);
  });

  it("derives across a multi-file model whose organization blocks are unioned (S4)", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/p/index.krs",
      `import "./system.krs"
import "./org-a.krs"
import "./org-b.krs"
`,
    );
    await fs.writeFile(
      "/p/system.krs",
      `system S {
  service A { domain Da { Da -> Db "call" } }
  service B { domain Db {} }
}
`,
    );
    await fs.writeFile("/p/org-a.krs", `organization O { team ta { owns A } }`);
    await fs.writeFile("/p/org-b.krs", `organization O { team tb { owns B } }`);

    const resolved = await new ImportResolver(fs).resolve("/p/index.krs");
    const { dependencies, teams } = extractTeamDependencies(resolved.krsFile);
    expect(teams.map((t) => t.id)).toEqual(["ta", "tb"]);
    expect(find(dependencies, "ta", "tb", "sync")).toBeDefined();
  });

  it("ignores relations declared inside an `entity` block", () => {
    const { dependencies } = report(`
system S {
  service A { domain Da { entity Order { Order -> Invoice } } }
  service B { domain Db { entity Invoice {} } }
}
organization O {
  team ta { owns A }
  team tb { owns B }
}
`);
    // An entity relation is an association between conceptual records, not a
    // call two teams have to coordinate over.
    expect(dependencies).toEqual([]);
  });
});

describe("extractTeamDependencies — reach and ownership units", () => {
  it("does not pair a bare endpoint with a same-named node in another system", () => {
    // The scope rule exempts `domain -> domain`, so this edge resolves through
    // the whole-model fallback. Unbounded, that fallback reaches `Db` in S2 and
    // names a coordination partner no view draws (TPL-2032 / TPL-2577).
    const { dependencies } = report(`
system S1 {
  service A { domain Da { Da -> Db "call" } }
  service B { domain Db {} }
}
system S2 {
  service C { domain Db {} }
}
organization O {
  team ta { owns A }
  team tb { owns B }
  team tc { owns C }
}
`);
    expect(find(dependencies, "ta", "tb", "sync")).toBeDefined();
    expect(find(dependencies, "ta", "tc")).toBeUndefined();
    // One authored edge, so the provenance count must read 1.
    expect(find(dependencies, "ta", "tb", "sync")!.via).toHaveLength(1);
  });

  it("ignores an `owns` naming a system, which the spec refuses as an ownership unit", () => {
    // `invalid-owns` reports it; letting it into the ownership relation would
    // hand that team every node in the system through the inheritance walk, and
    // the report would then claim full coverage on a refused claim.
    const { dependencies, unowned } = report(`
system Shop {
  service A { domain Da { Da -> Db "call" } }
  service B { domain Db {} }
}
organization O {
  team t1 { owns Shop }
  team t2 { owns B }
}
`);
    expect(dependencies).toEqual([]);
    expect(unowned.map((u) => u.path)).toContain("Shop.A.Da");
  });

  it("does not report a `system` endpoint as an ownership gap", () => {
    // A system can never be owned and has no ancestor to inherit from, so the
    // entry could never be closed — the same reason `user` is excluded.
    const { unowned } = report(`
system Shop {
  service Checkout {}
  Checkout -> Portal
}
system Portal { service Web {} }
organization O { team t { owns Checkout } }
`);
    expect(unowned.map((u) => u.path)).not.toContain("Portal");
    expect(unowned.every((u) => u.kind !== "system")).toBe(true);
  });

  it("still reports the resolvable end when the other endpoint names nothing", () => {
    const { unowned } = report(`
system Shop {
  service Platform {}
  Platform -> Typo
}
organization O { team t { owns Nothing } }
`);
    expect(unowned.map((u) => u.path)).toContain("Shop.Platform");
  });

  it("keeps two team pairs apart when a team id contains a space", () => {
    // `dependencyKey("Team", "A B", …)` and `dependencyKey("Team A", "B", …)`
    // collide under any printable separator.
    const { dependencies } = report(`
system S {
  service Sa { domain Da { Da -> Db "one"
    Da -> Dc "two" } }
  service Sb { domain Db {} }
  service Sc { domain Dc {} }
}
organization O {
  team "Team" { owns Sa }
  team "A B" { owns Sb }
  team "Team A" { owns Sc }
}
`);
    expect(find(dependencies, "Team", "A B", "sync")!.via).toHaveLength(1);
    expect(find(dependencies, "Team", "Team A", "sync")!.via).toHaveLength(1);
  });
});
