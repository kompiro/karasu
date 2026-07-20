/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Guards docs/adr/id-migration-map.json, the frozen old->new id table for the
// `issue-number` migration (Issue #2083).
//
// The map is the single source of truth for the rename: the Phase 3 rewrite is
// driven entirely by it rather than by re-running heuristics, because the
// heuristics are not trustworthy on their own (a bare `#N` in an ADR body is
// as likely to be "Rule #2", a dependency-table cell, a PR range like
// `#611–#626`, or a cross-repo ref like `actions/checkout#2439` as it is to be
// the originating issue). Every entry was reviewed; freezing it means the
// rename is reproducible and auditable rather than a one-time guess.
//
// It also outlives the migration as the redirect record: anything outside this
// repo still pointing at an `ADR-YYYYMMDD-NN` id resolves through this table.
//
// The check is state-aware. Before the rename every `oldFile` should exist;
// after it every `newFile` should. A tree where BOTH kinds are present is a
// half-migrated state — the single most dangerous outcome for this change —
// and is reported as such rather than as a pile of individual errors.

export const MAP_PATH = "docs/adr/id-migration-map.json";
export const ADR_DIR = "docs/adr";

/** Files in docs/adr that are not ADRs. */
const NON_ADR = new Set(["README.md", "TEMPLATE.md", "effective.md", "graph.md"]);

/**
 * Files that intentionally retain old-format `YYYYMMDD-NN` tokens and must be
 * skipped by the bare-id survivor scan:
 * - the map itself records the old ids as its redirect columns;
 * - the map validator's test fixtures simulate a pre-migration tree;
 * - THIS file quotes an old-format id in prose to illustrate the
 *   half-migration failure mode (`20260716-02 -> ADR-20260716`).
 */
const BARE_SCAN_FROZEN = new Set([
  "docs/adr/id-migration-map.json",
  "scripts/lint/adr-id-migration-map.test.ts",
  "scripts/lint/adr-id-migration-map.ts",
]);

/** Reserved range for ADRs that predate issue-driven development (see #2083). */
export const RESERVED_MIN = 9001;
export const RESERVED_MAX = 9099;

export type EntrySource = "issue" | "pr" | "reserved-block";

export interface MapEntry {
  oldId: string;
  oldFile: string;
  newId: string;
  newFile: string;
  source: EntrySource;
  evidence: string;
}

export interface IdMap {
  entries: MapEntry[];
}

export type Phase = "pre-migration" | "post-migration" | "half-migrated" | "empty";

export interface Result {
  phase: Phase;
  errors: string[];
  warnings: string[];
  entryCount: number;
}

const OLD_FILE_RE = /^(\d{8})-(\d{2})-(.+)\.md$/;
const NEW_FILE_RE = /^(\d+)-(.+)\.md$/;

export function loadMap(root: string): IdMap {
  const raw = readFileSync(join(root, MAP_PATH), "utf8");
  const parsed: unknown = JSON.parse(raw);
  const entries = (parsed as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) throw new Error(`${MAP_PATH}: "entries" must be an array`);
  return { entries: entries as MapEntry[] };
}

/** ADR files currently present in docs/adr, whichever naming they use. */
export function adrFiles(root: string): string[] {
  return readdirSync(join(root, ADR_DIR))
    .filter((f) => f.endsWith(".md") && !NON_ADR.has(f))
    .sort();
}

export interface BareSurvivor {
  file: string;
  stem: string;
  newId: string;
}

/**
 * Build the bare-stem matcher and lookup for a set of map entries. Pure and
 * testable, separate from the git/filesystem walk. See `bareSurvivors`.
 */
export function bareStemMatcher(entries: MapEntry[]): {
  re: RegExp | null;
  stemToNewId: Map<string, string>;
} {
  const stemToNewId = new Map<string, string>();
  for (const e of entries) {
    const m = e.oldFile.match(OLD_FILE_RE);
    if (m) stemToNewId.set(`${m[1]}-${m[2]}`, e.newId);
  }
  const stems = [...stemToNewId.keys()];
  const re =
    stems.length === 0
      ? null
      : new RegExp(`(?<![\\w\\-_/.])(${stems.join("|")})(?![\\w\\-_/.])`, "g");
  return { re, stemToNewId };
}

/** Bare old-format stems found in a single blob of text. */
export function findBareInText(
  text: string,
  matcher: ReturnType<typeof bareStemMatcher>,
): Array<{ stem: string; newId: string }> {
  if (!matcher.re) return [];
  return [...text.matchAll(matcher.re)].map((m) => ({
    stem: m[1],
    newId: matcher.stemToNewId.get(m[1])!,
  }));
}

/**
 * Find BARE old-format references the main rename missed.
 *
 * The migration rewrote `ADR-YYYYMMDD-NN` and the filename form
 * `YYYYMMDD-NN-slug.md`, but a bare `20260419-01` (no `ADR-` prefix, no `.md`
 * suffix) matched neither pattern and survived as a dangling reference. No
 * other CI check catches these — `adr:validate` / `check-permalinks` only
 * inspect `ADR-`-prefixed ids, filenames, and frontmatter.
 *
 * To stay precise (a bare `YYYYMMDD-NN` also looks like a TPL fragment, a date,
 * or an arbitrary number pair) we only flag a token that EXACTLY equals a known
 * old ADR filename stem and is not glued to a word char / `-` / `_` / `/` / `.`
 * on either side — so `ADR-<stem>`, `<stem>-slug.md`, `TPL-<stem>`, and path
 * segments are excluded.
 *
 * Scans git-tracked text files, skipping BARE_SCAN_FROZEN.
 */
export function bareSurvivors(root: string, entries: MapEntry[]): BareSurvivor[] {
  const matcher = bareStemMatcher(entries);
  if (!matcher.re) return [];

  let listing: string;
  try {
    listing = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  } catch {
    // Not a git checkout (e.g. a tmp-dir unit test) — can't enumerate tracked
    // files, so skip the scan. The real repo is always a git checkout, so CI
    // still runs it.
    return [];
  }
  const tracked = listing
    .split("\n")
    .filter(Boolean)
    .filter((f) => !BARE_SCAN_FROZEN.has(f))
    .filter((f) => /\.(md|mdx|ts|tsx|json|yml|yaml|astro)$/i.test(f));

  const out: BareSurvivor[] = [];
  for (const f of tracked) {
    let text: string;
    try {
      text = readFileSync(join(root, f), "utf8");
    } catch {
      continue;
    }
    for (const hit of findBareInText(text, matcher)) {
      out.push({ file: f, stem: hit.stem, newId: hit.newId });
    }
  }
  return out;
}

export function check(root: string): Result {
  const { entries } = loadMap(root);
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Internal consistency (independent of what is on disk) ---

  const seenOldFile = new Set<string>();
  const seenNewNum = new Map<number, string>();

  for (const e of entries) {
    const where = e.oldFile || e.newFile || "<unknown>";

    if (!OLD_FILE_RE.test(e.oldFile)) {
      errors.push(`${where}: oldFile is not YYYYMMDD-NN-<slug>.md`);
      continue;
    }
    const newMatch = e.newFile.match(NEW_FILE_RE);
    if (!newMatch) {
      errors.push(`${where}: newFile "${e.newFile}" is not <n>-<slug>.md`);
      continue;
    }

    const n = Number(newMatch[1]);
    const newSlug = newMatch[2];
    const oldSlug = e.oldFile.match(OLD_FILE_RE)![3];

    // The slug carries the human meaning; a rename must not quietly reword it.
    if (newSlug !== oldSlug) {
      errors.push(
        `${where}: slug changed ("${oldSlug}" -> "${newSlug}"); the rename must only replace the number`,
      );
    }

    if (e.newId !== `ADR-${n}`) {
      errors.push(`${where}: newId "${e.newId}" does not match newFile number (expected ADR-${n})`);
    }
    if (e.oldId !== `ADR-${e.oldFile.slice(0, 11)}`) {
      errors.push(`${where}: oldId "${e.oldId}" does not match oldFile`);
    }

    if (seenOldFile.has(e.oldFile)) errors.push(`${e.oldFile}: duplicate entry`);
    seenOldFile.add(e.oldFile);

    // Injectivity is the property that makes the migration reversible.
    const clash = seenNewNum.get(n);
    if (clash !== undefined) {
      errors.push(`ADR-${n}: assigned to both ${clash} and ${e.oldFile}`);
    }
    seenNewNum.set(n, e.oldFile);

    const inReserved = n >= RESERVED_MIN && n <= RESERVED_MAX;
    if (e.source === "reserved-block" && !inReserved) {
      errors.push(
        `${where}: source=reserved-block but ${n} is outside ${RESERVED_MIN}-${RESERVED_MAX}`,
      );
    }
    if (e.source !== "reserved-block" && inReserved) {
      errors.push(`${where}: ${n} is inside the reserved range but source=${e.source}`);
    }

    if (!e.evidence || e.evidence.trim() === "") {
      // Evidence is what makes the table reviewable rather than a bare assertion.
      errors.push(`${where}: evidence is required`);
    }
  }

  // --- Agreement with what is actually on disk ---

  const present = new Set(adrFiles(root));
  const oldPresent = entries.filter((e) => present.has(e.oldFile)).length;
  const newPresent = entries.filter((e) => present.has(e.newFile)).length;

  let phase: Phase;
  if (oldPresent > 0 && newPresent > 0) phase = "half-migrated";
  else if (oldPresent > 0) phase = "pre-migration";
  else if (newPresent > 0) phase = "post-migration";
  else phase = "empty";

  if (phase === "half-migrated") {
    errors.push(
      `docs/adr is HALF-MIGRATED: ${oldPresent} file(s) still use the old name and ${newPresent} use the new one. ` +
        `The rename must land atomically — a mixed tree parses some ids from the date (20260716-02 -> ADR-20260716) and CI cannot be trusted.`,
    );
  } else {
    // Totality: every ADR on disk must be accounted for, in whichever phase.
    const expected = new Set(
      entries.map((e) => (phase === "post-migration" ? e.newFile : e.oldFile)),
    );
    for (const f of present) {
      if (!expected.has(f)) errors.push(`${f}: present in ${ADR_DIR} but absent from the map`);
    }
    for (const f of expected) {
      if (!present.has(f)) errors.push(`${f}: in the map but missing from ${ADR_DIR}`);
    }
  }

  // Once the files are renamed away, a bare old-format reference is dangling.
  // Only meaningful post-migration (pre-migration those tokens still resolve).
  if (phase === "post-migration") {
    for (const s of bareSurvivors(root, entries)) {
      errors.push(
        `${s.file}: bare old-format reference "${s.stem}" is now dangling — rewrite it to ${s.newId.replace(/^ADR-/, "")}`,
      );
    }
  }

  return { phase, errors, warnings, entryCount: entries.length };
}

function main(): void {
  const root = process.cwd();
  if (!existsSync(join(root, MAP_PATH))) {
    console.error(`adr-id-migration-map: ${MAP_PATH} not found`);
    process.exit(1);
  }

  const { phase, errors, warnings, entryCount } = check(root);

  for (const w of warnings) console.warn(`⚠ ${w}`);

  if (errors.length > 0) {
    console.error(`adr-id-migration-map: ${errors.length} problem(s) [phase: ${phase}]`);
    for (const e of errors) console.error(`✗ ${e}`);
    process.exit(1);
  }

  console.log(`adr-id-migration-map: ok — ${entryCount} entries, phase: ${phase}`);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /adr-id-migration-map\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
