import { describe, it, expect } from "vitest";
import { compile, compileProject, compileProjectOrgView } from "./index.js";
import { InMemoryFileSystemProvider } from "./fs/in-memory-provider.js";

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
      orgPath: [],
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
    const meta = result.nodeMetadata.get("ec-app");
    expect(meta).toBeDefined();
    expect(meta!.kind).toBe("oci");
    expect(meta!.label).toBe("ec-app");
  });

  it("sets runtime and realizes from unit properties", () => {
    const result = compile(DEPLOY_KRS, { diagramType: "deploy" });
    if (result.diagramType !== "deploy") throw new Error("expected deploy result");
    const meta = result.nodeMetadata.get("ec-app");
    expect(meta!.runtime).toBe("node:20");
    expect(meta!.realizes).toBe("ECommerce");
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

const ORG_KRS = `
org "Eng" {
  system "API" {}
}
`;

const USER_STYLE = `service { color: #FF0000; }`;

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
