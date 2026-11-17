// A client's storage ids are reached the way an infra block's leaves are
// (#3794): listed for completion, and their declaration found by the word
// under the cursor (which never includes the `.` of `WebApp.ApiKey`).
import { describe, it, expect } from "vitest";
import { Parser } from "@karasu-tools/core";
import { collectAllIdentifiers, findNodeAtPosition, findRangeOfNode } from "./position-resolver.js";

const SRC = `\
system S {
  database Db {
    table Orders
  }
  client WebApp [web] {
    resource sessionStorage ApiKey "karasu.ai.anthropic.apiKey"
    resource opfs "/meta/projects.json"
  }
  service App {
    domain Chat {
      usecase SaveApiKey { resource WebApp.ApiKey { operations create } }
    }
  }
}
`;

const file = Parser.parse(SRC).value;

describe("client storage ids in the LSP (#3794)", () => {
  it("offers a storage id alongside the infra leaves", () => {
    const ids = collectAllIdentifiers(file);
    expect(ids).toContain("Orders");
    expect(ids).toContain("ApiKey");
  });

  it("finds a storage id's declaration line", () => {
    expect(findRangeOfNode(file, "ApiKey")?.start.line).toBe(5);
    // The infra leaf, for comparison, resolves the same way.
    expect(findRangeOfNode(file, "Orders")?.start.line).toBe(2);
  });

  it("lists no id for a storage declared without one", () => {
    expect(collectAllIdentifiers(file).some((id) => id.includes("projects"))).toBe(false);
  });

  it("keeps the client as the node at a storage line, for the cursor sync", () => {
    expect(findNodeAtPosition(file, { line: 5, character: 30 })).toBe("WebApp");
  });

  it("finds a node before a client storage of the same id", () => {
    const clash = Parser.parse(`\
system S {
  client WebApp [web] {
    resource indexedDB Outbox "outbox"
  }
  service App {
    domain D {
      usecase Outbox {}
    }
  }
}
`).value;
    expect(findRangeOfNode(clash, "Outbox")?.start.line).toBe(6);
  });
});
