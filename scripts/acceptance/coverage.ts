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
 *
 * On top of the heuristic cross-ref above, two *exact* (non-heuristic) e2e
 * linkage guards keep the AT ↔ e2e spec mapping from drifting (Issue #1680):
 *
 * - **orphan-spec**: every `packages/e2e/tests/at-*.spec.ts` must be named by
 *   its full path in at least one AT doc — so a reader of the spec can find
 *   the AT, and a reader of the AT can find the spec. Adding an AT-numbered
 *   e2e spec without linking it from an AT doc fails the guard.
 * - **stale-spec-ref**: every `packages/e2e/tests/*.spec.ts` path referenced
 *   in an AT doc must resolve to a real file — so renaming or deleting a spec
 *   (e.g. the `drilldown` → `drill-down` slug drift) cannot leave a dangling
 *   reference behind.
 *
 * Both are exact filename/path checks (no slug-token heuristic), so they run
 * under `--strict` without the "verify manually" caveat the cross-ref carries.
 */

export type Finding =
  | { kind: "verified-by-metadata"; file: string; line: number; snippet: string }
  | { kind: "section-grouping"; file: string; line: number; heading: string }
  | { kind: "checked-without-blockquote"; file: string; line: number; bullet: string }
  | { kind: "unchecked-under-suite-wide"; file: string; line: number; bullet: string }
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
// Suite-wide shorthand: a single header blockquote covers every `[x]`
// bullet that follows until the next markdown heading. See SKILL.md
// "ショートハンド A".
//
// Note: this regex also matches `CANONICAL_BLOCKQUOTE` (the `\b` after
// "Automated" accepts the space before "by"), so the suite-wide line
// trivially counts as a canonical marker too. The two checks are kept
// separate because the per-checkbox pass needs to distinguish a
// suite-wide *header* (sets `suiteWideActive`) from a per-bullet marker
// (does not).
const SUITE_WIDE_BLOCKQUOTE = /^\s*>\s*✅\s+Automated by\s+`[^`]+`\s*\(suite-wide\)/;
const HEADING = /^#{1,6}\s/;

const AT_FILENAME = /^(\d{4})-/;

const E2E_TESTS_DIR = "packages/e2e/tests";
// AT-numbered e2e specs follow the `at-<slug>.spec.ts` convention; the
// `*.smoke.spec.ts` fixtures (anthropic-fixture, opfs) are test infrastructure
// not bound to an AT, so the orphan guard skips them.
const E2E_AT_SPEC_RE = /^at-.*\.spec\.ts$/;
// Any e2e spec path mentioned in an AT doc — used by the stale-ref guard. Kept
// deliberately broad (matches `.smoke.spec.ts` too) so a doc that cites any
// e2e file by path is checked for existence.
const E2E_SPEC_PATH_RE = /packages\/e2e\/tests\/[A-Za-z0-9._/-]+\.spec\.ts/g;

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
    if (CANONICAL_BLOCKQUOTE.test(line) || SUITE_WIDE_BLOCKQUOTE.test(line)) {
      hasCanonicalMarker = true;
    }
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
  // A `[x]` is also accepted if a suite-wide marker precedes it within the
  // same heading section.
  let suiteWideActive = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (HEADING.test(line)) {
      suiteWideActive = false;
      continue;
    }
    if (SUITE_WIDE_BLOCKQUOTE.test(line)) {
      suiteWideActive = true;
      continue;
    }
    const m = line.match(CHECKBOX);
    if (!m) continue;
    if (suiteWideActive && m[1] === " ") {
      // Convention forbids `[ ]` under a suite-wide marker — the whole
      // section must fall back to per-bullet form so coverage is unambiguous.
      findings.push({
        kind: "unchecked-under-suite-wide",
        file,
        line: i + 1,
        bullet: m[2].trim(),
      });
      continue;
    }
    if (m[1] !== "x") continue;
    if (suiteWideActive) continue;
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
      // unit tests: content contains the literal `AT-NNNN` AND the test
      // filename has at least one slug-token in common with the AT (when
      // the AT has signal-bearing tokens at all). This filters out the
      // case where multiple ATs share the same numeric prefix and one of
      // them references the id in test names — e.g. AT-0042-vscode-cross-
      // diagram-navigation should not match `render.e2e.test.ts` (which
      // references AT-0042-cli-render-command in its test names).
      const needle = `AT-${atId}`;
      for (const { path, content } of unitTestFiles) {
        if (!content.includes(needle)) continue;
        if (atTokens.length === 0 || hasTokenOverlap(basename(path), atTokens)) {
          matches.push(path);
        }
      }
      return matches;
    },
  };
}

/**
 * Tokens dropped during slug tokenization because they appear so often
 * across both AT slugs and spec filenames that an overlap on them carries
 * no real signal (e.g. `0007-organization-diagram` × `at-0007-deployment-
 * diagram.spec.ts` would otherwise match on `diagram` alone).
 */
const SLUG_TOKEN_STOPLIST = new Set(["diagram", "view", "test", "spec", "command", "support"]);

/**
 * Tokenize a kebab/underscore slug, dropping short, numeric, or generic
 * tokens that carry no signal. Exported for direct unit-testing of the
 * slug-overlap heuristic.
 */
export function slugTokens(slug: string): string[] {
  return slug
    .toLowerCase()
    .split(/[-_]+/)
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !SLUG_TOKEN_STOPLIST.has(t));
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

/** A reference from an AT doc to an e2e spec path (one per occurrence). */
export interface SpecDocRef {
  /** The AT doc the reference was found in (repo-relative). */
  file: string;
  /** The `packages/e2e/tests/*.spec.ts` path as written in the doc. */
  specPath: string;
}

export interface LinkageReport {
  /**
   * AT-numbered e2e specs (`packages/e2e/tests/at-*.spec.ts`) whose path is not
   * named in any AT doc. Sorted for deterministic output.
   */
  orphanSpecs: string[];
  /**
   * Doc references to e2e spec paths that do not exist on disk. Sorted by
   * `(file, specPath)` for deterministic output.
   */
  staleSpecRefs: SpecDocRef[];
}

/**
 * Pure core of the two exact e2e linkage guards — no filesystem access, so it
 * unit-tests with plain fixtures.
 *
 * @param atSpecFiles repo-relative `packages/e2e/tests/at-*.spec.ts` paths that
 *   currently exist (the orphan guard's universe).
 * @param docRefs every `(doc, specPath)` reference parsed from the AT docs.
 * @param specExists predicate: does this repo-relative spec path exist on disk?
 */
export function analyzeLinkage(
  atSpecFiles: string[],
  docRefs: SpecDocRef[],
  specExists: (specPath: string) => boolean,
): LinkageReport {
  const referenced = new Set(docRefs.map((r) => r.specPath));
  const orphanSpecs = atSpecFiles.filter((spec) => !referenced.has(spec)).sort();

  const staleSeen = new Set<string>();
  const staleSpecRefs: SpecDocRef[] = [];
  for (const ref of docRefs) {
    if (specExists(ref.specPath)) continue;
    const key = `${ref.file} ${ref.specPath}`;
    if (staleSeen.has(key)) continue;
    staleSeen.add(key);
    staleSpecRefs.push(ref);
  }
  staleSpecRefs.sort(
    (a, b) => a.file.localeCompare(b.file) || a.specPath.localeCompare(b.specPath),
  );

  return { orphanSpecs, staleSpecRefs };
}

/** List repo-relative `packages/e2e/tests/at-*.spec.ts` paths (sorted). */
function listAtSpecFiles(repoRoot: string): string[] {
  const dir = join(repoRoot, E2E_TESTS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => E2E_AT_SPEC_RE.test(f))
    .map((f) => `${E2E_TESTS_DIR}/${f}`)
    .sort();
}

/** Parse every e2e spec path referenced in an AT doc's content. */
function parseSpecRefs(docFile: string, content: string): SpecDocRef[] {
  const refs: SpecDocRef[] = [];
  for (const m of content.matchAll(E2E_SPEC_PATH_RE)) {
    refs.push({ file: docFile, specPath: m[0] });
  }
  return refs;
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
  /** Exact e2e linkage guards (orphan specs, stale spec references). */
  linkage: LinkageReport;
}

export function analyzeRepo(options: AnalyzeRepoOptions): RepoReport {
  const atDir = join(options.repoRoot, options.atDir ?? "docs/acceptance");
  const specLookup = options.specLookup ?? createDefaultSpecLookup(options.repoRoot);

  const reports: FileReport[] = [];
  const crossRefFindings: Finding[] = [];
  const docRefs: SpecDocRef[] = [];

  const emptyLinkage: LinkageReport = { orphanSpecs: [], staleSpecRefs: [] };
  if (!existsSync(atDir)) return { reports, crossRefFindings, linkage: emptyLinkage };

  const files = readdirSync(atDir).filter((f) => f.endsWith(".md") && f !== "README.md");
  for (const filename of files.sort()) {
    const rel = join(options.atDir ?? "docs/acceptance", filename);
    const abs = join(atDir, filename);
    const content = readFileSync(abs, "utf8");
    const report = analyzeFile(rel, content);
    reports.push(report);
    docRefs.push(...parseSpecRefs(rel, content));

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

  const linkage = analyzeLinkage(listAtSpecFiles(options.repoRoot), docRefs, (specPath) =>
    existsSync(join(options.repoRoot, specPath)),
  );

  return { reports, crossRefFindings, linkage };
}

interface SummaryCounts {
  scanned: number;
  withCanonical: number;
  nonConforming: number;
  missingMarkerWithSpec: number;
  orphanSpecs: number;
  staleSpecRefs: number;
  totalFindings: number;
}

export function summarize(report: RepoReport): SummaryCounts {
  let nonConforming = 0;
  let totalFindings = 0;
  for (const r of report.reports) {
    if (r.findings.length > 0) nonConforming += 1;
    totalFindings += r.findings.length;
  }
  const orphanSpecs = report.linkage.orphanSpecs.length;
  const staleSpecRefs = report.linkage.staleSpecRefs.length;
  return {
    scanned: report.reports.length,
    withCanonical: report.reports.filter((r) => r.hasCanonicalMarker).length,
    nonConforming,
    missingMarkerWithSpec: report.crossRefFindings.length,
    orphanSpecs,
    staleSpecRefs,
    totalFindings: totalFindings + report.crossRefFindings.length + orphanSpecs + staleSpecRefs,
  };
}
