import { describe, expect, it } from "vitest";
import { renderKrs } from "./render.ts";

const SOURCE = `system Shop {
  service Web {
    label "Web"
  }
}`;

describe("renderKrs", () => {
  it("returns the compiled SVG", () => {
    const svg = renderKrs(SOURCE);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("Web");
  });

  it("passes compile options through — the two themes differ", () => {
    expect(renderKrs(SOURCE, { theme: "light" })).not.toBe(renderKrs(SOURCE, { theme: "dark" }));
  });

  // The import would resolve against a file that does not exist beside the
  // generator, so the stylesheet has to arrive as `styleSource` instead.
  it("strips @import of a .krs.style when styleSource is supplied", () => {
    const withImport = `@import "default.krs.style"\n\n${SOURCE}`;
    const svg = renderKrs(withImport, { styleSource: "service { background-color: #123456; }" });
    expect(svg).toContain("#123456");
  });

  it("throws with the diagnostic codes when the source has errors", () => {
    expect(() => renderKrs("system {")).toThrow(/failed to compile \(system view\)/);
  });
});
