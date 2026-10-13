import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bundledWorkspaceDirs,
  readLicenseFile,
  readUpstreamNoticesFile,
  renderNotices,
} from "./generate-third-party-notices.ts";

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

describe("readUpstreamNoticesFile (#3017)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "karasu-notices-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads a package's own ThirdPartyNotices.txt (monaco-editor's form)", () => {
    writeFileSync(join(dir, "LICENSE"), "MIT");
    writeFileSync(join(dir, "ThirdPartyNotices.txt"), "bundled: vscode-css-languageservice\n");
    expect(readUpstreamNoticesFile(dir)).toBe("bundled: vscode-css-languageservice");
    // It stays apart from the license text, which keeps preferring LICENSE.
    expect(readLicenseFile(dir)).toBe("MIT");
  });

  it("also matches THIRD_PARTY_NOTICES.md", () => {
    writeFileSync(join(dir, "THIRD_PARTY_NOTICES.md"), "notices");
    expect(readUpstreamNoticesFile(dir)).toBe("notices");
  });

  it("returns null when the package has none", () => {
    writeFileSync(join(dir, "LICENSE"), "MIT");
    expect(readUpstreamNoticesFile(dir)).toBeNull();
  });
});

describe("bundledWorkspaceDirs (#3137, TPL-3137)", () => {
  let root: string;

  /** A workspace package at `root/<name>`, linked into the packages that depend on it. */
  function writePackage(
    name: string,
    manifest: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
  ): void {
    const dir = join(root, name);
    mkdirSync(join(dir, "node_modules"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name, ...manifest }));
    const workspaceDeps = Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })
      .filter(([, spec]) => spec.startsWith("workspace:"))
      .map(([dep]) => dep);
    for (const dep of workspaceDeps) {
      symlinkSync(join(root, dep), join(dir, "node_modules", dep), "dir");
    }
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "karasu-workspace-")));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("follows the package's devDependencies, which it bundles through an alias", () => {
    writePackage("cli", {
      dependencies: { commander: "^15.0.0" },
      devDependencies: { core: "workspace:*" },
    });
    writePackage("core", { dependencies: { "smol-toml": "^1.9.0" } });
    expect(bundledWorkspaceDirs(join(root, "cli")).sort()).toEqual(
      [join(root, "cli"), join(root, "core")].sort(),
    );
  });

  it("follows only the dependencies of a reached workspace package", () => {
    writePackage("vscode", { dependencies: { lsp: "workspace:*" } });
    writePackage("lsp", {
      dependencies: { core: "workspace:*" },
      devDependencies: { testkit: "workspace:*" },
    });
    writePackage("core", {});
    writePackage("testkit", {});
    expect(bundledWorkspaceDirs(join(root, "vscode")).sort()).toEqual(
      [join(root, "vscode"), join(root, "lsp"), join(root, "core")].sort(),
    );
  });

  it("stops at a cycle", () => {
    writePackage("app", { dependencies: { core: "workspace:*" } });
    writePackage("core", { dependencies: { i18n: "workspace:*" } });
    writePackage("i18n", { dependencies: { core: "workspace:*" } });
    expect(bundledWorkspaceDirs(join(root, "app")).sort()).toEqual(
      [join(root, "app"), join(root, "core"), join(root, "i18n")].sort(),
    );
  });

  it("fails when a workspace dependency is not linked, instead of dropping its notices", () => {
    writePackage("cli", {});
    writeFileSync(
      join(root, "cli", "package.json"),
      JSON.stringify({ name: "cli", devDependencies: { core: "workspace:*" } }),
    );
    expect(() => bundledWorkspaceDirs(join(root, "cli"))).toThrow(/core is a workspace dependency/);
  });

  it("reaches core and i18n from the CLI, and never the workspace root", () => {
    const packages = resolve(import.meta.dirname, "../../packages");
    const dirs = bundledWorkspaceDirs(join(packages, "cli"));
    expect(dirs).toContain(realpathSync(join(packages, "core")));
    expect(dirs).toContain(realpathSync(join(packages, "i18n")));
    expect(dirs).not.toContain(realpathSync(resolve(packages, "..")));
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

  it("appends a dependency's own third-party notices after its license", () => {
    const md = renderNotices("@karasu-tools/app", [
      {
        name: "monaco-editor",
        version: "0.56.0",
        license: "MIT",
        licenseText: "MIT License",
        upstreamNotices: "THIRD-PARTY SOFTWARE NOTICES",
      },
    ]);
    expect(md).toContain(
      "```\nMIT License\n```\n\nThird-party notices of `monaco-editor` itself:\n\n```\nTHIRD-PARTY SOFTWARE NOTICES\n```",
    );
  });

  it("notes when there are no third-party dependencies", () => {
    expect(renderNotices("karasu", [])).toContain("_No third-party production dependencies._");
  });
});
