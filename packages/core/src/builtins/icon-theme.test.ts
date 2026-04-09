import { describe, it, expect } from "vitest";
import { ICON_THEME_STYLE_SOURCE, getIconThemeStyleSheet } from "./icon-theme.js";

describe("ICON_THEME_STYLE_SOURCE", () => {
  it("is a non-empty string", () => {
    expect(typeof ICON_THEME_STYLE_SOURCE).toBe("string");
    expect(ICON_THEME_STYLE_SOURCE.length).toBeGreaterThan(0);
  });

  it("parses without errors", () => {
    expect(() => getIconThemeStyleSheet()).not.toThrow();
  });

  it("contains rules for all logical node types", () => {
    for (const nodeType of ["service", "user", "domain", "usecase", "resource", "team", "member"]) {
      expect(ICON_THEME_STYLE_SOURCE).toContain(`${nodeType}`);
    }
  });

  it("contains rules for infra node types", () => {
    expect(ICON_THEME_STYLE_SOURCE).toContain("database");
    expect(ICON_THEME_STYLE_SOURCE).toContain("queue");
    expect(ICON_THEME_STYLE_SOURCE).toContain("storage");
  });

  it("contains rules for resource tag variants", () => {
    expect(ICON_THEME_STYLE_SOURCE).toContain("resource[table]");
    expect(ICON_THEME_STYLE_SOURCE).toContain("resource[queue]");
    expect(ICON_THEME_STYLE_SOURCE).toContain("resource[api]");
    expect(ICON_THEME_STYLE_SOURCE).toContain("resource[storage]");
  });

  it("resource[table] uses url(table) not url(database)", () => {
    expect(ICON_THEME_STYLE_SOURCE).toContain(`resource[table]   { shape: url("table");`);
  });

  it("resource[queue] uses url(queue-card)", () => {
    expect(ICON_THEME_STYLE_SOURCE).toContain(`resource[queue]   { shape: url("queue-card");`);
  });

  it("resource[storage] uses url(cloud-card)", () => {
    expect(ICON_THEME_STYLE_SOURCE).toContain(`resource[storage] { shape: url("cloud-card");`);
  });

  it("queue infra node uses url(queue-node) to avoid overwriting geometric queue shape", () => {
    expect(ICON_THEME_STYLE_SOURCE).toContain(`queue    { shape: url("queue-node"); }`);
  });

  it("storage infra node uses url(cloud-node) to avoid overwriting geometric cloud shape", () => {
    expect(ICON_THEME_STYLE_SOURCE).toContain(`storage  { shape: url("cloud-node"); }`);
  });

  it("usecase uses distinct url(usecase) not url(domain)", () => {
    expect(ICON_THEME_STYLE_SOURCE).toContain(`usecase  { shape: url("usecase");  }`);
    expect(ICON_THEME_STYLE_SOURCE).not.toContain(`usecase  { shape: url("domain")`);
  });

  it("contains rules for all deploy node types", () => {
    for (const deployType of [
      "oci",
      "lambda",
      "jar",
      "war",
      "function",
      "assets",
      "job",
      "artifact",
    ]) {
      expect(ICON_THEME_STYLE_SOURCE).toContain(`${deployType}`);
    }
  });

  it("all rules use url() shape syntax", () => {
    const sheet = getIconThemeStyleSheet();
    for (const rule of sheet.rules) {
      const shape = rule.properties["shape"];
      // Every rule in icon theme should use url() for shape
      expect(shape).toBeDefined();
      expect(shape).toMatch(/^url\(/);
    }
  });
});
