import { describe, it, expect } from "vitest";
import { format, FormatError } from "./formatter.js";

// Helper: assert format is idempotent
function expectIdempotent(src: string): void {
  const once = format(src);
  const twice = format(once);
  expect(twice).toBe(once);
}

// Helper: format and strip the trailing newline for compact assertions
function fmt(src: string): string {
  return format(src).trimEnd();
}

describe("format()", () => {
  // ── Basic structure ─────────────────────────────────────────────────────

  it("formats empty input", () => {
    expect(format("")).toBe("\n");
  });

  it("formats a minimal system", () => {
    const src = `system S {}`;
    expect(fmt(src)).toBe(`system S {}`);
    expectIdempotent(fmt(src));
  });

  it("formats @import statements", () => {
    const src = `@import "default.krs.style"\nsystem S {}`;
    expect(fmt(src)).toContain(`@import "default.krs.style"`);
    expectIdempotent(fmt(src));
  });

  it("formats node import", () => {
    const src = `import { A, B } from "other.krs"\nsystem S {}`;
    expect(fmt(src)).toContain(`import { A, B } from "other.krs"`);
    expectIdempotent(fmt(src));
  });

  it("formats wildcard import", () => {
    const src = `import "other.krs"\nsystem S {}`;
    expect(fmt(src)).toContain(`import "other.krs"`);
    expectIdempotent(fmt(src));
  });

  // ── Indentation ─────────────────────────────────────────────────────────

  it("indents properties with 2 spaces", () => {
    const src = `system S {\nlabel "My System"\n}`;
    expect(fmt(src)).toBe(`system S {\n  label "My System"\n}`);
    expectIdempotent(fmt(src));
  });

  it("indents nested nodes", () => {
    const src = `system S { service A { label "A" } }`;
    const result = fmt(src);
    expect(result).toContain(`  service A {`);
    expect(result).toContain(`    label "A"`);
    expectIdempotent(result);
  });

  // ── Blank lines ─────────────────────────────────────────────────────────

  it("inserts blank line between top-level blocks", () => {
    const src = `system A {}\nsystem B {}`;
    expect(fmt(src)).toBe(`system A {}\n\nsystem B {}`);
    expectIdempotent(fmt(src));
  });

  it("inserts blank line between sibling services", () => {
    const src = `system S {\n  service A {}\n  service B {}\n}`;
    const result = fmt(src);
    expect(result).toContain(`  service A {}\n\n  service B {}`);
    expectIdempotent(result);
  });

  it("inserts blank line between label and first child", () => {
    const src = `system S {\n  label "S"\n  service A {}\n}`;
    const result = fmt(src);
    expect(result).toContain(`  label "S"\n\n  service A {}`);
    expectIdempotent(result);
  });

  it("does not insert blank line before first child when no properties", () => {
    const src = `system S {\n  service A {}\n}`;
    const result = fmt(src);
    expect(result).toBe(`system S {\n  service A {}\n}`);
    expectIdempotent(result);
  });

  it("inserts blank line between last child and first edge", () => {
    const src = `system S {\n  service A {}\n  A -> B\n}`;
    const result = fmt(src);
    expect(result).toContain(`  service A {}\n\n  A -> B`);
    expectIdempotent(result);
  });

  it("does not insert blank line between consecutive edges", () => {
    const src = `system S {\n  A -> B\n  B -> C\n}`;
    const result = fmt(src);
    expect(result).toBe(`system S {\n  A -> B\n  B -> C\n}`);
    expectIdempotent(result);
  });

  // ── Properties ──────────────────────────────────────────────────────────

  it("formats label property", () => {
    const src = `system S { label "Hello" }`;
    expect(fmt(src)).toBe(`system S {\n  label "Hello"\n}`);
    expectIdempotent(fmt(src));
  });

  it("formats description property (single-line)", () => {
    const src = `service A { description "Handles payments" }`;
    expect(fmt(src)).toBe(`service A {\n  description "Handles payments"\n}`);
    expectIdempotent(fmt(src));
  });

  it("formats description property (multi-line)", () => {
    const src = `service A { description """\nLine 1\nLine 2\n""" }`;
    const result = fmt(src);
    expect(result).toContain(`description """`);
    expectIdempotent(result);
  });

  it("formats role property for user node", () => {
    const src = `system S { user U { role "Buyer" } }`;
    expect(fmt(src)).toContain(`  role "Buyer"`);
    expectIdempotent(fmt(src));
  });

  it("formats link property with label", () => {
    const src = `system S { link "https://example.com" "Docs" }`;
    expect(fmt(src)).toContain(`  link "https://example.com" "Docs"`);
    expectIdempotent(fmt(src));
  });

  it("formats link property without label", () => {
    const src = `system S { link "https://example.com" }`;
    expect(fmt(src)).toContain(`  link "https://example.com"`);
    expectIdempotent(fmt(src));
  });

  it("formats service node with delivers property", () => {
    const src = `system S { service BFF { delivers WebApp, Admin } client WebApp [web] client Admin [desktop] }`;
    const out = fmt(src);
    expect(out).toContain(`    delivers WebApp, Admin`);
    expectIdempotent(out);
  });

  it("formats service node with team property", () => {
    const src = `system S { service A { team "Backend" } }`;
    expect(fmt(src)).toContain(`    team "Backend"`);
    expectIdempotent(fmt(src));
  });

  // ── Tags and annotations ─────────────────────────────────────────────────

  it("formats tags", () => {
    const src = `service A [external] {}`;
    expect(fmt(src)).toBe(`service A [external] {}`);
    expectIdempotent(fmt(src));
  });

  it("formats annotations", () => {
    const src = `service A @deprecated {}`;
    expect(fmt(src)).toBe(`service A @deprecated {}`);
    expectIdempotent(fmt(src));
  });

  it("formats tags and annotations together", () => {
    const src = `service A [external] @deprecated {}`;
    expect(fmt(src)).toBe(`service A [external] @deprecated {}`);
    expectIdempotent(fmt(src));
  });

  // ── Edges ────────────────────────────────────────────────────────────────

  it("formats sync edge", () => {
    const src = `system S { A -> B }`;
    expect(fmt(src)).toBe(`system S {\n  A -> B\n}`);
    expectIdempotent(fmt(src));
  });

  it("formats async edge", () => {
    const src = `system S { A --> B }`;
    expect(fmt(src)).toBe(`system S {\n  A --> B\n}`);
    expectIdempotent(fmt(src));
  });

  it("formats edge with label", () => {
    const src = `system S { A -> B "calls" }`;
    expect(fmt(src)).toBe(`system S {\n  A -> B "calls"\n}`);
    expectIdempotent(fmt(src));
  });

  it("formats edge with tags", () => {
    const src = `system S { A -> B [critical] }`;
    expect(fmt(src)).toBe(`system S {\n  A -> B [critical]\n}`);
    expectIdempotent(fmt(src));
  });

  // ── Deploy block ─────────────────────────────────────────────────────────

  it("formats deploy block", () => {
    const src = `deploy Prod {\n  oci MyApp {\n    runtime "node"\n    realizes MyService\n  }\n}`;
    const result = fmt(src);
    expect(result).toContain(`deploy Prod {`);
    expect(result).toContain(`  oci MyApp {`);
    expect(result).toContain(`    runtime "node"`);
    expect(result).toContain(`    realizes MyService`);
    expectIdempotent(result);
  });

  it("formats deploy node with schedule property", () => {
    const src = `deploy Prod {\n  job Cron {\n    schedule "0 * * * *"\n  }\n}`;
    const result = fmt(src);
    expect(result).toContain(`    schedule "0 * * * *"`);
    expectIdempotent(result);
  });

  // ── Organization block ────────────────────────────────────────────────────

  it("formats organization block", () => {
    const src = `organization Org {\n  team Backend {\n    owns ECommerce\n  }\n}`;
    const result = fmt(src);
    expect(result).toContain(`organization Org {`);
    expect(result).toContain(`  team Backend {`);
    expect(result).toContain(`    owns ECommerce`);
    expectIdempotent(result);
  });

  it("formats organization with description and link", () => {
    const src = `organization Org {\n  description "Our org"\n  link "https://example.com" "Site"\n  team Backend {\n    owns ECommerce\n  }\n}`;
    const result = fmt(src);
    expect(result).toContain(`  description "Our org"`);
    expect(result).toContain(`  link "https://example.com" "Site"`);
    expectIdempotent(result);
  });

  it("formats team with description", () => {
    const src = `organization Org {\n  team Backend {\n    description "Backend team"\n    owns ECommerce\n  }\n}`;
    const result = fmt(src);
    expect(result).toContain(`    description "Backend team"`);
    expectIdempotent(result);
  });

  it("formats member block", () => {
    const src = `organization Org {\n  team Backend {\n    member Alice {\n      github "alice"\n    }\n  }\n}`;
    const result = fmt(src);
    expect(result).toContain(`    member Alice {`);
    expect(result).toContain(`      github "alice"`);
    expectIdempotent(result);
  });

  it("formats team with link property", () => {
    const src = `organization Org {\n  team Backend {\n    link "https://slack.com/backend" "Slack"\n    owns ECommerce\n  }\n}`;
    const result = fmt(src);
    expect(result).toContain(`    link "https://slack.com/backend" "Slack"`);
    expectIdempotent(result);
  });

  it("formats nested team inside team", () => {
    const src = `organization Org {\n  team Engineering {\n    team Backend {\n      owns ECommerce\n    }\n  }\n}`;
    const result = fmt(src);
    expect(result).toContain(`  team Engineering {`);
    expect(result).toContain(`    team Backend {`);
    expect(result).toContain(`      owns ECommerce`);
    expectIdempotent(result);
  });

  it("formats member with description and slack", () => {
    const src = `organization Org {\n  team Backend {\n    member Alice {\n      description "Lead"\n      slack "@alice"\n      github "alice"\n    }\n  }\n}`;
    const result = fmt(src);
    expect(result).toContain(`      description "Lead"`);
    expect(result).toContain(`      slack "@alice"`);
    expect(result).toContain(`      github "alice"`);
    expectIdempotent(result);
  });

  // ── Comment preservation ─────────────────────────────────────────────────

  it("preserves trailing comment at end of file (footer comment)", () => {
    const src = `system S {}\n// footer`;
    const result = fmt(src);
    expect(result).toContain(`system S {}\n\n// footer`);
    expectIdempotent(result);
  });

  it("preserves leading line comment before top-level block", () => {
    const src = `// This is the system\nsystem S {}`;
    const result = fmt(src);
    expect(result).toBe(`// This is the system\nsystem S {}`);
    expectIdempotent(result);
  });

  it("preserves trailing line comment on declaration line (empty body collapses to {})", () => {
    // Empty body is collapsed to {}, so trailing comment moves to after {}
    const src = `system S { // trailing\n}`;
    const result = fmt(src);
    expect(result).toContain(`system S {} // trailing`);
    expectIdempotent(result);
  });

  it("preserves trailing line comment on non-empty block declaration line", () => {
    const src = `system S { // trailing\n  service A {}\n}`;
    const result = fmt(src);
    expect(result).toContain(`system S { // trailing`);
    expectIdempotent(result);
  });

  it("preserves block comment", () => {
    const src = `/* header */\nsystem S {}`;
    const result = fmt(src);
    expect(result).toContain(`/* header */`);
    expectIdempotent(result);
  });

  it("preserves leading comment before child node", () => {
    const src = `system S {\n  // about A\n  service A {}\n}`;
    const result = fmt(src);
    expect(result).toContain(`  // about A\n  service A {}`);
    expectIdempotent(result);
  });

  it("preserves multiple leading comments", () => {
    const src = `// line 1\n// line 2\nsystem S {}`;
    const result = fmt(src);
    expect(result).toContain(`// line 1\n// line 2\nsystem S {}`);
    expectIdempotent(result);
  });

  it("preserves trailing comment on service declaration", () => {
    const src = `system S {\n  service A {} // note\n}`;
    const result = fmt(src);
    expect(result).toContain(`service A {} // note`);
    expectIdempotent(result);
  });

  // ── Normalisation ────────────────────────────────────────────────────────

  it("normalises extra blank lines between top-level blocks to exactly one", () => {
    const src = `system A {}\n\n\n\nsystem B {}`;
    expect(fmt(src)).toBe(`system A {}\n\nsystem B {}`);
    expectIdempotent(fmt(src));
  });

  it("normalises crowded formatting (no spaces)", () => {
    const src = `system S{label "S" service A{}}`;
    // Parser should handle this; formatter should normalise
    const result = fmt(src);
    expect(result).toContain(`system S {`);
    expect(result).toContain(`  label "S"`);
    expect(result).toContain(`  service A {}`);
    expectIdempotent(result);
  });

  // ── Infra nodes ──────────────────────────────────────────────────────────

  it("formats database block with table children", () => {
    const src = `system S {\n  database DB {\n    table Users {}\n  }\n}`;
    const result = fmt(src);
    expect(result).toContain(`  database DB {`);
    expect(result).toContain(`    table Users {}`);
    expectIdempotent(result);
  });

  it("formats queue block with queue-item children using 'queue' keyword", () => {
    const src = `system S {\n  queue Q {\n    queue Item {}\n  }\n}`;
    const result = fmt(src);
    expect(result).toContain(`  queue Q {`);
    expect(result).toContain(`    queue Item {}`);
    expectIdempotent(result);
  });

  // ── Error handling ───────────────────────────────────────────────────────

  it("throws FormatError on parse error", () => {
    expect(() => format("system {")).toThrow(FormatError);
  });

  it("FormatError has correct name", () => {
    expect(() => format("system {")).toThrow(expect.objectContaining({ name: "FormatError" }));
  });

  // ── Quoting of IDs that cannot be emitted bare (Issue #1058) ────────────

  describe("preserves quotes around IDs that need them", () => {
    it("keeps quotes on system / service IDs containing spaces", () => {
      const src = `system "My System" {\n  service "Order Service" {}\n}`;
      const out = fmt(src);
      expect(out).toContain(`system "My System"`);
      expect(out).toContain(`service "Order Service"`);
      expectIdempotent(out);
    });

    it("keeps quotes on hyphenated IDs (hyphen is not a bare ident char)", () => {
      const src = `system "my-system" {\n  service "order-svc" {}\n}`;
      const out = fmt(src);
      expect(out).toContain(`system "my-system"`);
      expect(out).toContain(`service "order-svc"`);
      expectIdempotent(out);
    });

    it("keeps quotes on IDs starting with a digit", () => {
      const src = `system "1stSystem" {}`;
      const out = fmt(src);
      expect(out).toContain(`system "1stSystem"`);
      expectIdempotent(out);
    });

    it("keeps quotes on IDs that collide with reserved keywords", () => {
      const src = `system "system" {\n  service "service" {}\n}`;
      const out = fmt(src);
      expect(out).toContain(`system "system"`);
      expect(out).toContain(`service "service"`);
      expectIdempotent(out);
    });

    it("keeps quotes on deploy block / unit IDs", () => {
      const src = `system EC { service Api {} }\ndeploy "prod-east" {\n  oci "api-svc" { realizes Api }\n}`;
      const out = fmt(src);
      expect(out).toContain(`deploy "prod-east"`);
      expect(out).toContain(`oci "api-svc"`);
      expectIdempotent(out);
    });

    it("keeps quotes on organization / team / member IDs", () => {
      const src = `organization "Acme Corp" {\n  team "Platform Team" {\n    member "alice smith" {}\n  }\n}`;
      const out = fmt(src);
      expect(out).toContain(`organization "Acme Corp"`);
      expect(out).toContain(`team "Platform Team"`);
      expect(out).toContain(`member "alice smith"`);
      expectIdempotent(out);
    });

    it("keeps quotes on edge from / to references", () => {
      const src = `system EC {\n  service "Order Service" {}\n  service "Billing Service" {}\n  "Order Service" -> "Billing Service" "charges"\n}`;
      const out = fmt(src);
      expect(out).toContain(`"Order Service" -> "Billing Service"`);
      expectIdempotent(out);
    });

    it("keeps quotes on realizes / owns / delivers references", () => {
      const src = `system EC { service "Order Service" {} }
deploy Prod {
  oci api { realizes "Order Service" }
}
organization Acme {
  team Platform {
    owns "Order Service"
  }
}`;
      const out = fmt(src);
      expect(out).toContain(`realizes "Order Service"`);
      expect(out).toContain(`owns "Order Service"`);
      expectIdempotent(out);
    });

    it("escapes embedded double quotes and backslashes in IDs", () => {
      const src = `system "with \\" quote" {}`;
      const out = fmt(src);
      // Round-trip must parse cleanly.
      expectIdempotent(out);
      expect(out).toContain(`"with \\" quote"`);
    });

    it("strips unnecessary quotes from bare-safe IDs", () => {
      // Inverse direction: round-trip should be canonical, not preserve
      // gratuitous quotes. `Foo` is a valid bare identifier, so the
      // formatter is free to drop the quotes.
      const src = `system "Foo" {}`;
      const out = fmt(src);
      expect(out).toBe(`system Foo {}`);
    });
  });
});
