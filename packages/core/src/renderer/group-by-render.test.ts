import { describe, it, expect } from "vitest";
import { compile } from "../index.js";

// A system with two teams (payments owns Billing/Wallet, catalog owns
// Search/Catalog) plus an un-owned infra store and an [external] service.
const SYS = `
system Shop {
  service Billing { label "Billing" }
  service Wallet { label "Wallet" }
  service Search { label "Search" }
  service Catalog { label "Catalog" }

  database ShopDB { label "Shop DB" }
  service Stripe [external] { label "Stripe" }

  Billing -> Wallet "debit"
  Search -> Catalog "read"
  Billing -> Catalog "reserve"
  Billing -> ShopDB "persist"
  Billing -> Stripe "authorize"
}

organization Org {
  team "payments" {
    label "Payments"
    owns Billing
    owns Wallet
  }
  team "catalog" {
    label "Catalog"
    owns Search
    owns Catalog
  }
}
`;

function svgOf(groupBy?: "team"): string {
  const result = compile(SYS, { diagramType: "system", groupBy });
  if (result.diagramType !== "system") throw new Error("expected system view");
  return result.svg;
}

describe("compile() with groupBy: team", () => {
  it("does not change output when groupBy is omitted (opt-in; no regression)", () => {
    // Byte-for-byte identical to not passing the option at all — the grouped
    // path is inert until the viewer opts in.
    const withUndefined = svgOf(undefined);
    const withoutOption = (() => {
      const r = compile(SYS, { diagramType: "system" });
      if (r.diagramType !== "system") throw new Error("expected system view");
      return r.svg;
    })();
    expect(withUndefined).toBe(withoutOption);
    expect(withUndefined).not.toContain('data-group="true"');
  });

  it("draws one boundary frame per team when grouped", () => {
    const svg = svgOf("team");
    expect(svg).toContain('data-container-id="__group_payments__"');
    expect(svg).toContain('data-container-id="__group_catalog__"');
    expect(svg.match(/data-group="true"/g)?.length).toBe(2);
  });

  it("still renders every node exactly once, grouped (TPL-20260624-02: totality)", () => {
    const svg = svgOf("team");
    for (const id of ["Billing", "Wallet", "Search", "Catalog", "ShopDB", "Stripe"]) {
      expect(svg.match(new RegExp(`data-node-id="${id}"`, "g"))?.length).toBe(1);
    }
  });

  it("leaves un-owned infra / external un-framed (they stay in the trailing band)", () => {
    const svg = svgOf("team");
    // No group frame is minted for a node that no team owns.
    expect(svg).not.toContain('data-container-id="__group_"');
    expect(svg).toContain('data-node-id="ShopDB"');
    expect(svg).toContain('data-node-id="Stripe"');
  });

  it("falls back to the ungrouped layout when the model has no owners", () => {
    const noOrg = `
system Shop {
  service A { label "A" }
  service B { label "B" }
  A -> B "x"
}
`;
    const grouped = compile(noOrg, { diagramType: "system", groupBy: "team" });
    const plain = compile(noOrg, { diagramType: "system" });
    if (grouped.diagramType !== "system" || plain.diagramType !== "system") {
      throw new Error("expected system view");
    }
    // No owners → no groups → identical to the default layout.
    expect(grouped.svg).toBe(plain.svg);
    expect(grouped.svg).not.toContain('data-group="true"');
  });

  it("collapses a team to a stub and re-targets its cross-group edges (#1858 slice B)", () => {
    const collapsed = compile(SYS, {
      diagramType: "system",
      groupBy: "team",
      collapsedGroups: new Set(["payments"]),
    });
    if (collapsed.diagramType !== "system") throw new Error("expected system view");
    // payments' members (Billing, Wallet) are folded into one stub …
    expect(collapsed.svg).not.toContain('data-node-id="Billing"');
    expect(collapsed.svg).not.toContain('data-node-id="Wallet"');
    expect(collapsed.svg).toContain('data-node-id="__group_collapsed_payments__"');
    expect(collapsed.svg).toContain("payments (2)");
    // … while the catalog team stays expanded and framed.
    expect(collapsed.svg).toContain('data-node-id="Search"');
    expect(collapsed.svg).toContain('data-container-id="__group_payments__"');
  });

  it("collapsing every team keeps a stub per team (the group-DAG view)", () => {
    const allCollapsed = compile(SYS, {
      diagramType: "system",
      groupBy: "team",
      collapsedGroups: new Set(["payments", "catalog"]),
    });
    if (allCollapsed.diagramType !== "system") throw new Error("expected system view");
    expect(allCollapsed.svg).toContain('data-node-id="__group_collapsed_payments__"');
    expect(allCollapsed.svg).toContain('data-node-id="__group_collapsed_catalog__"');
    // No owned service card remains.
    for (const id of ["Billing", "Wallet", "Search", "Catalog"]) {
      expect(allCollapsed.svg).not.toContain(`data-node-id="${id}"`);
    }
  });

  it("dashes an against-flow (backward) inter-group edge in grouped mode (#1859 P2c-A, AC-4)", () => {
    // Search (catalog band, below) → Wallet (payments band, above) runs against
    // the top-to-bottom flow with no return path (acyclic), so it renders
    // dashed — distinct from a cyclic edge, which keeps its own styling.
    const withBack = SYS.replace(
      'Search -> Catalog "read"',
      'Search -> Catalog "read"\n  Search -> Wallet "notify"',
    );
    const grouped = compile(withBack, { diagramType: "system", groupBy: "team" });
    if (grouped.diagramType !== "system") throw new Error("expected system view");
    // The Search→Wallet edge group carries a dashed stroke; a plain forward
    // edge (Billing→Wallet) does not.
    const backEdge = grouped.svg.match(
      /<g[^>]*data-edge-from="Search"[^>]*data-edge-to="Wallet"[\s\S]*?<\/g>/,
    );
    expect(backEdge).not.toBeNull();
    expect(backEdge![0]).toContain('stroke-dasharray="8 4"');

    const fwdEdge = grouped.svg.match(
      /<g[^>]*data-edge-from="Billing"[^>]*data-edge-to="Wallet"[\s\S]*?<\/g>/,
    );
    expect(fwdEdge).not.toBeNull();
    expect(fwdEdge![0]).not.toContain("stroke-dasharray");
  });
});

// #1884: grouping was silently dropped in the multi-system *root* view (two or
// more systems). Because a cross-system (ghost) edge requires a second system,
// its presence coincided exactly with "the root now has ≥2 systems", so from the
// user's side group-by-team looked like it "stopped working whenever there is a
// ghost edge". Grouping must apply per-(system, team) inside each system frame.
const MULTI = `
system Shop {
  service Billing { label "Billing" }
  service Wallet { label "Wallet" }
  service Search { label "Search" }

  Billing -> Wallet "debit"
  Search -> PaymentGateway.PaymentService "charge"
}

system PaymentGateway {
  service PaymentService { label "Payment Service" }
}

organization Org {
  team "payments" {
    label "Payments"
    owns Billing
    owns Wallet
  }
  team "catalog" {
    label "Catalog"
    owns Search
  }
}
`;

describe("compile() with groupBy: team — multi-system root view (#1884)", () => {
  const grouped = (src = MULTI, collapsedGroups?: Set<string>): string => {
    const r = compile(src, { diagramType: "system", groupBy: "team", collapsedGroups });
    if (r.diagramType !== "system") throw new Error("expected system view");
    return r.svg;
  };

  it("draws the team frames at the root (was 0 frames before the fix)", () => {
    // The repro: a cross-system charge edge makes Shop + PaymentGateway both
    // appear at the root. payments/catalog own services only in Shop, so two
    // frames are drawn — inside the Shop system frame.
    const svg = grouped();
    expect(svg).toContain('data-container-id="__group_payments__"');
    expect(svg).toContain('data-container-id="__group_catalog__"');
    expect(svg.match(/data-group="true"/g)?.length).toBe(2);
    // PaymentService is un-owned → no frame minted for it.
    expect(svg).toContain('data-node-id="PaymentService"');
  });

  it("still lays every node out exactly once (TPL-20260624-02: totality)", () => {
    const svg = grouped();
    for (const id of ["Billing", "Wallet", "Search", "PaymentService"]) {
      expect(svg.match(new RegExp(`data-node-id="${id}"`, "g"))?.length).toBe(1);
    }
  });

  it("leaves the root ungrouped output byte-identical when group-by is off", () => {
    const off = compile(MULTI, { diagramType: "system" });
    const optedOut = compile(MULTI, { diagramType: "system", groupBy: undefined });
    if (off.diagramType !== "system" || optedOut.diagramType !== "system") {
      throw new Error("expected system view");
    }
    expect(optedOut.svg).toBe(off.svg);
    expect(off.svg).not.toContain('data-group="true"');
  });

  it("collapses a team to a stub at the root, folding its members (#1858 slice B)", () => {
    const svg = grouped(MULTI, new Set(["payments"]));
    expect(svg).not.toContain('data-node-id="Billing"');
    expect(svg).not.toContain('data-node-id="Wallet"');
    // Stub id is system-scoped in the multi-system root view (#1884).
    expect(svg).toContain('data-node-id="__group_collapsed_Shop_payments__"');
    expect(svg).toContain("payments (2)");
    // catalog stays expanded and framed.
    expect(svg).toContain('data-node-id="Search"');
    expect(svg).toContain('data-container-id="__group_catalog__"');
  });

  it("frames a team that owns members in two systems once per system", () => {
    // `payments` owns Billing (Shop) and PaymentService (PaymentGateway): a team
    // may `owns` across systems. Per-(system, team) means one payments frame is
    // drawn inside each system's frame — same label, two disjoint frames.
    const spanning = `
system Shop {
  service Billing { label "Billing" }
  service Search { label "Search" }
  Search -> PaymentGateway.PaymentService "charge"
}

system PaymentGateway {
  service PaymentService { label "Payment Service" }
}

organization Org {
  team "payments" {
    label "Payments"
    owns Billing
    owns PaymentService
  }
}
`;
    const svg = grouped(spanning);
    // Two payments frames (one per system), plus Billing & PaymentService each once.
    expect(svg.match(/data-container-id="__group_payments__"/g)?.length).toBe(2);
    expect(svg.match(/data-group="true"/g)?.length).toBe(2);
    expect(svg.match(/data-node-id="Billing"/g)?.length).toBe(1);
    expect(svg.match(/data-node-id="PaymentService"/g)?.length).toBe(1);
  });

  it("re-anchors a cross-system edge from a collapsed team onto its stub (TPL-20260624-02)", () => {
    // `Search` (catalog) → `PaymentGateway.PaymentService` is a cross-system
    // edge. Collapsing catalog folds Search into its stub; the edge must survive,
    // re-anchored onto the stub — not silently dropped as before the fix.
    const svg = grouped(MULTI, new Set(["catalog"]));
    expect(svg).not.toContain('data-node-id="Search"');
    expect(svg).toContain('data-node-id="__group_collapsed_Shop_catalog__"');
    expect(svg).toContain('data-edge-from="__group_collapsed_Shop_catalog__"');
    expect(svg).toContain('data-edge-to="PaymentGateway.PaymentService"');
  });

  it("keeps a distinct stub per system when a spanning team is collapsed (totality)", () => {
    // payments owns Billing (Shop) + PaymentService (PaymentGateway). Collapsing
    // it must yield one stub *per system* — stub ids are system-scoped so the
    // second system's stub does not overwrite the first (exactly-once).
    const spanning = `
system Shop {
  service Billing { label "Billing" }
  service Search { label "Search" }
  Search -> PaymentGateway.PaymentService "charge"
}

system PaymentGateway {
  service PaymentService { label "Payment Service" }
}

organization Org {
  team "payments" {
    label "Payments"
    owns Billing
    owns PaymentService
  }
}
`;
    const svg = grouped(spanning, new Set(["payments"]));
    // One system-scoped stub per system, each present exactly once (no overwrite).
    expect(svg.match(/data-node-id="__group_collapsed_Shop_payments__"/g)?.length).toBe(1);
    expect(svg.match(/data-node-id="__group_collapsed_PaymentGateway_payments__"/g)?.length).toBe(
      1,
    );
    // The folded members are gone (folded into their per-system stub).
    expect(svg).not.toContain('data-node-id="Billing"');
    expect(svg).not.toContain('data-node-id="PaymentService"');
  });
});

// Two teams (alpha, beta) both call a shared infra DB and a shared external EXT,
// placed in the bottom tier so both calls cross bands → two trunks form (junction
// dots on merge), and the cross-band stubs cross verticals (hop arcs).
const TRUNKS = `
system Shop {
  service A { label "A" }
  service B { label "B" }
  service C { label "C" }
  database DB { label "DB" }
  service EXT [external] { label "EXT" }
  A -> DB "w"
  B -> DB "w"
  A -> EXT "call"
  B -> EXT "call"
}
organization Org {
  team "alpha" { label "Alpha" owns A }
  team "beta" { label "Beta" owns B }
  team "gamma" { label "Gamma" owns C }
}
`;

describe("crossing marks layer (#1859 P2c-C)", () => {
  const trunksSvg = (groupBy?: "team"): string => {
    const r = compile(TRUNKS, { diagramType: "system", groupBy });
    if (r.diagramType !== "system") throw new Error("expected system view");
    return r.svg;
  };

  it("emits a crossing-marks layer with junction dots when grouped", () => {
    const svg = trunksSvg("team");
    expect(svg).toContain('class="crossing-marks"');
    // Trunk merges render as connection dots.
    expect(svg).toContain("<circle");
  });

  it("emits no crossing-marks layer when ungrouped (AC-5)", () => {
    expect(trunksSvg(undefined)).not.toContain('class="crossing-marks"');
  });

  it("orders the crossing-marks layer after the edges layer (marks on top)", () => {
    const svg = trunksSvg("team");
    expect(svg.indexOf('class="edges"')).toBeLessThan(svg.indexOf('class="crossing-marks"'));
  });

  it("colours marks with their owning edge's stroke, not a fixed default (#1859 review #3)", () => {
    // Colour every edge crimson; the crossing marks must follow, not stay slate.
    const r = compile(TRUNKS, {
      diagramType: "system",
      groupBy: "team",
      styleSource: `edge { color: #dc143c; }`,
    });
    if (r.diagramType !== "system") throw new Error("expected system view");
    const layer = r.svg.match(/<g class="crossing-marks">.*?<\/g>/s)?.[0] ?? "";
    expect(layer).toContain("<circle"); // trunk merge dots present
    expect(layer).toContain('fill="#dc143c"'); // dot in the edge colour
    expect(layer).not.toContain("#94A3B8"); // not the default slate
  });

  it("marks a diagonal crossing with an oriented (rotated) hop (#1939 Part 1)", () => {
    // A "clear" intra-band edge left straight can be diagonal and cross another
    // edge; the hop now rides that diagonal and is drawn rotated along it.
    const DIAG = `
system S {
  service A {} service B {} service C {}
  service X {} service Y {}
  A -> X  B -> Y  C -> X  A -> Y
}
organization O { team "t1" { owns A owns B owns C } team "t2" { owns X owns Y } }`;
    const r = compile(DIAG, { diagramType: "system", groupBy: "team" });
    if (r.diagramType !== "system") throw new Error("expected system view");
    const layer = r.svg.match(/<g class="crossing-marks">.*?<\/g>/s)?.[0] ?? "";
    expect(layer).toContain("<path");
    // The arc's x-axis-rotation field (5th token after `A rx ry`) is non-zero.
    expect(layer).toMatch(/ A [\d.]+ [\d.]+ -?\d*\.?\d*[1-9]\d* 0 1 /);
  });

  // Multi-system marks are a separate slice (#1939 Part 2). Until then the
  // multi-system grouped view emits no marks — pinned so it stays explicit.
  it("does not emit marks for the multi-system grouped view (#1939 Part 2, not yet)", () => {
    const TWO_SYSTEMS = `
system Shop { service A { label "A" } service B { label "B" } A -> B }
system Pay { service C { label "C" } }
organization Org { team "t1" { owns A } team "t2" { owns B owns C } }
`;
    const r = compile(TWO_SYSTEMS, { diagramType: "system", groupBy: "team" });
    if (r.diagramType !== "system") throw new Error("expected system view");
    expect(r.svg).not.toContain('class="crossing-marks"');
  });
});
