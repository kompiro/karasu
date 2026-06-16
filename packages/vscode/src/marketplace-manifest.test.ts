import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Guards the VS Code Marketplace publish readiness for Issue #1316:
// discoverability metadata in the manifest, the .vsix file filter, and the
// publish-step secret guard. See docs/acceptance/1316-vscode-marketplace-publish.md
// and TPL-20260510-15 (dev vs packaged mode parity) / TPL-20260520-02 (guard
// must no-op without the secret).

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const manifest = JSON.parse(read("../package.json"));
const vscodeignore = read("../.vscodeignore");
// Active glob lines only — drop comments and blanks so assertions about what is
// (not) ignored don't trip over the explanatory comment block.
const ignorePatterns = vscodeignore
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"));
const releaseWorkflow = read("../../../.github/workflows/vscode-release.yml");
const rootReadme = read("../../../README.md");

describe("Marketplace manifest", () => {
  it("publishes under publisher `karasu-tools` (karasu was taken)", () => {
    expect(manifest.publisher).toBe("karasu-tools");
    // Extension id is `<publisher>.<name>` = karasu-tools.karasu-vscode
    expect(manifest.name).toBe("karasu-vscode");
  });

  it("carries discoverability keywords including the Acceptance search terms", () => {
    expect(manifest.keywords).toEqual(
      expect.arrayContaining(["karasu", "C4", "architecture diagram"]),
    );
  });

  it("declares Visualization alongside Programming Languages", () => {
    expect(manifest.categories).toEqual(
      expect.arrayContaining(["Programming Languages", "Visualization"]),
    );
  });

  it("links repository (with directory), homepage, and bugs", () => {
    expect(manifest.repository?.url).toContain("github.com/kompiro/karasu");
    expect(manifest.repository?.directory).toBe("packages/vscode");
    expect(manifest.homepage).toBeTruthy();
    expect(manifest.bugs?.url).toContain("/issues");
  });

  it("sets a gallery banner and ships an icon", () => {
    expect(manifest.galleryBanner?.color).toBeTruthy();
    expect(manifest.icon).toBe("icon.png");
  });

  it("exposes package/publish scripts that bundle (--no-dependencies)", () => {
    expect(manifest.scripts.package).toContain("vsce package");
    expect(manifest.scripts.package).toContain("--no-dependencies");
    expect(manifest.scripts.publish).toContain("vsce publish");
  });
});

describe(".vscodeignore (packaged/installed parity — TPL-20260510-15)", () => {
  it("excludes source and dev tooling from the .vsix", () => {
    expect(ignorePatterns).toContain("src/**");
    expect(ignorePatterns).toContain("**/*.test.*");
    expect(ignorePatterns).toContain("scripts/**");
  });

  it("does not exclude the runtime bundle, README, or assets", () => {
    // The bundled server/extension and the Marketplace README must ship.
    const ignoresRuntime = ignorePatterns.some((p) =>
      ["out/**", "out", "README.md", "icon.png", "images/**"].includes(p),
    );
    expect(ignoresRuntime).toBe(false);
  });
});

describe("vscode-release workflow (TPL-20260520-02)", () => {
  it("is manual-only (workflow_dispatch, not push)", () => {
    expect(releaseWorkflow).toContain("workflow_dispatch:");
    expect(releaseWorkflow).not.toMatch(/^\s*push:/m);
  });

  it("gates the publish step on the VSCE_PAT secret", () => {
    expect(releaseWorkflow).toContain("can_publish");
    expect(releaseWorkflow).toContain("secrets.VSCE_PAT");
    expect(releaseWorkflow).toMatch(/if:\s*steps\.prereqs\.outputs\.can_publish == 'true'/);
  });

  it("supports a pre-release channel input but defaults to stable", () => {
    expect(releaseWorkflow).toContain("pre_release");
    expect(releaseWorkflow).toContain("--pre-release");
    expect(releaseWorkflow).toMatch(/default:\s*false/);
  });
});

describe("root README cross-link", () => {
  it("links the Marketplace with the install command for the extension id", () => {
    expect(rootReadme).toContain("code --install-extension karasu-tools.karasu-vscode");
    expect(rootReadme).toContain("itemName=karasu-tools.karasu-vscode");
  });
});
