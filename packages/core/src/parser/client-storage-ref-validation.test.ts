/**
 * A usecase's `resource <ClientId>.<Id>` resolves to the storage the client
 * declares with that id (#3794). Before, KRS048 said no infra block declared
 * the client id, and nothing tied the reference to the declared storage.
 */
import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import { ImportResolver } from "../fs/import-resolver.js";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";
import type { Diagnostic } from "../types/ast.js";

const CODES = new Set([
  "unresolved-resource-ref",
  "unresolved-table-ref",
  "resource-target-ambiguous",
]);

function refDiagnostics(krs: string): Diagnostic[] {
  return Parser.parse(krs).diagnostics.filter((d) => CODES.has(d.code));
}

const USECASE = (ref: string) => `
  service App {
    domain Chat {
      usecase SaveApiKey { resource ${ref} { operations create, update } }
    }
  }`;

describe("resource <ClientId>.<Id> (#3794)", () => {
  it("resolves to the client storage with that id", () => {
    expect(
      refDiagnostics(`
system S {
  client WebApp [web] {
    resource sessionStorage ApiKey "karasu.ai.anthropic.apiKey"
  }
${USECASE("WebApp.ApiKey")}
}
`),
    ).toEqual([]);
  });

  it("reports a child the client does not declare as a missing leaf of a client", () => {
    const diags = refDiagnostics(`
system S {
  client WebApp [web] {
    resource sessionStorage ApiKey "karasu.ai.anthropic.apiKey"
    resource localStorage "karasu-theme"
  }
${USECASE("WebApp.Theme")}
}
`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("unresolved-resource-ref");
    expect(diags[0].params).toEqual({
      infraId: "WebApp",
      subId: "Theme",
      missing: "leaf",
      parentKind: "client",
    });
  });

  it("keeps a missing block without parentKind", () => {
    const diags = refDiagnostics(`system S {${USECASE("Nowhere.ApiKey")}\n}\n`);
    expect(diags.map((d) => d.params)).toEqual([
      { infraId: "Nowhere", subId: "ApiKey", missing: "block" },
    ]);
  });

  it("resolves to a top-level client and across systems", () => {
    expect(
      refDiagnostics(`
client WebApp [web] {
  resource sessionStorage ApiKey "k"
}
system Frontend {
  client Mobile [mobile] {
    resource keychain Token "t"
  }
}
system Backend {
  service App {
    domain Chat {
      usecase A { resource WebApp.ApiKey { operations read } }
      usecase B { resource Mobile.Token { operations read } }
    }
  }
}
`),
    ).toEqual([]);
  });

  it("resolves to the infra block when an infra block and a client share the id, and says so", () => {
    const diags = refDiagnostics(`
client WebApp [web] {
  resource sessionStorage ApiKey "k"
}
system S {
  storage WebApp {
    bucket ApiKey
  }
${USECASE("WebApp.ApiKey")}
}
`);
    expect(diags.map((d) => [d.code, d.params])).toEqual([
      ["resource-target-ambiguous", { ref: "WebApp.ApiKey", reason: "infra-and-client" }],
    ]);
  });

  it("does not fall back to the shadowed client's storage", () => {
    const diags = refDiagnostics(`
client WebApp [web] {
  resource sessionStorage ApiKey "k"
}
system S {
  storage WebApp {
    bucket Other
  }
${USECASE("WebApp.ApiKey")}
}
`);
    expect(diags.map((d) => d.code)).toEqual([
      "resource-target-ambiguous",
      "unresolved-resource-ref",
    ]);
    expect(diags[1].params).toMatchObject({ missing: "leaf", parentKind: "infra" });
  });

  it("leaves a reference unresolved when two same-id client nodes both declare the child", () => {
    const diags = refDiagnostics(`
system A {
  client WebApp [web] {
    resource sessionStorage ApiKey "a"
  }
}
system B {
  client WebApp [web] {
    resource localStorage ApiKey "b"
  }
${USECASE("WebApp.ApiKey")}
}
`);
    expect(diags.map((d) => [d.code, d.params])).toEqual([
      ["resource-target-ambiguous", { ref: "WebApp.ApiKey", reason: "multiple-clients" }],
    ]);
  });

  it("resolves when only one of the same-id client nodes declares the child", () => {
    expect(
      refDiagnostics(`
system A {
  client WebApp [web] {
    resource sessionStorage ApiKey "a"
  }
}
system B {
  client WebApp [web] {
    resource localStorage Theme "b"
  }
${USECASE("WebApp.ApiKey")}
}
`),
    ).toEqual([]);
  });

  it("resolves to the first of two storages with one id in one client", () => {
    const result = Parser.parse(`
system S {
  client WebApp [web] {
    resource sessionStorage ApiKey "a"
    resource localStorage ApiKey "b"
  }
${USECASE("WebApp.ApiKey")}
}
`);
    expect(result.diagnostics.filter((d) => CODES.has(d.code))).toEqual([]);
  });

  it("does not resolve an entity's table to a client storage", () => {
    const diags = refDiagnostics(`
system S {
  client WebApp [web] {
    resource sessionStorage ApiKey "k"
  }
  service App {
    domain Chat {
      entity Key { table WebApp.ApiKey }
    }
  }
}
`);
    expect(diags.map((d) => [d.code, d.params])).toEqual([
      [
        "unresolved-table-ref",
        { entityId: "Key", infraId: "WebApp", subId: "ApiKey", missing: "block" },
      ],
    ]);
  });

  it("checks no [external] reference, as before", () => {
    expect(refDiagnostics(`system S {${USECASE("Nowhere.ApiKey [external]")}\n}\n`)).toEqual([]);
  });

  it("resolves to a client declared in an imported file", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/p/clients.krs",
      `system Shop {
  client WebApp [web] {
    resource localStorage Cart "cart"
  }
}
`,
    );
    await fs.writeFile(
      "/p/index.krs",
      `import "./clients.krs"
system Shop {
  service App {
    domain Checkout {
      usecase AddToCart { resource WebApp.Cart { operations update } }
    }
  }
}
`,
    );
    const resolved = await new ImportResolver(fs).resolve("/p/index.krs");
    expect(resolved.diagnostics.filter((d) => CODES.has(d.code))).toEqual([]);
  });

  it("counts one client declaration reached through two imports once", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/p/clients.krs",
      `system Shop {
  client WebApp [web] {
    resource localStorage Cart "cart"
  }
}
`,
    );
    await fs.writeFile("/p/a.krs", `import "./clients.krs"\n`);
    await fs.writeFile("/p/b.krs", `import "./clients.krs"\n`);
    await fs.writeFile(
      "/p/index.krs",
      `import "./a.krs"
import "./b.krs"
system Shop {
  service App {
    domain Checkout {
      usecase AddToCart { resource WebApp.Cart { operations update } }
    }
  }
}
`,
    );
    const resolved = await new ImportResolver(fs).resolve("/p/index.krs");
    expect(resolved.diagnostics.filter((d) => CODES.has(d.code))).toEqual([]);
  });

  it("decides an infra/client clash across files on the merged model", async () => {
    const fs = new InMemoryFileSystemProvider();
    // Another system, so the ids are in different scopes (in one system the
    // merge reports duplicate-node-in-system, as it did before #3794).
    await fs.writeFile(
      "/p/infra.krs",
      `system Infra {\n  storage WebApp {\n    bucket Cart\n  }\n}\n`,
    );
    await fs.writeFile(
      "/p/index.krs",
      `import "./infra.krs"
system Shop {
  client WebApp [web] {
    resource localStorage Cart "cart"
  }
  service App {
    domain Checkout {
      usecase AddToCart { resource WebApp.Cart { operations update } }
    }
  }
}
`,
    );
    const resolved = await new ImportResolver(fs).resolve("/p/index.krs");
    expect(resolved.diagnostics.filter((d) => CODES.has(d.code)).map((d) => d.params)).toEqual([
      { ref: "WebApp.Cart", reason: "infra-and-client" },
    ]);
  });
});
