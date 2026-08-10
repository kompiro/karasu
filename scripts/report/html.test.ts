import { describe, expect, it } from "vitest";
import { dataUri, escapeHtml, pair, pane, reportPage } from "./html.ts";

const SVG = '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>';

describe("escapeHtml", () => {
  it("escapes the characters that break element content and quoted attributes", () => {
    expect(escapeHtml(`<img src="x" onerror='y'> & done`)).toBe(
      "&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt; &amp; done",
    );
  });
});

describe("pane", () => {
  it("renders inline SVG on the dark backdrop by default", () => {
    const html = pane({ label: "after", svg: SVG });
    expect(html).toContain(SVG);
    expect(html).toContain('class="art dark"');
    expect(html).toContain("after");
  });

  it("renders an image source and honours the light backdrop", () => {
    const html = pane({ label: "shot", image: "data:image/png;base64,AA==", background: "light" });
    expect(html).toContain('src="data:image/png;base64,AA=="');
    expect(html).toContain('class="art light"');
  });

  it("escapes the label and the note", () => {
    const html = pane({ label: "<b>x</b>", svg: SVG, note: "a & b" });
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("a &amp; b");
    expect(html).not.toContain("<b>x</b>");
  });

  it("rejects a pane carrying no artwork, and one carrying both kinds", () => {
    expect(() => pane({ label: "x" })).toThrow(/exactly one/);
    expect(() => pane({ label: "x", svg: SVG, image: "data:," })).toThrow(/exactly one/);
  });
});

describe("pair", () => {
  it("puts both panes in one grid and escapes the caption", () => {
    const html = pair({ label: "before", svg: SVG }, { label: "after", svg: SVG }, "5 & 6 nodes");
    expect(html).toContain('class="pair"');
    expect(html).toContain("before");
    expect(html).toContain("after");
    expect(html).toContain("5 &amp; 6 nodes");
  });

  it("omits the caption element when no caption is given", () => {
    expect(pair({ label: "a", svg: SVG }, { label: "b", svg: SVG })).not.toContain("<figcaption>");
  });
});

describe("dataUri", () => {
  it("base64-encodes the bytes under the given mime type", () => {
    expect(dataUri(new Uint8Array([1, 2, 3]))).toBe("data:image/png;base64,AQID");
    expect(dataUri(new Uint8Array([1]), "image/webp")).toBe("data:image/webp;base64,AQ==");
  });
});

describe("reportPage", () => {
  const page = reportPage({
    title: "PoC <report>",
    subtitle: "why",
    meta: ["spike/x", "Issue #2419"],
    sections: [
      { body: "<p>lead-in</p>" },
      { title: "System view", body: pair({ label: "a", svg: SVG }, { label: "b", svg: SVG }) },
      { title: "日本語の見出し", body: "<p>jp</p>" },
      { title: "Explicit", id: "pinned", body: "<p>x</p>" },
    ],
  });

  it("is a complete document with the title escaped", () => {
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain("<title>PoC &lt;report&gt;</title>");
    expect(page).toContain("</html>");
  });

  it("emits every section body, untitled ones without a heading", () => {
    expect(page).toContain("<p>lead-in</p>");
    expect(page).toContain('<h2 id="system-view">System view</h2>');
    expect(page).toContain('<h2 id="pinned">Explicit</h2>');
  });

  it("falls back to a positional anchor when the heading has no ascii", () => {
    expect(page).toContain('<h2 id="section-3">日本語の見出し</h2>');
  });

  // A report is opened from file://, copied to a preview, or attached to an
  // issue. Anything fetched over the network is broken in at least one of those.
  it("is self-contained — no external stylesheet, script, or image", () => {
    expect(page).not.toMatch(/<link\b/);
    expect(page).not.toMatch(/<script\b/);
    expect(page).not.toMatch(/(?:src|href)="(?:https?:)?\/\//);
  });
});
