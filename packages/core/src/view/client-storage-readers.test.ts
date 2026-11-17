/**
 * What the readers of a resolved `resource <ClientId>.<Id>` do with it (#3794):
 * the canvas labels it `<name> (<storageKind>)`, and nothing that reads infra
 * (derived service → store edges, shared-store fan-in, cross-domain store
 * access) treats a client's storage as an infra store, including when an infra
 * block and a client share the id (TPL-1720).
 */
import { describe, it, expect } from "vitest";
import { compile } from "../compile/compile.js";
import { extractView } from "./view-extract.js";
import { withUnassignedSystem } from "./unassigned-system.js";
import { Parser } from "../parser/parser.js";
import { physicalTargetsOf } from "../spec/infra-index.js";

const MODEL = `
system S {
  client WebApp [web] {
    resource sessionStorage ApiKey "karasu.ai.anthropic.apiKey"
    resource localStorage Theme "karasu-theme"
  }
  service App {
    delivers WebApp
    domain Chat {
      usecase SaveApiKey { resource WebApp.ApiKey { operations create } }
    }
    domain Look {
      usecase SetTheme { resource WebApp.Theme { operations update } }
    }
  }
  service Other {
    domain Prefs {
      usecase ReadKey { resource WebApp.ApiKey { operations read } }
    }
  }
}
`;

function view(src: string, path: string[]) {
  const file = Parser.parse(src).value;
  return extractView(withUnassignedSystem(file), path, [], [], undefined, physicalTargetsOf(file));
}

describe("client storage readers (#3794)", () => {
  it("labels a resolved client storage <name> (<storageKind>)", () => {
    const slice = view(MODEL, ["S", "App", "Chat"]);
    expect(slice.resourceLabelMap.get("WebApp.ApiKey")).toBe(
      "karasu.ai.anthropic.apiKey (sessionStorage)",
    );
    expect(slice.childNodes.map((n) => n.id)).toContain("WebApp.ApiKey");
  });

  it("draws that label in the domain view", () => {
    const result = compile(MODEL, { viewPath: ["S", "App", "Chat"] });
    expect(result.svg).toContain("karasu.ai.anthropic.apiKey (sessionStorage)");
  });

  it("labels a storage of a top-level client too", () => {
    const src = `
client WebApp [web] {
  resource opfs Projects "/meta/projects.json"
}
system S {
  service App {
    domain Workspace {
      usecase SaveProject { resource WebApp.Projects { operations update } }
    }
  }
}
`;
    const result = compile(src, { viewPath: ["S", "App", "Workspace"] });
    expect(result.svg).toContain("/meta/projects.json (opfs)");
  });

  it("derives no service → client edge from a client storage reference", () => {
    // The root system view is where derived service → store edges are drawn.
    const slice = view(MODEL, []);
    const toClient = slice.childEdges.filter((e) => e.to === "WebApp");
    // Only the authored `delivers` relation reaches the client.
    expect(toClient.length).toBeGreaterThan(0);
    expect(toClient.every((e) => e.tags.includes("delivers"))).toBe(true);
    expect(slice.childEdges.some((e) => e.from === "Other" && e.to === "WebApp")).toBe(false);
  });

  it("keeps resolving to the infra block, and its edge, when a client shares the id", () => {
    const src = `
client WebApp [web] {
  resource sessionStorage ApiKey "k"
}
system S {
  storage WebApp {
    bucket ApiKey { label "Key bucket" }
  }
  service App {
    domain Chat {
      usecase SaveApiKey { resource WebApp.ApiKey { operations create } }
    }
  }
}
`;
    const root = view(src, []);
    expect(root.childEdges.some((e) => e.from === "App" && e.to === "WebApp")).toBe(true);
    expect(view(src, ["S", "App", "Chat"]).resourceLabelMap.get("WebApp.ApiKey")).toBe(
      "Key bucket",
    );
  });

  it("gives no label to a storage two same-id clients declare", () => {
    const src = `
system A {
  client WebApp [web] { resource sessionStorage ApiKey "a" }
}
system B {
  client WebApp [web] { resource localStorage ApiKey "b" }
}
`;
    expect(view(src, ["A"]).resourceLabelMap.has("WebApp.ApiKey")).toBe(false);
  });

  it("puts the referencing usecases on the client's metadata", () => {
    const result = compile(MODEL, { viewPath: ["S"] });
    if (result.diagramType !== "system") throw new Error("expected a system result");
    const client = result.nodeMetadata.get("WebApp");
    expect(client?.resources?.map((r) => [r.id, r.usecases])).toEqual([
      ["ApiKey", ["SaveApiKey", "ReadKey"]],
      ["Theme", ["SetTheme"]],
    ]);
  });

  it("names the client storage on a promoted resource's metadata", () => {
    const result = compile(MODEL, { viewPath: ["S", "App", "Chat"] });
    if (result.diagramType !== "system") throw new Error("expected a system result");
    expect(result.nodeMetadata.get("WebApp.ApiKey")?.clientStorage).toEqual({
      clientId: "WebApp",
      storageId: "ApiKey",
      storageKind: "sessionStorage",
      name: "karasu.ai.anthropic.apiKey",
    });
  });

  it("reports no shared-store fan-in or cross-domain store access on a client storage", () => {
    const kinds = compile(MODEL).warnings.map((w) => w.kind);
    expect(kinds).not.toContain("shared-infra-fan-in");
    expect(kinds).not.toContain("cross-domain-store-access");
  });
});
