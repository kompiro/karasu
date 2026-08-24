import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import { boundaryScopeKey } from "../types/ast.js";
import { extractView } from "../view/view-extract.js";
import { layout } from "../renderer/layout.js";
import { ImportResolver } from "../fs/import-resolver.js";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";

/**
 * Slice B of #2088 (#2548): `owns` / `contains` accept suffix paths, the
 * ownership / boundary indices are path-keyed, and multi-matches that are not
 * uniform in (kind, depth) draw `*-target-ambiguous`.
 */

// Two nodes share the id `Payment`: a service (depth 2) and a nested domain
// (depth 3) — the cross-layer collision #2088 was opened about.
const COLLIDING = `
system Shop {
  service Payment {}
  service Checkout {
    domain Payment {}
  }
}
`;

describe("owns accepts suffix paths (#2548)", () => {
  it("a path-qualified owns narrows to exactly the node it names", () => {
    const r = Parser.parse(`${COLLIDING}
organization Org { team Platform { owns Shop.Payment } }
`);
    // The colliding model itself draws node-id-multiple-locations (#2550);
    // the path-qualified owns adds no diagnostic of its own.
    expect(r.diagnostics.filter((d) => d.code !== "node-id-multiple-locations")).toHaveLength(0);
    expect(r.value.ownerIndex.get("Shop.Payment")).toBe("Platform");
    expect(r.value.ownerIndex.has("Shop.Checkout.Payment")).toBe(false);
  });

  it("a bare id still claims every node (broadcast unchanged) and warns on the mixed match", () => {
    const r = Parser.parse(`${COLLIDING}
organization Org { team Platform { owns Payment } }
`);
    expect(r.value.ownerIndex.get("Shop.Payment")).toBe("Platform");
    expect(r.value.ownerIndex.get("Shop.Checkout.Payment")).toBe("Platform");
    const amb = r.diagnostics.filter((d) => d.code === "owns-target-ambiguous");
    expect(amb).toHaveLength(1);
    expect(amb[0].severity).toBe("warning");
    expect(amb[0].params).toEqual({
      path: "Payment",
      candidates: [
        { kind: "service", path: "Shop.Payment" },
        { kind: "domain", path: "Shop.Checkout.Payment" },
      ],
    });
  });

  it("a uniform (kind, depth) multi-match stays silent — intentional broadcast", () => {
    const r = Parser.parse(`
system TenantA { service Billing {} }
system TenantB { service Billing {} }
organization O { team T { owns Billing } }
`);
    expect(r.diagnostics.filter((d) => d.code === "owns-target-ambiguous")).toHaveLength(0);
    expect(r.value.ownerIndex.get("TenantA.Billing")).toBe("T");
    expect(r.value.ownerIndex.get("TenantB.Billing")).toBe("T");
  });

  it("the ambiguity verdict does not depend on declaration order", () => {
    const forward = Parser.parse(`${COLLIDING}
organization Org { team Platform { owns Payment } }
`);
    const swapped = Parser.parse(`
system Shop {
  service Checkout {
    domain Payment {}
  }
  service Payment {}
}
organization Org { team Platform { owns Payment } }
`);
    const count = (r: typeof forward) =>
      r.diagnostics.filter((d) => d.code === "owns-target-ambiguous").length;
    expect(count(forward)).toBe(1);
    expect(count(swapped)).toBe(1);
  });

  it("a dangling dot reports once and records nothing", () => {
    const r = Parser.parse(`organization O { team T { owns Shop. } }`);
    const errs = r.diagnostics.filter(
      (d) => d.severity === "error" && d.code === "expected-id-after",
    );
    expect(errs).toHaveLength(1);
    expect(r.value.organizations[0].teams[0].properties.owns).toEqual([]);
  });

  it("resolves a path declared in another file on the merged model", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/p/index.krs",
      `import "./nodes.krs"\norganization O {\n  team T {\n    owns Shop.Payment\n  }\n}\n`,
    );
    await fs.writeFile("/p/nodes.krs", COLLIDING);
    const resolved = await new ImportResolver(fs).resolve("/p/index.krs");
    expect(resolved.diagnostics.filter((d) => d.code === "owns-target-not-found")).toHaveLength(0);
    expect(resolved.krsFile.ownerIndex.get("Shop.Payment")).toBe("T");
    expect(resolved.krsFile.ownerIndex.has("Shop.Checkout.Payment")).toBe(false);
  });
});

describe("contains accepts suffix paths (#2548)", () => {
  it("a top-level contains narrows by path, mirroring owns", () => {
    const r = Parser.parse(`${COLLIDING}
boundary pci { contains Shop.Checkout.Payment }
`);
    // See the owns twin above: the collision itself warns since #2550.
    expect(r.diagnostics.filter((d) => d.code !== "node-id-multiple-locations")).toHaveLength(0);
    expect(r.value.boundaryMembership.get("Shop.Checkout.Payment")).toEqual(["pci"]);
    expect(r.value.boundaryMembership.has("Shop.Payment")).toBe(false);
  });

  it("a mixed-kind bare match draws contains-target-ambiguous with the candidates", () => {
    const r = Parser.parse(`${COLLIDING}
boundary pci { contains Payment }
`);
    const amb = r.diagnostics.filter((d) => d.code === "contains-target-ambiguous");
    expect(amb).toHaveLength(1);
    expect(amb[0].params).toEqual({
      path: "Payment",
      candidates: [
        { kind: "service", path: "Shop.Payment" },
        { kind: "domain", path: "Shop.Checkout.Payment" },
      ],
    });
    // Both entries are still indexed — the warning narrates, broadcast stays.
    expect(r.value.boundaryMembership.get("Shop.Payment")).toEqual(["pci"]);
    expect(r.value.boundaryMembership.get("Shop.Checkout.Payment")).toEqual(["pci"]);
  });

  it("the scoped form accepts the qualified spelling of a direct child", () => {
    const r = Parser.parse(`
system Shop {
  service Payment {}
  service Checkout {}
  boundary money { contains Shop.Payment }
}
`);
    expect(r.diagnostics.filter((d) => d.severity !== "info")).toHaveLength(0);
    const scoped = r.value.scopedBoundaryMembership.get(boundaryScopeKey(["Shop"]));
    // The membership key stays the child's bare id: the scope key already
    // carries the path dimension (TPL-1352).
    expect(scoped?.get("Payment")).toEqual(["money"]);
  });

  it("a dangling dot in contains reports once and records nothing", () => {
    const r = Parser.parse(`boundary b { contains Shop. }`);
    const errs = r.diagnostics.filter(
      (d) => d.severity === "error" && d.code === "expected-id-after",
    );
    expect(errs).toHaveLength(1);
    expect(r.value.boundaries[0].contains).toEqual([]);
  });
});

describe("path-qualified owns narrows rendering (#2548)", () => {
  const SRC = `${COLLIDING}
organization Org { team Platform { owns Shop.Payment } }
`;

  it("puts the team chip on exactly the named node, level by level", () => {
    const parsed = Parser.parse(SRC);
    const root = extractView(parsed.value.systems, ["Shop"]);
    const rootLayout = layout(root, { ownerIndex: parsed.value.ownerIndex });
    expect(rootLayout.nodes.get("Payment")?.properties.team).toBe("Platform");

    const drill = extractView(parsed.value.systems, ["Shop", "Checkout"]);
    const drillLayout = layout(drill, { ownerIndex: parsed.value.ownerIndex });
    expect(drillLayout.nodes.get("Payment")?.properties.team).toBeUndefined();
  });

  it("Group by: team frames only the named node", () => {
    const parsed = Parser.parse(SRC);
    const root = extractView(parsed.value.systems, ["Shop"]);
    const res = layout(root, { ownerIndex: parsed.value.ownerIndex, groupBy: "team" });
    const frames = res.containers.filter((c) => c.group === true);
    expect(frames.map((f) => f.groupId)).toEqual(["Platform"]);

    const drill = extractView(parsed.value.systems, ["Shop", "Checkout"]);
    const drillRes = layout(drill, { ownerIndex: parsed.value.ownerIndex, groupBy: "team" });
    expect(drillRes.containers.filter((c) => c.group === true)).toHaveLength(0);
  });
});
