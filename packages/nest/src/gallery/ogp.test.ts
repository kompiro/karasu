import { describe, expect, it } from "vitest";
import { OGP_DESCRIPTION_MAX, ogpDescription, ogpMeta } from "./ogp.js";

const base = { title: "Shop", submitter: "kompiro", url: "https://nest.example/g/42-abc" };

describe("ogpMeta (#2995)", () => {
  it("emits the card a crawler reads", () => {
    const meta = ogpMeta({ ...base, description: "The storefront." });
    expect(meta).toContain('<meta property="og:type" content="website">');
    expect(meta).toContain('<meta property="og:site_name" content="karasu gallery">');
    expect(meta).toContain('<meta property="og:url" content="https://nest.example/g/42-abc">');
    expect(meta).toContain('<meta property="og:title" content="Shop">');
    expect(meta).toContain('<meta property="og:description" content="The storefront.">');
    // No image until the stored preview lands, so not the large card.
    expect(meta).toContain('<meta name="twitter:card" content="summary">');
    expect(meta).not.toContain("og:image");
  });

  it("escapes what strangers typed", () => {
    const meta = ogpMeta({ ...base, title: '"><script>', description: "a & <b>" });
    expect(meta).not.toContain("<script>");
    expect(meta).not.toContain("<b>");
    expect(meta).toContain("&quot;&gt;&lt;script&gt;");
    expect(meta).toContain("a &amp; &lt;b&gt;");
  });

  it("omits og:url when the deploy has no public origin", () => {
    expect(ogpMeta({ ...base, url: undefined })).not.toContain("og:url");
  });
});

describe("ogpDescription", () => {
  it("says whose model it is when the document has no description", () => {
    expect(ogpDescription({ submitter: "kompiro" })).toBe(
      "Architecture model by kompiro on karasu gallery",
    );
    expect(ogpDescription({ submitter: "kompiro", description: "   " })).toContain("kompiro");
  });

  it("keeps a long description within what crawlers show", () => {
    const description = ogpDescription({ submitter: "k", description: "x".repeat(500) });
    expect(description).toHaveLength(OGP_DESCRIPTION_MAX);
    expect(description.endsWith("…")).toBe(true);
  });
});
