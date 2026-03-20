import { describe, it, expect } from "vitest";
import { summarizeDescription, stripMarkdown } from "./description-summary.js";

describe("stripMarkdown", () => {
  it("removes headings", () => {
    expect(stripMarkdown("# Title")).toBe("Title");
    expect(stripMarkdown("## Subtitle")).toBe("Subtitle");
  });

  it("removes bold and italic", () => {
    expect(stripMarkdown("**bold** and *italic*")).toBe("bold and italic");
    expect(stripMarkdown("__bold__ and _italic_")).toBe("bold and italic");
  });

  it("removes inline code", () => {
    expect(stripMarkdown("use `foo()` here")).toBe("use foo() here");
  });

  it("removes links keeping text", () => {
    expect(stripMarkdown("[text](https://example.com)")).toBe("text");
  });

  it("removes images keeping alt", () => {
    expect(stripMarkdown("![alt text](image.png)")).toBe("alt text");
  });

  it("removes list markers", () => {
    expect(stripMarkdown("- item one")).toBe("item one");
    expect(stripMarkdown("* item two")).toBe("item two");
    expect(stripMarkdown("1. numbered")).toBe("numbered");
  });

  it("removes strikethrough", () => {
    expect(stripMarkdown("~~deleted~~")).toBe("deleted");
  });
});

describe("summarizeDescription", () => {
  it("returns short text as-is", () => {
    expect(summarizeDescription("商品管理と注文処理")).toBe("商品管理と注文処理");
  });

  it("truncates at 50 characters with ellipsis", () => {
    const long = "あ".repeat(60);
    const result = summarizeDescription(long);
    expect([...result].length).toBe(51); // 50 chars + "…"
    expect(result.endsWith("…")).toBe(true);
  });

  it("respects custom maxLength", () => {
    const result = summarizeDescription("abcdefghij", 5);
    expect(result).toBe("abcde…");
  });

  it("extracts first paragraph only", () => {
    const md = "First paragraph.\n\nSecond paragraph.";
    expect(summarizeDescription(md)).toBe("First paragraph.");
  });

  it("strips Markdown from the summary", () => {
    const md = "**Bold** description with [link](https://example.com)";
    expect(summarizeDescription(md)).toBe("Bold description with link");
  });

  it("handles empty input", () => {
    expect(summarizeDescription("")).toBe("");
  });

  it("collapses newlines within first paragraph", () => {
    const md = "Line one\nLine two";
    expect(summarizeDescription(md)).toBe("Line one Line two");
  });

  it("handles Unicode correctly", () => {
    const emoji = "🎉".repeat(60);
    const result = summarizeDescription(emoji);
    expect([...result].length).toBe(51); // 50 emoji + "…"
    expect(result.endsWith("…")).toBe(true);
  });
});
