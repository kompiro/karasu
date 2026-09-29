/* eslint-disable no-console -- CLI entry point; stdout is the list release.yml reads */
/**
 * Reads the output of `changeset publish` (`pnpm run release`) on stdin and
 * prints one `name@version` per line for every package it reports under
 * "Successfully published:" (#2982).
 *
 *   pnpm run release 2>&1 | tee publish.log
 *   node scripts/release/published-packages.mts < publish.log
 *
 * release.yml uses it to check that every package the run published has its
 * tag on HEAD. `changeset publish` creates annotated tags and ignores a failing
 * `git tag`, and its closing "Created git tags." message never lists npm
 * packages, so its own output cannot tell a tagged run from an untagged one.
 *
 * Erasable TypeScript only, node builtins only: runs with plain `node`.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const entry of publishedPackages(readFileSync(0, "utf8"))) console.log(entry);
}
