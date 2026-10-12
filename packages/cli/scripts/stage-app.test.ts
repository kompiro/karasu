import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stageApp } from "./stage-app.ts";

function fakeBuild(): string {
  const dir = mkdtempSync(join(tmpdir(), "serve-build-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets/index-abc.js"), "js");
  writeFileSync(join(dir, "index.html"), "<div id=root></div>");
  writeFileSync(join(dir, "favicon.svg"), "<svg/>");
  return dir;
}

describe("stageApp (#3017)", () => {
  it("copies the serve build into the staged directory", () => {
    const out = join(mkdtempSync(join(tmpdir(), "cli-dist-")), "app");
    stageApp(fakeBuild(), out);
    expect(readdirSync(out).sort()).toEqual(["assets", "favicon.svg", "index.html"]);
    expect(readdirSync(join(out, "assets"))).toEqual(["index-abc.js"]);
  });

  it("drops what an earlier staging left behind (TPL-1681)", () => {
    const out = join(mkdtempSync(join(tmpdir(), "cli-dist-")), "app");
    mkdirSync(join(out, "assets"), { recursive: true });
    writeFileSync(join(out, "assets/index-old.js"), "stale");
    writeFileSync(join(out, "index.js.map"), "stale");
    stageApp(fakeBuild(), out);
    expect(readdirSync(out).sort()).toEqual(["assets", "favicon.svg", "index.html"]);
    expect(readdirSync(join(out, "assets"))).toEqual(["index-abc.js"]);
  });

  it("refuses to stage when the serve build is missing", () => {
    const empty = mkdtempSync(join(tmpdir(), "serve-none-"));
    expect(() => stageApp(empty, join(empty, "out"))).toThrow(/build:serve/);
  });
});
