import { describe, it, expect } from "vitest";
import { encodeShare } from "../utils/inline-share.js";
import { buildSharePage } from "./share-page.js";

const ORIGIN = "https://karasu-nest.example";

function page(s: string) {
  return buildSharePage(new URLSearchParams({ s }), ORIGIN);
}

const KRS = `system Shop {
  label "Acme Shop"
  description "The storefront and checkout services."
  service Web { label "Web" }
}`;

describe("buildSharePage", () => {
  it("emits OGP meta pointing at the system PNG and bounces to the fragment", () => {
    const s = encodeShare({ krs: KRS });
    const res = page(s);
    expect(res.status).toBe(200);
    expect(res.contentType).toBe("text/html; charset=utf-8");
    // og:image reuses the /render PNG endpoint at the system view. The `&`
    // query separators MUST be HTML-escaped (&amp;) or strict crawlers truncate
    // the URL at the first `&` and drop format=png (→ unpreviewable SVG).
    expect(res.body).toContain(
      `<meta property="og:image" content="${ORIGIN}/render?s=${s}&amp;view=system&amp;format=png&amp;width=1200">`,
    );
    expect(res.body).not.toContain(`&view=system`);
    expect(res.body).toContain('<meta name="twitter:card" content="summary_large_image">');
    // Human visitors are bounced back to the unchanged #s= restore path.
    expect(res.body).toContain(`location.replace("${ORIGIN}/#s=${s}")`);
    expect(res.body).toContain(`href="${ORIGIN}/#s=${s}"`);
  });

  it("uses the first system's label and description for og:title / og:description", () => {
    const res = page(encodeShare({ krs: KRS }));
    expect(res.body).toContain('<meta property="og:title" content="Acme Shop">');
    expect(res.body).toContain(
      '<meta property="og:description" content="The storefront and checkout services.">',
    );
  });

  it("falls back to the system id when there is no label", () => {
    const res = page(encodeShare({ krs: `system Shop {\n  service Web { label "Web" }\n}` }));
    expect(res.body).toContain('<meta property="og:title" content="Shop">');
  });

  it("falls back to a static description when the system has none", () => {
    const res = page(encodeShare({ krs: `system Shop {\n  service Web { label "Web" }\n}` }));
    expect(res.body).toContain("An architecture diagram shared with karasu-nest.");
  });

  // TPL-20260510-17: decoded title/description cross the trust boundary into
  // HTML and are NOT covered by the base64url charset check, so they must be
  // HTML-escaped. A label crafted to break out of the attribute must not.
  it("HTML-escapes the dynamic title (no attribute/tag injection)", () => {
    const s = encodeShare({
      krs: `system X {\n  label "\\"><script>alert(1)</script>"\n  service Web { label "Web" }\n}`,
    });
    const res = page(s);
    expect(res.status).toBe(200);
    expect(res.body).not.toContain("<script>alert(1)</script>");
    expect(res.body).toContain("&lt;script&gt;");
    expect(res.body).toContain("&quot;");
  });

  it("rejects a payload containing non-base64url characters (400)", () => {
    // A quote/angle bracket can never appear in a real encoded payload; reject.
    const res = page('abc"><script>');
    expect(res.status).toBe(400);
    expect(res.contentType).toBe("text/plain; charset=utf-8");
  });

  it("returns 400 when s is missing", () => {
    const res = buildSharePage(new URLSearchParams(), ORIGIN);
    expect(res.status).toBe(400);
  });

  it("still emits a valid page (static meta) for a corrupt but charset-valid payload", () => {
    // Best-effort: a bad payload never errors the page — it unfurls generically.
    const res = page("notARealDeflateStreamButBase64url");
    expect(res.status).toBe(200);
    expect(res.body).toContain(
      '<meta property="og:title" content="karasu — shared architecture diagram">',
    );
  });
});
