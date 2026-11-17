// Go to Definition and the cursor sync around client storage ids (#3794):
// a dotted `<Client>.<Id>` reaches that client's storage, a node of a name wins
// over a storage id of the same name (top-level nodes included), and a storage
// id is never the node at a position.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Parser } from "@karasu-tools/core";
import { resolveDefinition } from "./definition-imports.js";
import {
  findNodeAtPosition,
  findRangeOfNode,
  getQualifierAtPosition,
} from "./position-resolver.js";

const parse = (src: string) => Parser.parse(src).value;
const URI = "file:///tmp/karasu-client-storage-definition/index.krs";

describe("getQualifierAtPosition (#3794)", () => {
  const text = 'resource WebB.Cache\nresource "web-b".Cache\nresource Cache\n';
  it("returns the parent of a dotted reference", () => {
    expect(getQualifierAtPosition(text, { line: 0, character: 16 })).toBe("WebB");
  });
  it("returns the contents of a quoted parent", () => {
    expect(getQualifierAtPosition(text, { line: 1, character: 19 })).toBe("web-b");
  });
  it("returns null for a bare word or the parent itself", () => {
    expect(getQualifierAtPosition(text, { line: 2, character: 10 })).toBeNull();
    expect(getQualifierAtPosition(text, { line: 0, character: 10 })).toBeNull();
  });
});

describe("Go to Definition on a client storage reference (#3794)", () => {
  const TWO_CLIENTS = `\
system S {
  client WebA [web] {
    resource localStorage Cache "a"
  }
  client WebB [web] {
    resource localStorage Cache "b"
  }
  service App {
    domain D {
      usecase U { resource WebB.Cache { operations read } }
    }
  }
}
`;

  it("reaches the storage of the client the reference names, not another with the same id", () => {
    expect(resolveDefinition(parse(TWO_CLIENTS), "Cache", URI, "WebB")?.range.start.line).toBe(5);
    expect(resolveDefinition(parse(TWO_CLIENTS), "Cache", URI, "WebA")?.range.start.line).toBe(2);
  });

  it("does not go to a client storage when an infra block shares the client id", () => {
    const src = `\
client Media [web] {
  resource localStorage Uploads "u"
}
system S {
  storage Media {
    bucket Uploads
  }
}
`;
    // The reference names the infra block, so its bucket is the definition.
    expect(resolveDefinition(parse(src), "Uploads", URI, "Media")?.range.start.line).toBe(5);
  });

  it("goes to the leaf of the infra block the reference names, not a same-name leaf elsewhere", () => {
    const src = `\
database DB1 {
  table users
}
database DB2 {
  table users
}
`;
    expect(resolveDefinition(parse(src), "users", URI, "DB2")?.range.start.line).toBe(4);
  });

  it("prefers a top-level node over a client storage id of the same name", () => {
    const src = `\
database Cache {
  table entries
}
system S {
  client WebApp [web] {
    resource localStorage Cache "cache"
  }
}
`;
    const file = parse(src);
    expect(resolveDefinition(file, "Cache", URI)?.range.start.line).toBe(0);
    // The preview click (PositionOfNodeRequest) looks for nodes only.
    expect(findRangeOfNode(file, "Cache", { nodesOnly: true })?.start.line).toBe(0);
    expect(findRangeOfNode(file, "Cache")?.start.line).toBe(0);
  });

  it("keeps a top-level client as the node at its storage line", () => {
    const file = parse(
      `client WebApp [web] {\n  resource opfs Projects "/meta/projects.json"\n}\n`,
    );
    expect(findNodeAtPosition(file, { line: 1, character: 20 })).toBe("WebApp");
  });
});

describe("Go to Definition on a client storage in an imported file (#3794)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "karasu-lsp-storage-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("follows a named import of the client to its storage", () => {
    const clients = join(dir, "clients.krs");
    writeFileSync(
      clients,
      'system S {\n  client WebA [web] {\n    resource localStorage Cache "a"\n  }\n  client WebB [web] {\n    resource localStorage Cache "b"\n  }\n}\n',
    );
    const entry = join(dir, "index.krs");
    writeFileSync(entry, 'import { WebB } from "./clients.krs"\nsystem S {}\n');
    const file = parse('import { WebB } from "./clients.krs"\nsystem S {}\n');
    const loc = resolveDefinition(file, "Cache", pathToFileURL(entry).toString(), "WebB");
    expect(loc?.uri).toBe(pathToFileURL(clients).toString());
    expect(loc?.range.start.line).toBe(5);
  });

  it("does not reach an imported client that an infra block here hides", () => {
    writeFileSync(
      join(dir, "c.krs"),
      'client Media [web] {\n  resource localStorage Uploads "u"\n}\n',
    );
    const src = 'import "./c.krs"\nsystem S {\n  storage Media {\n    bucket Other\n  }\n}\n';
    const entry = join(dir, "index.krs");
    writeFileSync(entry, src);
    const loc = resolveDefinition(parse(src), "Uploads", pathToFileURL(entry).toString(), "Media");
    expect(loc?.uri ?? null).not.toBe(pathToFileURL(join(dir, "c.krs")).toString());
  });
});
