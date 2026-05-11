import { describe, expect, it } from "vitest";
import {
  VIEW_TYPES,
  isAllowedExternalUrl,
  isValidNavIndex,
  isViewType,
} from "./message-validation.js";

describe("isViewType", () => {
  it("accepts every known view type", () => {
    for (const v of VIEW_TYPES) {
      expect(isViewType(v)).toBe(true);
    }
  });

  it("rejects an unknown string", () => {
    expect(isViewType("matrix")).toBe(false);
    expect(isViewType("timeline")).toBe(false);
    expect(isViewType("")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isViewType(undefined)).toBe(false);
    expect(isViewType(null)).toBe(false);
    expect(isViewType(0)).toBe(false);
    expect(isViewType({ system: true })).toBe(false);
  });
});

describe("isValidNavIndex", () => {
  it("accepts non-negative integers within [0, pathLength]", () => {
    expect(isValidNavIndex(0, 3)).toBe(true);
    expect(isValidNavIndex(1, 3)).toBe(true);
    expect(isValidNavIndex(3, 3)).toBe(true); // == length is allowed (no-op slice)
  });

  it("rejects an index greater than pathLength", () => {
    expect(isValidNavIndex(4, 3)).toBe(false);
    expect(isValidNavIndex(100, 0)).toBe(false);
  });

  it("rejects negative indices", () => {
    expect(isValidNavIndex(-1, 3)).toBe(false);
    expect(isValidNavIndex(-100, 5)).toBe(false);
  });

  it("rejects non-integer numbers", () => {
    expect(isValidNavIndex(1.5, 3)).toBe(false);
    expect(isValidNavIndex(Number.NaN, 3)).toBe(false);
    expect(isValidNavIndex(Number.POSITIVE_INFINITY, 3)).toBe(false);
  });

  it("rejects non-number values", () => {
    expect(isValidNavIndex("1", 3)).toBe(false);
    expect(isValidNavIndex(undefined, 3)).toBe(false);
    expect(isValidNavIndex(null, 3)).toBe(false);
  });
});

describe("isAllowedExternalUrl", () => {
  it("accepts http / https / mailto", () => {
    expect(isAllowedExternalUrl("https://example.com/page")).toBe(true);
    expect(isAllowedExternalUrl("http://example.com")).toBe(true);
    expect(isAllowedExternalUrl("mailto:dev@example.com")).toBe(true);
  });

  it("rejects file: URLs", () => {
    expect(isAllowedExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedExternalUrl("file://C:/Windows/System32")).toBe(false);
  });

  it("rejects javascript: and other non-web schemes", () => {
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("vscode://some/command")).toBe(false);
    expect(isAllowedExternalUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects malformed URL strings", () => {
    expect(isAllowedExternalUrl("not a url")).toBe(false);
    expect(isAllowedExternalUrl("://missing-scheme")).toBe(false);
    expect(isAllowedExternalUrl("")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isAllowedExternalUrl(undefined)).toBe(false);
    expect(isAllowedExternalUrl(null)).toBe(false);
    expect(isAllowedExternalUrl(42)).toBe(false);
  });
});
