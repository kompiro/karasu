import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stageWebview } from "./stage-webview.ts";

function fakeBuild(): string {
  const dir = mkdtempSync(join(tmpdir(), "webview-build-"));
  writeFileSync(join(dir, "viewer.js"), "js");
  writeFileSync(join(dir, "viewer.css"), "css");
  return dir;
}

describe("stageWebview (#3312)", () => {
  it("copies the webview bundle into the staged directory", () => {
    const out = join(mkdtempSync(join(tmpdir(), "vscode-out-")), "webview");
    stageWebview(fakeBuild(), out);
    expect(readdirSync(out).sort()).toEqual(["viewer.css", "viewer.js"]);
  });

  it("drops what an earlier staging left behind (TPL-1681)", () => {
    const out = join(mkdtempSync(join(tmpdir(), "vscode-out-")), "webview");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "viewer-old.js"), "stale");
    stageWebview(fakeBuild(), out);
    expect(readdirSync(out).sort()).toEqual(["viewer.css", "viewer.js"]);
  });

  it.each(["viewer.js", "viewer.css"])("refuses to stage when the build has no %s", (missing) => {
    const build = fakeBuild();
    const other = missing === "viewer.js" ? "viewer.css" : "viewer.js";
    const partial = mkdtempSync(join(tmpdir(), "webview-partial-"));
    writeFileSync(join(partial, other), "x");
    expect(() => stageWebview(partial, join(build, "out"))).toThrow(/build:vscode-webview/);
  });
});
