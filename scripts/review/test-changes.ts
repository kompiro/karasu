// The two test questions the `Review tier` check asks of every PR (Issue #3505):
//
// - a bug fix adds a test that shows the bug is gone (`fix` title, or a PR that
//   closes a `bug` Issue), unless the body says `No test: <reason>`;
// - a change to an existing test file does not take coverage away. A `refactor`
//   may only move imports and swap module paths or comments; any other PR that
//   removes test lines, deletes a test file or adds a skip says
//   `Test change: <reason>`.
//
// The rules read the diff as changed lines, not as assertion patterns: a
// pattern list cannot tell a wrapped matcher (`).toBe(` alone on a line) or a
// moved assertion from a weakened one (TPL-3286). Reason lines are trusted as
// written, which the maintainer chose; the check lists them in its summary so a
// human sees every PR that passed by one.
//
// Pure functions over text, dependency-free like `tier.ts`, which calls them.

import { matchesGlob } from "node:path";
import type { ChangedFile, Hunk } from "./tier.ts";

export const TEST_GLOBS: readonly string[] = ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"];

export const isTestFile = (path: string): boolean => TEST_GLOBS.some((g) => matchesGlob(path, g));

/** The Conventional Commits type of a title, lower-cased (`fix(core)!: x` → `fix`), or null. */
export function titleType(title: string): string | null {
  return /^\s*([a-z]+)(?:\([^)]*\))?!?:/i.exec(title)?.[1].toLowerCase() ?? null;
}

/**
 * The body as a reader of the rendered PR sees it: HTML comments and fenced
 * code blocks hold the template's examples, not the author's words.
 */
function visibleBody(body: string): string {
  return body.replace(/<!--[\s\S]*?(?:-->|$)/g, "").replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1/gm, "");
}

/**
 * The reason a body gives on a `<label>: <reason>` line, or null. A reason left
 * as the template's placeholder (`<reason>`) is no reason.
 */
export function reasonLine(body: string, label: "No test" | "Test change"): string | null {
  const re = new RegExp(`^[ \\t]*(?:[-*][ \\t]+)?${label}:[ \\t]*(\\S.*?)[ \\t]*$`, "m");
  const reason = re.exec(visibleBody(body))?.[1];
  return reason === undefined || /^<[^>]*>$/.test(reason) ? null : reason;
}

/**
 * The Issues of this repository a body closes with a GitHub keyword
 * (`Closes #12`, `fixes: kompiro/karasu#12`). A stacked PR whose base is not
 * the default branch has no `closingIssuesReferences`, so the body is read too.
 */
export function closedIssueNumbers(body: string, repo: string): number[] {
  const re = new RegExp(
    `\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\\s+(?:${repo.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")})?#(\\d+)\\b`,
    "gi",
  );
  return [...new Set([...visibleBody(body).matchAll(re)].map((m) => Number(m[1])))];
}

// ---------------------------------------------------------------------------
// Reading a test file

/** 0-based indexes of the lines that belong to an `import ... from "..."` statement. */
function importLines(text: string): Set<number> {
  const lines = text.split("\n");
  const inImport = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    // Not `import(` (dynamic) or `import.meta`.
    if (!/^\s*import(?:\s|\{|\*|["'])/.test(lines[i])) continue;
    let j = i;
    while (
      j < lines.length &&
      !/\bfrom\s*["'][^"']*["']|^\s*import\s*["']|;\s*$/.test(lines[j]) &&
      j - i < 200
    ) {
      j++;
    }
    for (let k = i; k <= Math.min(j, lines.length - 1); k++) inImport.add(k);
    i = j;
  }
  return inImport;
}

/**
 * The 0-based index of the first line of the file's body: the first line that is
 * not blank, not a comment and not part of an import. A blank line above it sits
 * among the imports, where no test can be.
 */
function bodyStart(text: string, imports: ReadonlySet<number>): number {
  const lines = text.split("\n");
  const i = lines.findIndex(
    (line, n) => !imports.has(n) && line.trim() !== "" && !/^\s*(?:\/\/|\/\*|\*)/.test(line),
  );
  return i < 0 ? lines.length : i;
}

/** What a side of a file says about its lines: imports, and blank lines among them. */
function sideReader(text: string | null | undefined): (index: number, line: string) => boolean {
  if (typeof text !== "string") return () => false;
  const imports = importLines(text);
  const start = bodyStart(text, imports);
  return (index, line) => imports.has(index) || (index < start && line.trim() === "");
}

const PATH_STRING = /(["'`])((?:\\.|(?!\1)[^\\\n])*\.[cm]?[jt]sx?)\1/g;
const MODULE_CALL =
  /\b(import|require|vi\.(?:mock|doMock|unmock|importActual|importMock))\(\s*(["'`])(?:\\.|(?!\2)[^\\\n])*\2/g;

/**
 * A line with its comment text and module path strings masked. Two lines that
 * mask to the same text differ only in those. A comment keeps its markers: a
 * line that opens or closes a block comment does not match one that does not, so
 * a swap cannot comment tests out.
 */
export function maskPathsAndComments(line: string): string {
  const trimmed = line.trim();
  const indent = line.slice(0, line.length - line.trimStart().length);
  if (trimmed.startsWith("//")) return `${indent}//⟦c⟧`;
  if (/^\/\*.*\*\/$/.test(trimmed) && !trimmed.slice(2, -2).includes("*/")) {
    return `${indent}/*⟦c⟧*/`;
  }
  if (trimmed.startsWith("*") && !trimmed.startsWith("*/")) {
    return `${indent}*⟦c⟧${trimmed.includes("*/") ? "*/" : ""}`;
  }
  let code = line;
  // A trailing `// ...`, when the quotes before it are balanced (not inside a string).
  const m = /\s\/\/(?!.*["'`]).*$/.exec(code);
  if (m && (code.slice(0, m.index).match(/["'`]/g) ?? []).length % 2 === 0) {
    code = `${code.slice(0, m.index)} //⟦c⟧`;
  }
  return code
    .replace(MODULE_CALL, (_, fn: string) => `${fn}(⟦path⟧`)
    .replace(PATH_STRING, "⟦path⟧");
}

/** The lines of a hunk that the refactor rule does not already allow (imports, blank lines among them). */
function unexplained(h: Hunk, before: ChangedFile["before"], after: ChangedFile["after"]) {
  const oldSide = sideReader(before);
  const newSide = sideReader(after);
  return {
    removed: h.removed.filter((line, k) => !oldSide(h.oldStart - 1 + k, line)),
    added: h.added.filter((line, k) => !newSide(h.newStart - 1 + k, line)),
  };
}

/** Whether every remaining line pairs, in order, with one that differs only in paths or comments. */
function onlySwaps(rest: { removed: string[]; added: string[] }): boolean {
  return (
    rest.removed.length === rest.added.length &&
    rest.removed.every(
      (line, i) => maskPathsAndComments(line) === maskPathsAndComments(rest.added[i]),
    )
  );
}

/** Lines that turn tests off or narrow a run to some of them. */
const DISABLING = [/\.(?:skip|fixme|todo|only)\b/, /\b(?:skipIf|runIf)\b/, /^\s*return\s*;?\s*$/];

// ---------------------------------------------------------------------------
// Added tests

/** A test case opened on the line (`it(`, `test.each(`), not a skipped or focused one. */
const TEST_CASE = /^\s*(?:it|test)(?:\.(?:each|for|concurrent|sequential|fails))*\s*[(`]/;

/**
 * 0-based line ranges (exclusive start, inclusive end) of the argument lists of
 * `.each(` calls: where a row added to the table is a new case. Brackets inside
 * strings and line comments are skipped.
 */
function eachTables(text: string): [number, number][] {
  const lines = text.split("\n");
  const ranges: [number, number][] = [];
  for (let i = 0; i < lines.length; i++) {
    const at = lines[i].search(/\.each\s*\(/);
    if (at < 0) continue;
    let depth = 0;
    let quote: string | null = null;
    let end = -1;
    scan: for (let j = i; j < lines.length; j++) {
      const line = lines[j];
      for (let c = j === i ? lines[i].indexOf("(", at) : 0; c < line.length; c++) {
        const ch = line[c];
        if (quote !== null) {
          if (ch === "\\") c++;
          else if (ch === quote) quote = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") quote = ch;
        else if (ch === "/" && line[c + 1] === "/") break;
        else if ("([{".includes(ch)) depth++;
        else if (")]}".includes(ch) && --depth === 0) {
          end = j;
          break scan;
        }
      }
      // A string other than a template literal ends with its line.
      if (quote !== "`") quote = null;
    }
    if (end > i) ranges.push([i, end]);
  }
  return ranges;
}

/**
 * Whether the PR adds a test case: a new test file, a test case or `.each` row
 * added to an existing one, or a new input a test reads from a directory (an
 * example, a renderer fixture, an acceptance-test `krs` fence).
 */
export function addsTest(files: readonly ChangedFile[]): boolean {
  return files.some((f) => {
    if (f.status === "added") {
      if (isTestFile(f.path)) return true;
      if (/^examples\/.*\.krs$/.test(f.path)) return true;
      if (f.path.startsWith("packages/core/src/renderer/fixtures/")) return true;
    }
    if (f.status === "deleted") return false;
    if (/^docs\/acceptance\/[^/]+\.md$/.test(f.path)) {
      return f.hunks.some((h) => h.added.some((line) => /^\s*(?:```|~~~)krs(?:\s|$)/.test(line)));
    }
    if (!isTestFile(f.path)) return false;
    const tables = typeof f.after === "string" ? eachTables(f.after) : [];
    return f.hunks.some((h) =>
      h.added.some((line, k) => {
        if (TEST_CASE.test(line)) return true;
        const at = h.newStart - 1 + k;
        return (
          line.trim() !== "" &&
          !/^\s*(?:\/\/|\/\*|\*)/.test(line) &&
          tables.some(([start, end]) => at > start && at < end)
        );
      }),
    );
  });
}

// ---------------------------------------------------------------------------
// The check

interface Waiver {
  label: "No test" | "Test change";
  reason: string;
}

export interface TestCheck {
  errors: string[];
  /** The reason lines this PR passed by, for the check's summary. */
  waivers: Waiver[];
}

/**
 * Both test questions for one PR. `closesBug` is whether the PR closes an Issue
 * labeled `bug` (the CLI reads the labels). `files` holds `before` and `after`
 * for every existing test file it changes.
 */
export function checkTestChanges(input: {
  title: string;
  body: string;
  closesBug: boolean;
  files: readonly ChangedFile[];
}): TestCheck {
  const errors: string[] = [];
  const waivers: Waiver[] = [];
  const type = titleType(input.title);

  if ((type === "fix" || input.closesBug) && !addsTest(input.files)) {
    const why = type === "fix" ? "its title type is fix" : "it closes a bug Issue";
    const reason = reasonLine(input.body, "No test");
    if (reason !== null) waivers.push({ label: "No test", reason });
    else {
      errors.push(
        `This PR fixes a bug (${why}) but adds no test case. Add one that fails without the fix, ` +
          `or write "No test: <reason>" in the body when there is nothing to test ` +
          `(docs/process/review.md "リスク段階").`,
      );
    }
  }

  const existing = input.files.filter((f) => f.status !== "added" && isTestFile(f.path));
  if (type === "refactor") {
    const broken = existing.filter(
      (f) =>
        f.status === "deleted" ||
        f.hunks.some((h) => !onlySwaps(unexplained(h, f.before, f.after))),
    );
    if (broken.length > 0) {
      errors.push(
        `A refactor changes existing tests beyond imports, module paths and comments: ` +
          `${broken.map((f) => f.path).join(", ")}. A refactor keeps the tests as they are; ` +
          `if the change is not behavior-preserving, give the title another type and write ` +
          `"Test change: <reason>" in the body.`,
      );
    }
    return { errors, waivers };
  }

  const weakened = existing.filter(
    (f) =>
      f.status === "deleted" ||
      f.hunks.some((h) => {
        const rest = unexplained(h, f.before, f.after);
        return (
          (rest.removed.length > 0 && !onlySwaps(rest)) ||
          h.added.some((line) => DISABLING.some((re) => re.test(line)))
        );
      }),
  );
  if (weakened.length > 0) {
    const reason = reasonLine(input.body, "Test change");
    if (reason !== null) waivers.push({ label: "Test change", reason });
    else {
      errors.push(
        `This PR removes lines from, deletes or skips existing tests: ` +
          `${weakened.map((f) => f.path).join(", ")}. Write "Test change: <reason>" in the body ` +
          `to say why (docs/process/review.md "リスク段階").`,
      );
    }
  }
  return { errors, waivers };
}
