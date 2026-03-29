import { describe, it, expect, beforeEach } from "vitest";
import { parseSvgIcon, loadAndRegisterIcon, loadAndRegisterIcons } from "./svg-icon-loader.js";
import { getShape, getIconDef, clearRegistry, renderPictogram } from "./shape-registry.js";
import { registerBuiltinShapes } from "./shapes.js";

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

  it("sets builtIn flag when provided", () => {
    const def = parseSvgIcon("db", SAMPLE_SVG, true);
    expect(def.builtIn).toBe(true);
  });

  it("leaves builtIn undefined when not provided", () => {
    const def = parseSvgIcon("db", SAMPLE_SVG);
    expect(def.builtIn).toBeUndefined();
  });

  it("extracts pictogramBody from krs-pictogram group", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
      <g class="krs-pictogram" transform="translate(6, 4)">
        <path d="M10 6a4 4 0 1 1 0 8" fill="{{color}}"/>
        <circle cx="10" cy="10" r="5" fill="{{color}}"/>
      </g>
      <text class="krs-label" x="30" y="19" text-anchor="start"/>
    </svg>`;
    const def = parseSvgIcon("myicon", svg);
    expect(def.pictogramBody).toBeDefined();
    expect(def.pictogramBody).toContain('<path d="M10 6a4 4 0 1 1 0 8"');
    expect(def.pictogramBody).toContain("<circle");
    // The group wrapper and transform must NOT be included
    expect(def.pictogramBody).not.toContain("krs-pictogram");
    expect(def.pictogramBody).not.toContain("translate");
  });

  it("leaves pictogramBody undefined when krs-pictogram group is absent", () => {
    const simple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="red"/>
    </svg>`;
    const def = parseSvgIcon("dot", simple);
    expect(def.pictogramBody).toBeUndefined();
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

  it("passes builtIn flag through to icon def", () => {
    loadAndRegisterIcon("database", SAMPLE_SVG, true);
    const def = getIconDef("database");
    expect(def!.builtIn).toBe(true);
  });
});

describe("builtIn placeholder injection", () => {
  const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
    <rect fill="{{fill}}" stroke="{{stroke}}" stroke-width="{{strokeWidth}}"/>
    <path d="M0 0" fill="{{color}}"/>
  </svg>`;

  beforeEach(() => {
    clearRegistry();
    registerBuiltinShapes();
  });

  it("replaces placeholders for builtIn icons", () => {
    loadAndRegisterIcon("test-icon", PLACEHOLDER_SVG, true);
    const shapeFn = getShape("test-icon")!;
    const result = shapeFn({
      x: 0,
      y: 0,
      width: 160,
      height: 100,
      fill: "#112233",
      stroke: "#445566",
      strokeWidth: 2,
      strokeDasharray: "",
      borderRadius: 0,
      color: "#AABBCC",
    });
    expect(result).toContain("#AABBCC");
    expect(result).toContain("#112233");
    expect(result).toContain("#445566");
    expect(result).toContain("2");
    expect(result).not.toContain("{{color}}");
    expect(result).not.toContain("{{fill}}");
    expect(result).not.toContain("{{stroke}}");
    expect(result).not.toContain("{{strokeWidth}}");
  });

  it("does NOT replace placeholders for non-builtIn icons", () => {
    loadAndRegisterIcon("custom-icon", PLACEHOLDER_SVG);
    const shapeFn = getShape("custom-icon")!;
    const result = shapeFn({
      x: 0,
      y: 0,
      width: 160,
      height: 100,
      fill: "#112233",
      stroke: "#445566",
      strokeWidth: 2,
      strokeDasharray: "",
      borderRadius: 0,
      color: "#AABBCC",
    });
    expect(result).toContain("{{color}}");
    expect(result).toContain("{{fill}}");
  });
});

describe("renderPictogram", () => {
  const PICTOGRAM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
    <g class="krs-pictogram" transform="translate(6, 4)">
      <rect width="20" height="20" fill="{{color}}"/>
    </g>
    <text class="krs-label" x="30" y="19" text-anchor="start"/>
  </svg>`;

  beforeEach(() => {
    clearRegistry();
    registerBuiltinShapes();
  });

  it("returns an SVG string with viewBox 0 0 20 20", () => {
    loadAndRegisterIcon("myicon", PICTOGRAM_SVG, true);
    const result = renderPictogram("myicon", "#FFFFFF");
    expect(result).toBeDefined();
    expect(result).toContain('viewBox="0 0 20 20"');
  });

  it("applies the given size to width and height", () => {
    loadAndRegisterIcon("myicon", PICTOGRAM_SVG, true);
    const result = renderPictogram("myicon", "#FFFFFF", 16);
    expect(result).toContain('width="16"');
    expect(result).toContain('height="16"');
  });

  it("replaces {{color}} placeholder with the given color for builtIn icons", () => {
    loadAndRegisterIcon("myicon", PICTOGRAM_SVG, true);
    const result = renderPictogram("myicon", "#FF0000");
    expect(result).toContain('fill="#FF0000"');
    expect(result).not.toContain("{{color}}");
  });

  it("does not replace {{color}} for non-builtIn icons", () => {
    loadAndRegisterIcon("myicon", PICTOGRAM_SVG, false);
    const result = renderPictogram("myicon", "#FF0000");
    expect(result).toContain("{{color}}");
  });

  it("returns undefined for unknown icon name", () => {
    const result = renderPictogram("no-such-icon", "#FFFFFF");
    expect(result).toBeUndefined();
  });

  it("returns undefined when icon has no pictogramBody", () => {
    const noGroup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="red"/>
    </svg>`;
    loadAndRegisterIcon("plain-icon", noGroup, true);
    const result = renderPictogram("plain-icon", "#FFFFFF");
    expect(result).toBeUndefined();
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
