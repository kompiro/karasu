import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  scanFences,
  parseRenderMarkers,
  processFile,
  langOf,
  regenerate,
} from "./gen-guide-diagrams.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

describe("guide diagram codegen", () => {
  it("the committed guide diagrams + image refs are up to date (run `pnpm gen:guide-diagrams` if this fails)", () => {
    const { stale } = regenerate({ root: repoRoot, check: true });
    expect(stale).toEqual([]);
  });

  describe("scanFences", () => {
    it("pairs fences and captures the info string and body", () => {
      const fences = scanFences(["text", "```krs", "system S {}", "```", "more"].join("\n"));
      expect(fences).toHaveLength(1);
      expect(fences[0]).toMatchObject({
        info: "krs",
        body: "system S {}",
        openLine: 1,
        closeLine: 3,
      });
    });

    it("does not treat the info-string line of a second block as a closer", () => {
      const fences = scanFences(["```krs", "a", "```", "", "```css", "b", "```"].join("\n"));
      expect(fences.map((f) => f.info)).toEqual(["krs", "css"]);
    });
  });

  describe("parseRenderMarkers", () => {
    it("parses view, id, and the optional style flag", () => {
      const md = [
        "<!-- render: system id=01-foo -->",
        "<!-- render: org id=02-bar -->",
        "<!-- render: system id=05-baz style -->",
      ].join("\n");
      expect(parseRenderMarkers(md, "f.md")).toEqual([
        { view: "system", id: "01-foo", style: false, line: 0 },
        { view: "org", id: "02-bar", style: false, line: 1 },
        { view: "system", id: "05-baz", style: true, line: 2 },
      ]);
    });

    it("throws on an unknown view", () => {
      expect(() => parseRenderMarkers("<!-- render: bogus id=x -->", "f.md")).toThrow(
        /unknown view/,
      );
    });
  });

  it("langOf reads the locale from the filename", () => {
    expect(langOf("docs/guide/01-x.md")).toBe("en");
    expect(langOf("docs/guide/01-x.ja.md")).toBe("ja");
  });

  describe("processFile", () => {
    const doc = (markers: boolean) =>
      [
        "# Title",
        "",
        "prose A",
        ...(markers ? ["<!-- render: system id=a -->"] : []),
        "```krs",
        "system A {}",
        "```",
        "",
        "prose B",
        ...(markers ? ["<!-- render: system id=b -->"] : []),
        "```krs",
        "system B {}",
        "```",
        "",
        "tail",
      ].join("\n");

    it("inserts each image region directly after its closing fence — never inside a fence", () => {
      // Regression: with two markers in one file, a stale anchor used to drop
      // the second image inside the first/second fence.
      const { markdown } = processFile("docs/guide/x.md", doc(true));
      const lines = markdown.split("\n");
      lines.forEach((line, i) => {
        if (!line.startsWith("<!-- gen:guide-diagram:")) return;
        const fencesBefore = lines.slice(0, i).filter((l) => /^ {0,3}(`{3,}|~{3,})/.test(l)).length;
        // even count of fences before ⇒ the image sits outside any code fence
        expect(fencesBefore % 2).toBe(0);
      });
      expect(markdown).toContain("![system view — a](diagrams/a.svg)");
      expect(markdown).toContain("![system view — b](diagrams/b.svg)");
    });

    it("is idempotent — a second pass reproduces the same markdown and SVGs", () => {
      const first = processFile("docs/guide/x.md", doc(true));
      const second = processFile("docs/guide/x.md", first.markdown);
      expect(second.markdown).toBe(first.markdown);
      expect(second.diagrams.map((d) => d.svg)).toEqual(first.diagrams.map((d) => d.svg));
    });

    it("derives per-language SVG paths from the filename", () => {
      const en = processFile("docs/guide/x.md", doc(true));
      const ja = processFile("docs/guide/x.ja.md", doc(true));
      expect(en.diagrams.map((d) => d.svgPath)).toEqual([
        "docs/guide/diagrams/a.svg",
        "docs/guide/diagrams/b.svg",
      ]);
      expect(ja.diagrams.map((d) => d.svgPath)).toEqual([
        "docs/guide/diagrams/a.ja.svg",
        "docs/guide/diagrams/b.ja.svg",
      ]);
    });

    it("returns the input unchanged when there are no markers", () => {
      const input = doc(false);
      expect(processFile("docs/guide/x.md", input).markdown).toBe(input);
    });

    it("uses the next css block as the stylesheet and strips the @import line when `style` is set", () => {
      const md = [
        "<!-- render: system id=s style -->",
        "```krs",
        '@import "theme.krs.style"',
        'system S { service Old @deprecated { label "Old" } }',
        "```",
        "",
        "```css",
        '@deprecated { badge-label: "deprecated"; }',
        "```",
      ].join("\n");
      const { diagrams } = processFile("docs/guide/x.md", md);
      expect(diagrams).toHaveLength(1);
      // The badge proves the companion stylesheet was applied.
      expect(diagrams[0].svg).toContain("deprecated");
    });

    it("throws when a render marker is not directly above a krs fence", () => {
      const md = ["<!-- render: system id=x -->", "", "just prose, no fence"].join("\n");
      expect(() => processFile("docs/guide/x.md", md)).toThrow(/must sit directly above/);
    });

    it("throws when a snippet fails to compile", () => {
      const md = ["<!-- render: system id=x -->", "```krs", "system { not valid (((", "```"].join(
        "\n",
      );
      expect(() => processFile("docs/guide/x.md", md)).toThrow(/failed to compile/);
    });
  });
});
