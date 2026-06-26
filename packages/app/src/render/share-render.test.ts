import { describe, it, expect } from "vitest";
import { encodeShare } from "../utils/inline-share.js";
import { renderSharePayload } from "./share-render.js";

const KRS = `system Shop {
  service Web { label "Web" }
  service Api { label "API" }
  Web -> Api "calls"
}
deploy "compose" {
  oci "web" { image "web" realizes Web }
}`;
const STYLE = `edge[from=Web] { color: #abcdef; }`;

function params(obj: Record<string, string>): URLSearchParams {
  return new URLSearchParams(obj);
}

describe("renderSharePayload", () => {
  it("renders the bundled all-views SVG by default (200)", () => {
    const res = renderSharePayload(params({ s: encodeShare({ krs: KRS }) }));
    expect(res.status).toBe(200);
    expect(res.contentType).toBe("image/svg+xml; charset=utf-8");
    expect(res.body.startsWith("<svg") || res.body.includes("<svg")).toBe(true);
  });

  it.each(["system", "deploy", "org"])("renders the %s view", (view) => {
    const res = renderSharePayload(params({ s: encodeShare({ krs: KRS }), view }));
    expect(res.status).toBe(200);
    expect(res.body).toContain("<svg");
  });

  it("applies the bundled style (edge[from=...] color reaches the SVG)", () => {
    const res = renderSharePayload(
      params({ s: encodeShare({ krs: KRS, style: STYLE }), view: "system" }),
    );
    expect(res.status).toBe(200);
    // End-to-end guard: the style round-trips through the share and is applied
    // at render time (regression for the edge[from] serialize bug).
    expect(res.body).toContain("#abcdef");
  });

  it("400 when 's' is missing", () => {
    const res = renderSharePayload(params({}));
    expect(res.status).toBe(400);
  });

  it("400 when 's' is corrupt", () => {
    const res = renderSharePayload(params({ s: "@@@not-valid@@@" }));
    expect(res.status).toBe(400);
  });

  it("400 when 'view' is invalid", () => {
    const res = renderSharePayload(params({ s: encodeShare({ krs: KRS }), view: "matrix" }));
    expect(res.status).toBe(400);
  });

  it("422 when the shared source has errors", () => {
    const res = renderSharePayload(
      params({ s: encodeShare({ krs: "system { oops" }), view: "system" }),
    );
    expect(res.status).toBe(422);
  });
});
