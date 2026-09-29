/* eslint-disable no-console -- CLI entry point; stdout is the list release.yml reads */
/**
 * Prints one `name@version` per line: every package tag the release commit
 * must carry (#2982).
 *
 *   pnpm run release 2>&1 | tee publish.log
 *   node scripts/release/published-packages.mts --log publish.log              # every tag the commit needs
 *   node scripts/release/published-packages.mts --log publish.log --this-run   # only (1) below
 *
 * Two sources, merged:
 *
 * 1. The packages `changeset publish` lists under "Successfully published:" in
 *    this run's output.
 * 2. The current version of every released npm package (RELEASED_PACKAGES,
 *    not `private`) that is already on npm. This is what keeps the check alive
 *    on a re-run: `changeset publish` skips a version already on npm, so a
 *    package published without its tag in an earlier attempt never shows up
 *    in (1) again.
 *
 * release.yml fails the job when one of these has no tag, and when a tag for
 * (1) does not point at the release commit: `record` only records the tags on
 * that commit, so a tag left on another commit would drop the package from
 * the Release. A tag for (2) may point at the earlier release that shipped
 * that version. `changeset publish`
 * creates annotated tags and ignores a failing `git tag`, and its closing
 * "Created git tags." message never lists npm packages, so its own output
 * cannot tell a tagged run from an untagged one.
 *
 * Erasable TypeScript only, node builtins only: runs with plain `node`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { RELEASED_PACKAGES } from "./github-release.mts";

// CSI sequences (colours, cursor moves) that the spinner writes between lines.
const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, "g");

/** `@karasu-tools/core@0.3.1`, `karasu@0.8.0`: a package name, `@`, a semver. */
const PACKAGE_AT_VERSION = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*@\d+\.\d+\.\d+\S*$/;

export function publishedPackages(log: string): string[] {
  const lines = log.replace(ANSI, "").replace(/\r/g, "\n").split("\n");
  const published: string[] = [];
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.endsWith("Successfully published:")) {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    if (PACKAGE_AT_VERSION.test(line)) published.push(line);
    else inBlock = false;
  }
  return [...new Set(published)];
}

export type PackageVersion = { name: string; version: string };

/**
 * The tags the commit must carry: what this run published, plus every current
 * version that is on npm.
 */
export function expectedTags(
  published: string[],
  current: PackageVersion[],
  isOnNpm: (pkg: PackageVersion) => boolean,
): string[] {
  const onNpm = current.filter(isOnNpm).map(({ name, version }) => `${name}@${version}`);
  return [...new Set([...published, ...onNpm])].sort();
}

/** The released packages that go to npm (the VS Code extension is `private`). */
function currentNpmVersions(): PackageVersion[] {
  return RELEASED_PACKAGES.flatMap(({ dir }) => {
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      name: string;
      version: string;
      private?: boolean;
    };
    return manifest.private ? [] : [{ name: manifest.name, version: manifest.version }];
  });
}

/** Whether `name@version` is on npm. Anything but a clean yes / 404 is an error. */
function isVersionOnNpm({ name, version }: PackageVersion): boolean {
  const result = spawnSync("npm", ["view", `${name}@${version}`, "version"], {
    encoding: "utf8",
  });
  if (result.status === 0) return result.stdout.trim() === version;
  if (/E404|is not in this registry/.test(result.stderr)) return false;
  throw new Error(`npm view ${name}@${version} failed: ${result.stderr.trim()}`);
}

function main(argv: string[]): void {
  const logIndex = argv.indexOf("--log");
  const logPath = logIndex >= 0 ? argv[logIndex + 1] : undefined;
  const log = logPath && existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
  const published = publishedPackages(log);
  const tags = argv.includes("--this-run")
    ? published
    : expectedTags(published, currentNpmVersions(), isVersionOnNpm);
  for (const tag of tags) console.log(tag);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
