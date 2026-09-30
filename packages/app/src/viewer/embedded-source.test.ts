// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { EMBEDDED_SOURCE_ID, readEmbeddedSource } from "./embedded-source.js";

/** Embed the way the server does: JSON with `<`, `>` and `&` escaped. */
function embed(json: string) {
  const el = document.createElement("script");
  el.type = "application/json";
  el.id = EMBEDDED_SOURCE_ID;
  el.textContent = json;
  document.body.append(el);
}
const escaped = (krs: string) =>
  JSON.stringify(krs).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

afterEach(() => {
  document.body.innerHTML = "";
});

describe("readEmbeddedSource (#2997)", () => {
  it("returns the embedded .krs, unescaping what the server escaped", () => {
    const krs = 'system Shop {\n  service Api { label "</script><b>&" }\n}';
    embed(escaped(krs));
    expect(readEmbeddedSource(document)).toBe(krs);
  });

  it("returns null when the page carries no source", () => {
    expect(readEmbeddedSource(document)).toBeNull();
  });

  it("returns null for malformed JSON or a non-string value", () => {
    embed("{not json");
    expect(readEmbeddedSource(document)).toBeNull();
    document.body.innerHTML = "";
    embed('{"krs": "system A {}"}');
    expect(readEmbeddedSource(document)).toBeNull();
  });
});
