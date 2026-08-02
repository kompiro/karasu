import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compile } from "../index.js";
import { analyze, SYSTEM_ASSIGNED_TAGS } from "./warnings.js";
import { REFERENCE_DATA, LOGICAL_CONTAINMENT } from "../builtins/reference-data.js";
import { warningSeverity } from "../types/warnings.js";
import type { WarningKind, WarningSeverity } from "../types/warnings.js";
import { StyleParser } from "../parser/style-parser.js";
import { Parser } from "../parser/parser.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { loadAndRegisterIcons } from "../renderer/svg-icon-loader.js";
import { clearRegistry } from "../shapes/shape-registry.js";
import { registerBuiltinShapes } from "../renderer/shapes.js";

// Minimal icon SVG for test registration
const MINIMAL_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
  <g class="krs-pictogram" transform="translate(6, 4)">
    <rect width="20" height="20" fill="{{color}}"/>
  </g>
  <text class="krs-label" x="30" y="19" text-anchor="start"/>
  <text class="krs-description" x="8" y="44" text-anchor="start"/>
</svg>`;

describe("invalid-owns warning", () => {
  it("warns when owns references a non-existent ID (no system block)", () => {
    const krs = `
organization Corp {
  team backend {
    owns NonExistentService
  }
}
`;
    const result = compile(krs);
    const w = result.warnings.find((warning) => warning.kind === "invalid-owns");
    expect(w).toBeDefined();
    expect(w?.params).toEqual({ teamId: "backend", ownedId: "NonExistentService" });
  });

  it("does not warn when owns references a valid service ID", () => {
    const krs = `
system MySystem {
  service MyService "My Service" {}
}
organization Corp {
  team backend {
    owns MyService
  }
}
`;
    const result = compile(krs);
    expect(result.warnings.filter((w) => w.kind === "invalid-owns")).toHaveLength(0);
  });

  it("warns for each invalid owns reference", () => {
    const krs = `
organization Corp {
  team backend {
    owns ServiceA
    owns ServiceB
  }
}
`;
    const result = compile(krs);
    const ownsWarnings = result.warnings.filter((w) => w.kind === "invalid-owns");
    expect(ownsWarnings).toHaveLength(2);
  });

  it("does not warn when owns references a client ID (ADR-1720)", () => {
    const krs = `
system MySystem {
  client Web [web] {}
  service Api {}
}
organization Corp {
  team frontend {
    owns Web
    owns Api
  }
}
`;
    const result = compile(krs);
    expect(result.warnings.filter((w) => w.kind === "invalid-owns")).toHaveLength(0);
  });

  it("does not warn when owns references a top-level client ID", () => {
    const krs = `
client Web [web] {}
organization Corp {
  team frontend {
    owns Web
  }
}
`;
    const result = compile(krs);
    expect(result.warnings.filter((w) => w.kind === "invalid-owns")).toHaveLength(0);
  });
});

describe("icon mode style-conflict suppression", () => {
  // Register minimal icons so compile() can resolve the icon shapes used in ICON_THEME_STYLE_SOURCE.
  // Keys are the icon names as referenced in style rules (e.g. shape: url("service")).
  beforeEach(() => {
    clearRegistry();
    registerBuiltinShapes();
    loadAndRegisterIcons(
      {
        service: MINIMAL_ICON_SVG,
        "user-card": MINIMAL_ICON_SVG,
        domain: MINIMAL_ICON_SVG,
        resource: MINIMAL_ICON_SVG,
        team: MINIMAL_ICON_SVG,
        member: MINIMAL_ICON_SVG,
        database: MINIMAL_ICON_SVG,
        "queue-card": MINIMAL_ICON_SVG,
        api: MINIMAL_ICON_SVG,
        "cloud-card": MINIMAL_ICON_SVG,
        oci: MINIMAL_ICON_SVG,
        lambda: MINIMAL_ICON_SVG,
        jar: MINIMAL_ICON_SVG,
        war: MINIMAL_ICON_SVG,
        function: MINIMAL_ICON_SVG,
        assets: MINIMAL_ICON_SVG,
        job: MINIMAL_ICON_SVG,
        artifact: MINIMAL_ICON_SVG,
      },
      true,
    );
  });

  it("does not produce style-conflict warning when icon mode overrides builtin shapes", () => {
    // The icon theme defines service { shape: url("service"); }
    // The builtin defines service { shape: box; }
    // No user styles — should produce no style-conflict warnings
    const krs = `
system S {
  service A "Service A" {}
}
`;
    const result = compile(krs, undefined, [], "system", undefined, "icon");
    expect(result.warnings.filter((w) => w.kind === "style-conflict")).toHaveLength(0);
  });

  it("does not produce style-conflict warning when user style and icon theme both define service", () => {
    // Even if the user's style also targets service, no conflict should be raised
    // between the icon theme (system sheet) and user sheet.
    const krs = `
system S {
  service A "Service A" {}
}
`;
    const userStyle = `service { color: #FF0000; }`;
    const result = compile(krs, userStyle, [], "system", undefined, "icon");
    expect(result.warnings.filter((w) => w.kind === "style-conflict")).toHaveLength(0);
  });

  it("still produces style-conflict warning when same selector appears in multiple user style sheets", () => {
    // Without icon mode, conflicts among user sheets should still be detected.
    const krs = `system S { service A {} }`;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const sheet1 = StyleParser.parse("service { color: #AAA; }").value;
    const sheet2 = StyleParser.parse("service { color: #BBB; }").value;

    const warnings = analyze(file, [builtin, sheet1, sheet2]);
    expect(warnings.some((w) => w.kind === "style-conflict")).toBe(true);
  });
});

describe("domain-dispersal warning", () => {
  it("warns when the same domain id appears in multiple services within the same system", () => {
    const krs = `
system ECPlatform {
  service ECommerce {
    domain Order { label "注文" }
  }
  service Legacy {
    domain Order { label "受注" }
  }
}
`;
    const result = compile(krs);
    const w = result.warnings.find((warning) => warning.kind === "domain-dispersal");
    expect(w).toBeDefined();
    expect(w?.params.domainId).toBe("Order");
    expect(w?.params.services).toContain("ECommerce");
    expect(w?.params.services).toContain("Legacy");
  });

  it("carries the loc of a dispersed domain so editors can anchor the diagnostic", () => {
    // Without a loc the LSP / Monaco collapse the diagnostic to line 0. The
    // detector records the last occurrence's loc — here the `domain Order`
    // inside `Legacy`.
    const krs = `system ECPlatform {
  service ECommerce {
    domain Order {}
  }
  service Legacy {
    domain Order {}
  }
}`;
    const result = compile(krs);
    const w = result.warnings.find((warning) => warning.kind === "domain-dispersal");
    expect(w?.loc).toBeDefined();
    // The second `domain Order` is on line 6 (1-based).
    expect(w?.loc?.start.line).toBe(6);
  });

  it("does not block rendering — dispersed domain produces no error diagnostic (ADR-1386)", () => {
    // Regression: a domain id shared across services used to also raise the
    // `domain-id-not-unique` parser error, which made the App refuse to draw
    // the diagram. The dispersal is informational only; the diagram must
    // still render.
    const krs = `
system ECPlatform {
  service ECommerce {
    domain Order { label "注文" }
  }
  service Legacy {
    domain Order { label "受注" }
  }
}
`;
    const result = compile(krs);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result.svg.length).toBeGreaterThan(0);
  });

  it("warns when same domain id has different labels (id is the detection key, not label)", () => {
    const krs = `
system ECPlatform {
  service ECommerce {
    domain Payment { label "決済" }
  }
  service Checkout {
    domain Payment { label "お支払い" }
  }
}
`;
    const result = compile(krs);
    const w = result.warnings.find((warning) => warning.kind === "domain-dispersal");
    expect(w).toBeDefined();
    expect(w?.params.domainId).toBe("Payment");
  });

  it("does not warn when different domain ids share the same label", () => {
    const krs = `
system ECPlatform {
  service ECommerce {
    domain PaymentA { label "決済" }
  }
  service Checkout {
    domain PaymentB { label "決済" }
  }
}
`;
    const result = compile(krs);
    expect(result.warnings.filter((w) => w.kind === "domain-dispersal")).toHaveLength(0);
  });

  it("does not warn when the same domain id appears in different systems", () => {
    const krs = `
system LegacyPlatform {
  service OldBilling {
    domain Payment { label "決済（旧）" }
  }
}
system NewPlatform {
  service PaymentService {
    domain Payment { label "決済（新）" }
  }
}
`;
    const result = compile(krs);
    expect(result.warnings.filter((w) => w.kind === "domain-dispersal")).toHaveLength(0);
  });
});

describe("shared-infra-fan-in warning", () => {
  it("warns when one database is shared by two services in a single file (#1570)", () => {
    // The key case the issue calls out: one declaration, referenced by N
    // services — no `infra-redeclared-across-files` fires (single file), but the
    // fan-in is the actual Database-per-Service smell signal.
    const krs = `
system Shop {
  service OrderService {
    domain Ordering {
      usecase PlaceOrder {
        resource OrderDB.Orders { operations create }
      }
    }
  }
  service ReportService {
    domain Reporting {
      usecase BuildReport {
        resource OrderDB.Orders { operations read }
      }
    }
  }
  database OrderDB { table Orders }
}
`;
    const result = compile(krs);
    const fanIn = result.warnings.filter((w) => w.kind === "shared-infra-fan-in");
    expect(fanIn).toHaveLength(1);
    expect(fanIn[0].params.infraId).toBe("OrderDB");
    expect(fanIn[0].params.infraKind).toBe("database");
    expect(fanIn[0].params.services).toContain("OrderService");
    expect(fanIn[0].params.services).toContain("ReportService");
    expect(fanIn[0].params.services).toHaveLength(2);
    // No multi-file redeclaration here.
    expect(
      result.diagnostics.filter((d) => d.code === "infra-redeclared-across-files"),
    ).toHaveLength(0);
  });

  it("is registered as info and does not block rendering (ADR-1386)", () => {
    const krs = `
system Shop {
  service A { domain Da { usecase Ua { resource DB.t { operations read } } } }
  service B { domain Db { usecase Ub { resource DB.t { operations read } } } }
  database DB { table t }
}
`;
    const result = compile(krs);
    const w = result.warnings.find((x) => x.kind === "shared-infra-fan-in");
    expect(w).toBeDefined();
    expect(warningSeverity(w!.kind)).toBe("info");
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result.svg.length).toBeGreaterThan(0);
  });

  it("does not warn when only one service depends on the store", () => {
    const krs = `
system Shop {
  service OrderService {
    domain Ordering {
      usecase PlaceOrder {
        resource OrderDB.Orders { operations create }
      }
    }
  }
  database OrderDB { table Orders }
}
`;
    const result = compile(krs);
    expect(result.warnings.filter((w) => w.kind === "shared-infra-fan-in")).toHaveLength(0);
  });

  it("counts a service that references the store from multiple usecases only once", () => {
    const krs = `
system Shop {
  service OrderService {
    domain Ordering {
      usecase PlaceOrder { resource OrderDB.Orders { operations create } }
      usecase CancelOrder { resource OrderDB.Orders { operations update } }
    }
  }
  database OrderDB { table Orders }
}
`;
    const result = compile(krs);
    // Only one service touches it (twice) → not a fan-in.
    expect(result.warnings.filter((w) => w.kind === "shared-infra-fan-in")).toHaveLength(0);
  });

  it("excludes [external] stores — sharing a managed third-party store is not the smell", () => {
    const krs = `
system Shop {
  service A { domain Da { usecase Ua { resource ExtDB.t { operations read } } } }
  service B { domain Db { usecase Ub { resource ExtDB.t { operations read } } } }
  database ExtDB [external] { table t }
}
`;
    const result = compile(krs);
    expect(result.warnings.filter((w) => w.kind === "shared-infra-fan-in")).toHaveLength(0);
  });

  it("excludes [index] stores — a shared derived search index is not the smell (#1733)", () => {
    const krs = `
system Shop {
  service A { domain Da { usecase Ua { resource SearchIdx.docs { operations read } } } }
  service B { domain Db { usecase Ub { resource SearchIdx.docs { operations read } } } }
  database SearchIdx [index] { table docs }
}
`;
    const result = compile(krs);
    expect(result.warnings.filter((w) => w.kind === "shared-infra-fan-in")).toHaveLength(0);
  });

  it("detects shared queue and storage, not just database", () => {
    const krs = `
system Shop {
  service A {
    domain Da {
      usecase Ua {
        resource Events.Placed { operations create }
        resource Files.images { operations create }
      }
    }
  }
  service B {
    domain Db {
      usecase Ub {
        resource Events.Placed { operations read }
        resource Files.images { operations read }
      }
    }
  }
  queue Events { queue Placed }
  storage Files { bucket images }
}
`;
    const result = compile(krs);
    const kinds = result.warnings
      .filter((w) => w.kind === "shared-infra-fan-in")
      .map((w) => w.params.infraKind)
      .sort();
    expect(kinds).toEqual(["queue", "storage"]);
  });

  it("detects fan-in for a top-level (system-less) store shared by top-level services", () => {
    // Top-level infra is bucketed in `file.databases`, not under a service
    // subtree — the canonical "shared store" idiom must still be detected.
    const krs = `
service OrderService {
  domain Ordering { usecase PlaceOrder { resource OrderDB.Orders { operations create } } }
}
service ReportService {
  domain Reporting { usecase BuildReport { resource OrderDB.Orders { operations read } } }
}
database OrderDB { table Orders }
`;
    const result = compile(krs);
    const fanIn = result.warnings.filter((w) => w.kind === "shared-infra-fan-in");
    expect(fanIn).toHaveLength(1);
    expect(fanIn[0].params.infraId).toBe("OrderDB");
    expect(fanIn[0].params.services).toHaveLength(2);
  });

  it("does not warn across system boundaries (cross-system sharing is intentional)", () => {
    const krs = `
system A {
  service Sa { domain Da { usecase Ua { resource SharedDB.t { operations read } } } }
  database SharedDB { table t }
}
system B {
  service Sb { domain Db { usecase Ub { resource SharedDB.t { operations read } } } }
}
`;
    const result = compile(krs);
    // The store is declared only in system A; system B's reference resolves to
    // nothing in its own scope → no fan-in (one service per scope).
    expect(result.warnings.filter((w) => w.kind === "shared-infra-fan-in")).toHaveLength(0);
  });
});

describe("cross-domain-store-access warning (#1819)", () => {
  const xdomain = (krs: string) =>
    compile(krs).warnings.filter((w) => w.kind === "cross-domain-store-access");

  it("warns when a usecase writes a table owned (via entity mapping) by another domain", () => {
    // Billing writes OrderDB.orders, but the `orders` leaf is owned by domain
    // Ordering (its entity Order maps it). One-way reach-in across a boundary.
    const krs = `
system Shop {
  service Core {
    domain Ordering {
      entity Order { table OrderDB.orders }
    }
    domain Billing {
      usecase Charge {
        resource OrderDB.orders { operations update }
      }
    }
  }
  database OrderDB { table orders }
}
`;
    const ws = xdomain(krs);
    expect(ws).toHaveLength(1);
    expect(ws[0].params.accessingDomain).toBe("Billing");
    expect(ws[0].params.owningDomains).toEqual(["Ordering"]);
    expect(ws[0].params.infraId).toBe("OrderDB");
    expect(ws[0].params.infraKind).toBe("database");
    expect(ws[0].params.tableId).toBe("orders");
    expect(ws[0].params.mode).toBe("write");
    expect(warningSeverity(ws[0].kind)).toBe("info");
  });

  it("resolves ownership for a bare resource that resolves to the owning entity", () => {
    // Billing's bare `resource Order` resolves (model-wide) to entity Order in
    // Ordering, which maps OrderDB.orders → same cross-domain reach-in.
    const krs = `
system Shop {
  service Core {
    domain Ordering {
      entity Order { table OrderDB.orders }
    }
    domain Billing {
      usecase Charge {
        resource Order { operations read }
      }
    }
  }
  database OrderDB { table orders }
}
`;
    const ws = xdomain(krs);
    expect(ws).toHaveLength(1);
    expect(ws[0].params.accessingDomain).toBe("Billing");
    expect(ws[0].params.tableId).toBe("orders");
    expect(ws[0].params.mode).toBe("read");
  });

  it("does not warn for intra-domain access (owner accesses its own table)", () => {
    const krs = `
system Shop {
  service Core {
    domain Ordering {
      entity Order { table OrderDB.orders }
      usecase PlaceOrder {
        resource OrderDB.orders { operations create }
      }
    }
  }
  database OrderDB { table orders }
}
`;
    expect(xdomain(krs)).toHaveLength(0);
  });

  it("does not warn when crossing into an [external] or [index] store", () => {
    const krs = `
system Shop {
  service Core {
    domain Ordering {
      entity Order { table ExtDB.orders }
    }
    domain Billing {
      usecase Charge {
        resource ExtDB.orders { operations read }
      }
    }
  }
  database ExtDB [external] { table orders }
}
`;
    expect(xdomain(krs)).toHaveLength(0);
  });

  it("co-owned table: a third domain is flagged, the owners are exempt", () => {
    // orders is mapped by entities in both Ordering and Billing (co-owned).
    // Fulfillment (a third domain) reaching in fires; Ordering / Billing don't.
    const krs = `
system Shop {
  service Core {
    domain Ordering {
      entity Order { table OrderDB.orders }
      usecase PlaceOrder { resource OrderDB.orders { operations create } }
    }
    domain Billing {
      entity Invoice { table OrderDB.orders }
      usecase Charge { resource OrderDB.orders { operations update } }
    }
    domain Fulfillment {
      usecase Ship { resource OrderDB.orders { operations read } }
    }
  }
  database OrderDB { table orders }
}
`;
    const ws = xdomain(krs);
    expect(ws).toHaveLength(1);
    expect(ws[0].params.accessingDomain).toBe("Fulfillment");
    expect(ws[0].params.owningDomains).toEqual(["Billing", "Ordering"]);
    expect(ws[0].params.mode).toBe("read");
  });

  it("does not warn for a purely physical model with no entity mapping the table", () => {
    // No entity maps orders → owner unknown → no diagnostic (legitimate
    // bottom-up state; adding an entity promotes the diagnostic with zero edits).
    const krs = `
system Shop {
  service Core {
    domain Billing {
      usecase Charge { resource OrderDB.orders { operations update } }
    }
  }
  database OrderDB { table orders }
}
`;
    expect(xdomain(krs)).toHaveLength(0);
  });

  it("does not resolve ownership across systems (scope is per-system)", () => {
    const krs = `
system A {
  service Sa {
    domain Ordering { entity Order { table OrderDB.orders } }
  }
  database OrderDB { table orders }
}
system B {
  service Sb {
    domain Billing {
      usecase Charge { resource OrderDB.orders { operations read } }
    }
  }
  database OrderDB { table orders }
}
`;
    // System B has no entity mapping its OrderDB.orders → no owner in B's scope.
    expect(xdomain(krs)).toHaveLength(0);
  });

  it("keys ownership at leaf granularity — sibling tables in one store differ", () => {
    // Ordering owns orders; Billing owns invoices; both in OrderDB. Ordering
    // reaching into invoices is cross-domain even though it owns a sibling table.
    const krs = `
system Shop {
  service Core {
    domain Ordering {
      entity Order { table OrderDB.orders }
      usecase PlaceOrder { resource OrderDB.invoices { operations read } }
    }
    domain Billing {
      entity Invoice { table OrderDB.invoices }
    }
  }
  database OrderDB { table orders; table invoices }
}
`;
    const ws = xdomain(krs);
    expect(ws).toHaveLength(1);
    expect(ws[0].params.accessingDomain).toBe("Ordering");
    expect(ws[0].params.owningDomains).toEqual(["Billing"]);
    expect(ws[0].params.tableId).toBe("invoices");
  });

  it("aggregates read+write accesses from one domain into a single readwrite warning", () => {
    const krs = `
system Shop {
  service Core {
    domain Ordering {
      entity Order { table OrderDB.orders }
    }
    domain Billing {
      usecase Read { resource OrderDB.orders { operations read } }
      usecase Write { resource OrderDB.orders { operations update } }
    }
  }
  database OrderDB { table orders }
}
`;
    const ws = xdomain(krs);
    expect(ws).toHaveLength(1);
    expect(ws[0].params.mode).toBe("readwrite");
  });

  it("fires independently of shared-infra-fan-in on the same store", () => {
    // Two domains in two services share OrderDB (fan-in), and Billing crosses
    // into Ordering's owned table (cross-domain). Both fire, no suppression.
    const krs = `
system Shop {
  service OrderService {
    domain Ordering {
      entity Order { table OrderDB.orders }
      usecase PlaceOrder { resource OrderDB.orders { operations create } }
    }
  }
  service BillingService {
    domain Billing {
      usecase Charge { resource OrderDB.orders { operations update } }
    }
  }
  database OrderDB { table orders }
}
`;
    const result = compile(krs);
    expect(result.warnings.filter((w) => w.kind === "shared-infra-fan-in")).toHaveLength(1);
    expect(result.warnings.filter((w) => w.kind === "cross-domain-store-access")).toHaveLength(1);
  });
});

describe("unassigned-domain warning", () => {
  it("warns for each top-level domain", () => {
    const krs = `
domain Payment { label "決済" }
domain Inventory { label "在庫" }

system ECPlatform {
  service ECommerce {}
}
    `;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const warnings = analyze(file, [builtin]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-domain");
    expect(unassigned).toHaveLength(2);
    expect(unassigned[0].params.label).toBe("決済");
    expect(unassigned[1].params.label).toBe("在庫");
    expect(unassigned[0].params.domainId).toBe("Payment");
    expect(unassigned[1].params.domainId).toBe("Inventory");
  });

  it("does not warn for domains nested inside services", () => {
    const krs = `
system ECPlatform {
  service ECommerce {
    domain Order { label "注文" }
  }
}
    `;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const warnings = analyze(file, [builtin]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-domain");
    expect(unassigned).toHaveLength(0);
  });

  it("warns for a domain declared directly inside a system (#2184)", () => {
    const krs = `
system ECPlatform {
  domain Ordering { label "受注" }
}
    `;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, [getBuiltinStyleSheet()]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-domain");
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].params.domainId).toBe("Ordering");
    expect(unassigned[0].params.label).toBe("受注");
    // points at the declaration, not at the enclosing system
    expect(unassigned[0].loc?.start.line).toBe(3);
  });

  // TPL-2184: every spelling of "this domain is not assigned to a service"
  // carries the same diagnostic — the author picks the spelling, not the meaning.
  // A single-placement fixture cannot catch the asymmetry, so drive them together.
  it.each([
    ["top level", `domain Ordering {}`],
    ["directly inside a system", `system EC { domain Ordering {} }`],
  ])("warns for an unassigned domain written at %s", (_placement, krs) => {
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, [getBuiltinStyleSheet()]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-domain");
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].params.domainId).toBe("Ordering");
  });

  it("does not warn for a domain inside a service that is itself inside a system", () => {
    const krs = `
system ECPlatform {
  service ECommerce {
    domain Ordering {}
  }
  domain Billing {}
}
    `;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, [getBuiltinStyleSheet()]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-domain");
    expect(unassigned.map((w) => w.params.domainId)).toEqual(["Billing"]);
  });

  // TPL-2184 / TPL-2165: the detector derives its parent set from `canContain`,
  // so a new domain parent is picked up automatically. This guard fires when that
  // set changes, so the new placement also gets a spelling case above.
  it("covers every parent canContain lets hold a domain", () => {
    const parents = [...LOGICAL_CONTAINMENT.entries()]
      .filter(([, children]) => children.has("domain"))
      .map(([parent]) => parent)
      .sort();
    expect(parents).toEqual(["service", "system"]);
  });

  it("reports in source order when the two spellings are mixed", () => {
    const krs = `
system ECPlatform {
  domain Ordering {}
}

domain Billing {}
    `;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, [getBuiltinStyleSheet()]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-domain");
    // Ordering declared first, even though Billing is the top-level one that
    // lands in `file.domains`.
    expect(unassigned.map((w) => w.params.domainId)).toEqual(["Ordering", "Billing"]);
  });

  it("leaves a domain outside canContain to node-not-in-context, without double-reporting", () => {
    const krs = `
system ECPlatform {
  client Web {
    domain Ordering {}
  }
}
    `;
    const result = Parser.parse(krs);
    const misplaced = result.diagnostics.filter((d) => d.code === "node-not-in-context");
    expect(misplaced).toHaveLength(1);

    const warnings = analyze(result.value, [getBuiltinStyleSheet()]);
    expect(warnings.filter((w) => w.kind === "unassigned-domain")).toHaveLength(0);
  });
});

describe("unassigned-resource / entity resolution (#1908)", () => {
  const builtin = getBuiltinStyleSheet();

  function unassigned(krs: string): string[] {
    const file = Parser.parse(krs).value;
    return analyze(file, [builtin])
      .filter((w) => w.kind === "unassigned-resource")
      .map((w) => (w.params as { resourceId: string }).resourceId);
  }

  it("warns for a bare resource that resolves to no store (moved from the parser)", () => {
    expect(
      unassigned(`
system EC {
  service A {
    domain X {
      usecase B {
        resource OrderTable { label "注文テーブル" }
      }
    }
  }
}
      `),
    ).toEqual(["OrderTable"]);
  });

  it("emits one warning per unassigned bare resource", () => {
    expect(
      unassigned(`
system EC {
  service A {
    domain X {
      usecase B {
        resource TableA
        resource TableB
        resource TableC
      }
    }
  }
}
      `),
    ).toEqual(["TableA", "TableB", "TableC"]);
  });

  it("does not warn for dot-notation or [external] resources", () => {
    expect(
      unassigned(`
system EC {
  service A {
    domain X {
      usecase B {
        resource OrderDB.orders
        resource InventoryAPI [external]
      }
    }
  }
  database OrderDB { table orders }
}
      `),
    ).toEqual([]);
  });

  it("promotes a bare resource with zero edits once the matching entity is declared", () => {
    // Same usecase text; the only difference is that the entity now exists.
    const before = unassigned(`
system EC {
  service OrderService {
    domain Ordering {
      usecase PlaceOrder {
        resource Order
      }
    }
  }
}
    `);
    expect(before).toEqual(["Order"]);

    const after = unassigned(`
system EC {
  service OrderService {
    domain Ordering {
      entity Order { table OrderDB.orders }
      usecase PlaceOrder {
        resource Order
      }
    }
  }
  database OrderDB { table orders }
}
    `);
    expect(after).toEqual([]);
  });

  it("resolves logically even before a physical table mapping exists", () => {
    // entity Order has no `table` yet — still resolved (forward-design state),
    // so no unassigned-resource warning.
    expect(
      unassigned(`
system EC {
  service OrderService {
    domain Ordering {
      entity Order {}
      usecase PlaceOrder {
        resource Order
      }
    }
  }
}
      `),
    ).toEqual([]);
  });

  it("keeps an ambiguous bare resource unresolved and surfaces the collision root cause", () => {
    const krs = `
system EC {
  service OrderService {
    domain Ordering {
      entity Order { table OrderDB.orders }
      usecase PlaceOrder {
        resource Order
      }
    }
  }
  service ArchiveService {
    domain Archive {
      entity Order { table ArchiveDB.orders }
    }
  }
  database OrderDB { table orders }
  database ArchiveDB { table orders }
}
    `;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, [builtin]);
    // Still unresolved (ambiguous match does not promote)...
    expect(
      warnings.filter((w) => w.kind === "unassigned-resource").map((w) => w.params.resourceId),
    ).toEqual(["Order"]);
    // ...and the root cause is reported by entity-anchor-collision.
    expect(warnings.filter((w) => w.kind === "entity-anchor-collision")).toHaveLength(1);
  });

  it("is a warning-register diagnostic, not info", () => {
    expect(warningSeverity("unassigned-resource")).toBe("warning");
  });
});

describe("entity-anchor-collision warning (#1870)", () => {
  const builtin = getBuiltinStyleSheet();

  it("warns when two entities in different domains share an id", () => {
    const krs = `
system EC {
  service OrderService {
    domain Ordering {
      entity Order {}
    }
  }
  service ReportService {
    domain Reporting {
      entity Order {}
    }
  }
}
    `;
    const file = Parser.parse(krs).value;
    const collisions = analyze(file, [builtin]).filter((w) => w.kind === "entity-anchor-collision");
    expect(collisions).toHaveLength(1);
    expect(collisions[0].params.id).toBe("Order");
  });

  it("warns when an entity id equals a domain id", () => {
    const krs = `
system EC {
  service OrderService {
    domain Order {
      entity Order {}
    }
  }
}
    `;
    const file = Parser.parse(krs).value;
    const collisions = analyze(file, [builtin]).filter((w) => w.kind === "entity-anchor-collision");
    expect(collisions).toHaveLength(1);
    expect(collisions[0].params.id).toBe("Order");
  });

  it("does not warn when entity ids are unique across the model", () => {
    const krs = `
system EC {
  service OrderService {
    domain Ordering {
      entity Order {}
      entity Customer {}
    }
  }
}
    `;
    const file = Parser.parse(krs).value;
    const collisions = analyze(file, [builtin]).filter((w) => w.kind === "entity-anchor-collision");
    expect(collisions).toHaveLength(0);
  });

  it("warns when a same-id domain is dispersed across systems and each holds a same-id entity", () => {
    // domain D in two systems are two distinct domain NODES, so entity E under
    // each produces two distinct #krs-entity-E anchors — a real collision that
    // id-based domain counting would miss.
    const krs = `
system A {
  domain D {
    entity E {}
  }
}
system B {
  domain D {
    entity E {}
  }
}
    `;
    const file = Parser.parse(krs).value;
    const collisions = analyze(file, [builtin]).filter((w) => w.kind === "entity-anchor-collision");
    expect(collisions).toHaveLength(1);
    expect(collisions[0].params.id).toBe("E");
  });

  it("does not double-report same-parent duplicate entities (that is a duplicate-node-id-parent error)", () => {
    const krs = `
system EC {
  service OrderService {
    domain Ordering {
      entity Order {}
      entity Order {}
    }
  }
}
    `;
    const file = Parser.parse(krs).value;
    const collisions = analyze(file, [builtin]).filter((w) => w.kind === "entity-anchor-collision");
    expect(collisions).toHaveLength(0);
  });

  it("is a warning-register diagnostic, not info", () => {
    expect(warningSeverity("entity-anchor-collision")).toBe("warning");
  });
});

describe("entity relations are excluded from cyclic-dependency detection (#1870)", () => {
  const builtin = getBuiltinStyleSheet();

  it("does not flag a self-referential entity relation as a cycle", () => {
    const krs = `
system EC {
  service OrderService {
    domain Ordering {
      entity Category {
        Category -> Category "parent"
      }
    }
  }
}
    `;
    const file = Parser.parse(krs).value;
    const cycles = analyze(file, [builtin]).filter((w) => w.kind === "cyclic-dependency");
    expect(cycles).toHaveLength(0);
  });

  it("does not flag mutually-referencing entities as a cycle", () => {
    const krs = `
system EC {
  service OrderService {
    domain Ordering {
      entity Order {
        Order -> Line "has"
      }
      entity Line {
        Line -> Order "belongs to"
      }
    }
  }
}
    `;
    const file = Parser.parse(krs).value;
    const cycles = analyze(file, [builtin]).filter((w) => w.kind === "cyclic-dependency");
    expect(cycles).toHaveLength(0);
  });
});

describe("unassigned-service warning", () => {
  it("warns for each top-level service not wrapped in a system", () => {
    const krs = `
service AuthStandalone { label "認証" }
service BillingStandalone { label "課金" }

system ECPlatform {
  service ECommerce {}
}
    `;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const warnings = analyze(file, [builtin]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-service");
    expect(unassigned).toHaveLength(2);
    if (unassigned[0].kind !== "unassigned-service") throw new Error("kind mismatch");
    if (unassigned[1].kind !== "unassigned-service") throw new Error("kind mismatch");
    expect(unassigned[0].params).toEqual({ serviceId: "AuthStandalone", label: "認証" });
    expect(unassigned[1].params).toEqual({ serviceId: "BillingStandalone", label: "課金" });
  });

  it("does not warn for services nested inside a system", () => {
    const krs = `
system ECPlatform {
  service ECommerce { label "ECサイト" }
}
    `;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const warnings = analyze(file, [builtin]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-service");
    expect(unassigned).toHaveLength(0);
  });
});

describe("unassigned-client warning", () => {
  it("warns for top-level clients not wrapped in a system", () => {
    const krs = `
client StandaloneApp [web] { label "Standalone" }

system ECPlatform {
  client MobileApp [mobile] {}
}
    `;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const warnings = analyze(file, [builtin]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-client");
    expect(unassigned).toHaveLength(1);
    if (unassigned[0].kind !== "unassigned-client") throw new Error("kind mismatch");
    expect(unassigned[0].params).toEqual({ clientId: "StandaloneApp", label: "Standalone" });
  });

  it("does not warn for clients nested inside a system", () => {
    const krs = `
system ECPlatform {
  client MobileApp [mobile] { label "Mobile" }
}
    `;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const warnings = analyze(file, [builtin]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-client");
    expect(unassigned).toHaveLength(0);
  });
});

describe("client-capability-duplicate warning", () => {
  it("warns when a client declares the same capability twice", () => {
    const krs = `
system S {
  client App [mobile] {
    capability camera
    capability camera
  }
}
    `;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const warnings = analyze(file, [builtin]);
    const dups = warnings.filter((w) => w.kind === "client-capability-duplicate");
    expect(dups).toHaveLength(1);
    if (dups[0].kind !== "client-capability-duplicate") throw new Error("kind mismatch");
    expect(dups[0].params).toEqual({ clientId: "App", name: "camera" });
  });

  it("does not warn for distinct capability names", () => {
    const krs = `
system S {
  client App [mobile] {
    capability camera
    capability geolocation
  }
}
    `;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const warnings = analyze(file, [builtin]);
    expect(warnings.filter((w) => w.kind === "client-capability-duplicate")).toHaveLength(0);
  });
});

describe("annotation-possible-typo hint", () => {
  function typoHints(krs: string, userStyle?: string) {
    const file = Parser.parse(krs).value;
    const sheets = [getBuiltinStyleSheet()];
    if (userStyle) sheets.push(StyleParser.parse(userStyle).value);
    return analyze(file, sheets).filter((w) => w.kind === "annotation-possible-typo");
  }

  it("hints a near-miss of a built-in annotation", () => {
    const hints = typoHints(`
system S {
  service Legacy @depracated {}
}
    `);
    expect(hints).toHaveLength(1);
    if (hints[0].kind !== "annotation-possible-typo") throw new Error("kind mismatch");
    expect(hints[0].params).toEqual({
      nodeId: "Legacy",
      annotation: "depracated",
      suggestion: "deprecated",
    });
  });

  it("catches an adjacent transposition of a short built-in (@nwe → @new)", () => {
    const hints = typoHints(`
system S {
  service Api @nwe {}
}
    `);
    expect(hints).toHaveLength(1);
    if (hints[0].kind !== "annotation-possible-typo") throw new Error("kind mismatch");
    expect(hints[0].params.suggestion).toBe("new");
  });

  it("renders as info, not warning — annotation names are an open set", () => {
    expect(warningSeverity("annotation-possible-typo")).toBe("info");
  });

  it("stays silent for exact built-in names", () => {
    expect(
      typoHints(`
system S {
  service Legacy @deprecated @migration_target {}
}
    `),
    ).toHaveLength(0);
  });

  it("stays silent for user-defined names far from any built-in", () => {
    expect(
      typoHints(`
system S {
  service Billing @internal @team-alpha {}
}
    `),
    ).toHaveLength(0);
  });

  it("treats a name targeted by a stylesheet annotation selector as intentional", () => {
    const krs = `
system S {
  service Legacy @deprecate {}
}
    `;
    // Without a stylesheet the near-miss is hinted...
    expect(typoHints(krs)).toHaveLength(1);
    // ...but a user selector for the name marks it user-defined.
    expect(typoHints(krs, `service@deprecate { opacity: 0.5; }`)).toHaveLength(0);
  });

  it("walks annotations on systems and nested resources", () => {
    const hints = typoHints(`
system S @experimentl {
  service Svc {
    domain Orders {
      usecase Do {
        resource OrderDB @deprecatd {}
      }
    }
  }
}
    `);
    expect(hints.map((h) => h.params.suggestion).sort()).toEqual(["deprecated", "experimental"]);
  });
});

describe("tag-not-builtin deprecation warning (#2159)", () => {
  function tagWarnings(krs: string, userStyle?: string) {
    const file = Parser.parse(krs).value;
    const sheets = [getBuiltinStyleSheet()];
    if (userStyle) sheets.push(StyleParser.parse(userStyle).value);
    return analyze(file, sheets).filter((w) => w.kind === "tag-not-builtin");
  }

  it("warns on a non-builtin tag on any node kind", () => {
    const warnings = tagWarnings(`
system S {
  database SessionStore [cache] {}
}
    `);
    expect(warnings).toHaveLength(1);
    if (warnings[0].kind !== "tag-not-builtin") throw new Error("kind mismatch");
    expect(warnings[0].params).toEqual({ nodeId: "SessionStore", tag: "cache" });
  });

  it("warns on a non-builtin tag on an edge", () => {
    const warnings = tagWarnings(`
system S {
  service A {}
  service B {}
  A -> B "call" [pci]
}
    `);
    expect(warnings).toHaveLength(1);
    if (warnings[0].kind !== "tag-not-builtin") throw new Error("kind mismatch");
    expect(warnings[0].params).toEqual({ nodeId: "A -> B", tag: "pci" });
  });

  it("stays silent for every builtin tag", () => {
    expect(
      tagWarnings(`
system S {
  user U [human]
  user Agent [ai]
  client App [mobile] {}
  service Api [external] {}
  database Search [index] {}
  service A {}
  A -> Api "sync" [sync]
  A --> Api "async" [async]
}
    `),
    ).toHaveLength(0);
  });

  it("stays silent for system-assigned tags — [inferred] is stamped into source by translate", () => {
    expect(
      tagWarnings(`
system S {
  service A {}
  service B {}
  A -> B [inferred]
}
    `),
    ).toHaveLength(0);
  });

  it("is NOT suppressed by a style selector — intent does not change the v2.0 outcome", () => {
    const krs = `
system S {
  service Billing [pci] {}
}
    `;
    expect(tagWarnings(krs, `[pci] { border-color: #EF4444; }`)).toHaveLength(1);
  });

  it("renders as warning — a definite migration fact, not a hint", () => {
    expect(warningSeverity("tag-not-builtin")).toBe("warning");
  });

  it("walks nested nodes", () => {
    const warnings = tagWarnings(`
system S {
  service Svc {
    domain Orders {
      usecase Do {
        resource OrderRef [ledger] {}
      }
    }
  }
}
    `);
    expect(warnings).toHaveLength(1);
    if (warnings[0].kind !== "tag-not-builtin") throw new Error("kind mismatch");
    expect(warnings[0].params).toEqual({ nodeId: "OrderRef", tag: "ledger" });
  });

  it("allows every tag in the spec's System-assigned tags table (dual-representation guard, TPL-1415)", () => {
    // `SYSTEM_ASSIGNED_TAGS` and the spec table are two representations of
    // one vocabulary. If a future auto-assigned tag lands in the spec but
    // not in the constant, the tool would warn on its own vocabulary — this
    // guard catches that drift the way diagnostics-catalog.test.ts guards
    // the warning-kind catalog.
    const here = dirname(fileURLToPath(import.meta.url));
    const spec = readFileSync(
      resolve(here, "../../../..", "docs/spec/tags-annotations.md"),
      "utf8",
    );
    const section = /## System-assigned tags([\s\S]*?)(\n## |$)/.exec(spec);
    if (!section) throw new Error("System-assigned tags section not found in spec");
    const documented = [...section[1].matchAll(/^\| `\[([a-z-]+)\]` \|/gm)].map((m) => m[1]);
    expect(documented.length).toBeGreaterThanOrEqual(5); // sanity: the table was found
    const allowed = new Set([...REFERENCE_DATA.tags.map((t) => t.name), ...SYSTEM_ASSIGNED_TAGS]);
    expect(documented.filter((tag) => !allowed.has(tag))).toEqual([]);
  });
});

describe("tag-not-applicable — builtin tag on a kind outside appliesTo (#2225)", () => {
  function applicabilityWarnings(krs: string) {
    const file = Parser.parse(krs).value;
    return analyze(file, [getBuiltinStyleSheet()]).filter((w) => w.kind === "tag-not-applicable");
  }

  it("warns on each of the issue's verified cases and stays silent on the control", () => {
    const warnings = applicabilityWarnings(`
system S {
  service Api [index] {}
  user U [table] {}
  database DB [mobile] {}
  database Ok [index] {}
}
    `);
    expect(
      warnings.map((w) =>
        w.kind === "tag-not-applicable" ? `${w.params.nodeId}[${w.params.tag}]` : "",
      ),
    ).toEqual(["Api[index]", "U[table]", "DB[mobile]"]);
  });

  it("reports the kind written and the kinds the tag applies to", () => {
    const warnings = applicabilityWarnings(`
system S {
  service Api [index] {}
}
    `);
    expect(warnings).toHaveLength(1);
    if (warnings[0].kind !== "tag-not-applicable") throw new Error("kind mismatch");
    expect(warnings[0].params).toEqual({
      nodeId: "Api",
      tag: "index",
      nodeKind: "service",
      appliesTo: ["database"],
    });
  });

  it("warns on a redundant shape tag — `storage Bucket [storage]` (#2225, called out in the changeset)", () => {
    const warnings = applicabilityWarnings(`
system S {
  storage Bucket [storage] {}
}
    `);
    expect(warnings).toHaveLength(1);
    if (warnings[0].kind !== "tag-not-applicable") throw new Error("kind mismatch");
    expect(warnings[0].params.nodeKind).toBe("storage");
  });

  it("checks edge tags against the literal kind `edge`", () => {
    // `[sync]`/`[async]` declare appliesTo: ["edge"], so a client-form tag on
    // an edge must warn while the communication-mode tags must not.
    const warnings = applicabilityWarnings(`
system S {
  service A {}
  service B {}
  A -> B "ok" [sync]
  A --> B "ok" [async]
  A -> B "bad" [mobile]
}
    `);
    expect(warnings).toHaveLength(1);
    if (warnings[0].kind !== "tag-not-applicable") throw new Error("kind mismatch");
    expect(warnings[0].params).toEqual({
      nodeId: "A -> B",
      tag: "mobile",
      nodeKind: "edge",
      appliesTo: ["client"],
    });
  });

  it("stays silent for system-assigned tags — they carry no appliesTo to violate", () => {
    expect(
      applicabilityWarnings(`
system S {
  service A {}
  service B {}
  A -> B [inferred]
}
      `),
    ).toHaveLength(0);
  });

  it("never fires together with tag-not-builtin — one tag, one register", () => {
    const file = Parser.parse(`
system S {
  service Billing [pci] {}
}
    `).value;
    const kinds = analyze(file, [getBuiltinStyleSheet()])
      .filter((w) => w.kind === "tag-not-builtin" || w.kind === "tag-not-applicable")
      .map((w) => w.kind);
    expect(kinds).toEqual(["tag-not-builtin"]);
  });

  it("does not fire on infra sub-resources — their shape tags are inferred, never in node.tags", () => {
    // buildInferredTagMap (style-resolver) derives [table]/[queue]/[storage]
    // from the sub-kind against dot-notation ids; nothing writes them into the
    // AST. Pin that here so a future change to the inference path cannot start
    // producing false positives in this walk (#2225).
    expect(
      applicabilityWarnings(`
system S {
  database OrderDB {
    table OrderTable {}
  }
  queue Events {
    queue-item OrderPlaced {}
  }
  storage Assets {
    bucket Images {}
  }
}
      `),
    ).toHaveLength(0);
  });

  it("walks nested nodes", () => {
    const warnings = applicabilityWarnings(`
system S {
  service Svc {
    domain Orders {
      usecase Do {
        resource OrderRef [table] {}
        resource Bad [index] {}
      }
    }
  }
}
    `);
    expect(warnings).toHaveLength(1);
    if (warnings[0].kind !== "tag-not-applicable") throw new Error("kind mismatch");
    expect(warnings[0].params.nodeId).toBe("Bad");
  });

  it("renders as warning — same register as tag-not-builtin, the author's symptom is identical", () => {
    expect(warningSeverity("tag-not-applicable")).toBe("warning");
  });

  it("covers every builtin tag: each applies cleanly to at least one declared kind (TPL-2172)", () => {
    // The applicability table is the enforcement input now. A tag whose
    // appliesTo is empty (or names a kind that does not exist) would make the
    // diagnostic fire everywhere and nowhere — catch that at the source.
    const kinds = new Set<string>([...REFERENCE_DATA.nodeKinds.map((k) => k.kind), "edge"]);
    const broken = REFERENCE_DATA.tags.filter(
      (t) => t.appliesTo.length === 0 || t.appliesTo.some((k) => !kinds.has(k)),
    );
    expect(broken.map((t) => t.name)).toEqual([]);
  });
});

describe("annotation-not-builtin deprecation warning (#2159)", () => {
  function annotationWarnings(krs: string, userStyle?: string) {
    const file = Parser.parse(krs).value;
    const sheets = [getBuiltinStyleSheet()];
    if (userStyle) sheets.push(StyleParser.parse(userStyle).value);
    return analyze(file, sheets).filter((w) => w.kind === "annotation-not-builtin");
  }

  it("warns on a non-builtin annotation", () => {
    const warnings = annotationWarnings(`
system S {
  service Api @canary {}
}
    `);
    expect(warnings).toHaveLength(1);
    if (warnings[0].kind !== "annotation-not-builtin") throw new Error("kind mismatch");
    expect(warnings[0].params).toEqual({ nodeId: "Api", annotation: "canary" });
  });

  it("stays silent for the four builtin annotations", () => {
    expect(
      annotationWarnings(`
system S {
  service A @deprecated {}
  service B @new {}
  service C @experimental {}
  service D @migration_target {}
}
    `),
    ).toHaveLength(0);
  });

  it("is NOT suppressed by a style selector, unlike the typo hint", () => {
    const krs = `
system S {
  service Legacy @deprecate {}
}
    `;
    const style = `service@deprecate { opacity: 0.5; }`;
    // The near-miss typo hint is suppressed by the selector...
    const file = Parser.parse(krs).value;
    const sheets = [getBuiltinStyleSheet(), StyleParser.parse(style).value];
    const all = analyze(file, sheets);
    expect(all.filter((w) => w.kind === "annotation-possible-typo")).toHaveLength(0);
    // ...but the deprecation still fires: v2.0 closes the set regardless of intent.
    expect(all.filter((w) => w.kind === "annotation-not-builtin")).toHaveLength(1);
  });

  it("fires alongside the typo hint on an unstyled near-miss", () => {
    const file = Parser.parse(`
system S {
  service Legacy @depracated {}
}
    `).value;
    const all = analyze(file, [getBuiltinStyleSheet()]);
    expect(all.filter((w) => w.kind === "annotation-possible-typo")).toHaveLength(1);
    expect(all.filter((w) => w.kind === "annotation-not-builtin")).toHaveLength(1);
  });

  it("covers team annotations in organization blocks", () => {
    const warnings = annotationWarnings(`
organization Corp {
  team payments @sunset {
    owns Payment
  }
}
system S {
  service Payment {}
}
    `);
    expect(warnings).toHaveLength(1);
    if (warnings[0].kind !== "annotation-not-builtin") throw new Error("kind mismatch");
    expect(warnings[0].params).toEqual({ nodeId: "payments", annotation: "sunset" });
  });

  it("a team near-miss carries both diagnostics, same as a node (spec: coexist in v1.x)", () => {
    const file = Parser.parse(`
organization Corp {
  team ops @depracated {
    owns Payment
  }
}
system S {
  service Payment {}
}
    `).value;
    const all = analyze(file, [getBuiltinStyleSheet()]);
    const hints = all.filter((w) => w.kind === "annotation-possible-typo");
    expect(hints).toHaveLength(1);
    if (hints[0].kind !== "annotation-possible-typo") throw new Error("kind mismatch");
    expect(hints[0].params).toEqual({
      nodeId: "ops",
      annotation: "depracated",
      suggestion: "deprecated",
    });
    expect(all.filter((w) => w.kind === "annotation-not-builtin")).toHaveLength(1);
  });

  it("renders as warning", () => {
    expect(warningSeverity("annotation-not-builtin")).toBe("warning");
  });
});

describe("unresolved-handles warning", () => {
  function unresolved(krs: string) {
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, [getBuiltinStyleSheet()]);
    return warnings.filter((w) => w.kind === "unresolved-handles");
  }

  it("resolves client.handles when the connected service owns the domain", () => {
    const krs = `
system S {
  client WebApp [web] { handles Order }
  service Backend {
    domain Order {}
  }
  WebApp -> Backend
}
    `;
    expect(unresolved(krs)).toHaveLength(0);
  });

  it("resolves a BFF chain: client -> BFF.handles -> backend.owns", () => {
    const krs = `
system S {
  client WebApp [web] { handles Order }
  service NextServer { handles Order }
  service Backend {
    domain Order {}
  }
  WebApp -> NextServer
  NextServer -> Backend
}
    `;
    expect(unresolved(krs)).toHaveLength(0);
  });

  it("warns when client.handles cannot be resolved (typo)", () => {
    const krs = `
system S {
  client WebApp [web] { handles Ordr }
  service Backend {
    domain Order {}
  }
  WebApp -> Backend
}
    `;
    const w = unresolved(krs);
    expect(w).toHaveLength(1);
    if (w[0].kind !== "unresolved-handles") throw new Error("kind mismatch");
    expect(w[0].params).toEqual({ nodeKind: "client", nodeId: "WebApp", domainId: "Ordr" });
  });

  it("warns when client has no outgoing edge to a service that exposes the domain", () => {
    const krs = `
system S {
  client WebApp [web] { handles Order }
  service Backend {
    domain Order {}
  }
}
    `;
    // No edge from WebApp to Backend → unresolved
    const w = unresolved(krs);
    expect(w).toHaveLength(1);
    if (w[0].kind !== "unresolved-handles") throw new Error("kind mismatch");
    expect(w[0].params.nodeId).toBe("WebApp");
    expect(w[0].params.domainId).toBe("Order");
  });

  it("warns when the BFF in the chain forgets to declare handles", () => {
    const krs = `
system S {
  client WebApp [web] { handles Order }
  service NextServer {}
  service Backend {
    domain Order {}
  }
  WebApp -> NextServer
  NextServer -> Backend
}
    `;
    // NextServer doesn't declare handles Order → re-export rule fails → WebApp.handles Order unresolved
    const w = unresolved(krs);
    expect(w).toHaveLength(1);
    if (w[0].kind !== "unresolved-handles") throw new Error("kind mismatch");
    expect(w[0].params.nodeId).toBe("WebApp");
  });

  it("warns on service.handles that does not match a downstream owner", () => {
    const krs = `
system S {
  service Gateway { handles Invoice }
  service Backend {
    domain Order {}
  }
  Gateway -> Backend
}
    `;
    const w = unresolved(krs);
    expect(w).toHaveLength(1);
    if (w[0].kind !== "unresolved-handles") throw new Error("kind mismatch");
    expect(w[0].params).toEqual({
      nodeKind: "service",
      nodeId: "Gateway",
      domainId: "Invoice",
    });
  });

  it("accepts comma-separated and multiple-line handles forms equivalently", () => {
    const commaForm = `
system S {
  client A [web] { handles X, Y }
  service B {
    domain X {}
    domain Y {}
  }
  A -> B
}
    `;
    const multiLineForm = `
system S {
  client A [web] {
    handles X
    handles Y
  }
  service B {
    domain X {}
    domain Y {}
  }
  A -> B
}
    `;
    expect(unresolved(commaForm)).toHaveLength(0);
    expect(unresolved(multiLineForm)).toHaveLength(0);
  });

  it("accepts redundant handles for a self-owned domain", () => {
    const krs = `
system S {
  service Backend {
    domain Order {}
    handles Order
  }
}
    `;
    // The service owns Order via the child node; listing it again under
    // handles is redundant but not an error.
    expect(unresolved(krs)).toHaveLength(0);
  });

  it("does not enter infinite recursion on cycles", () => {
    const krs = `
system S {
  service A { handles X }
  service B { handles X }
  A -> B
  B -> A
}
    `;
    // Neither owns X; the cycle guard should prevent infinite recursion and
    // both A and B should warn.
    const w = unresolved(krs);
    expect(w).toHaveLength(2);
  });
});

describe("unresolved-realizes warning", () => {
  function unresolved(krs: string) {
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, [getBuiltinStyleSheet()]);
    return warnings.filter((w) => w.kind === "unresolved-realizes");
  }

  it("does not warn when realizes points to an existing service", () => {
    const krs = `
system S {
  service ECommerce {}
}
deploy Production {
  oci ecommerceApp {
    runtime "Kubernetes"
    realizes ECommerce
  }
}
    `;
    expect(unresolved(krs)).toHaveLength(0);
  });

  it("warns when realizes target is a typo", () => {
    const krs = `
system S {
  service ECommerce {}
}
deploy Production {
  oci ecommerceApp {
    runtime "Kubernetes"
    realizes ECommrce
  }
}
    `;
    const w = unresolved(krs);
    expect(w).toHaveLength(1);
    if (w[0].kind !== "unresolved-realizes") throw new Error("kind mismatch");
    expect(w[0].params).toEqual({
      deployNodeId: "ecommerceApp",
      deployBlockId: "Production",
      target: "ECommrce",
    });
  });

  it("does not warn when realizes is missing (covered by missing-realizes)", () => {
    const krs = `
system S {
  service ECommerce {}
}
deploy Production {
  oci ecommerceApp {
    runtime "Kubernetes"
  }
}
    `;
    // missing-realizes still fires, but unresolved-realizes does not.
    expect(unresolved(krs)).toHaveLength(0);
  });

  it("resolves a domain target nested under a service", () => {
    const krs = `
system S {
  service ECommerce {
    domain Order {}
  }
}
deploy Production {
  oci orderProcessor {
    runtime "Kubernetes"
    realizes Order
  }
}
    `;
    expect(unresolved(krs)).toHaveLength(0);
  });

  it("resolves top-level service / domain (no system wrapper)", () => {
    const krs = `
service Standalone {}
domain Inventory {}
deploy Production {
  oci app {
    runtime "Kubernetes"
    realizes Standalone
    realizes Inventory
  }
}
    `;
    expect(unresolved(krs)).toHaveLength(0);
  });

  it("resolves a `store` realizing system-nested infra (database / queue / storage)", () => {
    const krs = `
system S {
  database OrderDB {}
  queue OrderEvents {}
  storage MediaStore {}
}
deploy Production {
  store orderStore {
    type "Aurora PostgreSQL 15"
    realizes OrderDB
  }
  store eventBus {
    type "Amazon SQS"
    realizes OrderEvents
  }
  store mediaBucket {
    type "Amazon S3"
    realizes MediaStore
  }
}
    `;
    expect(unresolved(krs)).toHaveLength(0);
  });

  it("resolves a deploy unit realizing a system-nested client (ADR-1720)", () => {
    const krs = `
system S {
  client Web [web] {}
  service Api {}
}
deploy Production {
  assets webBundle {
    realizes Web
  }
  oci apiApp {
    runtime "Kubernetes"
    realizes Api
  }
}
    `;
    expect(unresolved(krs)).toHaveLength(0);
  });

  it("resolves a deploy unit realizing a top-level (unassigned) client", () => {
    const krs = `
client Web [web] {}
deploy Production {
  assets webBundle {
    realizes Web
  }
}
    `;
    expect(unresolved(krs)).toHaveLength(0);
  });

  it("does not emit `missing-runtime` for a `store` unit (it has no runtime form)", () => {
    const krs = `
system S {
  database OrderDB {}
}
deploy Production {
  store orderStore {
    type "Aurora PostgreSQL 15"
    realizes OrderDB
  }
  oci api {
    realizes OrderDB
  }
}
    `;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, [getBuiltinStyleSheet()]);
    const missingRuntime = warnings.filter((w) => w.kind === "missing-runtime");
    // `store` is exempt; the runtime-less `oci api` still fires it.
    expect(
      missingRuntime.map((w) => (w.kind === "missing-runtime" ? w.params.nodeId : null)),
    ).toEqual(["api"]);
  });

  it("resolves a `store` realizing a top-level (unassigned) infra node", () => {
    const krs = `
database OrderDB {}
deploy Production {
  store orderStore {
    type "Aurora PostgreSQL 15"
    realizes OrderDB
  }
}
    `;
    expect(unresolved(krs)).toHaveLength(0);
  });

  it("warns when a `store` realizes a non-existent infra id", () => {
    const krs = `
system S {
  database OrderDB {}
}
deploy Production {
  store orderStore {
    type "Aurora PostgreSQL 15"
    realizes OrderDb
  }
}
    `;
    const w = unresolved(krs);
    expect(w).toHaveLength(1);
    if (w[0].kind !== "unresolved-realizes") throw new Error("kind mismatch");
    expect(w[0].params).toEqual({
      deployNodeId: "orderStore",
      deployBlockId: "Production",
      target: "OrderDb",
    });
  });

  it("does not resolve a leaf infra sub-resource (table) as a realize target", () => {
    const krs = `
system S {
  database OrderDB {
    table Orders {}
  }
}
deploy Production {
  store t {
    type "Aurora PostgreSQL 15"
    realizes Orders
  }
}
    `;
    // Only top-level database/queue/storage are valid targets; a leaf `table`
    // is not, so realizing it is unresolved.
    expect(unresolved(krs)).toHaveLength(1);
  });

  it("warns once per typoed entry on a single deploy node", () => {
    const krs = `
system S {
  service A {}
  service B {}
}
deploy Production {
  oci app {
    runtime "Kubernetes"
    realizes A
    realizes Bx
    realizes Cx
  }
}
    `;
    const w = unresolved(krs);
    expect(w).toHaveLength(2);
    const targets = w.map((wn) => (wn.kind === "unresolved-realizes" ? wn.params.target : null));
    expect(targets).toEqual(["Bx", "Cx"]);
  });

  it("warns separately per deploy block when each has its own typo", () => {
    const krs = `
system S {
  service ECommerce {}
}
deploy Production {
  oci app1 { runtime "k" realizes ECommrce }
}
deploy Staging {
  oci app2 { runtime "k" realizes Comm }
}
    `;
    const w = unresolved(krs);
    expect(w).toHaveLength(2);
    expect(
      w.map((x) => (x.kind === "unresolved-realizes" ? x.params.deployBlockId : null)),
    ).toEqual(["Production", "Staging"]);
  });
});

describe("cross-system-ref warnings", () => {
  it("emits implicit-external warning for cross-system reference", () => {
    const krs = `
system ECPlatform {
  service OrderService {}
  OrderService -> PaymentGateway.PaymentService
}
system PaymentGateway {
  service PaymentService {}
}
`;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, []);
    const w = warnings.find((warning) => warning.kind === "cross-system-ref-implicit-external");
    expect(w).toBeDefined();
    expect(w?.params.ref).toBe("PaymentGateway.PaymentService");
    expect(w?.params.sourceSystemId).toBe("ECPlatform");
    expect(w?.params.sourceNodeId).toBe("OrderService");
    expect(w?.params.targetSystemId).toBe("PaymentGateway");
  });

  it("emits unresolved warning when referenced system does not exist", () => {
    const krs = `
system ECPlatform {
  service OrderService {}
  OrderService -> UnknownSystem.UnknownService
}
`;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, []);
    const w = warnings.find((warning) => warning.kind === "cross-system-ref-unresolved");
    expect(w).toBeDefined();
    expect(w?.params.ref).toBe("UnknownSystem.UnknownService");
  });

  it("emits unresolved warning when referenced service does not exist in the system", () => {
    const krs = `
system ECPlatform {
  service OrderService {}
  OrderService -> PaymentGateway.NoSuchService
}
system PaymentGateway {
  service PaymentService {}
}
`;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, []);
    const w = warnings.find((warning) => warning.kind === "cross-system-ref-unresolved");
    expect(w).toBeDefined();
    expect(w?.params.ref).toBe("PaymentGateway.NoSuchService");
  });

  it("suppresses implicit-external warning when system id is explicitly declared as [external]", () => {
    const krs = `
system ECPlatform {
  service PaymentGateway [external]
  service OrderService {}
  OrderService -> PaymentGateway.PaymentService
}
system PaymentGateway {
  service PaymentService {}
}
`;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, []);
    const implicit = warnings.filter(
      (warning) => warning.kind === "cross-system-ref-implicit-external",
    );
    expect(implicit).toHaveLength(0);
  });
});

describe("unresolved-edge-endpoint warning", () => {
  const find = (krs: string) =>
    analyze(Parser.parse(krs).value, []).filter((w) => w.kind === "unresolved-edge-endpoint");

  it("warns when a system-level edge targets an id that exists nowhere", () => {
    const warnings = find(`
system Shop {
  service OrderService {}
  OrderService -> Ghost
}
`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].params).toMatchObject({
      from: "OrderService",
      to: "Ghost",
      unresolvedId: "Ghost",
    });
  });

  it("does not warn when both endpoints resolve", () => {
    expect(
      find(`
system Shop {
  service A {}
  service B {}
  A -> B
}
`),
    ).toHaveLength(0);
  });

  it("does not warn for a domain edge to a domain owned by another service (ghost)", () => {
    expect(
      find(`
system Shop {
  service OrderSvc {
    domain Ordering {
      Ordering -> Catalog
    }
  }
  service CatalogSvc {
    domain Catalog {}
  }
}
`),
    ).toHaveLength(0);
  });

  it("warns when a domain edge targets an unknown domain", () => {
    const warnings = find(`
system Shop {
  service OrderSvc {
    domain Ordering {
      Ordering -> Nonexistent
    }
  }
}
`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].params.unresolvedId).toBe("Nonexistent");
  });

  it("does not fire for cross-system dotted refs (handled by cross-system-ref)", () => {
    expect(
      find(`
system Shop {
  service A {}
  A -> Other.Svc
}
`),
    ).toHaveLength(0);
  });
});

// #2075. Each "warns" case below was verified against `extractView` /
// `extractEntityView` on every view path before the detector existed: the edge
// rendered on none of them. Each "does not warn" case renders today, so a
// regression here would be a false positive on a working model.
describe("edge-endpoint-not-at-scope warning", () => {
  const find = (krs: string) =>
    analyze(Parser.parse(krs).value, []).filter((w) => w.kind === "edge-endpoint-not-at-scope");

  it("warns when a system-scope edge names a domain nested in a service", () => {
    const warnings = find(`
system T {
  service S {
    domain A { usecase u {} }
    domain B { usecase v {} }
  }
  A -> B "dep at system scope"
}
`);
    // Both endpoints are out of scope, so the edge is reported per endpoint.
    expect(warnings).toHaveLength(2);
    expect(warnings[0].params).toMatchObject({
      from: "A",
      to: "B",
      endpointId: "A",
      endpointKind: "domain",
      ownerId: "S",
      ownerKind: "service",
      scopeId: "T",
      scopeKind: "system",
    });
    expect(warnings[1].params).toMatchObject({ endpointId: "B" });
  });

  it("warns when a service-scope edge names a domain of another service", () => {
    const warnings = find(`
system T {
  service S1 {
    S1 -> B
    domain A { usecase u {} }
  }
  service S2 {
    domain B { usecase v {} }
  }
}
`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].params).toMatchObject({
      endpointId: "B",
      endpointKind: "domain",
      ownerId: "S2",
      scopeId: "S1",
      scopeKind: "service",
    });
  });

  it("warns when a domain-scope edge names a usecase instead of a domain", () => {
    const warnings = find(`
system T {
  service S1 {
    domain A { usecase u {} -> v }
  }
  service S2 {
    domain B { usecase v {} }
  }
}
`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].params).toMatchObject({
      endpointId: "v",
      endpointKind: "usecase",
      ownerId: "B",
      ownerKind: "domain",
      scopeKind: "domain",
    });
  });

  it("warns when a system-scope edge names a usecase nested two levels down", () => {
    const warnings = find(`
system T {
  service S {
    domain A { usecase u {} }
  }
  S -> u
}
`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].params).toMatchObject({ endpointId: "u", endpointKind: "usecase" });
  });

  it("warns when a service edge names a service of another system without a dotted ref", () => {
    const warnings = find(`
system T {
  service S1 { S1 -> S2 }
}
system U {
  service S2 { domain B { usecase v {} } }
}
`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].params).toMatchObject({
      endpointId: "S2",
      endpointKind: "service",
      ownerId: "U",
      ownerKind: "system",
    });
  });

  it("warns when an entity relation names a cross-domain entity with a bare id", () => {
    const warnings = find(`
system T {
  service S {
    domain D1 { entity Order { -> Customer } usecase u {} }
    domain D2 { entity Customer {} usecase v {} }
  }
}
`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].params).toMatchObject({
      endpointId: "Customer",
      endpointKind: "entity",
      ownerId: "D2",
      ownerKind: "domain",
      scopeId: "Order",
      scopeKind: "entity",
    });
  });

  it("does not warn for the canonical source-anchored domain edge", () => {
    expect(
      find(`
system T {
  service S {
    domain A { usecase u {} -> B }
    domain B { usecase v {} }
  }
}
`),
    ).toHaveLength(0);
  });

  it("does not warn for a cross-service domain edge (derived as an implicit service edge)", () => {
    expect(
      find(`
system T {
  service S1 { domain A { usecase u {} -> B } }
  service S2 { domain B { usecase v {} } }
}
`),
    ).toHaveLength(0);
  });

  it("does not warn for a qualified cross-domain entity relation", () => {
    expect(
      find(`
system T {
  service S {
    domain D1 { entity Order { -> D2.Customer } usecase u {} }
    domain D2 { entity Customer {} usecase v {} }
  }
}
`),
    ).toHaveLength(0);
  });

  // Two same-id `system` blocks in ONE file stay separate AST nodes (only
  // imported ones merge), and `layout.ts` draws a system's edge only when both
  // endpoints are in that system's own id set — so this edge really does drop.
  // The cross-file counterpart is asserted against the real merge in
  // `import-resolver.test.ts`.
  it("warns across a same-file reopened system block", () => {
    const warnings = find(`
system Blog {
  service Authoring { domain A { usecase u {} } }
  Authoring -> Moderation
}
system Blog {
  service Moderation { domain B { usecase v {} } }
}
`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].params).toMatchObject({
      endpointId: "Moderation",
      endpointKind: "service",
      scopeId: "Blog",
      scopeKind: "system",
    });
  });

  // The same domain id under two services is a legal shape (`domain-dispersal`
  // is an info diagnostic, not an error), and the entity view keeps the two
  // instances distinct by node identity — so a bare relation across them is
  // dropped, not resolved.
  it("warns when a dispersed domain id makes a bare entity relation look local", () => {
    const warnings = find(`
system T {
  service S1 { domain A { entity Customer {} usecase u {} } }
  service S2 { domain A { entity Order { -> Customer } usecase v {} } }
}
`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].params).toMatchObject({
      endpointId: "Customer",
      endpointKind: "entity",
      scopeId: "Order",
      scopeKind: "entity",
    });
  });

  // Orphan services / clients are never spliced into a real system's frame —
  // the SVG path wraps them in the `__unassigned__` pseudo-system instead.
  it("warns when a system-scope edge names a top-level orphan service", () => {
    const warnings = find(`
service Orphan { domain O { usecase o {} } }
system T {
  service S { domain A { usecase u {} } }
  S -> Orphan
}
`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].params).toMatchObject({ endpointId: "Orphan", endpointKind: "service" });
  });

  // A top-level *domain* is spliced into the root frame by the drawio exporter
  // (`extractView(systems, path, krsFile.domains)`), so it does render there.
  it("does not warn when a system-scope edge names a top-level orphan domain", () => {
    expect(
      find(`
domain Payment { usecase Pay {} }
system T {
  service S { domain A { usecase u {} } }
  S -> Payment
}
`),
    ).toHaveLength(0);
  });

  it("does not warn for a dotted cross-system ref", () => {
    expect(
      find(`
system T {
  service S1 { S1 -> U.S2 }
}
system U {
  service S2 {}
}
`),
    ).toHaveLength(0);
  });

  it("leaves an endpoint absent from the model to unresolved-edge-endpoint", () => {
    const krs = `
system T {
  service S { domain A { usecase u {} } }
  S -> Ghost
}
`;
    expect(find(krs)).toHaveLength(0);
    expect(
      analyze(Parser.parse(krs).value, []).filter((w) => w.kind === "unresolved-edge-endpoint"),
    ).toHaveLength(1);
  });
});

describe("cyclic-dependency warning", () => {
  it("detects self-reference (A -> A)", () => {
    const krs = `
system S {
  service A {}
  A -> A
}
`;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, []);
    const cyclic = warnings.filter((w) => w.kind === "cyclic-dependency");
    expect(cyclic).toHaveLength(1);
    const w = cyclic[0];
    if (w.kind !== "cyclic-dependency") throw new Error("expected cyclic-dependency");
    expect(w.params.cyclePath).toEqual(["A", "A"]);
  });

  it("marks self-reference edge as cyclic", () => {
    const krs = `
system S {
  service A {}
  A -> A
}
`;
    const file = Parser.parse(krs).value;
    analyze(file, []);
    const edge = file.systems[0].edges[0];
    expect(edge.cyclic).toBe(true);
  });

  it("detects direct cycle (A -> B -> A)", () => {
    const krs = `
system S {
  service A {}
  service B {}
  A -> B
  B -> A
}
`;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, []);
    const cyclic = warnings.filter((w) => w.kind === "cyclic-dependency");
    expect(cyclic).toHaveLength(1);
    const w = cyclic[0];
    if (w.kind !== "cyclic-dependency") throw new Error("expected cyclic-dependency");
    expect(w.params.cyclePath).toContain("A");
    expect(w.params.cyclePath).toContain("B");
  });

  it("marks both edges in a direct cycle as cyclic", () => {
    const krs = `
system S {
  service A {}
  service B {}
  A -> B
  B -> A
}
`;
    const file = Parser.parse(krs).value;
    analyze(file, []);
    const edges = file.systems[0].edges;
    expect(edges.every((e) => e.cyclic)).toBe(true);
  });

  it("detects indirect cycle (A -> B -> C -> A)", () => {
    const krs = `
system S {
  service A {}
  service B {}
  service C {}
  A -> B
  B -> C
  C -> A
}
`;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, []);
    const cyclic = warnings.filter((w) => w.kind === "cyclic-dependency");
    expect(cyclic).toHaveLength(1);
    const w = cyclic[0];
    if (w.kind !== "cyclic-dependency") throw new Error("expected cyclic-dependency");
    expect(w.params.cyclePath).toContain("A");
    expect(w.params.cyclePath).toContain("B");
    expect(w.params.cyclePath).toContain("C");
  });

  it("marks all three edges in an indirect cycle as cyclic", () => {
    const krs = `
system S {
  service A {}
  service B {}
  service C {}
  A -> B
  B -> C
  C -> A
}
`;
    const file = Parser.parse(krs).value;
    analyze(file, []);
    const edges = file.systems[0].edges;
    expect(edges.every((e) => e.cyclic)).toBe(true);
  });

  it("does not flag acyclic edges (A -> B -> C)", () => {
    const krs = `
system S {
  service A {}
  service B {}
  service C {}
  A -> B
  B -> C
}
`;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, []);
    expect(warnings.filter((w) => w.kind === "cyclic-dependency")).toHaveLength(0);
    const edges = file.systems[0].edges;
    expect(edges.every((e) => !e.cyclic)).toBe(true);
  });

  it("does not flag async cycles (A --> B --> A)", () => {
    const krs = `
system S {
  service A {}
  service B {}
  A --> B
  B --> A
}
`;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, []);
    expect(warnings.filter((w) => w.kind === "cyclic-dependency")).toHaveLength(0);
  });

  it("does not flag cyclic edges when cycle is non-cyclic side edge exists", () => {
    const krs = `
system S {
  service A {}
  service B {}
  service D {}
  A -> B
  B -> A
  D -> B
}
`;
    const file = Parser.parse(krs).value;
    analyze(file, []);
    const edges = file.systems[0].edges;
    const ab = edges.find((e) => e.from === "A" && e.to === "B");
    const ba = edges.find((e) => e.from === "B" && e.to === "A");
    const db = edges.find((e) => e.from === "D" && e.to === "B");
    expect(ab?.cyclic).toBe(true);
    expect(ba?.cyclic).toBe(true);
    expect(db?.cyclic).toBeFalsy();
  });
});

describe("unassigned-usecase warning", () => {
  it("warns when a usecase is a direct child of a service (not inside a domain)", () => {
    const krs = `
system ECPlatform {
  service ECommerce {
    usecase PlaceOrder { label "POST /orders" }
    usecase CancelOrder { label "POST /orders/{id}/cancel" }
  }
}
    `;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const warnings = analyze(file, [builtin]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-usecase");
    expect(unassigned).toHaveLength(2);
    expect(unassigned[0].params.usecaseId).toBe("PlaceOrder");
    expect(unassigned[1].params.usecaseId).toBe("CancelOrder");
  });

  it("uses usecase id (not label) in the warning message", () => {
    const krs = `
service OrderService {
  usecase PlaceOrder { label "POST /orders" }
}
    `;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const warnings = analyze(file, [builtin]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-usecase");
    expect(unassigned).toHaveLength(1);
    // The detection keys on the id, not the label — params carry the id,
    // and the label is not part of the structured payload.
    expect(unassigned[0].params.usecaseId).toBe("PlaceOrder");
    expect(unassigned[0].params).not.toHaveProperty("label");
  });

  it("does not warn when a usecase is properly nested inside a domain", () => {
    const krs = `
system ECPlatform {
  service ECommerce {
    domain Order {
      usecase PlaceOrder { label "POST /orders" }
    }
  }
}
    `;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const warnings = analyze(file, [builtin]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-usecase");
    expect(unassigned).toHaveLength(0);
  });
});

describe("unassigned-database warning", () => {
  it("warns for each top-level database not wrapped in a system", () => {
    const krs = `
database OrderDB { label "注文DB" }
database InventoryDB {}

system ECPlatform {
  database ProductDB {}
}
    `;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const warnings = analyze(file, [builtin]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-database");
    expect(unassigned).toHaveLength(2);
    if (unassigned[0].kind !== "unassigned-database") throw new Error("kind mismatch");
    if (unassigned[1].kind !== "unassigned-database") throw new Error("kind mismatch");
    expect(unassigned[0].params).toEqual({ databaseId: "OrderDB", label: "注文DB" });
    expect(unassigned[1].params).toEqual({ databaseId: "InventoryDB" });
  });

  it("does not warn for databases nested inside a system", () => {
    const krs = `
system ECPlatform {
  database OrderDB {}
}
    `;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const warnings = analyze(file, [builtin]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-database");
    expect(unassigned).toHaveLength(0);
  });
});

describe("unassigned-queue warning", () => {
  it("warns for each top-level queue not wrapped in a system", () => {
    const krs = `
queue EventQueue { label "イベントキュー" }

system ECPlatform {
  queue InternalQueue {}
}
    `;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const warnings = analyze(file, [builtin]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-queue");
    expect(unassigned).toHaveLength(1);
    if (unassigned[0].kind !== "unassigned-queue") throw new Error("kind mismatch");
    expect(unassigned[0].params).toEqual({ queueId: "EventQueue", label: "イベントキュー" });
  });
});

describe("unassigned-storage warning", () => {
  it("warns for each top-level storage not wrapped in a system", () => {
    const krs = `
storage FileStore { label "ファイル" }

system ECPlatform {
  storage InternalStore {}
}
    `;
    const file = Parser.parse(krs).value;
    const builtin = getBuiltinStyleSheet();
    const warnings = analyze(file, [builtin]);
    const unassigned = warnings.filter((w) => w.kind === "unassigned-storage");
    expect(unassigned).toHaveLength(1);
    if (unassigned[0].kind !== "unassigned-storage") throw new Error("kind mismatch");
    expect(unassigned[0].params).toEqual({ storageId: "FileStore", label: "ファイル" });
  });
});

describe("delivers-target-not-client warning", () => {
  it("does not warn when delivers target is a client peer", () => {
    const krs = `
system S {
  service NextServer {
    delivers WebApp
  }
  client WebApp [web]
}
`;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, [getBuiltinStyleSheet()]);
    expect(warnings.filter((w) => w.kind === "delivers-target-not-client")).toHaveLength(0);
  });

  it("warns when delivers target is missing or not a client", () => {
    const krs = `
system S {
  service NextServer {
    delivers OrderService, GhostId
  }
  service OrderService {}
}
`;
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, [getBuiltinStyleSheet()]);
    const filtered = warnings.filter((w) => w.kind === "delivers-target-not-client");
    expect(filtered).toHaveLength(2);
    const targets = filtered.map((w) =>
      w.kind === "delivers-target-not-client" ? w.params.targetId : "",
    );
    expect(targets.sort()).toEqual(["GhostId", "OrderService"]);
  });
});

describe("legend-ref-unresolved warning", () => {
  function legendWarnings(krs: string) {
    const file = Parser.parse(krs).value;
    const warnings = analyze(file, [getBuiltinStyleSheet()]);
    return warnings.filter((w) => w.kind === "legend-ref-unresolved");
  }

  it("does not warn for swatch entries", () => {
    expect(
      legendWarnings(`
legend "Owner" {
  swatch #2563EB "Team Backend"
  swatch #16A34A "Team Frontend"
}
`),
    ).toHaveLength(0);
  });

  it("resolves @annotation that is used by a node", () => {
    expect(
      legendWarnings(`
system S {
  service Legacy @deprecated {}
}
legend "Status" {
  ref @deprecated "Deprecated"
}
`),
    ).toHaveLength(0);
  });

  it("resolves [tag] that is present on a node", () => {
    expect(
      legendWarnings(`
system S {
  service ThirdParty [external] {}
}
legend "Origin" {
  ref [external] "Third-party"
}
`),
    ).toHaveLength(0);
  });

  it("resolves a bare type selector matching an existing node kind", () => {
    expect(
      legendWarnings(`
system S {
  service Demo {}
}
legend {
  ref service "Service"
}
`),
    ).toHaveLength(0);
  });

  it("resolves a #id selector matching an existing node id", () => {
    expect(
      legendWarnings(`
system ECPlatform {
  service ECommerce {}
}
legend {
  ref #ECommerce "EC site"
}
`),
    ).toHaveLength(0);
  });

  it("resolves @annotation defined in the builtin style sheet even when no node uses it", () => {
    // @deprecated is part of the builtin sheet — the renderer can still
    // surface its color even if no node currently carries it.
    expect(
      legendWarnings(`
system S {
  service Active {}
}
legend "Status" {
  ref @deprecated "Deprecated"
}
`),
    ).toHaveLength(0);
  });

  it("warns when @annotation is unknown to both nodes and styles", () => {
    const w = legendWarnings(`
system S {
  service Active {}
}
legend "Status" {
  ref @gone "Removed"
}
`);
    expect(w).toHaveLength(1);
    if (w[0].kind !== "legend-ref-unresolved") throw new Error("kind mismatch");
    expect(w[0].params.target).toBe("@gone");
    expect(w[0].params.legendTitle).toBe("Status");
  });

  it("warns when [tag] is unknown to both nodes and styles", () => {
    const w = legendWarnings(`
system S {
  service Active {}
}
legend {
  ref [unknownTag] "Unknown"
}
`);
    expect(w).toHaveLength(1);
    if (w[0].kind !== "legend-ref-unresolved") throw new Error("kind mismatch");
    expect(w[0].params.target).toBe("[unknownTag]");
    expect(w[0].params.legendTitle).toBeUndefined();
  });

  it("warns when a bare type selector does not match any node kind", () => {
    const w = legendWarnings(`
system S {
  service Demo {}
}
legend {
  ref bogus "Bogus"
}
`);
    expect(w).toHaveLength(1);
    if (w[0].kind !== "legend-ref-unresolved") throw new Error("kind mismatch");
    expect(w[0].params.target).toBe("bogus");
  });

  it("warns when a #id selector does not match any node id", () => {
    const w = legendWarnings(`
system S {
  service Demo {}
}
legend {
  ref #Missing "Missing"
}
`);
    expect(w).toHaveLength(1);
    if (w[0].kind !== "legend-ref-unresolved") throw new Error("kind mismatch");
    expect(w[0].params.target).toBe("#Missing");
  });

  it("always warns for .class selectors (.krs.style has no class concept)", () => {
    const w = legendWarnings(`
system S {
  service Demo {}
}
legend {
  ref .legacy "Legacy class"
}
`);
    expect(w).toHaveLength(1);
    if (w[0].kind !== "legend-ref-unresolved") throw new Error("kind mismatch");
    expect(w[0].params.target).toBe(".legacy");
  });

  it("emits one warning per unresolved entry, leaving resolved entries alone", () => {
    const w = legendWarnings(`
system S {
  service Active @deprecated {}
}
legend "Mixed" {
  ref @deprecated         "Deprecated"
  ref [unknownTag]     "Unknown tag"
  ref @gone               "Annotation (missing)"
  ref service             "Service kind"
}
`);
    expect(w).toHaveLength(2);
    const targets = w.map((entry) =>
      entry.kind === "legend-ref-unresolved" ? entry.params.target : "",
    );
    expect(targets.sort()).toEqual(["@gone", "[unknownTag]"]);
  });
});

describe("warningSeverity — exhaustive register map", () => {
  // The `Record<WarningKind, WarningSeverity>` literal forces this table to
  // stay exhaustive: adding a new `WarningKind` to the union without an entry
  // here is a compile error. That is the fence — it makes the author decide,
  // per ADR-1386 / TPL-1386, whether the new kind is a model
  // fact (`warning`) or a style-school smell (`info`), instead of silently
  // inheriting the `warning` default.
  const EXPECTED_SEVERITY: Record<WarningKind, WarningSeverity> = {
    "domain-dispersal": "info",
    // Shared-store fan-in is a style-school smell (Database-per-Service), a
    // fact karasu surfaces but does not prescribe fixing — info, symmetric
    // with domain-dispersal (#1570).
    "shared-infra-fan-in": "info",
    // Cross-domain store access is a boundary-crossing fact some schools call
    // a smell (legitimate under shared kernel / migrations) — info (#1819).
    "cross-domain-store-access": "info",
    "missing-runtime": "info",
    "missing-realizes": "info",
    // Low-confidence hint on an open name set — never a defect karasu can
    // assert (#1499).
    "annotation-possible-typo": "info",
    // v1.x deprecation of non-builtin vocabulary ahead of the v2.0 closure —
    // a definite migration fact, not a low-confidence hint (#2159,
    // TPL-1503 state (2)).
    "tag-not-builtin": "warning",
    // Same register as tag-not-builtin on purpose: from the author's side the
    // symptom is identical ("I wrote a tag and nothing happened"), so a
    // different severity would only ask them to learn a distinction that does
    // not help them (#2225).
    "tag-not-applicable": "warning",
    "annotation-not-builtin": "warning",
    // A `facets` reference to an undeclared facet is a broken reference with a
    // definite fix (declare it, or fix the spelling) — the same register as the
    // other unresolved-reference kinds, not the info hint register (#2173).
    "facet-not-declared": "warning",
    "style-conflict": "warning",
    "unresolved-realizes": "warning",
    "invalid-owns": "warning",
    "unassigned-domain": "warning",
    "unassigned-service": "warning",
    "unassigned-client": "warning",
    "unresolved-handles": "warning",
    "unassigned-database": "warning",
    "unassigned-queue": "warning",
    "unassigned-storage": "warning",
    "unassigned-usecase": "warning",
    "unassigned-resource": "warning",
    // Deep-link addressability degrades, but the model still renders and
    // resolves — a defect worth surfacing, not a style-school fact.
    "entity-anchor-collision": "warning",
    "cross-system-ref-implicit-external": "warning",
    "cross-system-ref-unresolved": "warning",
    "unresolved-edge-endpoint": "warning",
    // The author's edge is absent from every diagram — a defect, not a
    // style-school fact (#2075).
    "edge-endpoint-not-at-scope": "warning",
    "cyclic-dependency": "warning",
    "delivers-target-not-client": "warning",
    "client-capability-duplicate": "warning",
    "legend-ref-unresolved": "warning",
    "style-column-invalid-value": "warning",
    "style-column-ignored-non-system-view": "warning",
    "style-grid-columns-invalid-value": "warning",
    "style-invalid-enum-value": "warning",
    "style-invalid-hex-color": "warning",
    "style-missing-length-unit": "warning",
    "style-invalid-length-unit": "warning",
    "style-out-of-range": "warning",
    "style-unknown-property": "warning",
  };

  for (const [kind, expected] of Object.entries(EXPECTED_SEVERITY) as [
    WarningKind,
    WarningSeverity,
  ][]) {
    it(`${kind} → ${expected}`, () => {
      expect(warningSeverity(kind)).toBe(expected);
    });
  }
});

describe("facet-not-declared (#2173)", () => {
  function facetWarnings(krs: string) {
    return analyze(Parser.parse(krs).value, [getBuiltinStyleSheet()]).filter(
      (w) => w.kind === "facet-not-declared",
    );
  }

  it("warns when a `facets` reference names no declaration", () => {
    const warnings = facetWarnings(`
facet pii {}
system S {
  service Checkout { facets pcl }
}
    `);
    expect(warnings).toHaveLength(1);
    if (warnings[0].kind !== "facet-not-declared") throw new Error("kind mismatch");
    expect(warnings[0].params).toEqual({ nodeId: "Checkout", facetId: "pcl" });
    expect(warnings[0].loc).toBeDefined();
  });

  // The reverse assertion matters as much as the positive one: a correct model
  // that warns is as broken as a typo that does not (TPL-907).
  it("stays silent when every reference resolves", () => {
    expect(
      facetWarnings(`
facet pii {}
facet pci {}
system S {
  service Checkout { facets pii, pci }
  database OrderDB { facets pii }
}
    `),
    ).toEqual([]);
  });

  it("warns once per undeclared id, not once per node in the facet", () => {
    const warnings = facetWarnings(`
system S {
  service A { facets ghost }
  service B { facets ghost }
}
    `);
    expect(warnings.map((w) => (w.kind === "facet-not-declared" ? w.params.nodeId : ""))).toEqual([
      "A",
      "B",
    ]);
  });

  it("reports only the undeclared id when a node mixes declared and undeclared", () => {
    const warnings = facetWarnings(`
facet pii {}
system S {
  service Checkout { facets pii, pcl }
}
    `);
    expect(warnings).toHaveLength(1);
    if (warnings[0].kind !== "facet-not-declared") throw new Error("kind mismatch");
    expect(warnings[0].params.facetId).toBe("pcl");
  });

  it("checks references on every kind, including infra leaves", () => {
    const warnings = facetWarnings(`
system S {
  database DB { table T { facets ghost } }
}
    `);
    expect(warnings).toHaveLength(1);
    if (warnings[0].kind !== "facet-not-declared") throw new Error("kind mismatch");
    expect(warnings[0].params.nodeId).toBe("T");
  });

  it("is a warning, never info — a broken reference is a fact with a fix", () => {
    expect(warningSeverity("facet-not-declared")).toBe("warning");
  });
});

describe("facet-not-declared location precision (#2199 review)", () => {
  function facetWarnings(krs: string) {
    return analyze(Parser.parse(krs).value, [getBuiltinStyleSheet()]).filter(
      (w) => w.kind === "facet-not-declared",
    );
  }

  // Node ids are unique only among siblings (ADR-927), and `facetIndex` keys on
  // the bare id, so deriving the location from that index reported whichever
  // same-named node was walked first. The diagnostic has to land on the line the
  // author must edit (TPL-1352).
  it("points at the node that wrote the reference, not a same-named node elsewhere", () => {
    const warnings = facetWarnings(`facet pii {}
system Shop {
  service Payment {
    domain Ledger {}
  }
  service Checkout {
    domain Payment {
      facets ghost
    }
  }
}
`);
    expect(warnings).toHaveLength(1);
    // `service Payment` opens on line 3; the `domain Payment` that wrote the
    // reference opens on line 7.
    expect(warnings[0].loc?.start.line).toBe(7);
  });

  it("reports each site when two same-id nodes both carry a bad reference", () => {
    const warnings = facetWarnings(`system Shop {
  service Payment {
    domain Ledger { facets ghost }
  }
  service Checkout {
    domain Ledger { facets ghost }
  }
}
`);
    // One warning per authoring site — the union in `facetIndex` would have
    // collapsed these two mistakes into one.
    expect(warnings.map((w) => w.loc?.start.line)).toEqual([3, 6]);
  });
});
