import { describe, it, expect } from "vitest";
import { needsQuotes, quoteId } from "./quote-id.js";
import { KRS_KEYWORD_NAMES } from "../lexer/lexer.js";

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

  it.each(["system", "service", "deploy", "team", "member", "import", "from", "entity", "usecase"])(
    "returns true for reserved keyword %s",
    (id) => {
      expect(needsQuotes(id)).toBe(true);
    },
  );

  it("returns true for every keyword the lexer reserves (#2707)", () => {
    // Derived from the lexer, not copied: a hand-copied list missed
    // `boundary`, `contains`, `facet`, `facets` and `operations`.
    expect(KRS_KEYWORD_NAMES.filter((keyword) => !needsQuotes(keyword))).toEqual([]);
  });

  it("returns true for a value-matched deploy keyword", () => {
    expect(needsQuotes("store")).toBe(true);
  });

  it("returns false for an id with a character outside the BMP or a combining mark (#2848)", () => {
    // #2707 quoted these because the lexer dropped each half of a surrogate
    // pair and every mark. It now reads them, so they print bare.
    expect(["𠮷野家", "cafe\u0301", "हिन्दी"].filter(needsQuotes)).toEqual([]);
  });

  it("returns true for an id that starts with a combining mark (#2848)", () => {
    expect(needsQuotes("\u0301a")).toBe(true);
  });

  it("returns false for an id with ZWNJ inside, and true for one with a symbol (#3093)", () => {
    expect(needsQuotes("\u0645\u06CC\u200C\u062E")).toBe(false);
    expect(
      ["😀A", "A😀", "Foo\u200BBar", "Foo\u200DBar", "A\u200C"].filter((id) => !needsQuotes(id)),
    ).toEqual([]);
  });
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
