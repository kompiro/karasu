import { describe, it, expect } from "vitest";
import type { KrsNode, KrsEdge } from "../types/ast.js";
import { collapseGroups, groupStubId, GROUP_STUB_TAG } from "./group-collapse.js";

const ZERO = { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } };
const svc = (id: string): KrsNode => ({
  kind: "service",
  id,
  label: id,
  tags: [],
  annotations: [],
  children: [],
  edges: [],
  loc: ZERO,
  properties: { links: [] },
});
const edge = (
  from: string,
  to: string,
  label?: string,
  kind: "sync" | "async" = "sync",
): KrsEdge => ({
  from,
  to,
  label,
  kind,
  tags: [],
  loc: ZERO,
});

// payments owns A,B ; catalog owns C
const OWNER = new Map([
  ["A", "payments"],
  ["B", "payments"],
  ["C", "catalog"],
]);

describe("collapseGroups", () => {
  it("returns the input unchanged when nothing is collapsed", () => {
    const nodes = [svc("A"), svc("B"), svc("C")];
    const edges = [edge("A", "C")];
    const res = collapseGroups(nodes, edges, OWNER, undefined);
    expect(res.nodes).toBe(nodes);
    expect(res.edges).toBe(edges);
    expect(res.stubGroup.size).toBe(0);
  });

  it("folds a collapsed group's members into one <Team> (N) stub", () => {
    const nodes = [svc("A"), svc("B"), svc("C")];
    const res = collapseGroups(nodes, [], OWNER, new Set(["payments"]));
    const ids = res.nodes.map((n) => n.id);
    // A and B replaced by one stub; C (catalog, not collapsed) stays.
    expect(ids).not.toContain("A");
    expect(ids).not.toContain("B");
    expect(ids).toContain("C");
    const stub = res.nodes.find((n) => n.id === groupStubId("payments"))!;
    expect(stub.label).toBe("payments (2)");
    expect(stub.tags).toContain(GROUP_STUB_TAG);
    expect(res.stubGroup.get(groupStubId("payments"))).toBe("payments");
  });

  it("re-targets a cross-group edge onto the stub (survives collapse)", () => {
    // A (payments) -> C (catalog). Collapse payments → edge becomes stub -> C.
    const res = collapseGroups(
      [svc("A"), svc("C")],
      [edge("A", "C", "call")],
      OWNER,
      new Set(["payments"]),
    );
    expect(res.edges).toHaveLength(1);
    expect(res.edges[0].from).toBe(groupStubId("payments"));
    expect(res.edges[0].to).toBe("C");
    // The authored label is dropped — the stub edge is an aggregate.
    expect(res.edges[0].label).toBeUndefined();
  });

  it("drops edges wholly inside one collapsed group", () => {
    // A -> B, both in payments. Collapse payments → self-edge, dropped.
    const res = collapseGroups(
      [svc("A"), svc("B")],
      [edge("A", "B")],
      OWNER,
      new Set(["payments"]),
    );
    expect(res.edges).toHaveLength(0);
  });

  it("de-duplicates edges that collapse onto the same (from,to,kind)", () => {
    // A->C and B->C both become paymentsStub->C when payments collapses.
    const res = collapseGroups(
      [svc("A"), svc("B"), svc("C")],
      [edge("A", "C"), edge("B", "C")],
      OWNER,
      new Set(["payments"]),
    );
    expect(res.edges).toHaveLength(1);
    expect(res.edges[0].from).toBe(groupStubId("payments"));
  });

  it("collapsing every group yields stub→stub edges (the group DAG)", () => {
    // A(payments) -> C(catalog). Collapse both → paymentsStub -> catalogStub.
    const res = collapseGroups(
      [svc("A"), svc("C")],
      [edge("A", "C")],
      OWNER,
      new Set(["payments", "catalog"]),
    );
    expect(res.nodes.map((n) => n.id).sort()).toEqual(
      [groupStubId("catalog"), groupStubId("payments")].sort(),
    );
    expect(res.edges).toHaveLength(1);
    expect(res.edges[0].from).toBe(groupStubId("payments"));
    expect(res.edges[0].to).toBe(groupStubId("catalog"));
  });
});
