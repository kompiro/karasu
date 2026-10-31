/* eslint-disable no-console -- CLI entry point; its stdout is read by the workflow */
/**
 * The decisions of the weekly VS Code pre-release (#2940), kept out of the
 * workflow YAML so they can be tested.
 *
 *   node scripts/release/pre-release.mts highest < vsce-show.json
 *   node scripts/release/pre-release.mts version --stable <x.y.z> < vsce-show.json
 *   node scripts/release/pre-release.mts diff --a <unzipped .vsix> --b <unzipped .vsix>
 *
 * A pre-release is versioned `<stable major>.<stable minor>.<YYYYMMDDNN>`, so it
 * is above every stable of its minor and never takes a number the monthly train
 * (changesets) will use. A week whose `.vsix` has the same files as the highest
 * version on the Marketplace publishes nothing. Anything that cannot be decided
 * throws, so the workflow fails instead of publishing or skipping (TPL-2786).
 *
 * Runs on Node's type stripping (no install needed in the workflow), so it uses
 * erasable TypeScript only and imports nothing but node builtins and its sibling.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { pathToFileURL } from "node:url";
import type { VsceShow } from "./train.mts";

// ------------------------------------------------------------------ versions

type Triple = [number, number, number];

function parseVersion(version: string): Triple {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`not a major.minor.patch version: ${version}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Numeric order, so `0.5.2026110401` is above `0.5.1`. */
export function compareVersions(a: string, b: string): number {
  const [pa, pb] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/**
 * The highest version on the Marketplace in either channel: VS Code moves a
 * pre-release user to it, so it is what the next pre-release is compared with.
 */
export function highestVersion(show: VsceShow): string {
  const versions = (show.versions ?? []).map((v) => v.version);
  if (versions.length === 0) throw new Error("the Marketplace lists no version of the extension");
  versions.forEach(parseVersion); // a single listed version is never compared
  return versions.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b));
}

const MAX_PER_DAY = 99;

/**
 * `<major>.<minor>.<YYYYMMDDNN>` from the stable version on main and the UTC
 * date. `NN` counts the day's pre-releases from 01, read from the versions the
 * Marketplace already has, so a re-run on the same day takes the next number.
 */
export function preReleaseVersion(stable: string, now: Date, existing: string[]): string {
  const [major, minor] = parseVersion(stable);
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const prefix = `${major}.${minor}.${date}`;
  const taken = existing.flatMap((v) => {
    const m = /^(\d{2})$/.exec(v.startsWith(prefix) ? v.slice(prefix.length) : "");
    return m ? [Number(m[1])] : [];
  });
  const next = Math.max(0, ...taken) + 1;
  if (next > MAX_PER_DAY) {
    throw new Error(`${prefix}: more than ${MAX_PER_DAY} pre-releases on one day`);
  }
  return `${prefix}${String(next).padStart(2, "0")}`;
}

/**
 * The version of the next pre-release, which must be above the highest version
 * on the Marketplace. Taking `NN` from the list makes this hold unless the
 * premise breaks (a clock behind the last pre-release), which must stop the run.
 */
export function nextPreReleaseVersion(stable: string, now: Date, show: VsceShow): string {
  const version = preReleaseVersion(
    stable,
    now,
    (show.versions ?? []).map((v) => v.version),
  );
  const highest = highestVersion(show);
  if (compareVersions(version, highest) <= 0) {
    throw new Error(`${version} is not above ${highest}, the highest version on the Marketplace`);
  }
  return version;
}

// ------------------------------------------------------------------ .vsix contents

const EXTENSION_DIR = "extension";

function listFiles(root: string, dir = ""): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = dir === "" ? entry.name : posix.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(root, path) : [path];
  });
}

function filesOf(unzipped: string): string[] {
  const root = join(unzipped, EXTENSION_DIR);
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${unzipped} has no ${EXTENSION_DIR}/ directory: not an unzipped .vsix`);
  }
  const files = listFiles(root);
  if (files.length === 0) throw new Error(`${root} is empty`);
  return files;
}

/** `package.json` without its `version`, which always differs between the two. */
function withoutVersion(text: string): string {
  const { version: _version, ...rest } = JSON.parse(text) as Record<string, unknown>;
  return JSON.stringify(rest);
}

/**
 * The files under `extension/` that differ between two unzipped `.vsix`
 * packages, including a file only one of them has. `package.json` is compared
 * without its `version`. The `.vsix` manifest outside `extension/` is derived
 * from `package.json` and carries the version, so it is not compared.
 * Comparing what was built, not a list of source paths, means nothing has to
 * name the inputs that can change the extension (TPL-2804).
 */
export function diffExtensionDirs(a: string, b: string): string[] {
  const [inA, inB] = [new Set(filesOf(a)), new Set(filesOf(b))];
  const paths = [...new Set([...inA, ...inB])].sort();
  return paths.filter((path) => {
    if (!inA.has(path) || !inB.has(path)) return true;
    const [bytesA, bytesB] = [a, b].map((root) => readFileSync(join(root, EXTENSION_DIR, path)));
    if (path === "package.json") {
      return withoutVersion(bytesA.toString("utf8")) !== withoutVersion(bytesB.toString("utf8"));
    }
    return !bytesA.equals(bytesB);
  });
}

// ------------------------------------------------------------------ CLI

function flag(argv: string[], name: string): string {
  const i = argv.indexOf(`--${name}`);
  const value = i === -1 ? undefined : argv[i + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`--${name} is required`);
  return value;
}

const readShow = (): VsceShow => JSON.parse(readFileSync(0, "utf8")) as VsceShow;

export function main(argv: string[]): void {
  const [command, ...rest] = argv;
  switch (command) {
    case "highest":
      console.log(highestVersion(readShow()));
      return;
    case "version":
      console.log(nextPreReleaseVersion(flag(rest, "stable"), new Date(), readShow()));
      return;
    case "diff": {
      const changed = diffExtensionDirs(flag(rest, "a"), flag(rest, "b"));
      for (const path of changed) console.error(`changed: extension/${path}`);
      console.log(changed.length === 0 ? "same" : "changed");
      return;
    }
    default:
      throw new Error(`unknown command: ${command ?? "(none)"}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
