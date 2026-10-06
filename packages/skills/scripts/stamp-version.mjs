/* eslint-disable no-console -- CLI entry point run by prepack / postpack; the usage error is its only output */
// Stamps the karasu CLI version into every SKILL.md while the package is being
// packed, and restores the sources afterwards (Issue #2932).
//
//   node scripts/stamp-version.mjs stamp     # prepack
//   node scripts/stamp-version.mjs restore   # postpack
//
// The version written is the CLI version at pack time
// (`packages/cli/package.json`). It is a floor: "this skill was written for this
// CLI version or later". Each SKILL.md carries the placeholder below twice, in
// `metadata.karasu-version` and in its Step 0 text, because front matter does
// not always reach the agent's context. The in-repo sources keep the
// placeholder, and Step 0 treats an unreplaced placeholder as "running inside
// the karasu repository" and skips the check.
//
// `stamp` saves each file it rewrites under `.stamp-backup/`; `restore` puts
// them back and removes the directory, so `pnpm pack` leaves the working tree
// as it found it. A leftover backup from an interrupted pack is restored first.
//
// Design: option 1-D of the #2901 design doc (PR #2931).

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const PLACEHOLDER = "{{KARASU_MIN_VERSION}}";

const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = join(PACKAGE_DIR, "skills");
const BACKUP_DIR = join(PACKAGE_DIR, ".stamp-backup");
const CLI_PACKAGE_JSON = join(PACKAGE_DIR, "..", "cli", "package.json");

function skillFiles() {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(SKILLS_DIR, entry.name, "SKILL.md"))
    .filter((file) => existsSync(file));
}

/**
 * Write through a temporary file and rename it into place, so an interrupted
 * write never leaves a truncated file at `path`. A truncated backup would be
 * copied over the source by the next `restore()`.
 */
function writeAtomic(path, data) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

/** Every complete backup under BACKUP_DIR (the `.tmp` of an interrupted write is not one). */
function backupFiles(dir = BACKUP_DIR) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return backupFiles(full);
    return entry.name === "SKILL.md" ? [full] : [];
  });
}

function restore() {
  if (!existsSync(BACKUP_DIR)) return;
  for (const backup of backupFiles()) {
    const source = join(PACKAGE_DIR, relative(BACKUP_DIR, backup));
    writeAtomic(source, readFileSync(backup, "utf8"));
  }
  rmSync(BACKUP_DIR, { recursive: true, force: true });
}

function stamp() {
  restore();
  const { version } = JSON.parse(readFileSync(CLI_PACKAGE_JSON, "utf8"));
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`stamp-version: unexpected CLI version ${JSON.stringify(version)}`);
  }
  // Validate every skill before writing any of them. A failure here aborts the
  // pack, and npm does not run postpack after a failed prepack, so a partial
  // stamp would stay in the working tree.
  const sources = skillFiles().map((file) => ({ file, text: readFileSync(file, "utf8") }));
  const unstamped = sources.filter(({ text }) => !text.includes(PLACEHOLDER));
  if (unstamped.length > 0) {
    const names = unstamped.map(({ file }) => relative(PACKAGE_DIR, file)).join(", ");
    throw new Error(
      `stamp-version: ${names} has no ${PLACEHOLDER}; every skill needs the Step 0 version check`,
    );
  }
  for (const { file, text } of sources) {
    const backup = join(BACKUP_DIR, relative(PACKAGE_DIR, file));
    mkdirSync(dirname(backup), { recursive: true });
    writeAtomic(backup, text);
    writeAtomic(file, text.replaceAll(PLACEHOLDER, version));
  }
}

const mode = process.argv[2];
if (mode === "stamp") stamp();
else if (mode === "restore") restore();
else {
  console.error("usage: node scripts/stamp-version.mjs stamp|restore");
  process.exit(2);
}
