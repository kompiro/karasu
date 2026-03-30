import { describe, it, expect } from "vitest";
import { compile, compileProjectOrgView } from "./index.js";
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

const ORG_KRS = `
organization "OrgA" {
  team "TeamA" {}
}
`;

describe("compileProjectOrgView — displayMode", () => {
  it("accepts displayMode: icon and returns SVG", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/index.krs", ORG_KRS);
    const result = await compileProjectOrgView("/index.krs", fs, [], "icon");
    expect(result.svg).toBeTruthy();
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });
});

describe("compile — deploy diagram nodeMetadata", () => {
  it("populates nodeMetadata for deploy units", () => {
    const result = compile(DEPLOY_KRS, undefined, undefined, "deploy");
    expect(result.nodeMetadata.size).toBeGreaterThan(0);
  });

  it("sets kind and label from unit id", () => {
    const result = compile(DEPLOY_KRS, undefined, undefined, "deploy");
    const meta = result.nodeMetadata.get("ec-app");
    expect(meta).toBeDefined();
    expect(meta!.kind).toBe("oci");
    expect(meta!.label).toBe("ec-app");
  });

  it("sets runtime and realizes from unit properties", () => {
    const result = compile(DEPLOY_KRS, undefined, undefined, "deploy");
    const meta = result.nodeMetadata.get("ec-app");
    expect(meta!.runtime).toBe("node:20");
    expect(meta!.realizes).toBe("ECommerce");
  });

  it("sets undefined for missing runtime and realizes", () => {
    const result = compile(DEPLOY_KRS, undefined, undefined, "deploy");
    const meta = result.nodeMetadata.get("mailer");
    expect(meta).toBeDefined();
    expect(meta!.kind).toBe("lambda");
    expect(meta!.runtime).toBeUndefined();
    expect(meta!.realizes).toBeUndefined();
  });

  it("does not affect system view nodeMetadata", () => {
    const result = compile(DEPLOY_KRS, undefined, undefined, "system");
    // deploy unit keys must not appear in system view
    expect(result.nodeMetadata.has("ec-app")).toBe(false);
    expect(result.nodeMetadata.has("mailer")).toBe(false);
  });
});
