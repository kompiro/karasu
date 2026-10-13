#!/usr/bin/env tsx
// Generate `THIRD_PARTY_NOTICES.md` for one or more publishable packages, listing
// every production dependency with its version, SPDX license, and the full text of
// its LICENSE file. MIT and Apache-2.0 both require redistributing the upstream
// LICENSE text when their code ships in our artifacts (most relevant for
// `packages/vscode`, whose deps are esbuild-bundled into the `.vsix`).
//
// Usage: tsx scripts/ci/generate-third-party-notices.ts <packageDir> [<packageDir> ...]
//        tsx scripts/ci/generate-third-party-notices.ts <packageDir> --out <file>
// Wired into each publishable package's `build` script; the output is git-ignored.
// `--out` writes one package's notices somewhere other than its own directory:
// the CLI uses it for the preview app it ships in `dist/app/` (#3017).
//
// A bundle also carries the workspace packages it bundles (core, i18n, lsp)
// and, with them, their dependencies. `pnpm licenses list` stops at
// `workspace:` links, so the generator walks them itself and lists every
// reached package (#3137, TPL-3137).
//
// See ADR-1320 and TPL-3137.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { PnpmLicensesList } from "./license-allowlist.ts";

export interface DependencyNotice {
  name: string;
  version: string;
  license: string;
  /** Full LICENSE file text, or `null` if no license file was found in the package. */
  licenseText: string | null;
  /**
   * The package's own third-party notices (e.g. `monaco-editor`'s
   * `ThirdPartyNotices.txt`), for code it bundles from others. Shipping the
   * package's bundle ships that code too, so its notices travel with it (#3017).
   */
  upstreamNotices?: string | null;
}

const LICENSE_FILE_PATTERN = /^(LICEN[CS]E|COPYING|NOTICE)(\.\w+)?$/i;

/** Find and read the upstream LICENSE-like file in a package directory, if any. */
export function readLicenseFile(packagePath: string): string | null {
  let entries: string[];
  try {
    entries = readdirSync(packagePath);
  } catch {
    return null;
  }
  // Prefer a plain "LICENSE" over "LICENSE.md" / "COPYING" / "NOTICE" for stable output.
  const matches = entries
    .filter((name) => LICENSE_FILE_PATTERN.test(name))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  for (const name of matches) {
    try {
      const text = readFileSync(join(packagePath, name), "utf8").trim();
      if (text.length > 0) return text;
    } catch {
      // unreadable — try the next candidate
    }
  }
  return null;
}

const UPSTREAM_NOTICES_PATTERN = /^third[-_]?party[-_]?notices(\.\w+)?$/i;

/** Read the package's own third-party notices file (`ThirdPartyNotices.txt` etc.), if any. */
export function readUpstreamNoticesFile(packagePath: string): string | null {
  let entries: string[];
  try {
    entries = readdirSync(packagePath);
  } catch {
    return null;
  }
  for (const name of entries.filter((entry) => UPSTREAM_NOTICES_PATTERN.test(entry)).sort()) {
    try {
      const text = readFileSync(join(packagePath, name), "utf8").trim();
      if (text.length > 0) return text;
    } catch {
      // unreadable — try the next candidate
    }
  }
  return null;
}

function rank(fileName: string): number {
  const lower = fileName.toLowerCase();
  if (lower === "license") return 0;
  if (lower.startsWith("license")) return 1;
  if (lower.startsWith("licence")) return 2;
  if (lower.startsWith("copying")) return 3;
  return 4; // NOTICE and anything else last
}

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function readManifest(dir: string): Manifest {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Manifest;
}

/**
 * The directories of `packageDir` and of every workspace package its bundle
 * carries. The package itself contributes its devDependencies too (the CLI
 * bundles core through a devDependency and an esbuild alias); a reached
 * workspace package does not, since its own devDependencies never reach the
 * bundle. Peer and optional dependencies count everywhere: a bundler resolves
 * them like any other import.
 */
export function bundledWorkspaceDirs(packageDir: string): string[] {
  const start = realpathSync(packageDir);
  const seen = new Set([start]);
  const queue = [start];
  for (let dir = queue.shift(); dir !== undefined; dir = queue.shift()) {
    const manifest = readManifest(dir);
    const specs = {
      ...(dir === start ? manifest.devDependencies : {}),
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
      ...manifest.dependencies,
    };
    for (const [name, spec] of Object.entries(specs)) {
      if (!spec.startsWith("workspace:")) continue;
      const link = join(dir, "node_modules", name);
      if (!existsSync(link)) {
        throw new Error(`${name} is a workspace dependency of ${dir}, but ${link} is missing.`);
      }
      const target = realpathSync(link);
      if (seen.has(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return [...seen];
}

/**
 * `--filter` arguments that select each of `dirs` by path, for a pnpm run
 * from `cwd`. pnpm reads a filter as a path only when it is relative and
 * starts with `.` or `..` (an absolute path matches nothing), and with `/`
 * as the separator on every platform.
 */
export function directoryFilters(cwd: string, dirs: readonly string[]): string[] {
  return dirs.flatMap((dir) => {
    const path = relative(cwd, dir).split(sep).join("/");
    const selector =
      path === "" ? "." : path === ".." || path.startsWith("../") ? path : `./${path}`;
    return ["--filter", selector];
  });
}

/**
 * The directories in `dirs` that pnpm did not select. pnpm drops a filter
 * that matches nothing and still exits 0, which would silently drop that
 * package's dependencies from the notices.
 */
export function unselectedDirs(dirs: readonly string[], selected: readonly string[]): string[] {
  const selectedSet = new Set(selected);
  return dirs.filter((dir) => !selectedSet.has(dir));
}

function collectNotices(packageDir: string): DependencyNotice[] {
  // Select by directory, not by name: the private workspace root is also
  // named `karasu`, and `--filter karasu` picks up its dependencies too.
  const cwd = realpathSync(packageDir);
  const dirs = bundledWorkspaceDirs(cwd);
  const filters = directoryFilters(cwd, dirs);
  const projects = JSON.parse(
    execFileSync("pnpm", [...filters, "ls", "--depth", "-1", "--json"], { cwd, encoding: "utf8" }),
  ) as { path: string }[];
  const missed = unselectedDirs(
    dirs,
    projects.map((project) => realpathSync(project.path)),
  );
  if (missed.length > 0) {
    throw new Error(`pnpm selected no workspace project at ${missed.join(", ")}.`);
  }
  let stdout: string;
  try {
    stdout = execFileSync("pnpm", [...filters, "licenses", "list", "--prod", "--json"], {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const stdoutOnError = (error as { stdout?: string | Buffer }).stdout;
    if (stdoutOnError === undefined) throw error;
    stdout = stdoutOnError.toString("utf8");
  }
  const trimmed = stdout.trim();
  const licenses = (trimmed === "" ? {} : JSON.parse(trimmed)) as PnpmLicensesList;

  const notices: DependencyNotice[] = [];
  for (const [license, packages] of Object.entries(licenses)) {
    for (const pkg of packages) {
      // Skip workspace-internal packages — they ship under the repo's own LICENSE.
      if (pkg.name.startsWith("@karasu-tools/")) continue;
      pkg.versions.forEach((version, index) => {
        const path = pkg.paths[index] ?? pkg.paths[0];
        notices.push({
          name: pkg.name,
          version,
          license,
          licenseText: path !== undefined ? readLicenseFile(path) : null,
          upstreamNotices: path !== undefined ? readUpstreamNoticesFile(path) : null,
        });
      });
    }
  }
  return notices.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

export function renderNotices(packageName: string, notices: DependencyNotice[]): string {
  const lines: string[] = [
    `# Third-Party Notices`,
    ``,
    `This file lists the third-party production dependencies redistributed with`,
    `\`${packageName}\` and the text of their licenses. It is generated by`,
    `\`scripts/ci/generate-third-party-notices.ts\` during the package build — do not edit by hand.`,
    ``,
  ];
  if (notices.length === 0) {
    lines.push(`_No third-party production dependencies._`, ``);
    return lines.join("\n");
  }
  for (const notice of notices) {
    lines.push(`## ${notice.name}@${notice.version}`, ``, `License: ${notice.license}`, ``);
    if (notice.licenseText === null) {
      lines.push(`_No license file was found in this package; see the SPDX identifier above._`, ``);
    } else {
      lines.push("```", notice.licenseText, "```", ``);
    }
    if (notice.upstreamNotices) {
      lines.push(
        `Third-party notices of \`${notice.name}\` itself:`,
        ``,
        "```",
        notice.upstreamNotices,
        "```",
        ``,
      );
    }
  }
  return lines.join("\n");
}

function packageNameOf(packageDir: string): string {
  const manifest = join(packageDir, "package.json");
  if (existsSync(manifest)) {
    const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { name?: string };
    if (typeof parsed.name === "string" && parsed.name.length > 0) return parsed.name;
  }
  return basename(resolve(packageDir));
}

function main(argv: string[]): void {
  const args = argv.slice(2);
  const outIndex = args.indexOf("--out");
  const out = outIndex === -1 ? undefined : args[outIndex + 1];
  const dirs = outIndex === -1 ? args : args.filter((_, i) => i !== outIndex && i !== outIndex + 1);
  if (dirs.length === 0 || (outIndex !== -1 && (out === undefined || dirs.length !== 1))) {
    process.stderr.write(
      "usage: tsx scripts/ci/generate-third-party-notices.ts <packageDir> [<packageDir> ...]\n" +
        "       tsx scripts/ci/generate-third-party-notices.ts <packageDir> --out <file>\n",
    );
    process.exitCode = 1;
    return;
  }
  for (const dir of dirs) {
    const packageDir = resolve(dir);
    const packageName = packageNameOf(packageDir);
    const notices = collectNotices(packageDir);
    const outPath = out !== undefined ? resolve(out) : join(packageDir, "THIRD_PARTY_NOTICES.md");
    writeFileSync(outPath, renderNotices(packageName, notices));
    process.stdout.write(
      `Wrote ${outPath} (${notices.length} dependenc${notices.length === 1 ? "y" : "ies"}).\n`,
    );
  }
}

// Only run when invoked directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv);
}
