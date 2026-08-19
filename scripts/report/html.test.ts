import { describe, expect, it } from "vitest";
import { dataUri, escapeHtml, pair, pane, reportFragment, reportPage } from "./html.ts";

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

// Two compiled diagrams reuse the same generated ids, so inlining both in one
// document would make the second pane's url(#…) resolve to the first pane's
// definition — the "after" pane drawing "before" arrowheads is exactly the
// silent failure a comparison report cannot afford.
describe("inline SVG id isolation", () => {
  const WITH_IDS =
    '<svg><defs><marker id="arrow-0"/></defs>' +
    '<path marker-end="url(#arrow-0)"/><use href="#arrow-0"/></svg>';

  function idsOf(html: string): string[] {
    return [...html.matchAll(/\bid="([^"]*)"/g)].map((m) => m[1]);
  }

  it("gives each pane its own id namespace", () => {
    const html = pair({ label: "before", svg: WITH_IDS }, { label: "after", svg: WITH_IDS });
    const [beforeCell, afterCell] = html.split('<figure class="pane">').slice(1);
    const [beforeId] = idsOf(beforeCell);
    const [afterId] = idsOf(afterCell);
    expect(beforeId).not.toBe(afterId);
    expect(html).not.toContain('id="arrow-0"');
  });

  it("rewrites url() and href references to match their own pane", () => {
    const html = pair({ label: "before", svg: WITH_IDS }, { label: "after", svg: WITH_IDS });
    for (const cell of html.split('<figure class="pane">').slice(1)) {
      const [id] = idsOf(cell);
      expect(cell).toContain(`url(#${id})`);
      expect(cell).toContain(`href="#${id}"`);
    }
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

  it("does not repeat an anchor when two sections share a heading", () => {
    const repeated = reportPage({
      title: "t",
      sections: [
        { title: "Results", body: "<p>a</p>" },
        { title: "Results", body: "<p>b</p>" },
      ],
    });
    expect(repeated).toContain('<h2 id="results">Results</h2>');
    expect(repeated).toContain('<h2 id="section-2">Results</h2>');
  });

  // A report is opened from file://, published as an Artifact, or attached to
  // an issue. Anything fetched over the network is broken in at least one of
  // those, and the Artifact sandbox refuses it outright.
  it("is self-contained — no external stylesheet, script, or image", () => {
    expect(page).not.toMatch(/<link\b/);
    expect(page).not.toMatch(/<script\b/);
    expect(page).not.toMatch(/(?:src|href)="(?:https?:)?\/\//);
  });
});

// The publishable form (Issue #2436). The host wraps it in its own
// `<!doctype html>…<body>`, so anything asserted here is what stands between a
// generated report and a page that either nests two documents or renders
// nothing.
describe("reportFragment", () => {
  const fragment = reportFragment({
    title: "PoC <report>",
    lang: "en",
    subtitle: "why",
    meta: ["spike/x", "Issue #2436"],
    sections: [
      { body: "<p>lead-in</p>" },
      { title: "System view", body: pair({ label: "a", svg: SVG }, { label: "b", svg: SVG }) },
      { title: "Shot", body: pane({ label: "shot", image: "data:image/png;base64,AA==" }) },
    ],
  });

  it("carries no document skeleton for the host's to nest inside", () => {
    expect(fragment).not.toMatch(/<!doctype/i);
    expect(fragment).not.toMatch(/<html\b/i);
    expect(fragment).not.toMatch(/<head\b/i);
    expect(fragment).not.toMatch(/<body\b/i);
    expect(fragment).not.toMatch(/<\/(?:html|head|body)>/i);
  });

  it("opens with the title, which the host reads from the head of the file", () => {
    expect(fragment.startsWith("<title>PoC &lt;report&gt;</title>")).toBe(true);
  });

  it("is self-contained — inline styles, no external stylesheet, script, or image", () => {
    expect(fragment).toContain("<style>");
    expect(fragment).not.toMatch(/<link\b/);
    expect(fragment).not.toMatch(/<script\b/);
    expect(fragment).not.toMatch(/(?:src|href)="(?:https?:)?\/\//);
    expect(fragment).not.toMatch(/url\((?:'|")?(?:https?:)?\/\//);
    expect(fragment).toContain('src="data:image/png;base64,AA=="');
  });

  it("shows the same header and sections as the full document", () => {
    expect(fragment).toContain("<h1>PoC &lt;report&gt;</h1>");
    expect(fragment).toContain("<p>why</p>");
    expect(fragment).toContain("<span>Issue #2436</span>");
    expect(fragment).toContain("<p>lead-in</p>");
    expect(fragment).toContain('<h2 id="system-view">System view</h2>');
  });
});
