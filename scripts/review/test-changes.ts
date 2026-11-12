// The two test questions the `Review tier` check asks of every PR (Issue #3505):
//
// - a bug fix adds a test that shows the bug is gone (`fix` title, or a PR that
//   closes a `bug` Issue), unless the body says `No test: <reason>`;
// - a change to existing tests does not take coverage away. A `refactor` may
//   only move imports and swap module paths or comments; any other PR that
//   removes test lines, deletes a test file or adds a skip says
//   `Test change: <reason>`. Existing tests are test files, helper modules that
//   take the test API (#3548), test runner configs, and the inputs a test reads
//   from a directory.
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

/** A test runner's config, which decides which test files run at all. */
export const isRunnerConfig = (path: string): boolean =>
  /(?:^|\/)(?:(?:vitest|playwright)(?:\.[\w-]+)*\.(?:config|workspace)\.[cm]?[jt]s|\.vscode-test\.[cm]?[jt]s|\.mocharc\.(?:json|[cm]?js))$/.test(
    path,
  );

/** An input a test reads from its directory: adding one adds a case, deleting one drops it. */
export const isTestInput = (path: string): boolean => inputGroup(path) !== null;

/** Which tests read an input. An input moves only within its group. */
function inputGroup(path: string): string | null {
  if (/^examples\/.*\.krs$/.test(path)) return "examples";
  if (path.startsWith("packages/core/src/renderer/fixtures/")) return "renderer";
  return null;
}

/** A file whose code {@link isTestSupport} reads. */
const isCodeFile = (path: string): boolean => /\.[cm]?[jt]sx?$/.test(path);

/** The Conventional Commits type of a title, lower-cased (`fix(core)!: x` → `fix`), or null. */
export function titleType(title: string): string | null {
  return /^\s*([a-z]+)(?:\([^)]*\))?!?:/i.exec(title)?.[1].toLowerCase() ?? null;
}

/**
 * The body as a reader of the rendered PR sees it: HTML comments and fenced
 * code blocks hold the template's examples, not the author's words.
 */
export function visibleBody(body: string): string {
  return body.replace(/<!--[\s\S]*?(?:-->|$)/g, "").replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1/gm, "");
}

/**
 * The reason a body gives on a `<label>: <reason>` line, or null. A reason left
 * as the template's placeholder (`<reason>`) is no reason.
 */
export function reasonLine(body: string, label: "No test" | "Test change"): string | null {
  // Trimmed after the match: a lazy group before `[ \t]*$` is quadratic on a run of spaces.
  const re = new RegExp(`^[ \\t]*(?:[-*][ \\t]+)?${label}:[ \\t]*(\\S.*)$`, "m");
  const reason = re.exec(visibleBody(body))?.[1].trimEnd();
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

type LineState = "code" | "block" | "template";

/** What a value import binds a local name to. */
interface Binding {
  module: string;
  /** The exported name (`test` in `{ test as base }`), `default`, or `*` for a namespace. */
  imported: string;
}

/** What the rules read from one side of a test file. */
interface Side {
  lines: string[];
  /** Whether each line starts in code, inside a block comment or inside a template literal. */
  states: LineState[];
  /** Each line with comment text and module paths masked ({@link maskLines}). */
  masked: string[];
  /** Each line with only comment text masked. */
  bare: string[];
  /** 0-based indexes of the lines of `import ... from "..."` statements. */
  imports: Set<number>;
  /** Each name a value import binds, and the module it comes from. */
  bindings: Map<string, Binding>;
}

/**
 * Where a `/` opens a regex literal rather than dividing: after one of these,
 * or at the start of the line. Not after `++` / `--` (a division) or `<` (a JSX
 * closing tag). Read on the last few characters only, to stay linear.
 */
const REGEX_AFTER =
  /(?:^|[(,=:[!&|?{};*%~^]|(?<!\+)\+|(?<!-)-|=>|\b(?:return|typeof|case|do|else|in|of|void|yield|await))\s*$/;

/**
 * Scans a file once. For each line it records the state the line starts in and
 * the line with its comment text replaced by `⟦c⟧` (the `//`, `/*` and `*\/`
 * markers stay, so a line that opens or closes a comment never matches one that
 * does not). Strings, template literals with their `${...}` holes, and regex
 * literals are kept as written, so a quote, `//` or `/*` inside them does not
 * change the state.
 */
function maskLines(text: string): { states: LineState[]; masked: string[]; bare: string[] } {
  const lines = text.split("\n");
  const states: LineState[] = [];
  const masked: string[] = [];
  const bare: string[] = [];
  let state: LineState = "code";
  // Brace depth in code, and the depths to return to when a `${` hole closes.
  let depth = 0;
  const holes: number[] = [];
  for (const line of lines) {
    states.push(state);
    let out = state === "block" ? "⟦c⟧" : "";
    // `out`'s last characters in code, which decide whether a `/` opens a regex.
    let tail = "";
    for (let c = 0; c < line.length; c++) {
      tail = out.slice(-24);
      const ch = line[c];
      if (state === "block") {
        if (ch === "*" && line[c + 1] === "/") {
          out += "*/";
          state = "code";
          c++;
        }
        continue;
      }
      if (state === "template") {
        out += ch;
        if (ch === "\\") out += line[++c] ?? "";
        else if (ch === "`") state = "code";
        else if (ch === "$" && line[c + 1] === "{") {
          out += "{";
          holes.push(depth);
          depth = 0;
          state = "code";
          c++;
        }
        continue;
      }
      if (ch === "/" && line[c + 1] === "/") {
        out += "//⟦c⟧";
        break;
      }
      if (ch === "/" && line[c + 1] === "*") {
        out += "/*⟦c⟧";
        state = "block";
        c++;
        continue;
      }
      if (ch === "/" && REGEX_AFTER.test(tail)) {
        // A regex literal, to its closing `/` outside a character class.
        let k = c + 1;
        for (let inClass = false; k < line.length; k++) {
          if (line[k] === "\\") k++;
          else if (line[k] === "[") inClass = true;
          else if (line[k] === "]") inClass = false;
          else if (line[k] === "/" && !inClass) break;
        }
        out += line.slice(c, k + 1);
        c = k;
        continue;
      }
      if (ch === '"' || ch === "'") {
        // A quoted string ends on its line.
        let k = c + 1;
        for (; k < line.length && line[k] !== ch; k++) if (line[k] === "\\") k++;
        out += line.slice(c, k + 1);
        c = k;
        continue;
      }
      out += ch;
      if (ch === "`") state = "template";
      else if (ch === "{") depth++;
      else if (ch === "}") {
        if (depth === 0 && holes.length > 0) {
          depth = holes.pop() ?? 0;
          state = "template";
        } else depth--;
      }
    }
    bare.push(out);
    masked.push(maskPaths(out));
  }
  return { states, masked, bare };
}

/** For each line, whether it starts in code rather than in a block comment or a template literal. */
export function codeLineStarts(text: string): boolean[] {
  return maskLines(text).states.map((s) => s === "code");
}

/**
 * A string that names a module by a relative path (`./a/b.ts`) or a bare file
 * name (`node-card.ts`). A repo path (`packages/nest/a.ts`) is not one: tests of
 * path rules use those as inputs, and changing one changes what is tested.
 */
const PATH_STRING = /(["'`])((?:\.\.?\/(?:[^"'`\\\n/]+\/)*)?[^"'`\\\n/]+\.[cm]?[jt]sx?)\1/g;
const MODULE_CALL =
  /\b(import|require|vi\.(?:mock|doMock|unmock|importActual|importMock))\(\s*(["'`])(?:\\.|(?!\2)[^\\\n])*\2/g;

const maskPaths = (line: string): string =>
  line.replace(MODULE_CALL, (_, fn: string) => `${fn}(⟦path⟧`).replace(PATH_STRING, "⟦path⟧");

/** The masked form of one line read on its own, starting in code (for tests). */
export const maskPathsAndComments = (line: string): string => maskLines(line).masked[0];

/** One side of a file, or null when the CLI could not read it. */
function readSide(text: string | null | undefined): Side | null {
  if (typeof text !== "string") return null;
  const lines = text.split("\n");
  const { states, masked, bare } = maskLines(text);
  const imports = new Set<number>();
  const bindings = new Map<string, Binding>();
  for (let i = 0; i < lines.length; i++) {
    // Not `import(` (dynamic) or `import.meta`, nor a `.krs` import in a fixture string.
    if (states[i] !== "code" || !/^\s*import(?:\s|\{|\*|["'])/.test(masked[i])) continue;
    let j = i;
    let spec: RegExpExecArray | null = null;
    for (; j < lines.length && j - i < 200; j++) {
      spec = /\bfrom\s*(["'])([^"']*)\1|^\s*import\s*(["'])([^"']*)\3/.exec(lines[j]);
      if (spec !== null || /;\s*$/.test(lines[j])) break;
    }
    // Only a whole statement is free: nothing but `;` or a comment may follow
    // its module, or code could ride on an import line.
    const whole =
      /(?:\bfrom|^\s*import)\s*(?:(["'])[^"']*\1|\u27E6path\u27E7)\s*;?\s*(?:\/\/\u27E6c\u27E7|\/\*\u27E6c\u27E7\*\/)?\s*$/;
    if (spec === null || j >= lines.length || !whole.test(masked[j])) continue;
    const module = spec[2] ?? spec[4];
    const statement = lines.slice(i, j + 1).join(" ");
    if (!/^\s*import\s+type\b/.test(statement)) {
      const clause = /^\s*import\s+([\s\S]*?)\s*\bfrom\b/.exec(statement)?.[1] ?? "";
      const named = /\{([^}]*)\}/.exec(clause)?.[1] ?? "";
      // [local, imported] pairs.
      const names: [string, string][] = [
        ...named.split(",").flatMap((part): [string, string][] => {
          const n = part.trim();
          if (n === "" || /^type\s/.test(n)) return [];
          const alias = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(n);
          return [alias === null ? [n, n] : [alias[2], alias[1]]];
        }),
        ...(/^\s*([\w$]+)\s*(?:,|$)/.exec(clause.replace(/\{[^}]*\}/, ""))?.slice(1) ?? []).map(
          (n): [string, string] => [n, "default"],
        ),
        ...(/\*\s*as\s+([\w$]+)/.exec(clause)?.slice(1) ?? []).map((n): [string, string] => [
          n,
          "*",
        ]),
      ];
      for (const [name, imported] of names) bindings.set(name, { module, imported });
    }
    for (let k = i; k <= j; k++) imports.add(k);
    i = j;
  }
  return { lines, states, masked, bare, imports, bindings };
}

/** Whether a line may change freely: part of an import, or blank outside a template literal. */
const isFree = (side: Side | null, i: number): boolean =>
  side !== null &&
  (side.imports.has(i) || (side.lines[i]?.trim() === "" && side.states[i] !== "template"));

/**
 * Whether every line of a hunk that is not free pairs, in order, with one that
 * differs only in comment text or module paths. A side that could not be read
 * pairs with nothing.
 */
function onlySwaps(h: Hunk, was: Side | null, now: Side | null): boolean {
  const removed = h.removed.flatMap((_, k) =>
    isFree(was, h.oldStart - 1 + k) ? [] : [h.oldStart - 1 + k],
  );
  const added = h.added.flatMap((_, k) =>
    isFree(now, h.newStart - 1 + k) ? [] : [h.newStart - 1 + k],
  );
  if (removed.length !== added.length) return false;
  return removed.every(
    (i, n) => was !== null && now !== null && was.masked[i] === now.masked[added[n]],
  );
}

/** Whether a hunk only adds lines, or removes nothing but free ones. */
const removesNothing = (h: Hunk, was: Side | null): boolean =>
  h.removed.every((_, k) => isFree(was, h.oldStart - 1 + k));

/**
 * Lines that turn tests off or narrow a run to some of them. These guard
 * against accidents, not disguises: an author off the trusted list is High and
 * a human reads the diff (#3505). Read on code with its strings emptied, so a
 * case title or data that says `only:` or `.skip` is not one.
 */
const DISABLING = [
  // A skip or focus modifier, not a spread (`...skip`) or a property (`result.only`).
  /(?<!\.)\.(?:skip|fixme|todo|only)\b(?=\s*[(.`])/,
  /\b(?:skipIf|runIf)\b/,
  // Playwright's expected failure.
  /\b(?:test|it)(?:\.describe)?\.fail\s*\(/,
  // A `return` without a value.
  /(?:^|[;{)]|\belse)\s*return\s*(?:undefined\s*|void\s+0\s*)?(?:;|\}|$)/,
];

/** The same, read with strings kept: a `skip: true` option and a `ctx["skip"]` call. */
const DISABLING_WITH_STRINGS = [
  /(?:^|[{,])\s*["']?(?:skip|only|todo)["']?\s*:\s*(?:true\b|!|[A-Za-z_$])/,
  /\[\s*["'](?:skip|only|todo|fixme|fail)["']\s*\]/,
];

/** Whether an added (masked) line turns tests off. */
function disables(masked: string): boolean {
  const code = masked.replace(/\/\*\u27E6c\u27E7\*\//g, "").replace(/\/\/\u27E6c\u27E7$/, "");
  const noStrings = code.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, '""');
  return (
    DISABLING.some((re) => re.test(noStrings)) || DISABLING_WITH_STRINGS.some((re) => re.test(code))
  );
}

/** Names a test file runs its tests with: taken from anywhere else, they can turn every test off. */
const TEST_API = new Set([
  "it",
  "test",
  "expect",
  "describe",
  "suite",
  "beforeEach",
  "afterEach",
  "beforeAll",
  "afterAll",
]);

/**
 * Whether lines the PR leaves as they were stop being code (added lines open a
 * block comment or a template literal around them), or the file stops taking
 * its test API from the runner. Unknown sides count as hiding.
 */
function hidesLines(f: ChangedFile, was: Side | null, now: Side | null): boolean {
  if (was === null || now === null) return true;
  for (const [name, b] of was.bindings) {
    const kept = now.bindings.get(name);
    if (isTestApi(name, b) && (kept?.module !== b.module || kept.imported !== b.imported))
      return true;
  }
  return untouchedLines(f, was.states.length).some(
    ([old, cur]) => was.states[old] === "code" && now.states[cur] !== "code",
  );
}

/** Runner modules whose namespace import is the test API. */
const RUNNER_MODULES = new Set(["vitest", "@playwright/test", "node:test"]);

/**
 * Whether a local name binds the names a test runs its tests with: under that
 * name, under the name it was exported as, or as a runner module's default or
 * namespace import (`import test from "node:test"`).
 */
const isTestApi = (name: string, b: Binding): boolean =>
  TEST_API.has(name) ||
  TEST_API.has(b.imported) ||
  ((b.imported === "*" || b.imported === "default") && RUNNER_MODULES.has(b.module));

/**
 * The 0-based [old, new] indexes of the lines a PR leaves as they were. `-U0`
 * hunks in order: an untouched old line moves by the lines added and removed
 * above it.
 */
function untouchedLines(f: ChangedFile, oldLength: number): [number, number][] {
  const hunks = [...f.hunks].sort((a, b) => a.oldStart - b.oldStart);
  const pairs: [number, number][] = [];
  let delta = 0;
  let next = 0;
  for (let line = 1; line <= oldLength; line++) {
    while (next < hunks.length) {
      const h = hunks[next];
      const last = h.removed.length > 0 ? h.oldStart + h.removed.length - 1 : h.oldStart;
      if (last >= line) break;
      delta += h.added.length - h.removed.length;
      next++;
    }
    const h = hunks[next];
    if (h !== undefined && h.removed.length > 0 && line >= h.oldStart) continue;
    pairs.push([line - 1, line - 1 + delta]);
  }
  return pairs;
}

/** Whether a refactor's change to an existing test file keeps the tests as they were. */
function keepsTests(f: ChangedFile): boolean {
  if (f.status === "deleted") return false;
  const was = readSide(f.before);
  const now = readSide(f.after);
  return !hidesLines(f, was, now) && f.hunks.every((h) => onlySwaps(h, was, now));
}

/**
 * Whether a change to an existing test file can take coverage away: it deletes
 * the file, removes lines beyond free ones and paired path or comment swaps,
 * adds a line that skips or narrows tests, or hides untouched lines in a
 * comment or a string.
 */
export function weakensTests(f: ChangedFile): boolean {
  if (f.status === "deleted") return true;
  const was = readSide(f.before);
  const now = readSide(f.after);
  if (hidesLines(f, was, now)) return true;
  return f.hunks.some(
    (h) =>
      (!removesNothing(h, was) && !onlySwaps(h, was, now)) ||
      h.added.some((line, k) => disables(now?.masked[h.newStart - 1 + k] ?? line)),
  );
}

/**
 * Whether a file other than a test file takes the test API (`expect`, `test`)
 * before the PR: an e2e helper that asserts. Its lines count like a test
 * file's. Read from its imports, not from a list of helper directories.
 */
export function isTestSupport(f: ChangedFile): boolean {
  if (f.status === "added" || isTestFile(f.path) || isRunnerConfig(f.path) || !isCodeFile(f.path)) {
    return false;
  }
  const was = readSide(f.before);
  return was !== null && [...was.bindings].some(([name, b]) => isTestApi(name, b));
}

/** A line that holds only a comment, or nothing, outside a template literal. */
const isCommentOnly = (side: Side, i: number): boolean =>
  side.states[i] !== "template" &&
  /^\s*(?:(?:\/\/|\/\*)?\u27E6c\u27E7(?:\*\/)?)?\s*$/.test(side.bare[i] ?? "");

/**
 * Whether a change to a runner config can take test files out of the run. Which
 * files run is data (an `include` glob, a `testMatch` regex in a constant), so
 * any change but comment lines and blank lines counts, as does a comment opened
 * around lines the PR leaves as they were. An unknown side counts too.
 */
function changesRunner(f: ChangedFile): boolean {
  if (f.status === "deleted") return true;
  const was = readSide(f.before);
  const now = readSide(f.after);
  if (was === null || now === null) return true;
  // Opening or closing a comment around lines the PR leaves as they were.
  if (
    untouchedLines(f, was.states.length).some(([old, cur]) => was.states[old] !== now.states[cur])
  ) {
    return true;
  }
  const kept = (side: Side, start: number, lines: readonly string[]): string[] =>
    lines.flatMap((_, k) => (isCommentOnly(side, start - 1 + k) ? [] : [side.bare[start - 1 + k]]));
  return f.hunks.some((h) => {
    const removed = kept(was, h.oldStart, h.removed);
    const added = kept(now, h.newStart, h.added);
    return removed.length !== added.length || removed.some((line, n) => line !== added[n]);
  });
}

/** A line that opens a `krs` fence, which an acceptance-test record's test reads. */
const KRS_FENCE = /^\s*(?:```|~~~)krs(?:\s|$)/;

const AT_RECORD = /^docs\/acceptance\/[^/]+\.md$/;

/**
 * The deleted and added inputs that pair, one to one, as the same text moved
 * within one group. `--no-renames` splits a move into a deletion and an addition.
 */
function inputMoves(files: readonly ChangedFile[]): Set<string> {
  const added = new Map<string, string[]>();
  for (const f of files) {
    const group = inputGroup(f.path);
    if (f.status !== "added" || group === null || typeof f.after !== "string") continue;
    const key = `${group}\u0000${f.after}`;
    added.set(key, [...(added.get(key) ?? []), f.path]);
  }
  const moved = new Set<string>();
  for (const f of files) {
    const group = inputGroup(f.path);
    if (f.status !== "deleted" || group === null || typeof f.before !== "string") continue;
    const to = added.get(`${group}\u0000${f.before}`)?.shift();
    if (to !== undefined) moved.add(f.path).add(to);
  }
  return moved;
}

const fences = (text: string): number => text.split("\n").filter((l) => KRS_FENCE.test(l)).length;

/**
 * The inputs a PR takes away from tests that read a directory, the mirror of
 * what {@link addsTest} counts: a deleted example or renderer fixture that did
 * not move ({@link inputMoves}), and acceptance-test records that lose `krs`
 * fences when the PR's records together have fewer (a renamed or split record
 * keeps its fences). An unknown side counts as taken away.
 */
export function removedInputs(files: readonly ChangedFile[]): string[] {
  const moved = inputMoves(files);
  const deleted = files.flatMap((f) =>
    f.status === "deleted" && isTestInput(f.path) && !moved.has(f.path) ? [f.path] : [],
  );
  const records = files.filter((f) => AT_RECORD.test(f.path));
  const count = (text: string | null | undefined, absent: boolean): number | null =>
    absent ? 0 : typeof text === "string" ? fences(text) : null;
  const sides = records.map((f) => ({
    path: f.path,
    before: count(f.before, f.status === "added"),
    after: count(f.after, f.status === "deleted"),
  }));
  const unknown = sides.filter((r) => r.before === null || r.after === null);
  if (unknown.length > 0) return [...deleted, ...unknown.map((r) => r.path)];
  const total = (k: "before" | "after"): number => sides.reduce((n, r) => n + (r[k] ?? 0), 0);
  const fewer =
    total("after") < total("before")
      ? sides.filter((r) => (r.after ?? 0) < (r.before ?? 0)).map((r) => r.path)
      : [];
  return [...deleted, ...fewer];
}

// ---------------------------------------------------------------------------
// Added tests

/** A test case opened on the line (`it(`, `test.each(`), not a skipped or focused one. */
const TEST_CASE = /^\s*(?:it|test)(?:\.(?:each|for|concurrent|sequential|fails))*\s*[(`]/;

/** How many test cases a side opens in code (not in a comment or a string). */
const liveCases = (side: Side): number =>
  side.masked.filter((line, i) => side.states[i] === "code" && TEST_CASE.test(line)).length;

/**
 * The 0-based index of the line where the bracket opened at `lines[i][col]`
 * closes, or -1. Reads masked lines, so comments hold no brackets.
 */
function closingLine(lines: readonly string[], i: number, col: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let j = i; j < lines.length; j++) {
    const line = lines[j];
    for (let c = j === i ? col : 0; c < line.length; c++) {
      const ch = line[c];
      if (quote !== null) {
        if (ch === "\\") c++;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch) && --depth === 0) return j;
    }
    // A string other than a template literal ends with its line.
    if (quote !== "`") quote = null;
  }
  return -1;
}

/**
 * 0-based line ranges (exclusive at both ends) of the tables `.each` reads:
 * its inline argument list, or the array a named table (`.each(CASES)`) is
 * declared with. A row added inside one is a new case.
 */
function eachTables(side: Side): [number, number][] {
  const { masked } = side;
  const ranges: [number, number][] = [];
  const named = new Set<string>();
  for (let i = 0; i < masked.length; i++) {
    const m = /\.each\s*\(\s*([A-Za-z_$][\w$]*)?\s*(\))?/.exec(masked[i]);
    if (m === null) continue;
    if (m[1] !== undefined && m[2] !== undefined) {
      // A named table: where it is declared, from the bracket after `=`. Once per name.
      if (named.has(m[1])) continue;
      named.add(m[1]);
      const decl = new RegExp(`\\b(?:const|let|var)\\s+${m[1].replace(/\$/g, "\\$")}\\b[^=]*=\\s*`);
      for (let j = 0; j < masked.length; j++) {
        const d = decl.exec(masked[j]);
        if (d === null) continue;
        const end = closingLine(masked, j, d.index + d[0].length);
        if (end > j) ranges.push([j, end]);
      }
      continue;
    }
    const end = closingLine(masked, i, masked[i].indexOf("(", m.index));
    if (end > i) ranges.push([i, end]);
  }
  return ranges;
}

/** Whether a line holds code, not only a comment or white space. */
const isCode = (masked: string): boolean => !/^\s*(?:\/\/|\/\*|⟦c⟧|$)/.test(masked);

/**
 * Whether the PR adds a test case: a new test file, more test cases or `.each`
 * rows in an existing one, or a new input a test reads from a directory (an
 * example, a renderer fixture, an acceptance-test `krs` fence). Renaming a case,
 * adding one inside a comment or moving an input adds nothing.
 */
export function addsTest(files: readonly ChangedFile[]): boolean {
  const moved = inputMoves(files);
  return files.some((f) => {
    if (f.status === "added") {
      // A new test file that only skips its cases adds none.
      if (isTestFile(f.path)) {
        const now = readSide(f.after);
        return now !== null && liveCases(now) > 0;
      }
      // A moved input is the same case.
      if (isTestInput(f.path)) return !moved.has(f.path);
    }
    if (f.status === "deleted") return false;
    if (AT_RECORD.test(f.path)) {
      return f.hunks.some((h) => h.added.some((line) => KRS_FENCE.test(line)));
    }
    if (!isTestFile(f.path)) return false;
    const was = readSide(f.before);
    const now = readSide(f.after);
    if (was === null || now === null) return false;
    if (liveCases(now) > liveCases(was)) return true;
    const tables = eachTables(now);
    return f.hunks.some((h) =>
      h.added.some((_, k) => {
        const at = h.newStart - 1 + k;
        return (
          now.states[at] === "code" &&
          isCode(now.masked[at]) &&
          tables.some(([start, end]) => at > start && at < end)
        );
      }),
    );
  });
}

// ---------------------------------------------------------------------------
// The check

export interface Waiver {
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
 * for every test file, code file, test input and acceptance-test record it
 * changes.
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

  const existing = input.files.filter(
    (f) => f.status !== "added" && (isTestFile(f.path) || isTestSupport(f)),
  );
  // Taking away an input drops cases without touching a test file.
  const inputs = removedInputs(input.files);
  // A refactor may change a runner config too (an alias, a coverage setting),
  // and whether it keeps the run cannot be read from the text: every PR,
  // refactors included, says why.
  const configs = input.files
    .filter((f) => f.status !== "added" && isRunnerConfig(f.path) && changesRunner(f))
    .map((f) => f.path);
  const weakened = [...configs];
  if (type === "refactor") {
    const broken = [...existing.filter((f) => !keepsTests(f)).map((f) => f.path), ...inputs];
    if (broken.length > 0) {
      errors.push(
        `A refactor changes existing tests or their helpers beyond imports, module paths and ` +
          `comments, or deletes a test input: ${broken.join(", ")}. A refactor keeps the tests ` +
          `as they are; if the change is not behavior-preserving, give the title another type ` +
          `and write "Test change: <reason>" in the body.`,
      );
    }
  } else {
    weakened.unshift(...existing.filter(weakensTests).map((f) => f.path), ...inputs);
  }

  if (weakened.length > 0) {
    const reason = reasonLine(input.body, "Test change");
    if (reason !== null) waivers.push({ label: "Test change", reason });
    else {
      errors.push(
        `This PR removes lines from, deletes, skips or comments out existing tests or their ` +
          `helpers, deletes a test input or changes a test runner config: ` +
          `${weakened.join(", ")}. Write "Test change: <reason>" in the body ` +
          `to say why (docs/process/review.md "リスク段階").`,
      );
    }
  }
  return { errors, waivers };
}
