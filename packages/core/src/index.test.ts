import { describe, it, expect } from "vitest";
import { compile, compileProject, compileProjectOrgView } from "./index.js";
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

  it("icon theme assigns the dedicated client shape", () => {
    const resolveSheets = [getBuiltinStyleSheet(), getIconThemeStyleSheet()];
    const styles = resolveStyles([CLIENT_NODE], resolveSheets);
    expect(styles.nodes.get("MyClient")!.shape).toMatchObject({ url: "client" });
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
