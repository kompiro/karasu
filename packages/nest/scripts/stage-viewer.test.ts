import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OG_FONT_FILES } from "../src/gallery/og-image.ts";
import { stageViewer } from "./stage-viewer.ts";

function fakeBuild(): string {
  const dir = mkdtempSync(join(tmpdir(), "viewer-build-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets/viewer-abc.js"), "js");
  writeFileSync(join(dir, "viewer.html"), "<html></html>");
  writeFileSync(join(dir, "favicon.svg"), "<svg/>");
  return dir;
}

function fakeFonts(files: readonly string[] = OG_FONT_FILES): string {
  const dir = mkdtempSync(join(tmpdir(), "og-fonts-"));
  for (const file of files) writeFileSync(join(dir, file), "font");
  writeFileSync(join(dir, "OFL.txt"), "licence");
  return dir;
}

describe("stageViewer (#2998)", () => {
  it("stages the bundle, the template, _headers and the OGP fonts, and nothing else", () => {
    const out = join(mkdtempSync(join(tmpdir(), "viewer-staged-")), "viewer-assets");
    stageViewer(fakeBuild(), out, fakeFonts());
    expect(readdirSync(out).sort()).toEqual(["_headers", "assets", "og-fonts", "viewer.html"]);
    expect(readdirSync(join(out, "assets"))).toEqual(["viewer-abc.js"]);
    expect(readdirSync(join(out, "og-fonts")).sort()).toEqual([...OG_FONT_FILES].sort());
  });

  it("refuses to stage when an OGP font is missing (#2995)", () => {
    const out = join(mkdtempSync(join(tmpdir(), "viewer-staged-")), "viewer-assets");
    expect(() => stageViewer(fakeBuild(), out, fakeFonts(OG_FONT_FILES.slice(1)))).toThrow(
      /No OGP font/,
    );
  });

  it("stages from the app's real fonts directory by default", () => {
    const out = join(mkdtempSync(join(tmpdir(), "viewer-staged-")), "viewer-assets");
    stageViewer(fakeBuild(), out);
    expect(readdirSync(join(out, "og-fonts")).sort()).toEqual([...OG_FONT_FILES].sort());
  });

  it("gives the assets CORS, because the page that loads them has no origin", () => {
    const out = join(mkdtempSync(join(tmpdir(), "viewer-staged-")), "viewer-assets");
    stageViewer(fakeBuild(), out, fakeFonts());
    const headers = readFileSync(join(out, "_headers"), "utf8");
    expect(headers).toMatch(/^\/assets\/\*\n {2}Access-Control-Allow-Origin: \*\n/);
  });

  it("refuses to stage when the viewer has not been built", () => {
    const empty = mkdtempSync(join(tmpdir(), "viewer-none-"));
    expect(() => stageViewer(empty, join(empty, "out"))).toThrow(/build:viewer/);
  });

  it("stages exactly the fonts the app's /render loads (TPL-1799)", () => {
    // `png-font-coverage.test.ts` proves that set covers every glyph the
    // renderer emits. Holding this list equal to it is what lets the gallery's
    // image rely on that proof instead of needing its own.
    const render = readFileSync(
      resolve(import.meta.dirname, "../../../functions/render.ts"),
      "utf8",
    );
    const loaded = [...render.matchAll(/"\/fonts\/([^"]+)"/g)].map((match) => match[1]);
    expect(loaded.length).toBeGreaterThan(0);
    expect([...OG_FONT_FILES].sort()).toEqual(loaded.sort());
  });
});
