import { describe, expect, it } from "vitest";
import { findOpenableExample, OPENABLE_EXAMPLES } from "./openable-examples.js";

describe("findOpenableExample", () => {
  it("resolves a known example for an available language", () => {
    expect(findOpenableExample("payment-platform", "ja")?.entry).toBe("system.krs");
    expect(findOpenableExample("getting-started", "en")?.entry).toBe("index.krs");
  });

  it("rejects malformed slugs (no path traversal)", () => {
    expect(findOpenableExample("../etc", "en")).toBeUndefined();
    expect(findOpenableExample("a/b", "en")).toBeUndefined();
    expect(findOpenableExample("Payment_Platform", "en")).toBeUndefined();
  });

  it("rejects unknown slugs and bad languages", () => {
    expect(findOpenableExample("does-not-exist", "en")).toBeUndefined();
    expect(findOpenableExample("payment-platform", "fr")).toBeUndefined();
  });

  it("respects per-example language availability", () => {
    expect(findOpenableExample("client-mcp", "en")?.entry).toBe("index.krs");
    expect(findOpenableExample("client-mcp", "ja")).toBeUndefined(); // en-only
  });

  it("every entry is a bare kebab slug with at least one language", () => {
    for (const e of OPENABLE_EXAMPLES) {
      expect(e.slug).toMatch(/^[a-z0-9-]+$/);
      expect(e.langs.length).toBeGreaterThan(0);
      expect(e.entry.endsWith(".krs")).toBe(true);
    }
  });
});
