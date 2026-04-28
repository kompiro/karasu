import { describe, it, expect, beforeEach } from "vitest";
import { compile } from "../index.js";
import { analyze } from "./warnings.js";
import { StyleParser } from "../parser/style-parser.js";
import { Parser } from "../parser/parser.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { loadAndRegisterIcons } from "../renderer/svg-icon-loader.js";
import { clearRegistry } from "../renderer/shape-registry.js";
import { registerBuiltinShapes } from "../renderer/shapes.js";

// Minimal icon SVG for test registration
const MINIMAL_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
  <g class="krs-pictogram" transform="translate(6, 4)">
    <rect width="20" height="20" fill="{{color}}"/>
  </g>
  <text class="krs-label" x="30" y="19" text-anchor="start"/>
  <text class="krs-description" x="8" y="44" text-anchor="start"/>
</svg>`;

describe("deprecated-team-property warning", () => {
  it("warns when service has explicit team property covered by owns", () => {
    const krs = `
system MySystem {
  service MyService {
    team "backend"
  }
}
organization Corp {
  team backend {
    owns MyService
  }
}
`;
    const result = compile(krs);
    const w = result.warnings.find((warning) => warning.kind === "deprecated-team-property");
    expect(w).toBeDefined();
    expect(w?.params.nodeId).toBe("MyService");
    expect(w?.params.ownerTeamId).toBe("backend");
  });

  it("does not warn when service has team property but no owns coverage", () => {
    const krs = `
system MySystem {
  service MyService {
    team "backend"
  }
}
`;
    const result = compile(krs);
    expect(result.warnings.filter((w) => w.kind === "deprecated-team-property")).toHaveLength(0);
  });

  it("does not warn when service has no team property but owns coverage exists", () => {
    const krs = `
system MySystem {
  service MyService {}
}
organization Corp {
  team backend {
    owns MyService
  }
}
`;
    const result = compile(krs);
    expect(result.warnings.filter((w) => w.kind === "deprecated-team-property")).toHaveLength(0);
  });
});

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
