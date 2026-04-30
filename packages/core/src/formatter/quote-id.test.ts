import { describe, it, expect } from "vitest";
import { needsQuotes, quoteId } from "./quote-id.js";

describe("needsQuotes", () => {
  it.each(["Foo", "foo", "_underscore", "id123", "snake_case", "日本語", "_"])(
    "returns false for bare-safe %s",
    (id) => {
      expect(needsQuotes(id)).toBe(false);
    },
  );

  it.each([
    "",
    "with space",
    "hyphen-id",
    "1leadingDigit",
    "dot.path",
    'has"quote',
    "has\\backslash",
    "trailing ",
  ])("returns true for %s", (id) => {
    expect(needsQuotes(id)).toBe(true);
  });

  it.each(["system", "service", "deploy", "team", "member", "import", "from"])(
    "returns true for reserved keyword %s",
    (id) => {
      expect(needsQuotes(id)).toBe(true);
    },
  );
});

describe("quoteId", () => {
  it("returns bare id verbatim when no quoting needed", () => {
    expect(quoteId("Foo")).toBe("Foo");
    expect(quoteId("snake_case_99")).toBe("snake_case_99");
  });

  it("wraps unbare ids in double quotes", () => {
    expect(quoteId("My System")).toBe(`"My System"`);
    expect(quoteId("hyphen-id")).toBe(`"hyphen-id"`);
  });

  it("escapes embedded backslashes and double quotes", () => {
    expect(quoteId(`he said "hi"`)).toBe(`"he said \\"hi\\""`);
    expect(quoteId(`back\\slash`)).toBe(`"back\\\\slash"`);
    expect(quoteId(`mix \\ and "`)).toBe(`"mix \\\\ and \\""`);
  });

  it("quotes reserved keywords as IDs", () => {
    expect(quoteId("system")).toBe(`"system"`);
    expect(quoteId("from")).toBe(`"from"`);
  });
});
