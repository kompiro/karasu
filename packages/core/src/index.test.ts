import { describe, it, expect } from "vitest";
import {
  compile,
  compileProject,
  compileProjectOrgView,
  buildAllViewsSvgDiffProject,
} from "./index.js";
import { InMemoryFileSystemProvider } from "./fs/in-memory-provider.js";
import { resolveStyles } from "./resolver/style-resolver.js";
import { StyleParser } from "./parser/style-parser.js";
import { getBuiltinStyleSheet } from "./builtins/default-style.js";
import { getIconThemeStyleSheet } from "./builtins/icon-theme.js";
import type { KrsNode, LinkEntry } from "./types/ast.js";

const DEPLOY_KRS = `
system "EC" {
  service "ECommerce" {}
}

deploy "prod" {
  oci "ec-app" { realizes = "ECommerce"; runtime = "node:20"; }
  lambda "mailer" {}
}
`;

const ORG_KRS_DISPLAY_MODE = `
organization "OrgA" {
  team "TeamA" {}
}
`;

describe("compileProject — diagramType org with displayMode", () => {
  it("accepts diagramType: org and displayMode: icon and returns SVG", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/index.krs", ORG_KRS_DISPLAY_MODE);
    const result = await compileProject("/index.krs", fs, {
      diagramType: "org",
      viewPath: [],
      displayMode: "icon",
    });
    expect(result.svg).toBeTruthy();
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result.diagramType).toBe("org");
  });
});

describe("compile — deploy diagram nodeMetadata", () => {
  it("populates nodeMetadata for deploy units", () => {
    const result = compile(DEPLOY_KRS, { diagramType: "deploy" });
    if (result.diagramType !== "deploy") throw new Error("expected deploy result");
    expect(result.nodeMetadata.size).toBeGreaterThan(0);
  });

  it("sets kind and label from unit id", () => {
    const result = compile(DEPLOY_KRS, { diagramType: "deploy" });
    if (result.diagramType !== "deploy") throw new Error("expected deploy result");
    const meta = result.nodeMetadata.get("ECommerce::ec-app");
    expect(meta).toBeDefined();
    expect(meta!.kind).toBe("oci");
    expect(meta!.label).toBe("ec-app");
  });

  it("sets runtime and realizes from unit properties", () => {
    const result = compile(DEPLOY_KRS, { diagramType: "deploy" });
    if (result.diagramType !== "deploy") throw new Error("expected deploy result");
    const meta = result.nodeMetadata.get("ECommerce::ec-app");
    expect(meta!.runtime).toBe("node:20");
    expect(meta!.realizes).toEqual(["ECommerce"]);
  });

  it("sets undefined for missing runtime and realizes", () => {
    const result = compile(DEPLOY_KRS, { diagramType: "deploy" });
    if (result.diagramType !== "deploy") throw new Error("expected deploy result");
    const meta = result.nodeMetadata.get("mailer");
    expect(meta).toBeDefined();
    expect(meta!.kind).toBe("lambda");
    expect(meta!.runtime).toBeUndefined();
    expect(meta!.realizes).toBeUndefined();
  });

  it("does not affect system view nodeMetadata", () => {
    const result = compile(DEPLOY_KRS, { diagramType: "system" });
    if (result.diagramType !== "system") throw new Error("expected system result");
    // deploy unit keys must not appear in system view
    expect(result.nodeMetadata.has("ec-app")).toBe(false);
    expect(result.nodeMetadata.has("mailer")).toBe(false);
  });
});

const MULTI_REALIZES_KRS = `
system ECPlatform {
  service OrderService {}
  service InventoryService {}
}

deploy Production {
  oci monolith {
    realizes OrderService
    realizes InventoryService
  }
}
`;

describe("compile — multi-realizes deploy unit", () => {
  it("renders monolith in both OrderService and InventoryService containers", () => {
    const result = compile(MULTI_REALIZES_KRS, { diagramType: "deploy" });
    if (result.diagramType !== "deploy") throw new Error("expected deploy result");
    expect(result.svg).toContain('data-container-id="OrderService"');
    expect(result.svg).toContain('data-container-id="InventoryService"');
    expect(result.svg).toContain('data-node-id="OrderService::monolith"');
    expect(result.svg).toContain('data-node-id="InventoryService::monolith"');
  });

  it("creates nodeMetadata entries for both compound keys", () => {
    const result = compile(MULTI_REALIZES_KRS, { diagramType: "deploy" });
    if (result.diagramType !== "deploy") throw new Error("expected deploy result");
    expect(result.nodeMetadata.has("OrderService::monolith")).toBe(true);
    expect(result.nodeMetadata.has("InventoryService::monolith")).toBe(true);
  });
});

const ORG_KRS = `
org "Eng" {
  system "API" {}
}
`;

const USER_STYLE = `service { color: #FF0000; }`;

const DOMAIN_NODE = {
  id: "MyDomain",
  kind: "domain",
  label: "MyDomain",
  tags: [] as string[],
  annotations: [] as string[],
  edges: [],
  children: [],
  properties: { links: [] as LinkEntry[] },
} as unknown as KrsNode;

const SERVICE_NODE = {
  id: "MyService",
  kind: "service",
  label: "MyService",
  tags: [] as string[],
  annotations: [] as string[],
  edges: [],
  children: [],
  properties: { links: [] as LinkEntry[] },
} as unknown as KrsNode;

const CLIENT_NODE = {
  id: "MyClient",
  kind: "client",
  label: "MyClient",
  tags: ["mobile"] as string[],
  annotations: [] as string[],
  edges: [],
  children: [],
  properties: { links: [] as LinkEntry[] },
} as unknown as KrsNode;

describe("Icon Mode — shape cascade priority (issue #279)", () => {
  it("icon theme last in cascade: url() shape wins over user box declaration", () => {
    // This is the correct cascade for icon mode: [builtin, user, iconTheme]
    // icon theme is last → highest sourceIndex → wins for `shape`
    const userSheet = StyleParser.parse(`domain { shape: box; }`).value;
    const resolveSheets = [getBuiltinStyleSheet(), userSheet, getIconThemeStyleSheet()];
    const styles = resolveStyles([DOMAIN_NODE], resolveSheets);
    expect(styles.nodes.get("MyDomain")!.shape).toMatchObject({ url: "domain" });
  });

  it("icon theme last in cascade: url() shape wins over user cylinder declaration on service", () => {
    const userSheet = StyleParser.parse(`service { shape: cylinder; }`).value;
    const resolveSheets = [getBuiltinStyleSheet(), userSheet, getIconThemeStyleSheet()];
    const styles = resolveStyles([SERVICE_NODE], resolveSheets);
    expect(styles.nodes.get("MyService")!.shape).toMatchObject({ url: "service" });
  });

  it("icon theme first in cascade: user box declaration incorrectly overrides url() shape (documents the original bug)", () => {
    // This documents the original bug behavior: [builtin, iconTheme, user]
    // user is last → highest sourceIndex → user's `box` wins (wrong behavior, now fixed)
    const userSheet = StyleParser.parse(`domain { shape: box; }`).value;
    const resolveSheets = [getBuiltinStyleSheet(), getIconThemeStyleSheet(), userSheet];
    const styles = resolveStyles([DOMAIN_NODE], resolveSheets);
    expect(styles.nodes.get("MyDomain")!.shape).toBe("box");
  });

  it("compile: icon mode does not emit style-conflict for user shape override", () => {
    // Regression test for issue #279.
    const krs = `system "S" { domain "D" {} }`;
    const result = compile(krs, { displayMode: "icon", styleSource: `domain { shape: box; }` });
    expect(result.warnings.filter((w) => w.kind === "style-conflict")).toHaveLength(0);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("compile: no diagnostics in icon mode with user shape declarations", () => {
    const krs = `system "S" { service "Svc" {} domain "D" {} }`;
    const result = compile(krs, {
      displayMode: "icon",
      styleSource: `service { shape: box; }\ndomain { shape: cylinder; }`,
    });
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result.warnings.filter((w) => w.kind === "style-conflict")).toHaveLength(0);
  });

  it("compileProject: icon mode shape wins over user stylesheet shape (verified via resolveStyles)", async () => {
    // Verify that compileProject uses the correct cascade order: [builtin, user, iconTheme]
    // by checking resolveStyles directly with the same cascade.
    const userSheet = StyleParser.parse(
      `domain { shape: box; }\nservice { shape: cylinder; }`,
    ).value;
    const resolveSheets = [getBuiltinStyleSheet(), userSheet, getIconThemeStyleSheet()];
    const styles = resolveStyles([DOMAIN_NODE, SERVICE_NODE], resolveSheets);
    expect(styles.nodes.get("MyDomain")!.shape).toMatchObject({ url: "domain" });
    expect(styles.nodes.get("MyService")!.shape).toMatchObject({ url: "service" });
  });

  it("icon theme assigns the dedicated client shape (subtype tag picks variant)", () => {
    const resolveSheets = [getBuiltinStyleSheet(), getIconThemeStyleSheet()];
    // CLIENT_NODE has tags: ["mobile"] → resolves to the client-mobile variant.
    const styles = resolveStyles([CLIENT_NODE], resolveSheets);
    expect(styles.nodes.get("MyClient")!.shape).toMatchObject({ url: "client-mobile" });
  });

  it("icon theme: client without recognized subtype tags falls back to generic client shape", () => {
    const resolveSheets = [getBuiltinStyleSheet(), getIconThemeStyleSheet()];
    const node = { ...CLIENT_NODE, id: "Plain", tags: ["my-team-internal-tag"] } as KrsNode;
    const styles = resolveStyles([node], resolveSheets);
    expect(styles.nodes.get("Plain")!.shape).toMatchObject({ url: "client" });
  });

  it.each([
    ["mobile", "client-mobile"],
    ["web", "client-web"],
    ["desktop", "client-desktop"],
    ["cli", "client-cli"],
    ["device", "client-device"],
    ["extension", "client-extension"],
    ["embed", "client-embed"],
  ])("icon theme: client[%s] resolves to %s", (tag, shape) => {
    const resolveSheets = [getBuiltinStyleSheet(), getIconThemeStyleSheet()];
    const node = { ...CLIENT_NODE, id: `C-${tag}`, tags: [tag] } as KrsNode;
    const styles = resolveStyles([node], resolveSheets);
    expect(styles.nodes.get(`C-${tag}`)!.shape).toMatchObject({ url: shape });
  });

  it("icon theme: multi-tag client picks first-declared subtype (first-match-wins)", () => {
    const resolveSheets = [getBuiltinStyleSheet(), getIconThemeStyleSheet()];
    // Tag order on the node, NOT theme rule order, governs the choice.
    const node = { ...CLIENT_NODE, id: "Multi", tags: ["mobile", "desktop"] } as KrsNode;
    const styles = resolveStyles([node], resolveSheets);
    expect(styles.nodes.get("Multi")!.shape).toMatchObject({ url: "client-mobile" });
  });

  it("icon theme: multi-tag client respects node-tag order even when reversed", () => {
    const resolveSheets = [getBuiltinStyleSheet(), getIconThemeStyleSheet()];
    const node = { ...CLIENT_NODE, id: "Reversed", tags: ["desktop", "mobile"] } as KrsNode;
    const styles = resolveStyles([node], resolveSheets);
    expect(styles.nodes.get("Reversed")!.shape).toMatchObject({ url: "client-desktop" });
  });

  it("icon theme: single-tag client resolution comes from cascade alone (post-step is a no-op)", () => {
    // Regression guard: if applyClientSubtypeFirstMatch is widened to handle
    // single-tag nodes, this test catches it. The point is that the resolver
    // post-step must not even consider single-tag clients — those are owned
    // entirely by the icon-theme cascade rules.
    const themeOnly = [getBuiltinStyleSheet(), getIconThemeStyleSheet()];
    const overrideOnTheme = StyleParser.parse(`client[mobile] { shape: box; }`).value;
    const styles = resolveStyles(
      [{ ...CLIENT_NODE, id: "Single", tags: ["mobile"] } as KrsNode],
      [...themeOnly, overrideOnTheme],
    );
    // User override on a single-tag client wins via cascade specificity ties +
    // higher source index. If the post-step ever re-asserted client-mobile here
    // it would clobber the user choice.
    expect(styles.nodes.get("Single")!.shape).toBe("box");
  });

  it("icon theme: extra non-subtype tags do not affect first-match-wins", () => {
    const resolveSheets = [getBuiltinStyleSheet(), getIconThemeStyleSheet()];
    const node = {
      ...CLIENT_NODE,
      id: "Mixed",
      tags: ["my-internal", "web", "v2", "mobile"],
    } as KrsNode;
    const styles = resolveStyles([node], resolveSheets);
    expect(styles.nodes.get("Mixed")!.shape).toMatchObject({ url: "client-web" });
  });

  it("compileProject: icon mode does not emit false style-conflict for shape overrides", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/main.krs", `system "S" { domain "D" {} }`);
    await fs.writeFile("/main.krs.style", `domain { shape: box; }`);
    const result = await compileProject("/main.krs", fs, { displayMode: "icon" });
    expect(result.warnings.filter((w) => w.kind === "style-conflict")).toHaveLength(0);
  });
});

describe("compileProject — diagramType org style-conflict warnings", () => {
  it("does not emit style-conflict when icon theme overrides builtin (icon mode)", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/main.krs", ORG_KRS);
    const result = await compileProject("/main.krs", fs, {
      diagramType: "org",
      displayMode: "icon",
    });
    expect(result.warnings.filter((w) => w.kind === "style-conflict")).toHaveLength(0);
  });

  it("does not emit style-conflict between icon theme and user sheet (icon mode)", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/main.krs", ORG_KRS);
    await fs.writeFile("/main.krs.style", USER_STYLE);
    const result = await compileProject("/main.krs", fs, {
      diagramType: "org",
      displayMode: "icon",
    });
    expect(result.warnings.filter((w) => w.kind === "style-conflict")).toHaveLength(0);
  });
});

describe("compile — nodeMetadata viewPath in multi-system root view", () => {
  const MULTI_SYSTEM_KRS = `
system SysA {
  service ServiceA {}
}
system SysB {
  service ServiceB {}
}
`;

  it("includes viewPath for services in the first system", () => {
    const result = compile(MULTI_SYSTEM_KRS, { diagramType: "system", viewPath: [] });
    if (result.diagramType !== "system") throw new Error("expected system result");
    expect(result.nodeMetadata.get("ServiceA")?.viewPath).toEqual(["SysA", "ServiceA"]);
  });

  it("includes viewPath for services in the second system (regression: was missing before fix)", () => {
    const result = compile(MULTI_SYSTEM_KRS, { diagramType: "system", viewPath: [] });
    if (result.diagramType !== "system") throw new Error("expected system result");
    expect(result.nodeMetadata.get("ServiceB")?.viewPath).toEqual(["SysB", "ServiceB"]);
  });
});

describe("compile — nodeMetadata viewPath for ghost system services", () => {
  const CROSS_SYSTEM_KRS = `
system ECPlatform {
  service OrderService {}
  OrderService -> PaymentGateway.PaymentService "決済を依頼する"
}
system PaymentGateway {
  service PaymentService {}
}
`;

  it("includes viewPath for ghost system services in service view", () => {
    const result = compile(CROSS_SYSTEM_KRS, {
      diagramType: "system",
      viewPath: ["ECPlatform", "OrderService"],
    });
    if (result.diagramType !== "system") throw new Error("expected system result");
    expect(result.nodeMetadata.get("PaymentService")?.viewPath).toEqual([
      "PaymentGateway",
      "PaymentService",
    ]);
  });
});

describe("compile — top-level (unassigned) services and domains", () => {
  it("renders orphan services/domains inside a labeled Unassigned frame alongside real systems", () => {
    const src = `service AuthStandalone { label "認証" }
domain Payment { label "決済" }

system ECPlatform {
  service ECommerce { label "ECサイト" }
}`;
    const result = compile(src);
    if (result.diagramType !== "system") throw new Error("expected system result");
    // Both frames are drawn with their own label
    expect(result.svg).toContain("ECPlatform");
    expect(result.svg).toContain("Unassigned");
    // Orphan nodes land inside the Unassigned frame, not inside ECPlatform
    expect(result.svg).toContain("認証");
    expect(result.svg).toContain("決済");
    expect(result.svg).toContain("ECサイト");
    // The ECPlatform frame is rendered before the Unassigned frame
    expect(result.svg.indexOf("ECPlatform")).toBeLessThan(result.svg.indexOf("Unassigned"));
  });

  it("wraps orphans in an Unassigned frame even when no real system is present", () => {
    const src = `service ECommerce {
  usecase ManageOrders { label "注文管理" }
}`;
    const result = compile(src);
    if (result.diagramType !== "system") throw new Error("expected system result");
    expect(result.svg).not.toContain("No diagram");
    expect(result.svg).not.toContain("No nodes to render");
    expect(result.svg).toContain("Unassigned");
    expect(result.svg).toContain("ECommerce");
  });
});

describe("deprecated compileProjectOrgView — backward compatibility", () => {
  it("still works and returns OrgCompileResult shape", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/index.krs", ORG_KRS_DISPLAY_MODE);
    const result = await compileProjectOrgView("/index.krs", fs, [], "icon");
    expect(result.svg).toBeTruthy();
    expect(result.diagramType).toBe("org");
    expect(result.nodePathIndex).toBeDefined();
  });
});

describe("buildAllViewsSvgDiffProject — bundled diff (Issue #1025)", () => {
  const SYSTEM_DEPLOY_ORG_BEFORE = `
system "EC" {
  service "ECommerce" {}
}

deploy "prod" {
  oci "ec-app" { realizes = "ECommerce"; runtime = "node:20"; }
}

organization "OrgA" {
  team "TeamA" {}
}
`;

  const SYSTEM_DEPLOY_ORG_AFTER = `
system "EC" {
  service "ECommerce" {}
  service "Billing" {}
}

deploy "prod" {
  oci "ec-app" { realizes = "ECommerce"; runtime = "node:20"; }
  lambda "mailer" {}
}

organization "OrgA" {
  team "TeamA" {}
  team "TeamB" {}
}
`;

  const SYSTEM_ONLY = `
system "EC" {
  service "ECommerce" {}
}
`;
  const SYSTEM_ONLY_AFTER = `
system "EC" {
  service "ECommerce" {}
  service "Billing" {}
}
`;

  it("bundles system + deploy + org tabs when all three apply", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/before.krs", SYSTEM_DEPLOY_ORG_BEFORE);
    await fs.writeFile("/after.krs", SYSTEM_DEPLOY_ORG_AFTER);

    const result = await buildAllViewsSvgDiffProject({
      beforeEntryPath: "/before.krs",
      afterEntryPath: "/after.krs",
      fs,
    });

    expect(result.svg).toContain('id="krs-system-root"');
    expect(result.svg).toContain('id="krs-deploy-root"');
    expect(result.svg).toContain('id="krs-org-root"');
    expect(result.svg).toContain("/* karasu-diff-style */");
    expect(result.views.system).toBeDefined();
    expect(result.views.deploy).toBeDefined();
    expect(result.views.org).toBeDefined();
    // Diff annotations should be present in the bundle.
    expect(result.svg).toContain('data-diff-state="added"');
  });

  it("skips deploy tab when neither side has a deploy block", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/before.krs", SYSTEM_ONLY);
    await fs.writeFile("/after.krs", SYSTEM_ONLY_AFTER);

    const result = await buildAllViewsSvgDiffProject({
      beforeEntryPath: "/before.krs",
      afterEntryPath: "/after.krs",
      fs,
    });

    expect(result.svg).toContain('id="krs-system-root"');
    expect(result.svg).not.toContain('id="krs-deploy-root"');
    expect(result.svg).not.toContain('id="krs-org-root"');
    expect(result.views.system).toBeDefined();
    expect(result.views.deploy).toBeUndefined();
    expect(result.views.org).toBeUndefined();
  });

  it("skips org tab when neither side has any team", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/before.krs", DEPLOY_KRS);
    await fs.writeFile("/after.krs", DEPLOY_KRS);

    const result = await buildAllViewsSvgDiffProject({
      beforeEntryPath: "/before.krs",
      afterEntryPath: "/after.krs",
      fs,
    });

    expect(result.svg).toContain('id="krs-system-root"');
    expect(result.svg).toContain('id="krs-deploy-root"');
    expect(result.svg).not.toContain('id="krs-org-root"');
    expect(result.views.org).toBeUndefined();
  });

  it("includes a view if it appears on only one side (added or removed)", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/before.krs", SYSTEM_ONLY);
    await fs.writeFile("/after.krs", SYSTEM_DEPLOY_ORG_AFTER);

    const result = await buildAllViewsSvgDiffProject({
      beforeEntryPath: "/before.krs",
      afterEntryPath: "/after.krs",
      fs,
    });

    expect(result.svg).toContain('id="krs-deploy-root"');
    expect(result.svg).toContain('id="krs-org-root"');
  });
});

describe("compile — edge#<id> style selector (end-to-end)", () => {
  const KRS = `
system S {
  service A {}
  service B {}
  service C {}
  A -> B "primary" #criticalWrite
  A -> C "secondary"
}
  `;

  it("targets an edge by author id", () => {
    const result = compile(KRS, {
      styleSource: `
edge { color: #000000; }
edge#criticalWrite { color: #FF0000; }
      `,
    });
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    if (result.diagramType !== "system") throw new Error("expected system result");
    expect(result.svg).toContain("#FF0000");
  });

  it("targets an edge by computed base id when no author id is present", () => {
    const result = compile(KRS, {
      styleSource: `
edge { color: #000000; }
edge#A->C { color: #00FF00; }
      `,
    });
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    if (result.diagramType !== "system") throw new Error("expected system result");
    expect(result.svg).toContain("#00FF00");
  });
});

describe("compile — edge direction hint reaches the layered layout", () => {
  // Drill into a service (non-forced layer path) and observe the rendered
  // SVG to verify the direction hint reaches the layout. The top-level
  // forced kind-based layering is intentionally untouched.
  const KRS = `
system S {
  service Backend {
    domain Order { label "Order" }
    domain Payment { label "Payment" }
    Order -> Payment "calls"
  }
}
  `;

  function yOf(svg: string, id: string): number {
    // Find the <g data-node-id="..."> opener, then read the first inner rect's
    // y attribute. We can't use a single regex because the SVG has multiple
    // unrelated rects scattered between nodes.
    const open = svg.indexOf(`data-node-id="${id}"`);
    if (open < 0) throw new Error(`no data-node-id="${id}"`);
    const segment = svg.slice(open, open + 800);
    const m = /<rect\s[^>]*\sy="([0-9.]+)"/.exec(segment);
    if (!m) throw new Error(`no rect y for ${id} (segment: ${segment.slice(0, 200)})`);
    return parseFloat(m[1]);
  }

  it("targets a synthesized usecase->resource edge whose base id contains a dot", () => {
    const krs = `
system S {
  database OrderDB { table OrderTable {} }
  service Backend {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable { operations create }
      }
    }
  }
}
    `;
    const result = compile(krs, {
      viewPath: ["S", "Backend", "Order"],
      styleSource: `edge#PlaceOrder->OrderDB.OrderTable { color: #EF4444; }`,
    });
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    if (result.diagramType !== "system") throw new Error("expected system result");
    expect(result.svg).toContain("#EF4444");
  });

  it("`direction: up` flips the source/target layer order in drill-down views", () => {
    const path = ["S", "Backend"];
    const baseline = compile(KRS, { viewPath: path });
    const upward = compile(KRS, {
      viewPath: path,
      styleSource: `edge#Order->Payment { direction: up; }`,
    });
    if (baseline.diagramType !== "system" || upward.diagramType !== "system") {
      throw new Error("expected system result");
    }
    expect(yOf(baseline.svg, "Order")).toBeLessThan(yOf(baseline.svg, "Payment"));
    expect(yOf(upward.svg, "Order")).toBeGreaterThan(yOf(upward.svg, "Payment"));
  });
});
