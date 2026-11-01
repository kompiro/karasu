/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Fails when a tracked file outside `docs/` cites a Design Doc (Issue #3471).
//
// A Design Doc is deleted when it is promoted to an ADR (`docs/process.md`
// 「ドキュメントのライフサイクル」), so a citation of one from code is an
// address the process guarantees will die. Each promotion then has two bad
// choices: repoint the code, which makes the promotion PR a code change and
// costs it the Low tier ADR-2331 gives an ADR-only PR (#3468), or leave the
// citation dead. When this guard was written, 68 of the 83 such citations were
// already dead. Cite the ADR instead, or the Issue while there is no ADR yet. That is
// TPL-2254, and ADR-2348 already holds AT records to it
// (`scripts/acceptance/design-refs.ts`); this guard holds everything outside
// `docs/` to it. Inside `docs/`, a promotion swaps links in Markdown and stays
// Low, so those citations are left to the promotion.
//
// `docs/design/TEMPLATE.md` is permanent and may be cited. A file whose subject
// is Design Doc paths as data is exempted by name in EXEMPT_FILES, and each
// exemption must still carry a citation, so the list cannot outlive its reason.
//
// WHERE IT RUNS: lefthook pre-push, and both jobs that report the Required
// `Check`: `ci.yml` and the docs-only stub `ci-skip.yml`, whose
// `paths-ignore` covers `**/*.md` and `.claude/**`, where a citation can land
// as easily as in code (TPL-2446). The stub has no `pnpm install`, so this file
// is erasable TypeScript run by plain `node`.

/** `docs/design/<name>.md`, however it is quoted or linked. */
const DESIGN_REF = /docs\/design\/([A-Za-z0-9._-]+\.md)/g;

/** Design Docs that are never promoted, so citing them cannot rot. */
export const PERMANENT_DESIGN_DOCS = ["TEMPLATE.md"];

/** Files that hold Design Doc paths as data, not as citations. */
export const EXEMPT_FILES: Record<string, string> = {
  "scripts/review/tier.test.ts": "the tier classifier's tests take Design Doc paths as input",
  "scripts/adr/generated.test.ts": "the ADR diff-kind tests take a Design Doc path as input",
  "scripts/acceptance/design-refs.ts": "the AT guard documents the link shape it matches",
  "scripts/lint/design-doc-refs.test.ts": "this guard's tests",
};

export interface ScannedFile {
  path: string;
  text: string;
}

export type FindingKind =
  /** A file outside `docs/` cites a Design Doc. */
  | "design-doc-ref"
  /** An EXEMPT_FILES entry whose file no longer cites a Design Doc. */
  | "stale-exemption";

export interface Finding {
  kind: FindingKind;
  path: string;
  /** 1-based line of the citation; absent for a stale exemption. */
  line?: number;
  /** The cited path as written; absent for a stale exemption. */
  ref?: string;
}

/** Whether `path` is scanned: tracked, and not under `docs/`. */
export const inScope = (path: string): boolean => !path.startsWith("docs/");

/** Citations of non-permanent Design Docs in one file, one per line and target. */
function citations(file: ScannedFile): { line: number; ref: string }[] {
  const found: { line: number; ref: string }[] = [];
  file.text.split("\n").forEach((text, i) => {
    const seen = new Set<string>();
    for (const m of text.matchAll(DESIGN_REF)) {
      if (PERMANENT_DESIGN_DOCS.includes(m[1]) || seen.has(m[0])) continue;
      seen.add(m[0]);
      found.push({ line: i + 1, ref: m[0] });
    }
  });
  return found;
}

export function check(files: readonly ScannedFile[]): Finding[] {
  const findings: Finding[] = [];
  const exemptWithCitation = new Set<string>();
  for (const file of files) {
    if (!inScope(file.path)) continue;
    const found = citations(file);
    if (Object.hasOwn(EXEMPT_FILES, file.path)) {
      if (found.length > 0) exemptWithCitation.add(file.path);
      continue;
    }
    for (const { line, ref } of found) {
      findings.push({ kind: "design-doc-ref", path: file.path, line, ref });
    }
  }
  for (const path of Object.keys(EXEMPT_FILES)) {
    if (!exemptWithCitation.has(path)) findings.push({ kind: "stale-exemption", path });
  }
  return findings;
}

export function describeFinding(f: Finding): string {
  if (f.kind === "stale-exemption") {
    return `${f.path}: listed in EXEMPT_FILES but cites no Design Doc; remove the entry`;
  }
  return `${f.path}:${f.line} cites ${f.ref}; cite the ADR, or the Issue (#N) until one exists`;
}

export const HOW_TO_FIX = [
  "A Design Doc is deleted when it is promoted to an ADR, so a citation of one",
  "from outside docs/ always ends up dead, or makes the promotion PR edit code.",
  "Cite the ADR, or the Issue (#N) while there is no ADR yet (ADR-3471).",
].join("\n");

/** Reads every tracked regular file in scope. Symlinks and unreadable files are skipped. */
export function readTrackedFiles(repoRoot: string): ScannedFile[] {
  const listed = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" });
  const files: ScannedFile[] = [];
  for (const path of listed.split("\0")) {
    if (path === "" || !inScope(path)) continue;
    const abs = join(repoRoot, path);
    try {
      if (!lstatSync(abs).isFile()) continue;
      files.push({ path, text: readFileSync(abs, "utf8") });
    } catch {
      continue;
    }
  }
  return files;
}

function main(): void {
  const files = readTrackedFiles(process.cwd());
  const findings = check(files);
  if (findings.length > 0) {
    console.error(`design-doc-refs: ${findings.length} finding(s):`);
    for (const f of findings) console.error(`✗ ${describeFinding(f)}`);
    console.error(HOW_TO_FIX);
    process.exit(1);
  }
  console.log(`design-doc-refs: ok (${files.length} tracked file(s) outside docs/)`);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /design-doc-refs\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
