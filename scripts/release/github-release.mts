/* eslint-disable no-console -- CLI entry point; it reports what it created */
/**
 * Creates or updates the GitHub Release that records one release (#2939).
 *
 *   node scripts/release/github-release.mts --commit <sha> [--no-latest] [--dry-run]
 *
 * The package tags (`karasu@0.7.0`, `@karasu-tools/core@0.3.0`,
 * `karasu-vscode@0.2.0`) pointing at the commit are the source of truth: a tag
 * exists only once that version is published (npm by release.yml, the
 * Marketplace by vscode-release.yml). This script turns the set of tags on one
 * commit into one Release named `release-YYYY-MM-DD` (the commit's UTC date,
 * suffixed `-2`, `-3` … when a day already has one), whose body is each
 * package's CHANGELOG section for its version.
 *
 * It regenerates the whole Release from the tags every time, so it is safe to
 * re-run and it is how the extension is "appended": vscode-release.yml tags the
 * same commit after the Marketplace publish and runs this script again.
 *
 * Runs on Node's type stripping (no install needed in the workflow), so it uses
 * erasable TypeScript only and imports nothing but node builtins.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Released packages, in the order they are listed in a Release. */
export const RELEASED_PACKAGES: ReadonlyArray<{ name: string; dir: string }> = [
  { name: "karasu", dir: "packages/cli" },
  { name: "@karasu-tools/core", dir: "packages/core" },
  { name: "karasu-vscode", dir: "packages/vscode" },
];

export type PackageTag = { name: string; version: string };

export type ReleaseEntry = PackageTag & {
  changelogSection: string | null;
  /** Where the full CHANGELOG of this version can be read. */
  changelogUrl: string;
};

/**
 * GitHub rejects a Release body over 125,000 characters (HTTP 422). The
 * budget leaves room for the per-package headings and the truncation notes.
 * The first backfilled release that hit it carried three months of
 * changesets (release-2026-09-27, 182k characters).
 */
export const RELEASE_BODY_BUDGET = 120_000;

const NO_CHANGELOG_ENTRY =
  "_No CHANGELOG entry for this version (published before changesets managed this package)._";

const RELEASE_TAG = /^release-\d{4}-\d{2}-\d{2}(?:-\d+)?$/;

/** `@karasu-tools/core@0.3.0` → name + version; anything else → null. */
export function parsePackageTag(tag: string): PackageTag | null {
  const at = tag.lastIndexOf("@");
  if (at <= 0) return null;
  const name = tag.slice(0, at);
  const version = tag.slice(at + 1);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) return null;
  if (!RELEASED_PACKAGES.some((pkg) => pkg.name === name)) return null;
  return { name, version };
}

export function isReleaseTag(tag: string): boolean {
  return RELEASE_TAG.test(tag);
}

/** `release-<date>`, or the first free `release-<date>-<n>` (n ≥ 2). */
export function pickReleaseTagName(date: string, existingTags: Iterable<string>): string {
  const taken = new Set(existingTags);
  const base = `release-${date}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * The body of `## <version>` in a changesets CHANGELOG, up to the next
 * `## ` heading. Null when the version has no section (published before
 * changesets managed the package).
 */
export function extractChangelogSection(changelog: string, version: string): string | null {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  const section = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return section === "" ? null : section;
}

export function sortEntries<T extends PackageTag>(entries: T[]): T[] {
  const order = (name: string) => RELEASED_PACKAGES.findIndex((pkg) => pkg.name === name);
  return [...entries].sort((a, b) => order(a.name) - order(b.name));
}

export function composeReleaseTitle(date: string, entries: PackageTag[]): string {
  const list = sortEntries(entries)
    .map((entry) => `${entry.name} ${entry.version}`)
    .join(", ");
  return `${date}: ${list}`;
}

/**
 * Cuts a CHANGELOG section to at most `budget` characters at a change
 * boundary (a top-level `- ` bullet or a `### ` heading), never inside one
 * change, and says how many changes were left out and where to read them.
 */
export function truncateSection(section: string, budget: number, url: string): string {
  if (section.length <= budget) return section;
  const lines = section.split("\n");
  const isBoundary = (line: string) => line.startsWith("- ") || line.startsWith("### ");
  const noteFor = (omitted: number) =>
    `_…and ${omitted} more change${omitted === 1 ? "" : "s"}. The full list is in [CHANGELOG.md](${url})._`;
  const totalChanges = lines.filter((line) => line.startsWith("- ")).length;

  let cut = 0;
  let kept = 0;
  for (let i = 0; i <= lines.length; i++) {
    if (i === lines.length || isBoundary(lines[i])) {
      const head = lines.slice(0, i).join("\n").trimEnd();
      const keptChanges = lines.slice(0, i).filter((line) => line.startsWith("- ")).length;
      if (head.length + 2 + noteFor(totalChanges - keptChanges).length > budget) break;
      cut = i;
      kept = keptChanges;
    }
  }
  const head = lines.slice(0, cut).join("\n").trimEnd();
  const note = noteFor(totalChanges - kept);
  // Not even the note fits: fail rather than return more than the budget, which
  // would push the whole body past GitHub's limit without saying so.
  if (note.length > budget) {
    throw new Error(`A ${budget}-character budget cannot hold the truncation note for ${url}.`);
  }
  return head === "" ? note : `${head}\n\n${note}`;
}

export function composeReleaseBody(
  entries: ReleaseEntry[],
  budget: number = RELEASE_BODY_BUDGET,
): string {
  const sorted = sortEntries(entries);
  const blocks = (sectionOf: (entry: ReleaseEntry, section: string) => string) =>
    sorted
      .map((entry) => {
        const section = entry.changelogSection ?? NO_CHANGELOG_ENTRY;
        return `## ${entry.name}@${entry.version}\n\n${sectionOf(entry, section)}`;
      })
      .join("\n\n");

  const full = blocks((_, section) => section);
  if (full.length <= budget) return full;
  // Share what is left after the headings, shortest section first, so a
  // package whose notes fit hands its unused share on to the longer ones.
  const sectionOf = (entry: ReleaseEntry) => entry.changelogSection ?? NO_CHANGELOG_ENTRY;
  let remaining = budget - blocks(() => "").length;
  const allowance = new Map<ReleaseEntry, number>();
  const byLength = [...sorted].sort((a, b) => sectionOf(a).length - sectionOf(b).length);
  byLength.forEach((entry, i) => {
    const share = Math.floor(remaining / (byLength.length - i));
    const used = truncateSection(sectionOf(entry), share, entry.changelogUrl).length;
    allowance.set(entry, share);
    remaining -= used;
  });
  return blocks((entry, section) =>
    truncateSection(section, allowance.get(entry) ?? 0, entry.changelogUrl),
  );
}

// ------------------------------------------------------------------ IO

const REPOSITORY = process.env.GITHUB_REPOSITORY ?? "kompiro/karasu";

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function tryRun(cmd: string, args: string[]): string | null {
  try {
    return run(cmd, args);
  } catch {
    return null;
  }
}

function splitLines(text: string): string[] {
  return text.split("\n").filter((line) => line !== "");
}

type Options = { commit: string; latest: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  let commit: string | null = null;
  let latest = true;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--commit") commit = argv[++i] ?? null;
    else if (arg === "--no-latest") latest = false;
    else if (arg === "--dry-run") dryRun = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!commit) throw new Error("--commit <sha> is required");
  return { commit, latest, dryRun };
}

export function main(argv: string[]): void {
  const options = parseArgs(argv);
  const sha = run("git", ["rev-parse", `${options.commit}^{commit}`]);
  const tagsOnCommit = splitLines(run("git", ["tag", "--points-at", sha]));

  const packageTags = tagsOnCommit.flatMap((tag) => parsePackageTag(tag) ?? []);
  if (packageTags.length === 0) {
    console.log(`No package tag points at ${sha}: nothing to record.`);
    return;
  }

  const entries: ReleaseEntry[] = packageTags.map((tag) => {
    const dir = RELEASED_PACKAGES.find((pkg) => pkg.name === tag.name)!.dir;
    const changelog = tryRun("git", ["show", `${sha}:${dir}/CHANGELOG.md`]);
    return {
      ...tag,
      changelogSection: changelog ? extractChangelogSection(changelog, tag.version) : null,
      changelogUrl: `https://github.com/${REPOSITORY}/blob/${sha}/${dir}/CHANGELOG.md`,
    };
  });

  const date = new Date(run("git", ["log", "-1", "--format=%cI", sha])).toISOString().slice(0, 10);
  const existing = tagsOnCommit.find(isReleaseTag);
  const name =
    existing ?? pickReleaseTagName(date, splitLines(run("git", ["tag", "-l", "release-*"])));
  const title = composeReleaseTitle(date, entries);
  const body = composeReleaseBody(entries);

  if (options.dryRun) {
    console.log(
      `[dry-run] ${existing ? "update" : "create"} ${name} at ${sha}\n# ${title}\n\n${body}`,
    );
    return;
  }

  const notesFile = join(mkdtempSync(join(tmpdir(), "github-release-")), "notes.md");
  writeFileSync(notesFile, `${body}\n`);

  // A release tag without a Release object (e.g. one deleted by hand) is
  // re-attached with `create`, which reuses the existing tag.
  const hasRelease = tryRun("gh", ["release", "view", name, "--json", "tagName"]) !== null;
  if (hasRelease) {
    run("gh", ["release", "edit", name, "--title", title, "--notes-file", notesFile]);
    console.log(`Updated ${name}: ${title}`);
  } else {
    run("gh", [
      "release",
      "create",
      name,
      "--target",
      sha,
      "--title",
      title,
      "--notes-file",
      notesFile,
      // Left out by default so GitHub picks "Latest" by date: a Release
      // created late for an older commit must not take it from a newer one.
      ...(options.latest ? [] : ["--latest=false"]),
    ]);
    console.log(`Created ${name}: ${title}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
