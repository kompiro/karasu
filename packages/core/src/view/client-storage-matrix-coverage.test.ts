/**
 * Client storages in the CRUD matrix and the coverage report (#3794). Both read
 * the model-wide target index, so a top-level client reaches them when the
 * compile result's `physicalTargets` is passed.
 */
import { describe, it, expect } from "vitest";
import { extractCrudMatrix, cellKey, formatCell } from "./crud-matrix-extract.js";
import { extractCoverage } from "./coverage-extract.js";
import { withUnassignedSystem } from "./unassigned-system.js";
import { Parser } from "../parser/parser.js";
import { physicalTargetsOf } from "../spec/infra-index.js";
import { compile } from "../compile/compile.js";

const MODEL = `
system S {
  database Db {
    table Orders
  }
  client WebApp [web] {
    resource sessionStorage ApiKey "karasu.ai.anthropic.apiKey"
    resource localStorage Theme "karasu-theme"
    resource opfs "/meta/projects.json"
  }
  service App {
    domain Chat {
      usecase SaveApiKey { resource WebApp.ApiKey { operations create, update } }
      usecase PlaceOrder { resource Db.Orders { operations create } }
    }
  }
}
`;

function model(src: string) {
  const file = Parser.parse(src).value;
  return { systems: withUnassignedSystem(file), targets: physicalTargetsOf(file) };
}

describe("CRUD matrix columns for client storages (#3794)", () => {
  it("makes one column per identified storage, referenced or not", () => {
    const { systems, targets } = model(MODEL);
    const m = extractCrudMatrix(systems, {}, targets);
    const byId = new Map(m.columns.map((c) => [c.resourceId, c]));
    expect(byId.get("WebApp.ApiKey")).toEqual({
      resourceId: "WebApp.ApiKey",
      label: "karasu.ai.anthropic.apiKey (sessionStorage)",
      infraKind: undefined,
      external: false,
      clientId: "WebApp",
      storageKind: "sessionStorage",
    });
    expect(byId.get("WebApp.Theme")?.label).toBe("karasu-theme (localStorage)");
    // A storage without an id cannot be referenced, so it is no column.
    expect([...byId.keys()].some((k) => k.includes("projects"))).toBe(false);
    // Infra columns keep their shape.
    expect(byId.get("Db.Orders")).toEqual({
      resourceId: "Db.Orders",
      label: "Orders",
      infraKind: "database",
      external: false,
    });
    const cell = m.cells.get(cellKey("SaveApiKey", "WebApp.ApiKey"));
    expect(cell && formatCell(cell)).toBe("CU");
  });

  it("drops client storage columns under the infra filter, as before", () => {
    const { systems, targets } = model(MODEL);
    const m = extractCrudMatrix(systems, { infraFilter: ["database"] }, targets);
    expect(m.columns.map((c) => c.resourceId)).toEqual(["Db.Orders"]);
  });

  it("keeps one column for a key two same-id clients declare, with no client of its own", () => {
    const src = `
system A {
  client WebApp [web] { resource sessionStorage ApiKey "a" }
  service App {
    domain Chat { usecase U { resource WebApp.ApiKey { operations read } } }
  }
}
system B {
  client WebApp [web] { resource localStorage ApiKey "b" }
}
`;
    const { systems, targets } = model(src);
    const cols = extractCrudMatrix(systems, {}, targets).columns.filter(
      (c) => c.resourceId === "WebApp.ApiKey",
    );
    expect(cols).toEqual([
      {
        resourceId: "WebApp.ApiKey",
        label: "WebApp.ApiKey",
        infraKind: undefined,
        external: false,
      },
    ]);
  });

  it("reaches a top-level client through the compile result's targets", () => {
    const src = `
client WebApp [web] {
  resource opfs Projects "/meta/projects.json"
}
system S {
  service App {
    domain Workspace { usecase Save { resource WebApp.Projects { operations update } } }
  }
}
`;
    const result = compile(src);
    if (result.diagramType !== "system") throw new Error("expected a system result");
    const col = extractCrudMatrix(result.systems, {}, result.physicalTargets).columns.find(
      (c) => c.resourceId === "WebApp.Projects",
    );
    expect(col).toMatchObject({ clientId: "WebApp", storageKind: "opfs" });
  });
});

describe("coverage clientStores (#3794)", () => {
  it("reports identified, referenced, unreferenced and unidentified storages per client", () => {
    const { systems, targets } = model(MODEL);
    const report = extractCoverage(systems, {}, targets);
    expect(report.clientStores).toEqual([
      {
        clientId: "WebApp",
        identified: ["ApiKey", "Theme"],
        referenced: ["ApiKey"],
        unreferenced: ["Theme"],
        unidentified: ["/meta/projects.json (opfs)"],
      },
    ]);
    // The physical section still covers the infra only.
    expect(report.physical.infra.map((b) => b.infraId)).toEqual(["Db"]);
  });

  it("reports client storages when the model declares no infra", () => {
    const src = `
system S {
  client WebApp [web] { resource sessionStorage ApiKey "k" }
  service App {
    domain Chat { usecase U { resource WebApp.ApiKey { operations read } } }
  }
}
`;
    const { systems, targets } = model(src);
    const report = extractCoverage(systems, {}, targets);
    expect(report.physical.infra).toEqual([]);
    expect(report.clientStores.map((c) => c.referenced)).toEqual([["ApiKey"]]);
    // The domain count is unchanged: the reference was already counted.
    expect(report.domains[0].resourceRefs).toBe(1);
  });

  it("is empty when no client declares storage", () => {
    const { systems, targets } = model(`system S {\n  client WebApp [web]\n}\n`);
    expect(extractCoverage(systems, {}, targets).clientStores).toEqual([]);
  });

  it("does not mistake one client storage for another whose dotted key is the same", () => {
    const src = `
system S {
  client A [web] { resource opfs "B.C" "x" }
  client "A.B" [web] { resource opfs C "y" }
  service App {
    domain D { usecase U { resource "A.B".C { operations read } } }
  }
}
`;
    const { systems, targets } = model(src);
    const report = extractCoverage(systems, {}, targets);
    expect(report.clientStores.map((c) => [c.clientId, c.referenced])).toEqual([
      ["A", []],
      ["A.B", ["C"]],
    ]);
  });
});
