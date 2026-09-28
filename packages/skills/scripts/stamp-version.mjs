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
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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

function restore() {
  if (!existsSync(BACKUP_DIR)) return;
  cpSync(BACKUP_DIR, PACKAGE_DIR, { recursive: true });
  rmSync(BACKUP_DIR, { recursive: true, force: true });
}

function stamp() {
  restore();
  const { version } = JSON.parse(readFileSync(CLI_PACKAGE_JSON, "utf8"));
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`stamp-version: unexpected CLI version ${JSON.stringify(version)}`);
  }
  for (const file of skillFiles()) {
    const text = readFileSync(file, "utf8");
    if (!text.includes(PLACEHOLDER)) {
      throw new Error(
        `stamp-version: ${relative(PACKAGE_DIR, file)} has no ${PLACEHOLDER}; every skill needs the Step 0 version check`,
      );
    }
    const backup = join(BACKUP_DIR, relative(PACKAGE_DIR, file));
    mkdirSync(dirname(backup), { recursive: true });
    writeFileSync(backup, text);
    writeFileSync(file, text.replaceAll(PLACEHOLDER, version));
  }
}

const mode = process.argv[2];
if (mode === "stamp") stamp();
else if (mode === "restore") restore();
else {
  console.error("usage: node scripts/stamp-version.mjs stamp|restore");
  process.exit(2);
}
