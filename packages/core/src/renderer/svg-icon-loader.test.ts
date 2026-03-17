import { describe, it, expect, beforeEach } from "vitest";
import { parseSvgIcon, loadAndRegisterIcon, loadAndRegisterIcons } from "../renderer/svg-icon-loader.js";
import { getShape, getIconDef, clearRegistry } from "../renderer/shape-registry.js";
import { registerBuiltinShapes } from "../renderer/shapes.js";

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80" width="160" height="80">
  <ellipse cx="80" cy="20" rx="60" ry="12" fill="#1E3A5F" stroke="#60A5FA" stroke-width="1.5"/>
  <path d="M20 20 L20 60 A60 12 0 0 0 140 60 L140 20" fill="#1E3A5F" stroke="#60A5FA" stroke-width="1.5"/>
  <text class="krs-label" x="80" y="42" text-anchor="middle" fill="#E2E8F0" font-size="14px">Database</text>
  <text class="krs-description" x="80" y="58" text-anchor="middle" fill="#E2E8F0" font-size="11px" opacity="0.7">Stores user data</text>
</svg>`;

describe("parseSvgIcon", () => {
  it("extracts viewBox dimensions", () => {
    const def = parseSvgIcon("db", SAMPLE_SVG);
    expect(def.viewBoxWidth).toBe(160);
    expect(def.viewBoxHeight).toBe(80);
  });

  it("extracts label slot from krs-label text element", () => {
    const def = parseSvgIcon("db", SAMPLE_SVG);
    expect(def.labelSlot).toEqual({ x: 80, y: 42, textAnchor: "middle" });
  });

  it("extracts description slot from krs-description text element", () => {
    const def = parseSvgIcon("db", SAMPLE_SVG);
    expect(def.descriptionSlot).toEqual({ x: 80, y: 58, textAnchor: "middle" });
  });

  it("removes krs-label and krs-description text elements from body", () => {
    const def = parseSvgIcon("db", SAMPLE_SVG);
    expect(def.body).not.toContain("krs-label");
    expect(def.body).not.toContain("krs-description");
    expect(def.body).not.toContain("Database");
    expect(def.body).not.toContain("Stores user data");
  });

  it("preserves non-text SVG elements in body", () => {
    const def = parseSvgIcon("db", SAMPLE_SVG);
    expect(def.body).toContain("<ellipse");
    expect(def.body).toContain("<path");
  });

  it("sets the name from parameter", () => {
    const def = parseSvgIcon("my-icon", SAMPLE_SVG);
    expect(def.name).toBe("my-icon");
  });

  it("handles SVG without text slots", () => {
    const simple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="red"/>
    </svg>`;
    const def = parseSvgIcon("dot", simple);
    expect(def.labelSlot).toBeUndefined();
    expect(def.descriptionSlot).toBeUndefined();
    expect(def.body).toContain("<circle");
  });

  it("defaults viewBox to 24x24 when not specified", () => {
    const noViewBox = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`;
    const def = parseSvgIcon("x", noViewBox);
    expect(def.viewBoxWidth).toBe(24);
    expect(def.viewBoxHeight).toBe(24);
  });
});

describe("loadAndRegisterIcon", () => {
  beforeEach(() => {
    clearRegistry();
    registerBuiltinShapes();
  });

  it("registers the icon in the shape registry", () => {
    loadAndRegisterIcon("database", SAMPLE_SVG);
    expect(getShape("database")).toBeDefined();
  });

  it("stores the icon definition with text slots", () => {
    loadAndRegisterIcon("database", SAMPLE_SVG);
    const def = getIconDef("database");
    expect(def).toBeDefined();
    expect(def!.labelSlot).toEqual({ x: 80, y: 42, textAnchor: "middle" });
  });
});

describe("loadAndRegisterIcons", () => {
  beforeEach(() => {
    clearRegistry();
    registerBuiltinShapes();
  });

  it("registers multiple icons at once", () => {
    const simple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>`;
    loadAndRegisterIcons({
      "icon-a": simple,
      "icon-b": simple,
    });
    expect(getShape("icon-a")).toBeDefined();
    expect(getShape("icon-b")).toBeDefined();
  });
});
