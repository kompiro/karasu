import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

// Guards the npm publish surface of `karasu-skills` (Issue #2932, TPL-1681).
//
// The package is a Claude Code plugin shipped through npm: the marketplace entry
// in `.claude-plugin/marketplace.json` installs it, and every SKILL.md carries a
// Step 0 that compares `karasu --version` with the CLI version stamped at pack
// time. These tests pack the real package and read the tarball, so they catch
// what reading package.json cannot: a skill without its placeholder, a stamp
// that did not happen, a reference file left out, or a pack that leaves the
// working tree modified (TPL-1024: the repo copy and the packed copy must differ
// only by the stamp).

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const PACKAGE_DIR = join(REPO_ROOT, "packages/skills");
const PLACEHOLDER = "{{KARASU_MIN_VERSION}}";

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

const cliVersion = readJson(join(REPO_ROOT, "packages/cli/package.json")).version as string;
const pkg = readJson(join(PACKAGE_DIR, "package.json"));
const sourceSkills = readdirSync(join(PACKAGE_DIR, "skills")).sort();

describe("karasu-skills packed tarball", () => {
  const work = mkdtempSync(join(tmpdir(), "karasu-skills-pack-"));
  const extracted = join(work, "x");
  let before: string;

  beforeAll(() => {
    before = execFileSync("git", ["status", "--porcelain", "--", "packages/skills"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    execFileSync("pnpm", ["pack", "--pack-destination", work], { cwd: PACKAGE_DIR, stdio: "pipe" });
    const tarball = readdirSync(work).find((name) => name.endsWith(".tgz"));
    if (!tarball) throw new Error("pnpm pack produced no tarball");
    execFileSync("mkdir", ["-p", extracted]);
    execFileSync("tar", ["-xzf", join(work, tarball), "-C", extracted]);
  }, 60_000);

  afterAll(() => rmSync(work, { recursive: true, force: true }));

  const packaged = () => join(extracted, "package");

  it("ships the plugin manifest and every source file of every skill", () => {
    const shipped = filesUnder(join(packaged(), "skills"));
    expect(shipped).toEqual(filesUnder(join(PACKAGE_DIR, "skills")));
    expect(existsSync(join(packaged(), ".claude-plugin", "plugin.json"))).toBe(true);
  });

  it("does not ship the stamping script or its backup", () => {
    expect(existsSync(join(packaged(), "scripts"))).toBe(false);
    expect(existsSync(join(packaged(), ".stamp-backup"))).toBe(false);
  });

  it.each(sourceSkills)("stamps %s with the CLI version in metadata and in Step 0", (skill) => {
    const text = readFileSync(join(packaged(), "skills", skill, "SKILL.md"), "utf8");
    expect(text).not.toContain(PLACEHOLDER);
    expect(text).toContain(`karasu-version: "${cliVersion}"`);
    expect(text).toContain(`written for karasu\n   \`${cliVersion}\` or later`);
  });

  it("leaves the working tree as it found it", () => {
    const after = execFileSync("git", ["status", "--porcelain", "--", "packages/skills"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(after).toBe(before);
    expect(existsSync(join(PACKAGE_DIR, ".stamp-backup"))).toBe(false);
  });
});

describe("karasu-skills sources", () => {
  it.each(sourceSkills)(
    "%s keeps the placeholder and puts Step 0 before any other section",
    (skill) => {
      const text = readFileSync(join(PACKAGE_DIR, "skills", skill, "SKILL.md"), "utf8");
      expect(text).toContain(`karasu-version: "${PLACEHOLDER}"`);
      const sections = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
      expect(sections[0]).toBe("Step 0: Check the karasu CLI");
    },
  );

  it("keeps the dev symlink pointing at the packaged reverse-architecture", () => {
    const link = join(REPO_ROOT, ".claude/skills/reverse-architecture/SKILL.md");
    expect(readFileSync(link, "utf8")).toBe(
      readFileSync(join(PACKAGE_DIR, "skills/reverse-architecture/SKILL.md"), "utf8"),
    );
  });
});

describe("plugin and marketplace manifests", () => {
  const plugin = readJson(join(PACKAGE_DIR, ".claude-plugin/plugin.json"));
  const marketplace = readJson(join(REPO_ROOT, ".claude-plugin/marketplace.json")) as {
    name: string;
    plugins: { name: string; source: { source: string; package: string; version?: string } }[];
  };

  it("publishes only the plugin layout", () => {
    expect(pkg.name).toBe("karasu-skills");
    expect(pkg.files).toEqual([".claude-plugin", "skills"]);
  });

  it("lets the marketplace entry install this package", () => {
    const entry = marketplace.plugins.find((p) => p.name === plugin.name);
    expect(entry?.source).toEqual({ source: "npm", package: pkg.name });
  });

  it("tracks the latest release: neither manifest pins a version that could drift", () => {
    expect(plugin.version).toBeUndefined();
    for (const entry of marketplace.plugins) expect(entry.source.version).toBeUndefined();
  });

  it("installs as karasu@karasu", () => {
    expect(`${plugin.name}@${marketplace.name}`).toBe("karasu@karasu");
  });
});
