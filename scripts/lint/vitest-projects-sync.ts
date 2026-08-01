/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
/**
 * Guards the root `vitest.config.ts` project list against the two silent
 * failure modes we have already hit:
 *
 * 1. A config file that no longer participates. Vitest 4 dropped support for a
 *    standalone `vitest.workspace.ts`, so the file added in #675 to keep test
 *    discovery out of `.claude/worktrees/` stopped being read — a bare `vitest`
 *    at the repo root silently went back to the default glob.
 * 2. A package with a vitest suite but no config of its own. Running `vitest`
 *    inside such a package walks up to the root config and resolves its
 *    `projects` entries against the package directory, producing
 *    "Projects definition references a non-existing file or a directory".
 *    Pinning `root: __dirname` in every referenced config keeps a config's
 *    meaning independent of the cwd it is loaded from.
 *
 * The checks are text/filesystem based on purpose: importing the package
 * configs would execute their plugin graphs, which is both slow and a source
 * of unrelated failures.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const ROOT_CONFIG = "vitest.config.ts";

/** Runners other than vitest own these; they must not appear in `projects`. */
const NON_VITEST_PACKAGES = new Set(["e2e", "vscode-e2e"]);

export type Problems = {
  /** `vitest.workspace.*` is present but inert under Vitest 4. */
  staleWorkspaceFiles: string[];
  /** Packages with `*.test.ts` files but no `vitest.config.ts` of their own. */
  packagesWithoutConfig: string[];
  /** Package configs that exist but are absent from the root `projects` list. */
  missingFromProjects: string[];
  /** `projects` entries pointing at a path that does not exist. */
  danglingProjects: string[];
  /** Referenced configs that do not pin `root`, so their meaning follows cwd. */
  configsWithoutPinnedRoot: string[];
};

function walk(dir: string, onFile: (path: string) => void): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, onFile);
    else onFile(path);
  }
}

function hasVitestSuite(packageDir: string): boolean {
  let found = false;
  walk(packageDir, (path) => {
    if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) found = true;
  });
  return found;
}

/**
 * Reads the string literals of the root config's `projects` array. Parsing the
 * text rather than importing keeps this usable on the fixture directories the
 * unit tests build.
 */
export function parseProjects(configText: string): string[] {
  const array = /projects\s*:\s*\[([^\]]*)\]/s.exec(configText);
  if (!array) throw new Error(`${ROOT_CONFIG} has no \`test.projects\` array`);
  return [...array[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
}

export function check(repoRoot: string): Problems {
  const problems: Problems = {
    staleWorkspaceFiles: [],
    packagesWithoutConfig: [],
    missingFromProjects: [],
    danglingProjects: [],
    configsWithoutPinnedRoot: [],
  };

  for (const name of readdirSync(repoRoot)) {
    if (/^vitest\.workspace\.(ts|js|mjs|mts|json)$/.test(name)) {
      problems.staleWorkspaceFiles.push(name);
    }
  }

  const rootConfigPath = join(repoRoot, ROOT_CONFIG);
  if (!existsSync(rootConfigPath)) {
    throw new Error(`${ROOT_CONFIG} is missing — worktrees would be discovered again`);
  }
  const projects = parseProjects(readFileSync(rootConfigPath, "utf8"));

  for (const entry of projects) {
    const path = join(repoRoot, entry);
    if (!existsSync(path)) {
      problems.danglingProjects.push(entry);
      continue;
    }
    if (statSync(path).isDirectory()) {
      // A directory entry means the package has no config of its own, which is
      // exactly the cwd-dependent setup this guard exists to prevent.
      problems.configsWithoutPinnedRoot.push(entry);
      continue;
    }
    if (!/\broot\s*:/.test(readFileSync(path, "utf8"))) {
      problems.configsWithoutPinnedRoot.push(entry);
    }
  }

  const listed = new Set(projects);
  const packagesDir = join(repoRoot, "packages");
  if (!existsSync(packagesDir)) return problems;

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || NON_VITEST_PACKAGES.has(entry.name)) continue;
    const packageDir = join(packagesDir, entry.name);
    const configPath = join(packageDir, "vitest.config.ts");
    if (!existsSync(configPath)) {
      if (hasVitestSuite(packageDir)) {
        problems.packagesWithoutConfig.push(relative(repoRoot, packageDir));
      }
      continue;
    }
    const rel = relative(repoRoot, configPath);
    if (!listed.has(rel)) problems.missingFromProjects.push(rel);
  }

  return problems;
}

export function formatProblems(problems: Problems): string[] {
  const lines: string[] = [];
  for (const file of problems.staleWorkspaceFiles) {
    lines.push(
      `${file}: inert under Vitest 4 — move its list into ${ROOT_CONFIG} \`test.projects\``,
    );
  }
  for (const dir of problems.packagesWithoutConfig) {
    lines.push(`${dir}: has *.test.ts but no vitest.config.ts — it will inherit the root config`);
  }
  for (const entry of problems.missingFromProjects) {
    lines.push(`${entry}: not listed in ${ROOT_CONFIG} \`test.projects\``);
  }
  for (const entry of problems.danglingProjects) {
    lines.push(`${entry}: listed in \`test.projects\` but does not exist`);
  }
  for (const entry of problems.configsWithoutPinnedRoot) {
    lines.push(`${entry}: must be a config file pinning \`root: __dirname\``);
  }
  return lines;
}

function main(): void {
  // `pnpm run` sets the cwd to the repo root, matching the sibling lint scripts.
  const messages = formatProblems(check(process.cwd()));
  if (messages.length === 0) {
    console.log("✓ vitest projects are in sync");
    return;
  }
  for (const message of messages) console.error(`✗ ${message}`);
  console.error(
    `\nEvery package with a vitest suite owns a vitest.config.ts that pins ` +
      `\`root: __dirname\`, and every one of them is listed in ${ROOT_CONFIG} ` +
      `\`test.projects\`. Otherwise a root run silently drops a package, or a ` +
      `package run resolves the root project list against its own directory.`,
  );
  process.exit(1);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /vitest-projects-sync\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
