import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLicenseFile, renderNotices } from "./generate-third-party-notices.ts";

describe("readLicenseFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "karasu-notices-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads a plain LICENSE file", () => {
    writeFileSync(join(dir, "LICENSE"), "MIT License\n\nCopyright (c) 2026\n");
    expect(readLicenseFile(dir)).toBe("MIT License\n\nCopyright (c) 2026");
  });

  it("prefers LICENSE over LICENSE.md / COPYING / NOTICE", () => {
    writeFileSync(join(dir, "COPYING"), "copying text");
    writeFileSync(join(dir, "LICENSE.md"), "license md text");
    writeFileSync(join(dir, "NOTICE"), "notice text");
    writeFileSync(join(dir, "LICENSE"), "the canonical license");
    expect(readLicenseFile(dir)).toBe("the canonical license");
  });

  it("falls back to LICENSE.txt / LICENCE / COPYING when there is no plain LICENSE", () => {
    writeFileSync(join(dir, "COPYING"), "gnu copying");
    expect(readLicenseFile(dir)).toBe("gnu copying");
  });

  it("ignores empty license files", () => {
    writeFileSync(join(dir, "LICENSE"), "   \n  ");
    expect(readLicenseFile(dir)).toBeNull();
  });

  it("returns null when the directory has no license file (or does not exist)", () => {
    writeFileSync(join(dir, "index.js"), "module.exports = 1;");
    expect(readLicenseFile(dir)).toBeNull();
    expect(readLicenseFile(join(dir, "does-not-exist"))).toBeNull();
  });
});

describe("renderNotices", () => {
  it("renders a heading, version, license and fenced license text per dependency", () => {
    const md = renderNotices("karasu-vscode", [
      { name: "marked", version: "18.0.2", license: "MIT", licenseText: "MIT License\nblah" },
      { name: "vscode-languageclient", version: "9.0.1", license: "MIT", licenseText: null },
    ]);
    expect(md).toContain("# Third-Party Notices");
    expect(md).toContain("`karasu-vscode`");
    expect(md).toContain("## marked@18.0.2");
    expect(md).toContain("License: MIT");
    expect(md).toContain("```\nMIT License\nblah\n```");
    expect(md).toContain("## vscode-languageclient@9.0.1");
    expect(md).toContain("_No license file was found");
  });

  it("notes when there are no third-party dependencies", () => {
    expect(renderNotices("karasu", [])).toContain("_No third-party production dependencies._");
  });
});
