import { describe, it, expect } from "vitest";
import { getBuiltinStyleSheet, BUILTIN_STYLE_SOURCE } from "./default-style.js";

describe("BUILTIN_STYLE_SOURCE", () => {
  it("is a non-empty string", () => {
    expect(BUILTIN_STYLE_SOURCE.length).toBeGreaterThan(0);
  });
});

describe("getBuiltinStyleSheet", () => {
  it("parses without errors", () => {
    const sheet = getBuiltinStyleSheet();
    expect(sheet.rules.length).toBeGreaterThan(0);
  });

  it("returns cached instance on second call", () => {
    const a = getBuiltinStyleSheet();
    const b = getBuiltinStyleSheet();
    expect(a).toBe(b);
  });

  it("contains user shape rule", () => {
    const sheet = getBuiltinStyleSheet();
    const userRule = sheet.rules.find(
      (r) => r.selector.nodeType === "user" && r.properties["shape"] === "user",
    );
    expect(userRule).toBeDefined();
  });

  it("contains resource[table] cylinder rule", () => {
    const sheet = getBuiltinStyleSheet();
    const rule = sheet.rules.find(
      (r) =>
        r.selector.nodeType === "resource" &&
        r.selector.tags.includes("table") &&
        r.properties["shape"] === "cylinder",
    );
    expect(rule).toBeDefined();
  });

  it("contains resource[queue] queue rule", () => {
    const sheet = getBuiltinStyleSheet();
    const rule = sheet.rules.find(
      (r) =>
        r.selector.nodeType === "resource" &&
        r.selector.tags.includes("queue") &&
        r.properties["shape"] === "queue",
    );
    expect(rule).toBeDefined();
  });

  it("contains resource[api] hexagon rule", () => {
    const sheet = getBuiltinStyleSheet();
    const rule = sheet.rules.find(
      (r) =>
        r.selector.nodeType === "resource" &&
        r.selector.tags.includes("api") &&
        r.properties["shape"] === "hexagon",
    );
    expect(rule).toBeDefined();
  });

  it("contains resource[storage] cloud rule", () => {
    const sheet = getBuiltinStyleSheet();
    const rule = sheet.rules.find(
      (r) =>
        r.selector.nodeType === "resource" &&
        r.selector.tags.includes("storage") &&
        r.properties["shape"] === "cloud",
    );
    expect(rule).toBeDefined();
  });

  it("contains edge[async] dashed rule", () => {
    const sheet = getBuiltinStyleSheet();
    const rule = sheet.rules.find(
      (r) =>
        r.selector.nodeType === "edge" &&
        r.selector.tags.includes("async") &&
        r.properties["border-style"] === "dashed",
    );
    expect(rule).toBeDefined();
  });

  it("contains annotation rules", () => {
    const sheet = getBuiltinStyleSheet();
    const deprecated = sheet.rules.find((r) => r.selector.annotations.includes("deprecated"));
    const newAnnotation = sheet.rules.find((r) => r.selector.annotations.includes("new"));
    expect(deprecated).toBeDefined();
    expect(newAnnotation).toBeDefined();
  });
});
