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
