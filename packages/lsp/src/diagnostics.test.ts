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

    // Messages render in English by default (the tooling-output default
    // from docs/spec/i18n.md). `renderWarning` is the shared i18n
    // formatter — the same one the app and CLI use.
    const dispersal = diagnostics.find(
      (d) => d.message.includes("Order") && /service/.test(d.message),
    );
    expect(dispersal).toBeDefined();
    expect(dispersal!.severity).toBe(DiagnosticSeverity.Information);
    // ADR-20260514-02: a dispersed domain is representable — not an error.
    expect(diagnostics.some((d) => d.severity === DiagnosticSeverity.Error)).toBe(false);
    // The warning carries a loc, so it anchors on the dispersed node — not
    // collapsed to the document start.
    expect(dispersal!.range.start.line).toBeGreaterThan(0);
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

  it("surfaces annotation-possible-typo without stylesheet suppression (sheetless context)", () => {
    // TPL-20260612-01: the LSP runs analyze() with no sheets, so the
    // style-*suppressed* hint fires here even when the user's .krs.style
    // defines a selector for the name (the app, which has the sheets,
    // would stay silent). This test pins the accepted asymmetry (#1522).
    const src = `system S {
  service Legacy @depracated {}
}`;
    const diagnostics = computeDiagnostics(src, false);

    const hint = diagnostics.find((d) => d.message.includes("@depracated"));
    expect(hint).toBeDefined();
    expect(hint!.message).toContain("@deprecated");
    expect(hint!.severity).toBe(DiagnosticSeverity.Information);
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

describe("computeDiagnostics — locale", () => {
  const dispersalSrc = `system EC {
  service ECommerce { domain Order {} }
  service Legacy { domain Order {} }
}`;

  it("renders warning messages in English by default", () => {
    const diagnostics = computeDiagnostics(dispersalSrc, false);
    const dispersal = diagnostics.find((d) => d.message.includes("Order"));
    expect(dispersal!.message).toBe('Domain "Order" appears under multiple services');
  });

  it("renders warning messages in Japanese when locale is 'ja'", () => {
    const diagnostics = computeDiagnostics(dispersalSrc, false, "ja");
    const dispersal = diagnostics.find((d) => d.message.includes("Order"));
    expect(dispersal!.message).toBe('domain "Order" は複数の service の配下に登場します');
  });

  it("renders parse-error (diagnostic) messages in the requested locale", () => {
    // A parser diagnostic — exercises the renderDiagnostic path, not just
    // renderWarning. `generic-text` aside, parser diagnostics are uniform
    // English, so en and ja currently match; this asserts the locale is
    // threaded through without throwing.
    const en = computeDiagnostics("!!! not valid krs !!!", false, "en");
    const ja = computeDiagnostics("!!! not valid krs !!!", false, "ja");
    expect(en.some((d) => d.severity === DiagnosticSeverity.Error)).toBe(true);
    expect(ja.some((d) => d.severity === DiagnosticSeverity.Error)).toBe(true);
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
