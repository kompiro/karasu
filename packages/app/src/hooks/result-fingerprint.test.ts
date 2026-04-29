import { describe, it, expect } from "vitest";
import type { Diagnostic, NodeMetadata, Warning } from "@karasu-tools/core";
import { computeViewResultFingerprint } from "./result-fingerprint.js";

describe("computeViewResultFingerprint", () => {
  const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg"></svg>`;

  it("returns the same fingerprint for the same inputs", () => {
    const a = computeViewResultFingerprint({ svg: baseSvg, warnings: [], diagnostics: [] });
    const b = computeViewResultFingerprint({ svg: baseSvg, warnings: [], diagnostics: [] });
    expect(a).toBe(b);
  });

  it("changes when the SVG changes", () => {
    const a = computeViewResultFingerprint({ svg: baseSvg, warnings: [], diagnostics: [] });
    const b = computeViewResultFingerprint({
      svg: `<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>`,
      warnings: [],
      diagnostics: [],
    });
    expect(a).not.toBe(b);
  });

  it("changes when warnings change but SVG stays the same (Issue #891 root cause)", () => {
    const warning: Warning = {
      kind: "unresolved-handles",
      params: { nodeKind: "client", nodeId: "WebApp", domainId: "Order" },
    };
    const clean = computeViewResultFingerprint({ svg: baseSvg, warnings: [], diagnostics: [] });
    const dirty = computeViewResultFingerprint({
      svg: baseSvg,
      warnings: [warning],
      diagnostics: [],
    });
    expect(clean).not.toBe(dirty);
  });

  it("changes when diagnostics change but SVG stays the same", () => {
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "expected-node-id",
      params: { kind: "service" },
    };
    const clean = computeViewResultFingerprint({ svg: baseSvg, warnings: [], diagnostics: [] });
    const dirty = computeViewResultFingerprint({
      svg: baseSvg,
      warnings: [],
      diagnostics: [diagnostic],
    });
    expect(clean).not.toBe(dirty);
  });

  it("changes when only nodeMetadata changes (Issue #1032 root cause)", () => {
    const baseEntry = (overrides: Partial<NodeMetadata> = {}): NodeMetadata => ({
      kind: "client",
      label: "WebApp",
      links: [],
      tags: [],
      annotations: [],
      hasChildren: false,
      ...overrides,
    });

    const before = new Map<string, NodeMetadata>([
      ["WebApp", baseEntry({ description: "Original description" })],
    ]);
    const after = new Map<string, NodeMetadata>([
      ["WebApp", baseEntry({ description: "Edited description" })],
    ]);

    // SVG / warnings / diagnostics are byte-identical: only the metadata
    // (e.g. a description body) changed.
    const a = computeViewResultFingerprint({
      svg: baseSvg,
      warnings: [],
      diagnostics: [],
      nodeMetadata: before,
    });
    const b = computeViewResultFingerprint({
      svg: baseSvg,
      warnings: [],
      diagnostics: [],
      nodeMetadata: after,
    });
    expect(a).not.toBe(b);
  });

  it("returns the same fingerprint when nodeMetadata content is unchanged", () => {
    const entry: NodeMetadata = {
      kind: "client",
      label: "WebApp",
      links: [],
      tags: [],
      annotations: [],
      hasChildren: false,
    };
    const a = computeViewResultFingerprint({
      svg: baseSvg,
      warnings: [],
      diagnostics: [],
      nodeMetadata: new Map([["WebApp", entry]]),
    });
    const b = computeViewResultFingerprint({
      svg: baseSvg,
      warnings: [],
      diagnostics: [],
      nodeMetadata: new Map([["WebApp", { ...entry }]]),
    });
    expect(a).toBe(b);
  });

  it("uses an unambiguous separator that cannot collide with input", () => {
    // A warning whose params look like the SVG-segment of a fingerprint must
    // not produce the same fingerprint as a different SVG with no warnings.
    // U+001F gets escaped by JSON.stringify, so the JSON segment is safe.
    const warning: Warning = {
      kind: "unresolved-handles",
      params: { nodeKind: "client", nodeId: "WebApp", domainId: "X\nY" },
    };
    const a = computeViewResultFingerprint({
      svg: baseSvg,
      warnings: [warning],
      diagnostics: [],
    });
    const b = computeViewResultFingerprint({
      svg: `${baseSvg}garbage`,
      warnings: [],
      diagnostics: [],
    });
    expect(a).not.toBe(b);
  });
});
