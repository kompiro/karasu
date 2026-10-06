import { describe, expect, it } from "vitest";
import { embedSource, viewerHeader, viewerPage, ViewerTemplateError } from "./viewer-page.js";

const TEMPLATE =
  '<html><head><title>karasu</title></head><body><!--GALLERY_HEADER--><div id="root"></div><!--KRS_SOURCE--></body></html>';

const header = {
  id: "42-abcdefghjkmn",
  title: "Shop",
  submitter: "kompiro",
  submittedAt: "2026-08-02T00:00:00.000Z",
  unlisted: false,
  isOwner: false,
};

describe("viewerPage (#2998)", () => {
  it("fills the title, the header and the source", () => {
    const html = viewerPage(TEMPLATE, {
      title: "Shop",
      header: "<header>h</header>",
      krs: "system A {}",
    });
    expect(html).toContain("<title>Shop · karasu gallery</title>");
    expect(html).toContain('<header>h</header><div id="root">');
    expect(html).toContain(
      '<script type="application/json" id="krs-source">"system A {}"</script>',
    );
    expect(html).not.toContain("<!--");
  });

  it("keeps replacement patterns in a stranger's text literal", () => {
    const html = viewerPage(TEMPLATE, { title: "$& $1", header: "", krs: 'label "$`"' });
    expect(html).toContain("<title>$&amp; $1 · karasu gallery</title>");
    expect(html).toContain("$`");
  });

  it.each([
    ["a missing placeholder", TEMPLATE.replace("<!--KRS_SOURCE-->", "")],
    [
      "a duplicated placeholder",
      TEMPLATE.replace("<!--GALLERY_HEADER-->", "<!--GALLERY_HEADER--><!--GALLERY_HEADER-->"),
    ],
    ["a changed title", TEMPLATE.replace("<title>karasu</title>", "<title>other</title>")],
  ])("refuses a template with %s", (_, template) => {
    expect(() => viewerPage(template, { title: "t", header: "", krs: "" })).toThrow(
      ViewerTemplateError,
    );
  });
});

describe("embedSource", () => {
  it("escapes everything that could end the element, and round-trips", () => {
    const krs = `</script><!-- & ${String.fromCharCode(0x2028)} end`;
    const embedded = embedSource(krs);
    const json = embedded.slice(embedded.indexOf(">") + 1, embedded.lastIndexOf("</script>"));
    expect(json).not.toMatch(/[<>&]/);
    expect(json).not.toContain(String.fromCharCode(0x2028));
    expect(JSON.parse(json)).toBe(krs);
  });
});

describe("viewerHeader", () => {
  it("escapes what strangers typed", () => {
    const html = viewerHeader({ ...header, title: "<img src=x>", submitter: '"><b>' });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
  });

  it("links the console only for the owner, and marks an unlisted submission", () => {
    expect(viewerHeader(header)).not.toContain("/console/");
    const owned = viewerHeader({ ...header, isOwner: true, unlisted: true });
    expect(owned).toContain('<a href="/console/s/42-abcdefghjkmn">Manage</a>');
    expect(owned).toContain("unlisted");
  });

  it("uses links that stay in the tab, and no form", () => {
    const html = viewerHeader({ ...header, isOwner: true });
    expect(html).not.toMatch(/<form|target=/i);
    expect(html).toContain('href="/g/42-abcdefghjkmn?format=krs"');
    expect(html).toContain('href="/g/42-abcdefghjkmn?format=svg"');
  });
});
