import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import { format } from "../formatter/formatter.js";
import type { ClientNode } from "../types/ast.js";

// `resource <storageKind> [<Id>] "<name>"` in a client (#3794): the id is
// optional, the name is required and read with the shared reader (TPL-3752).

function clientOf(src: string): ClientNode {
  const result = Parser.parse(src);
  return result.value.systems[0].children.find((c) => c.kind === "client") as ClientNode;
}

describe("client resource id (#3794)", () => {
  it("reads an optional id between the storage kind and the name", () => {
    const result = Parser.parse(`
system S {
  client WebApp [web] {
    resource sessionStorage ApiKey "karasu.ai.anthropic.apiKey"
    resource opfs "/meta/projects.json"
  }
}
`);
    expect(result.diagnostics).toEqual([]);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.resources).toMatchObject([
      { storageKind: "sessionStorage", id: "ApiKey", name: "karasu.ai.anthropic.apiKey" },
      { storageKind: "opfs", name: "/meta/projects.json" },
    ]);
    expect(client.properties.resources[1]).not.toHaveProperty("id");
  });

  it("keeps the id-less form exactly as before", () => {
    const client = clientOf(
      `system S {\n  client C [web] {\n    resource localStorage "prefs"\n  }\n}\n`,
    );
    expect(client.properties.resources).toEqual([
      expect.objectContaining({ storageKind: "localStorage", name: "prefs" }),
    ]);
  });

  it("reports a missing name over the declaration, keeping the id", () => {
    const result = Parser.parse(`
system S {
  client WebApp [web] {
    resource opfs Projects
  }
}
`);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["expected-string-after"]);
    expect(result.diagnostics[0].params).toEqual({ property: "resource" });
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.resources[0]).toMatchObject({ id: "Projects", name: "" });
  });

  it("rejects a keyword in the id position and still reads the name", () => {
    const result = Parser.parse(`
system S {
  client WebApp [web] {
    resource opfs table "/meta/projects.json"
  }
}
`);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["expected-identifier"]);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.resources[0]).toMatchObject({
      storageKind: "opfs",
      name: "/meta/projects.json",
    });
    expect(client.properties.resources[0]).not.toHaveProperty("id");
  });

  it("still reads a name written on a later line", () => {
    const result = Parser.parse(`
system S {
  client WebApp [web] {
    resource opfs Projects
      "/meta/projects.json"
  }
}
`);
    expect(result.diagnostics).toEqual([]);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.resources[0]).toMatchObject({
      id: "Projects",
      name: "/meta/projects.json",
    });
  });

  it("does not read the source of an edge on a later line as the name (ADR-3752)", () => {
    const result = Parser.parse(`
system S {
  client WebApp [web] {
    resource opfs
    "WebApp" -> Api
  }
  service Api {}
}
`);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["expected-string-after"]);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.resources[0]).toMatchObject({ storageKind: "opfs", name: "" });
    // The edge is read as written, its source being the client itself.
    expect(client.edges).toEqual([expect.objectContaining({ from: "WebApp", to: "Api" })]);
  });

  it("does not read an edge on a later line as the id either", () => {
    const result = Parser.parse(`
system S {
  client WebApp [web] {
    resource opfs
    WebApp -> Api
  }
  service Api {}
}
`);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["expected-string-after"]);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.resources[0]).not.toHaveProperty("id");
    expect(client.edges).toEqual([expect.objectContaining({ from: "WebApp", to: "Api" })]);
  });

  it("does not take a keyword on a later line as a bad id", () => {
    const result = Parser.parse(`
system S {
  client WebApp [web] {
    resource opfs
    capability camera
  }
}
`);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["expected-string-after"]);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.capabilities.map((c) => c.name)).toEqual(["camera"]);
  });

  it("keeps a regular resource declaration out of the client-storage form", () => {
    const result = Parser.parse(`
system S {
  client WebApp [web] {
    resource Foo { }
  }
}
`);
    expect(result.diagnostics.map((d) => d.code)).not.toContain("client-resource-invalid-kind");
    expect(
      clientOf(`system S {\n  client WebApp [web] {\n    resource Foo { }\n  }\n}\n`).properties
        .resources,
    ).toEqual([]);
  });

  it("still reports a misspelt storage kind followed by a name", () => {
    const result = Parser.parse(
      `system S {\n  client WebApp [web] {\n    resource cookie "session"\n  }\n}\n`,
    );
    expect(result.diagnostics.map((d) => d.code)).toEqual(["client-resource-invalid-kind"]);
  });

  it("still reports a misspelt storage kind followed by an id and a name", () => {
    const result = Parser.parse(
      `system S {\n  client WebApp [web] {\n    resource cookie Session "s"\n  }\n}\n`,
    );
    expect(result.diagnostics.map((d) => d.code)).toEqual(["client-resource-invalid-kind"]);
  });

  it("round-trips the id through the formatter (TPL-1101)", () => {
    const src = `system S {\n  client WebApp [web] {\n    resource sessionStorage ApiKey "karasu.ai.anthropic.apiKey"\n    resource opfs "/meta/projects.json"\n  }\n}\n`;
    expect(format(src)).toBe(src);
  });
});

describe("client resource quoted id (#3794, TPL-2707)", () => {
  it("reads a quoted id followed by the name on the same line", () => {
    const client = clientOf(
      `system S {\n  client C [web] {\n    resource localStorage "api-key" "karasu.ai.anthropic.apiKey"\n  }\n}\n`,
    );
    expect(client.properties.resources[0]).toMatchObject({
      id: "api-key",
      name: "karasu.ai.anthropic.apiKey",
    });
  });

  it("formats an id that needs quotes with quotes", () => {
    const src = `system S {\n  client C [web] {\n    resource localStorage "api-key" "karasu.ai.anthropic.apiKey"\n  }\n}\n`;
    expect(format(src)).toBe(src);
  });
});
