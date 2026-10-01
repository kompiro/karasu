import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

/**
 * `karasu skill` (Issue #2912): hand the agent skills from the `karasu-skills`
 * package to agents that cannot install a Claude Code plugin. The skills ship
 * as a runtime dependency of the CLI, so the copy matches the CLI it came with.
 */

/** The `skills/` directory of the installed `karasu-skills` package. */
function skillsRoot(): string {
  const pkgJson = createRequire(import.meta.url).resolve("karasu-skills/package.json");
  return join(dirname(pkgJson), "skills");
}

/** Names of the skills in `root`: every directory holding a `SKILL.md`. */
function listSkills(root: string = skillsRoot()): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, e.name, "SKILL.md")))
    .map((e) => e.name)
    .sort();
}

function requireSkill(name: string, root: string): string {
  const available = listSkills(root);
  if (!available.includes(name)) {
    throw new Error(`unknown skill '${name}'. Available: ${available.join(", ")}`);
  }
  return join(root, name);
}

export interface SkillInstallOptions {
  /** Directory the skills are copied into (default: `.claude/skills`). */
  dir?: string;
  /** Replace a skill that is already installed. */
  force?: boolean;
  /** Where the skills come from (default: the `karasu-skills` package). */
  root?: string;
}

/** The default install directory: where Claude Code reads project skills. */
export const DEFAULT_SKILL_DIR = ".claude/skills";

/**
 * Copy one skill, or every skill when `name` is omitted, into `<dir>/<name>/`.
 * Checks every target before copying anything, so a refusal leaves `dir` as it was.
 * Returns the directories written.
 */
export function skillInstall(
  name: string | undefined,
  options: SkillInstallOptions = {},
): string[] {
  const root = options.root ?? skillsRoot();
  const names = name === undefined ? listSkills(root) : [name];
  const sources = names.map((n) => requireSkill(n, root));
  const dir = resolve(options.dir ?? DEFAULT_SKILL_DIR);
  const targets = names.map((n) => join(dir, n));
  if (!options.force) {
    const existing = targets.filter((t) => existsSync(t));
    if (existing.length > 0) {
      throw new Error(
        `already installed: ${existing.join(", ")}. Re-run with --force to replace it.`,
      );
    }
  }
  targets.forEach((target, i) => {
    // Remove first so files the new version dropped do not linger.
    rmSync(target, { recursive: true, force: true });
    cpSync(sources[i], target, { recursive: true });
  });
  return targets;
}

/** The absolute path of one skill, or of the directory holding them all. */
export function skillPath(name: string | undefined, root: string = skillsRoot()): string {
  return name === undefined ? root : requireSkill(name, root);
}
