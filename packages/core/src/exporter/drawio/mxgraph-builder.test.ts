import { describe, it, expect } from "vitest";
import { escapeXml, renderAttrs, renderStyle } from "./mxgraph-builder.js";

describe("escapeXml", () => {
  it("escapes the five predefined entities", () => {
    expect(escapeXml(`<a href="x&y">O'Neil</a>`)).toBe(
      "&lt;a href=&quot;x&amp;y&quot;&gt;O&apos;Neil&lt;/a&gt;",
    );
  });

  it("returns input unchanged when no unsafe characters are present", () => {
    expect(escapeXml("plain-text 123")).toBe("plain-text 123");
  });
});

describe("renderAttrs", () => {
  it("emits sorted key=value pairs with escaped values", () => {
    expect(renderAttrs({ id: "a&b", x: 10, vertex: true })).toBe(` id="a&amp;b" x="10" vertex="1"`);
  });

  it("skips undefined values and returns empty string for no attrs", () => {
    expect(renderAttrs({ a: undefined })).toBe("");
    expect(renderAttrs({})).toBe("");
  });

  it("encodes false booleans as 0", () => {
    expect(renderAttrs({ connectable: false })).toBe(` connectable="0"`);
  });
});

describe("renderStyle", () => {
  it("puts _shape token first and joins remaining props with semicolons", () => {
    expect(renderStyle({ _shape: "rounded", fillColor: "#fff", strokeColor: "#000" })).toBe(
      "rounded;fillColor=#fff;strokeColor=#000",
    );
  });

  it("omits _shape when absent and skips undefined values", () => {
    expect(renderStyle({ fillColor: "#fff", strokeColor: undefined })).toBe("fillColor=#fff");
  });

  it("encodes boolean props as 1/0", () => {
    expect(renderStyle({ rounded: true, dashed: false })).toBe("rounded=1;dashed=0");
  });
});
