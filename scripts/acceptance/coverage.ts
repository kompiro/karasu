import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

/**
 * Static analysis of `docs/acceptance/*.md` against the canonical automation
 * marker convention codified in `.claude/skills/acceptance-test/SKILL.md`.
 *
 * Two finding categories:
 *
 * 1. **non-conforming**: the file uses a deprecated style — "Verified by"
 *    metadata, "Automated Checks" / "Manual Verification" section grouping,
 *    or has `[x]` bullets without the immediate `> ✅ Automated` blockquote.
 * 2. **missing-marker**: the file has zero automation markers but a matching
 *    `packages/e2e/tests/at-NNNN*.spec.ts` (or unit test referencing
 *    `(AT-NNNN-*)`) exists.
 *
 * The script never tries to autofix — phases C and B (#919 / #920) handle
 * the retrofit edits manually using this output as their work list.
 */

export type Finding =
  | { kind: "verified-by-metadata"; file: string; line: number; snippet: string }
  | { kind: "section-grouping"; file: string; line: number; heading: string }
  | { kind: "checked-without-blockquote"; file: string; line: number; bullet: string }
  | { kind: "missing-marker-with-spec"; file: string; specPaths: string[] };

export interface FileReport {
  file: string;
  atId: string | null;
  hasCanonicalMarker: boolean;
  findings: Finding[];
}

const VERIFIED_BY = /^\s*-\s+\*\*Verified by\*\*:/;
// Match the deprecated section-grouping pattern by exact heading text. The
// trailing `\s*$` is important: "Manual Verification" is the deprecated AC
// section, but "Manual Verification Checklist" / "Manual Verification Steps"
// at the end of a file is a legitimate post-implementation review section
// that this convention does not target.
const SECTION_GROUPING =
  /^##\s+(Automated Checks|Automated Tests|Manual Verification|Manual Checks)\s*$/;
const CHECKBOX = /^\s*-\s+\[(x| )\]\s+(.*)$/;
const CANONICAL_BLOCKQUOTE = /^\s*>\s*(✅|🟡)\s+(Automated|Partially automated)\b/;

const AT_FILENAME = /^(\d{4})-/;

/**
 * Parse a single AT file and return its report.
 *
 * - `hasCanonicalMarker` is true if at least one `> ✅ Automated …` or
 *   `> 🟡 Partially automated …` blockquote is present, regardless of
 *   whether other parts of the file are non-conforming.
 * - Findings list every individual deviation (one entry per offending line).
 */
export function analyzeFile(file: string, content: string): FileReport {
  const lines = content.split(/\r?\n/);
  const findings: Finding[] = [];
  let hasCanonicalMarker = false;

  // Fast pass: section headings and metadata lines.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (CANONICAL_BLOCKQUOTE.test(line)) hasCanonicalMarker = true;
    if (VERIFIED_BY.test(line)) {
      findings.push({
        kind: "verified-by-metadata",
        file,
        line: i + 1,
        snippet: line.trim(),
      });
    }
    const sectionMatch = line.match(SECTION_GROUPING);
    if (sectionMatch) {
      findings.push({
        kind: "section-grouping",
        file,
        line: i + 1,
        heading: sectionMatch[1],
      });
    }
  }

  // Per-checkbox pass: `[x]` bullets without a following canonical blockquote.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CHECKBOX);
    if (!m || m[1] !== "x") continue;
    if (!hasFollowingBlockquote(lines, i)) {
      findings.push({
        kind: "checked-without-blockquote",
        file,
        line: i + 1,
        bullet: m[2].trim(),
      });
    }
  }

  return {
    file,
    atId: extractAtId(file),
    hasCanonicalMarker,
    findings,
  };
}

/**
 * Look at the lines after `index`, skipping blank lines, and return true if
 * the next non-blank line is a canonical Automated blockquote. Stops at the
 * next checkbox, markdown heading, or after `MAX_BLOCKQUOTE_LOOKAHEAD` lines
 * to bound the scan on pathological input.
 */
const MAX_BLOCKQUOTE_LOOKAHEAD = 20;

function hasFollowingBlockquote(lines: string[], index: number): boolean {
  const limit = Math.min(lines.length, index + 1 + MAX_BLOCKQUOTE_LOOKAHEAD);
  for (let j = index + 1; j < limit; j++) {
    const line = lines[j];
    if (line.trim() === "") continue;
    if (CHECKBOX.test(line)) return false;
    if (/^#{1,6}\s/.test(line)) return false;
    return CANONICAL_BLOCKQUOTE.test(line);
  }
  return false;
}

function extractAtId(file: string): string | null {
  const m = basename(file).match(AT_FILENAME);
  return m ? m[1] : null;
}

/**
 * "0004-project-management-opfs.md" → "project-management-opfs".
 * Legacy AT files without a numeric prefix (e.g. `barycenter-layer-ordering.md`)
 * still yield a slug, but `extractAtId` returns `null` for them, so they skip
 * the cross-reference path entirely.
 */
function extractSlug(filename: string): string {
  return filename.replace(/^\d+-/, "").replace(/\.md$/, "");
}

export interface SpecLookup {
  /**
   * Returns the spec / test file paths that reference the given AT id, or `[]`.
   * `atSlug` is the filename slug after the id (e.g. "project-management-opfs"
   * from "0004-project-management-opfs.md"); implementations may use it to
   * disambiguate when multiple ATs share the same numeric prefix.
   */
  findSpecsForAtId(atId: string, atSlug?: string): string[];
}

/**
 * Default spec lookup that scans `packages/e2e/tests/` filenames and the
 * contents of `packages/{core,app,cli,lsp,vscode}/src/**\/*.test.{ts,tsx}`.
 *
 * The match is intentionally loose: filename prefix `at-NNNN` for the e2e
 * folder, plus a substring search for `AT-NNNN` inside test file contents
 * (handles `(AT-0031-02)` style labels).
 */
function createDefaultSpecLookup(repoRoot: string): SpecLookup {
  const e2eDir = join(repoRoot, "packages/e2e/tests");
  const e2eFiles = existsSync(e2eDir)
    ? readdirSync(e2eDir)
        .filter((f) => f.endsWith(".spec.ts"))
        .map((f) => join("packages/e2e/tests", f))
    : [];

  // For unit tests we only collect files that mention `AT-NNNN` substring.
  // Doing a recursive walk is cheap (a few hundred files) and keeps the
  // output deterministic without forcing every package to declare its spec.
  const unitTestFiles = collectUnitTestFiles(repoRoot);

  return {
    findSpecsForAtId(atId, atSlug) {
      const matches: string[] = [];
      const atTokens = slugTokens(atSlug ?? "");
      // e2e: filename starts with at-NNNN. Tighten with slug-token overlap
      // when the AT filename has a slug — multiple ATs sometimes share the
      // same id prefix (e.g. 0046-foo / 0046-bar) and would otherwise
      // both match the same spec.
      for (const path of e2eFiles) {
        if (!basename(path).startsWith(`at-${atId}`)) continue;
        if (atTokens.length === 0 || hasTokenOverlap(basename(path), atTokens)) {
          matches.push(path);
        }
      }
      // unit tests: content contains the literal `AT-NNNN`
      const needle = `AT-${atId}`;
      for (const { path, content } of unitTestFiles) {
        if (content.includes(needle)) matches.push(path);
      }
      return matches;
    },
  };
}

/**
 * Tokenize a kebab/underscore slug, dropping short or numeric tokens that
 * carry no signal (e.g. `02`, `to`). Exported for direct unit-testing of
 * the slug-overlap heuristic.
 */
export function slugTokens(slug: string): string[] {
  return slug
    .toLowerCase()
    .split(/[-_]+/)
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t));
}

export function hasTokenOverlap(text: string, tokens: string[]): boolean {
  const lower = text.toLowerCase();
  return tokens.some((t) => lower.includes(t));
}

interface UnitTestEntry {
  path: string;
  content: string;
}

// Reads every test file's full content into memory. For the current corpus
// (~150 files, microseconds total) this is fine; if scan time becomes
// noticeable, switch to streaming or pre-grep with `git grep`.
function collectUnitTestFiles(repoRoot: string): UnitTestEntry[] {
  const roots = ["packages/core/src", "packages/app/src", "packages/cli/src", "packages/lsp/src"];
  const out: UnitTestEntry[] = [];
  for (const r of roots) {
    walkTests(join(repoRoot, r), repoRoot, out);
  }
  return out;
}

function walkTests(absDir: string, repoRoot: string, out: UnitTestEntry[]): void {
  if (!existsSync(absDir)) return;
  const entries = readdirSync(absDir, { withFileTypes: true });
  for (const e of entries) {
    const abs = join(absDir, e.name);
    if (e.isDirectory()) {
      walkTests(abs, repoRoot, out);
      continue;
    }
    if (!/\.test\.tsx?$/.test(e.name)) continue;
    const rel = abs.slice(repoRoot.length + 1);
    out.push({ path: rel, content: readFileSync(abs, "utf8") });
  }
}

interface AnalyzeRepoOptions {
  repoRoot: string;
  atDir?: string;
  specLookup?: SpecLookup;
}

export interface RepoReport {
  reports: FileReport[];
  /** Cross-reference findings (kind === "missing-marker-with-spec") aggregated separately. */
  crossRefFindings: Finding[];
}

export function analyzeRepo(options: AnalyzeRepoOptions): RepoReport {
  const atDir = join(options.repoRoot, options.atDir ?? "docs/acceptance");
  const specLookup = options.specLookup ?? createDefaultSpecLookup(options.repoRoot);

  const reports: FileReport[] = [];
  const crossRefFindings: Finding[] = [];

  if (!existsSync(atDir)) return { reports, crossRefFindings };

  const files = readdirSync(atDir).filter((f) => f.endsWith(".md") && f !== "README.md");
  for (const filename of files.sort()) {
    const rel = join(options.atDir ?? "docs/acceptance", filename);
    const abs = join(atDir, filename);
    const content = readFileSync(abs, "utf8");
    const report = analyzeFile(rel, content);
    reports.push(report);

    if (!report.hasCanonicalMarker && report.atId) {
      const slug = extractSlug(filename);
      const specPaths = specLookup.findSpecsForAtId(report.atId, slug);
      if (specPaths.length > 0) {
        crossRefFindings.push({
          kind: "missing-marker-with-spec",
          file: rel,
          specPaths,
        });
      }
    }
  }

  return { reports, crossRefFindings };
}

interface SummaryCounts {
  scanned: number;
  withCanonical: number;
  nonConforming: number;
  missingMarkerWithSpec: number;
  totalFindings: number;
}

export function summarize(report: RepoReport): SummaryCounts {
  let nonConforming = 0;
  let totalFindings = 0;
  for (const r of report.reports) {
    if (r.findings.length > 0) nonConforming += 1;
    totalFindings += r.findings.length;
  }
  return {
    scanned: report.reports.length,
    withCanonical: report.reports.filter((r) => r.hasCanonicalMarker).length,
    nonConforming,
    missingMarkerWithSpec: report.crossRefFindings.length,
    totalFindings: totalFindings + report.crossRefFindings.length,
  };
}
