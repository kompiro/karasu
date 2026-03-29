import { describe, it, expect, beforeEach } from "vitest";
import { resolveIconManifest, type IconManifest } from "./icon-manifest.js";
import { getIconDef, clearRegistry } from "./shape-registry.js";
import { registerBuiltinShapes } from "./shapes.js";

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80" width="160" height="80">
  <ellipse cx="80" cy="20" rx="60" ry="12" fill="#1E3A5F" stroke="#60A5FA" stroke-width="1.5"/>
  <text class="krs-label" x="80" y="42" text-anchor="middle" fill="#E2E8F0" font-size="14px">Label</text>
</svg>`;

describe("resolveIconManifest", () => {
  beforeEach(() => {
    clearRegistry();
    registerBuiltinShapes();
  });

  it("registers icons from manifest", () => {
    const manifest: IconManifest = {
      icons: [{ name: "db", file: "db.svg" }],
    };
    resolveIconManifest(manifest, { "db.svg": SAMPLE_SVG });
    expect(getIconDef("db")).toBeDefined();
  });

  it("skips entries with missing svg content", () => {
    const manifest: IconManifest = {
      icons: [{ name: "missing", file: "missing.svg" }],
    };
    resolveIconManifest(manifest, {});
    expect(getIconDef("missing")).toBeUndefined();
  });

  it("passes builtIn flag through to icon definitions", () => {
    const manifest: IconManifest = {
      icons: [{ name: "db", file: "db.svg" }],
    };
    resolveIconManifest(manifest, { "db.svg": SAMPLE_SVG }, true);
    const def = getIconDef("db");
    expect(def).toBeDefined();
    expect(def!.builtIn).toBe(true);
  });

  it("registers multiple icons", () => {
    const manifest: IconManifest = {
      icons: [
        { name: "db", file: "db.svg" },
        { name: "db2", file: "db2.svg" },
      ],
    };
    resolveIconManifest(manifest, {
      "db.svg": SAMPLE_SVG,
      "db2.svg": SAMPLE_SVG,
    });
    expect(getIconDef("db")).toBeDefined();
    expect(getIconDef("db2")).toBeDefined();
  });
});
