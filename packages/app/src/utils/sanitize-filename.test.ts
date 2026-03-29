import { describe, it, expect } from "vitest";
import { sanitizeFilename } from "./sanitize-filename.js";

describe("sanitizeFilename", () => {
  it("returns name unchanged when no special characters", () => {
    expect(sanitizeFilename("ECommerce", "fallback")).toBe("ECommerce");
  });

  it("replaces spaces with underscores", () => {
    expect(sanitizeFilename("My System", "fallback")).toBe("My_System");
    expect(sanitizeFilename("E Commerce API", "fallback")).toBe("E_Commerce_API");
  });

  it("preserves Japanese characters", () => {
    expect(sanitizeFilename("受注システム", "fallback")).toBe("受注システム");
    expect(sanitizeFilename("EC サービス", "fallback")).toBe("EC_サービス");
  });

  it("replaces filesystem-unsafe characters with underscores", () => {
    expect(sanitizeFilename("foo/bar", "fallback")).toBe("foo_bar");
    expect(sanitizeFilename("foo\\bar", "fallback")).toBe("foo_bar");
    expect(sanitizeFilename("foo:bar", "fallback")).toBe("foo_bar");
    expect(sanitizeFilename("foo*bar", "fallback")).toBe("foo_bar");
    expect(sanitizeFilename("foo?bar", "fallback")).toBe("foo_bar");
    expect(sanitizeFilename('foo"bar', "fallback")).toBe("foo_bar");
    expect(sanitizeFilename("foo<bar", "fallback")).toBe("foo_bar");
    expect(sanitizeFilename("foo>bar", "fallback")).toBe("foo_bar");
    expect(sanitizeFilename("foo|bar", "fallback")).toBe("foo_bar");
    expect(sanitizeFilename("foo\x00bar", "fallback")).toBe("foo_bar");
  });

  it("preserves hyphens, underscores, and dots", () => {
    expect(sanitizeFilename("my-service_v2.0", "fallback")).toBe("my-service_v2.0");
  });

  it("preserves other symbols not dangerous to filesystems", () => {
    expect(sanitizeFilename("foo!bar#baz", "fallback")).toBe("foo!bar#baz");
  });

  it("falls back to fallback when result is empty", () => {
    expect(sanitizeFilename("", "node-id")).toBe("node-id");
  });

  it("falls back to fallback when all characters sanitize to underscores and result is truthy", () => {
    // "???" → "___" which is not empty, so it is returned as-is
    expect(sanitizeFilename("???", "fallback")).toBe("___");
  });

  it("handles mixed Japanese and unsafe characters", () => {
    expect(sanitizeFilename("受注/決済", "fallback")).toBe("受注_決済");
  });
});
