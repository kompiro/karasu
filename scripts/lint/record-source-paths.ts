/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Guards the `packages/…` / `scripts/…` source paths named in the records that
// are meant to stay true — acceptance tests, test perspectives, design docs —
// against the working tree (Issue #2648).
//
// A record can name a file that no longer exists and nothing fails. #2604
// deleted about half of `packages/nest`; eight records kept pointing at the
// deleted files and every check in CI passed the whole time. This is the
// source-path level of TPL-2254 ("a record that is re-read points at an
// address that outlives it"), one below the URLs that TPL already covers.
//
// The existing guards do not reach it: `at:check-coverage` never resolves the
// unit-test paths inside a `> ✅ Automated —` marker, `adr:check-assumptions`
// reads ADR *frontmatter* only, and `knip` sees code rather than prose.
//
// WHY `docs/adr/**` IS NOT SCANNED — do not "fix" this by adding it. An ADR
// body is a record of a decision at its date and is deliberately not rewritten
// when the code moves on. ADR-706 states it for a rename:
//
//   旧名 `KarasuPreviewColumn` は以下の ADR / acceptance doc / design doc に
//   登場するが、これらは**当時の実装と決定の記録**であり本文は変更しない
//
// So the dead references under `docs/adr/**` (28 at the time of writing) are
// not defects, and a guard that flagged them would be turned off within a
// week. ADR frontmatter is the opposite case and is already covered by
// `adr:check-assumptions`, so nothing is lost by leaving the bodies alone.
//
// WHAT THIS DOES NOT CATCH: a path written as prose rather than inside a code
// span, and a path that exists but is no longer the right one for the claim
// around it. Code spans alone found every dead reference in this repo and
// produced no false positive; reading bare prose paths would need a deny-list
// for illustrative names (`packages/foo`), which is the maintenance shape that
// ADR-2125 retired. A green result means no dangling paths, not that the
// records describe the code accurately.

/** Directories whose records are expected to stay true. `docs/adr` is excluded — see the header. */
export const SCANNED_DIRS = ["docs/acceptance", "docs/test-perspectives", "docs/design"];

/**
 * Path segments naming build output. A clean checkout does not have them, so
 * their absence is the normal state rather than a rotted reference. Everything
 * here is git-ignored by the repo or by a package's own `.gitignore`; the list
 * is spelled out rather than shelled out to `git check-ignore` because that
 * reads the *developer's* global excludes too (`out/` is only ignored there),
 * which would make the guard answer differently on CI than on a laptop.
 */
export const GENERATED_SEGMENTS = new Set([
  ".astro",
  ".vscode-test",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "preview-dist",
  "screenshots",
  "test-resources",
  "test-results",
]);

/** Generated files that live beside sources rather than under a build directory. */
export const GENERATED_FILES = new Set(["THIRD_PARTY_NOTICES.md"]);

/**
 * Declares that the next line names a path which is *meant* not to exist —
 * history ("this test was deleted"), an illustration, or a file a design doc
 * intends to create. Modelled on ```` ```krs invalid ```` in
 * `.claude/rules/krs-fences.md`: a declaration of what the line claims, not a
 * switch that turns the check off. Hence both halves below — the reason is
 * required, and an unused marker is itself a finding, so the declaration
 * cannot outlive the claim it stands for.
 */
export const ABSENT_PATH_MARKER = "absent-path-next-line";

/**
 * The marker must be the whole line (indentation aside). Matching it anywhere
 * would make any document that *describes* the syntax declare something —
 * writing `` `<!-- absent-path-next-line: <reason> -->` `` in a sentence, as
 * this guard's own AT record and TPL-2254 both do, fired the marker and then
 * failed as unused. A standalone line is also how `eslint-disable-next-line`
 * reads, and it is how every real use in this repo is written.
 */
const MARKER_RE = new RegExp(`^\\s*<!--\\s*${ABSENT_PATH_MARKER}\\s*:([^]*?)-->\\s*$`);

/** Inline code span: `…` (single backtick, no embedded backtick). */
const INLINE_CODE_RE = /`([^`\n]+)`/g;

/**
 * A fence opener or closer: three or more backticks or tildes, indented up to
 * three spaces. Both the character and the run length matter — a ```` fence
 * wrapping a ``` example (as the rules files do when they quote fence syntax)
 * closes only on four or more backticks, and a ~~~ fence does not close a ```
 * one. Toggling on any ``` line got that wrong in both directions: it could
 * read a fenced example as prose, or swallow the rest of a document as fence.
 */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * A span that is a source path and nothing else. Requiring the *whole* span to
 * match is what keeps globs (`at-*.spec.ts`), placeholders (`<spec path>`) and
 * shell lines (`cp a b`) out without a deny-list: none of them is bare path
 * characters end to end.
 */
const SOURCE_PATH_RE = /^(?:packages|scripts)\/[A-Za-z0-9._/-]+$/;

export type FindingKind =
  /** A code span names a source path that is not in the working tree. */
  | "missing-source-path"
  /** A marker sits above a line whose paths all resolve — the declaration is stale. */
  | "absent-path-marker-unused"
  /** A marker declares nothing about why the path is absent. */
  | "absent-path-marker-empty-reason";

export interface Finding {
  kind: FindingKind;
  file: string;
  line: number;
  /** The offending path; empty for the marker findings, which are about a line. */
  path: string;
}

/** True when the path is build output rather than a source file. */
export function isGeneratedPath(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  if (segments.some((s) => GENERATED_SEGMENTS.has(s))) return true;
  const basename = segments.at(-1);
  return basename !== undefined && GENERATED_FILES.has(basename);
}

/** Every source path named by a code span on one line of Markdown. */
export function sourcePathsInLine(line: string): string[] {
  const paths: string[] = [];
  for (const m of line.matchAll(INLINE_CODE_RE)) {
    const span = m[1];
    if (!SOURCE_PATH_RE.test(span)) continue;
    if (isGeneratedPath(span)) continue;
    paths.push(span);
  }
  return paths;
}

/** The declared reason when a line carries the marker, otherwise `undefined`. */
export function absentPathReason(line: string): string | undefined {
  const m = MARKER_RE.exec(line);
  return m === undefined || m === null ? undefined : m[1].trim();
}

/**
 * Findings for one Markdown document. YAML frontmatter and fenced code blocks
 * are not read: frontmatter is validated by the ADR / TPL tooling and carries
 * prose with stand-in names (`packages/foo`), and a fence holds commands and
 * transcripts rather than the record's own claims.
 */
export function checkMarkdown(file: string, markdown: string, repoRoot: string): Finding[] {
  const findings: Finding[] = [];
  const lines = markdown.split("\n");
  let inFrontmatter = lines[0]?.trim() === "---";
  let openFence: string | undefined;
  let pendingMarker: { line: number; reason: string } | undefined;

  /** The pending declaration turned out to stand for nothing. */
  const reportUnusedMarker = (): void => {
    if (pendingMarker === undefined) return;
    findings.push({
      kind: "absent-path-marker-unused",
      file,
      line: pendingMarker.line,
      path: "",
    });
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (inFrontmatter) {
      if (index > 0 && /^---\s*$/.test(line)) inFrontmatter = false;
      return;
    }

    const fence = FENCE_RE.exec(line)?.[1];
    if (fence !== undefined) {
      if (openFence === undefined) {
        openFence = fence;
      } else if (fence[0] === openFence[0] && fence.length >= openFence.length) {
        openFence = undefined;
      }
      return;
    }
    if (openFence !== undefined) return;

    const reason = absentPathReason(line);
    if (reason !== undefined) {
      if (reason === "") {
        findings.push({
          kind: "absent-path-marker-empty-reason",
          file,
          line: lineNumber,
          path: "",
        });
      }
      // Two markers in a row: the first one's next line is another marker, so
      // it names no path and stands for nothing.
      reportUnusedMarker();
      pendingMarker = { line: lineNumber, reason };
      return;
    }

    const missing = sourcePathsInLine(line).filter((path) => !existsSync(resolve(repoRoot, path)));

    if (pendingMarker !== undefined) {
      if (missing.length === 0) reportUnusedMarker();
      pendingMarker = undefined;
      return;
    }

    for (const path of missing) {
      findings.push({ kind: "missing-source-path", file, line: lineNumber, path });
    }
  });

  // A marker on the last line of a file declares nothing.
  reportUnusedMarker();

  return findings;
}

/** Recursively collect every Markdown file under `dir`. */
function markdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...markdownFiles(full));
    } else if (entry.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

/** Every finding across `SCANNED_DIRS`, ordered by file then line. */
export function check(repoRoot: string, dirs: string[] = SCANNED_DIRS): Finding[] {
  const findings: Finding[] = [];
  for (const dir of dirs) {
    for (const file of markdownFiles(resolve(repoRoot, dir))) {
      const rel = relative(repoRoot, file);
      findings.push(...checkMarkdown(rel, readFileSync(file, "utf8"), repoRoot));
    }
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export function describeFinding(f: Finding): string {
  switch (f.kind) {
    case "missing-source-path":
      return `${f.file}:${f.line} — \`${f.path}\` does not exist`;
    case "absent-path-marker-unused":
      return `${f.file}:${f.line} — \`${ABSENT_PATH_MARKER}\` declares an absent path, but every path on the next line resolves`;
    case "absent-path-marker-empty-reason":
      return `${f.file}:${f.line} — \`${ABSENT_PATH_MARKER}\` needs a reason after the colon`;
  }
}

const HOW_TO_FIX = [
  "",
  "A record under docs/{acceptance,test-perspectives,design} names a source path",
  "that is not in the working tree. Repoint it at the successor file, or drop the",
  "reference when the feature is gone.",
  "",
  "If the path is meant to be absent — history, an illustration, or a file a design",
  `doc intends to create — declare it on the line above with a reason:`,
  "",
  `    <!-- ${ABSENT_PATH_MARKER}: retired test, named as history (#1585) -->`,
  "",
  "The declaration is checked both ways: it fails once the path exists again, which",
  "is how an implemented design doc reports that it is due for ADR promotion.",
].join("\n");

function main(): void {
  const findings = check(process.cwd());
  if (findings.length > 0) {
    console.error(`record-source-paths: ${findings.length} finding(s):`);
    for (const f of findings) console.error(`✗ ${describeFinding(f)}`);
    console.error(HOW_TO_FIX);
    process.exit(1);
  }
  console.log(
    `record-source-paths: ok (every \`packages/…\` / \`scripts/…\` code span in ${SCANNED_DIRS.join(", ")} resolves)`,
  );
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /record-source-paths\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
