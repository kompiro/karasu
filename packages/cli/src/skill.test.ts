import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { skillInstall, skillPath } from "./skill.js";

// `karasu skill install|path` (#2912). The default source is the real
// `karasu-skills` workspace package, so these also catch a broken dependency.

const SKILLS_DIR = fileURLToPath(new URL("../../skills/skills", import.meta.url));

describe("karasu skill path", () => {
  it("resolves the skills directory of the karasu-skills package", () => {
    expect(skillPath(undefined)).toBe(SKILLS_DIR);
  });

  it("resolves one skill by name", () => {
    expect(skillPath("karasu-author")).toBe(join(SKILLS_DIR, "karasu-author"));
    expect(existsSync(join(skillPath("reverse-architecture"), "SKILL.md"))).toBe(true);
  });

  it("rejects an unknown name and lists the ones that exist", () => {
    expect(() => skillPath("nope")).toThrow(
      "unknown skill 'nope'. Available: karasu-author, reverse-architecture",
    );
  });
});

describe("karasu skill install", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "karasu-skill-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("copies one skill with its bundled reference into <dir>/<name>/", () => {
    const written = skillInstall("karasu-author", { dir });
    expect(written).toEqual([join(dir, "karasu-author")]);
    expect(readFileSync(join(dir, "karasu-author", "SKILL.md"), "utf8")).toBe(
      readFileSync(join(SKILLS_DIR, "karasu-author", "SKILL.md"), "utf8"),
    );
    expect(existsSync(join(dir, "karasu-author", "reference", "syntax.md"))).toBe(true);
    expect(existsSync(join(dir, "reverse-architecture"))).toBe(false);
  });

  it("copies every skill when no name is given", () => {
    skillInstall(undefined, { dir });
    expect(existsSync(join(dir, "karasu-author", "SKILL.md"))).toBe(true);
    expect(existsSync(join(dir, "reverse-architecture", "SKILL.md"))).toBe(true);
  });

  it("defaults to .claude/skills under the working directory", () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      skillInstall("karasu-author");
    } finally {
      process.chdir(cwd);
    }
    expect(existsSync(join(dir, ".claude", "skills", "karasu-author", "SKILL.md"))).toBe(true);
  });

  it("refuses to overwrite an installed skill, and copies nothing", () => {
    mkdirSync(join(dir, "reverse-architecture"));
    expect(() => skillInstall(undefined, { dir })).toThrow(/already installed: .*--force/);
    expect(existsSync(join(dir, "karasu-author"))).toBe(false);
  });

  it("replaces an installed skill with --force, dropping stale files", () => {
    mkdirSync(join(dir, "karasu-author"));
    writeFileSync(join(dir, "karasu-author", "stale.md"), "old");
    skillInstall("karasu-author", { dir, force: true });
    expect(existsSync(join(dir, "karasu-author", "stale.md"))).toBe(false);
    expect(existsSync(join(dir, "karasu-author", "SKILL.md"))).toBe(true);
  });

  it.skipIf(process.getuid?.() === 0)(
    "keeps the installed skill when the --force copy fails part way",
    () => {
      const root = mkdtempSync(join(tmpdir(), "karasu-skill-src-"));
      try {
        mkdirSync(join(root, "demo"));
        writeFileSync(join(root, "demo", "SKILL.md"), "new");
        writeFileSync(join(root, "demo", "unreadable.md"), "x");
        chmodSync(join(root, "demo", "unreadable.md"), 0o000);
        mkdirSync(join(dir, "demo"));
        writeFileSync(join(dir, "demo", "SKILL.md"), "old");

        expect(() => skillInstall("demo", { dir, root, force: true })).toThrow(/EACCES/);
        expect(readFileSync(join(dir, "demo", "SKILL.md"), "utf8")).toBe("old");
        expect(readdirSync(dir)).toEqual(["demo"]);
      } finally {
        chmodSync(join(root, "demo", "unreadable.md"), 0o644);
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it("rejects an unknown name before writing anything", () => {
    expect(() => skillInstall("nope", { dir })).toThrow("unknown skill 'nope'");
    expect(existsSync(join(dir, "nope"))).toBe(false);
  });
});
