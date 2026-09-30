import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stageViewer } from "./stage-viewer.ts";

function fakeBuild(): string {
  const dir = mkdtempSync(join(tmpdir(), "viewer-build-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets/viewer-abc.js"), "js");
  writeFileSync(join(dir, "viewer.html"), "<html></html>");
  writeFileSync(join(dir, "favicon.svg"), "<svg/>");
  return dir;
}

describe("stageViewer (#2998)", () => {
  it("stages the bundle, the template and _headers, and nothing else", () => {
    const out = join(mkdtempSync(join(tmpdir(), "viewer-staged-")), "viewer-assets");
    stageViewer(fakeBuild(), out);
    expect(readdirSync(out).sort()).toEqual(["_headers", "assets", "viewer.html"]);
    expect(readdirSync(join(out, "assets"))).toEqual(["viewer-abc.js"]);
  });

  it("gives the assets CORS, because the page that loads them has no origin", () => {
    const out = join(mkdtempSync(join(tmpdir(), "viewer-staged-")), "viewer-assets");
    stageViewer(fakeBuild(), out);
    const headers = readFileSync(join(out, "_headers"), "utf8");
    expect(headers).toMatch(/^\/assets\/\*\n {2}Access-Control-Allow-Origin: \*\n/);
  });

  it("refuses to stage when the viewer has not been built", () => {
    const empty = mkdtempSync(join(tmpdir(), "viewer-none-"));
    expect(() => stageViewer(empty, join(empty, "out"))).toThrow(/build:viewer/);
  });
});
