import { describe, it, expect } from "vitest";
import { DiagnosticSeverity } from "vscode-languageserver/node";
import { computeDiagnostics } from "./diagnostics.js";

describe("computeDiagnostics — resolver warnings (.krs)", () => {
  it("surfaces domain-dispersal at Information severity", () => {
    const src = `system EC {
  service ECommerce { domain Order {} }
  service Legacy { domain Order {} }
}`;
    const diagnostics = computeDiagnostics(src, false);

    // `formatWarning` is the legacy compat bridge the LSP shares with the
    // CLI; for domain-dispersal it renders the message in Japanese.
    const dispersal = diagnostics.find(
      (d) => d.message.includes("Order") && /service/.test(d.message),
    );
    expect(dispersal).toBeDefined();
    expect(dispersal!.severity).toBe(DiagnosticSeverity.Information);
    // ADR-20260514-02: a dispersed domain is representable — not an error.
    expect(diagnostics.some((d) => d.severity === DiagnosticSeverity.Error)).toBe(false);
  });

  it("surfaces a resolver warning kind at Warning severity", () => {
    // A top-level domain with no owning service is `unassigned-domain` —
    // a model-internal fact, so it stays at the warning register.
    const src = `domain Orphan {}`;
    const diagnostics = computeDiagnostics(src, false);

    const unassigned = diagnostics.filter((d) => d.severity === DiagnosticSeverity.Warning);
    expect(unassigned.length).toBeGreaterThan(0);
  });

  it("still reports parse errors at Error severity", () => {
    const diagnostics = computeDiagnostics("!!! not valid krs !!!", false);
    expect(diagnostics.some((d) => d.severity === DiagnosticSeverity.Error)).toBe(true);
  });

  it("emits nothing for a clean single-system document", () => {
    const src = `system Solo {
  service Api { domain Core {} }
}`;
    expect(computeDiagnostics(src, false)).toHaveLength(0);
  });

  it("tags every karasu diagnostic with source 'karasu'", () => {
    const src = `system EC {
  service A { domain Dup {} }
  service B { domain Dup {} }
}`;
    const diagnostics = computeDiagnostics(src, false);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.source === "karasu")).toBe(true);
  });
});

describe("computeDiagnostics — style documents (.krs.style)", () => {
  it("does not run the resolver for style documents", () => {
    // `analyze()` is `.krs`-only; a style document must not throw or emit
    // resolver warnings. A well-formed sheet yields no diagnostics.
    const diagnostics = computeDiagnostics("node { color: red; }", true);
    expect(diagnostics).toEqual([]);
  });
});
