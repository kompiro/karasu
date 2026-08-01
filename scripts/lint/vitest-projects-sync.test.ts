import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { check, formatProblems, parseProjects, ROOT_CONFIG } from "./vitest-projects-sync.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vitest-projects-sync-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeRootConfig(projects: string[]): void {
  writeFileSync(
    join(tmp, ROOT_CONFIG),
    `export default defineConfig({ test: { projects: [${projects.map((p) => `"${p}"`).join(", ")}] } });`,
  );
}

function writePackage(
  name: string,
  options: { config?: "pinned" | "unpinned" | "none"; tests?: boolean } = {},
): void {
  const { config = "pinned", tests = true } = options;
  const dir = join(tmp, "packages", name, "src");
  mkdirSync(dir, { recursive: true });
  if (tests) writeFileSync(join(dir, "thing.test.ts"), "");
  if (config === "none") return;
  writeFileSync(
    join(tmp, "packages", name, "vitest.config.ts"),
    config === "pinned"
      ? `export default defineConfig({ root: __dirname, test: {} });`
      : `export default defineConfig({ test: {} });`,
  );
}

const CLEAN = {
  staleWorkspaceFiles: [],
  packagesWithoutConfig: [],
  missingFromProjects: [],
  danglingProjects: [],
  configsWithoutPinnedRoot: [],
};

describe("check", () => {
  it("passes when every package has a pinned config that is listed", () => {
    writePackage("core");
    writeRootConfig(["packages/core/vitest.config.ts"]);
    expect(check(tmp)).toEqual(CLEAN);
  });

  it("flags a package with tests but no config of its own", () => {
    // The i18n failure mode: `vitest run` in the package walks up to the root
    // config and resolves `projects` against the package directory.
    writePackage("i18n", { config: "none" });
    writeRootConfig([]);
    expect(check(tmp).packagesWithoutConfig).toEqual([join("packages", "i18n")]);
  });

  it("ignores a package that has no vitest suite at all", () => {
    writePackage("assets", { config: "none", tests: false });
    writeRootConfig([]);
    expect(check(tmp).packagesWithoutConfig).toEqual([]);
  });

  it("ignores packages owned by other runners", () => {
    writePackage("e2e", { config: "none" });
    writePackage("vscode-e2e", { config: "none" });
    writeRootConfig([]);
    expect(check(tmp).packagesWithoutConfig).toEqual([]);
  });

  it("flags a config that exists but is absent from the projects list", () => {
    // The regression that would silently drop a package from root runs.
    writePackage("core");
    writePackage("lsp");
    writeRootConfig(["packages/core/vitest.config.ts"]);
    expect(check(tmp).missingFromProjects).toEqual([join("packages", "lsp", "vitest.config.ts")]);
  });

  it("flags a projects entry pointing at a path that does not exist", () => {
    writeRootConfig(["packages/gone/vitest.config.ts"]);
    expect(check(tmp).danglingProjects).toEqual(["packages/gone/vitest.config.ts"]);
  });

  it("flags a listed config that does not pin root", () => {
    writePackage("docs-site", { config: "unpinned" });
    writeRootConfig(["packages/docs-site/vitest.config.ts"]);
    expect(check(tmp).configsWithoutPinnedRoot).toEqual(["packages/docs-site/vitest.config.ts"]);
  });

  it("flags a directory entry, which means the package owns no config", () => {
    writePackage("i18n", { config: "none" });
    writeRootConfig(["packages/i18n"]);
    expect(check(tmp).configsWithoutPinnedRoot).toEqual(["packages/i18n"]);
  });

  it("flags a leftover vitest.workspace.ts, which Vitest 4 ignores", () => {
    writeFileSync(join(tmp, "vitest.workspace.ts"), "export default {};");
    writeRootConfig([]);
    expect(check(tmp).staleWorkspaceFiles).toEqual(["vitest.workspace.ts"]);
  });

  it("throws when the root config is missing — worktrees would be discovered again", () => {
    expect(() => check(tmp)).toThrow(/vitest\.config\.ts is missing/);
  });

  it("throws when the root config declares no projects array", () => {
    writeFileSync(join(tmp, ROOT_CONFIG), `export default defineConfig({ test: {} });`);
    expect(() => check(tmp)).toThrow(/no `test\.projects` array/);
  });

  it("names the offending file in every message", () => {
    writePackage("i18n", { config: "none" });
    writeFileSync(join(tmp, "vitest.workspace.ts"), "export default {};");
    writeRootConfig(["packages/gone/vitest.config.ts"]);
    const lines = formatProblems(check(tmp));
    expect(lines).toHaveLength(3);
    expect(lines.join("\n")).toContain("packages/gone/vitest.config.ts");
  });
});

describe("parseProjects", () => {
  it("reads entries across multiple lines and ignores comments", () => {
    expect(
      parseProjects(`export default defineConfig({
        test: {
          projects: [
            // a comment mentioning nothing
            "packages/core/vitest.config.ts",
            "scripts/vitest.config.ts",
          ],
        },
      });`),
    ).toEqual(["packages/core/vitest.config.ts", "scripts/vitest.config.ts"]);
  });
});

describe("the real repo", () => {
  it("keeps every vitest package listed in the root projects array", () => {
    expect(formatProblems(check(REPO_ROOT))).toEqual([]);
  });
});
