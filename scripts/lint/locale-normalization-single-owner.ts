/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Drift guard: the raw-language-tag → `Locale` rule has exactly one
 * implementation, `resolveLocaleTag` in `@karasu-tools/i18n`.
 *
 * Before #2081 the `startsWith("ja")` test was copied into four consumers
 * (lsp / app / cli / vscode), each reading its tag from a different source.
 * Nothing failed when they drifted: a change to the Japanese-matching rule
 * that missed one copy would silently render a different locale on one
 * surface than another in the same editor. Consolidating the copies does not
 * stop a fifth consumer from inlining the rule again, so this checker fails
 * the build when one does.
 *
 * Only the tag-matching idioms are detected — `locale === "ja"` and friends
 * are legitimate everywhere, since picking behavior off an already-resolved
 * `Locale` is not normalization. The patterns cover both the prefix form the
 * rule used to have and the primary-subtag form it has now (ADR-2535): a
 * consumer re-inlining the rule copies whichever shape it reads in the owner,
 * so the guard has to know both.
 */

export interface Finding {
  file: string;
  line: number;
  text: string;
}

/**
 * `.startsWith("ja")` / `.startsWith('ja-')` / `.startsWith(`ja_`)`.
 *
 * The trailing back-reference keeps the argument to the language subtag plus
 * an optional separator, so unrelated identifiers that merely begin with the
 * same two letters (`startsWith("java-service")`) are not findings.
 */
const PATTERN_STARTS_WITH = /\.\s*startsWith\s*\(\s*(["'`])ja[-_]?\1/i;

/** `.slice(0, 2) === "ja"`, `.substring(0,2) == 'ja'`, `.substr(0,2) === "ja"`. */
const PATTERN_SLICE_EQUALS = /\.\s*(?:slice|substr|substring)\s*\([^)]*\)\s*===?\s*["'`]ja["'`]/i;

/**
 * `.split(/[-_.]/)[0] === "ja"`, `.split("-").at(0) === "japanese"`.
 *
 * The primary-subtag form the owner adopted in ADR-2535. Without this the
 * guard would only recognize the idiom the rule no longer uses, which is the
 * inverse of the drift it exists to catch: a fifth consumer re-inlining today
 * would copy the split, not the prefix test.
 */
const PATTERN_SPLIT_EQUALS =
  /\.\s*split\s*\([^)]*\)\s*(?:\[\s*0\s*\]|\.\s*at\s*\(\s*0\s*\))\s*===?\s*(["'`])ja(?:panese)?\1/i;

/**
 * `.split(/[-_.]/, 1)[0]` — pulling the primary subtag off a raw tag, which is
 * the first half of the rule and the shape the owner spells out.
 *
 * The comparison that follows it may be anything (`=== "ja"`, a `Set` lookup,
 * a `switch`), so keying on the comparison alone would miss a consumer that
 * copied the owner wholesale.
 *
 * The separator class has to be built only from `-` `_` `.` *and* contain the
 * underscore. Splitting on a dot alone is how filenames and versions are taken
 * apart (`name.split(/[.]/)[0]`), which has nothing to do with locales; the
 * underscore is what makes it a locale split, because a consumer normalizing
 * tags has to handle the POSIX `ja_JP` form to be doing the job at all.
 */
const PATTERN_PRIMARY_SUBTAG_SPLIT =
  /\.\s*split\s*\(\s*\/\[[-_.\\]*_[-_.\\]*\]\/[a-z]*\s*(?:,[^)]*)?\)\s*(?:\[\s*0\s*\]|\.\s*at\s*\(\s*0\s*\))/;

/**
 * The rule's owner and its test, which must be free to spell the rule out.
 * Everything else under `packages/` delegates.
 */
const ALLOWED = ["packages/i18n/src/locale.ts", "packages/i18n/src/locale.test.ts"];

const DEFAULT_ROOTS = ["packages"];

const SKIP_DIRS = new Set(["node_modules", "dist", "out", "build", ".vite", "coverage"]);

const MESSAGE = [
  "Language-tag normalization must not be re-implemented per consumer.",
  "",
  "Call `resolveLocaleTag(raw)` from `@karasu-tools/i18n` instead of testing the raw",
  "tag yourself. Reading the raw tag stays with the consumer (that is what differs",
  "between the LSP init param, navigator.language, LANG and vscode.env.language);",
  "turning it into a `Locale` does not.",
  "",
  "See docs/spec/i18n.md and packages/i18n/src/locale.ts.",
].join("\n");

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out = out.concat(walk(full));
    } else if (st.isFile() && /\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

export function scanFile(absPath: string, repoRoot: string): Finding[] {
  const file = relative(repoRoot, absPath).split("\\").join("/");
  if (ALLOWED.includes(file)) return [];

  const findings: Finding[] = [];
  const lines = readFileSync(absPath, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      PATTERN_STARTS_WITH.test(line) ||
      PATTERN_SLICE_EQUALS.test(line) ||
      PATTERN_SPLIT_EQUALS.test(line) ||
      PATTERN_PRIMARY_SUBTAG_SPLIT.test(line)
    ) {
      findings.push({ file, line: i + 1, text: line.trim() });
    }
  }
  return findings;
}

export function scan(repoRoot: string, roots: string[] = DEFAULT_ROOTS): Finding[] {
  const findings: Finding[] = [];
  for (const root of roots) {
    for (const file of walk(resolve(repoRoot, root))) {
      findings.push(...scanFile(file, repoRoot));
    }
  }
  return findings;
}

export function formatFindings(findings: Finding[]): string {
  const lines: string[] = [];
  lines.push(`Found ${findings.length} inlined locale-normalization site(s):`);
  lines.push("");
  for (const f of findings) {
    lines.push(`  ${f.file}:${f.line}`);
    lines.push(`    ${f.text}`);
  }
  lines.push("");
  lines.push(MESSAGE);
  return lines.join("\n");
}

function main(): void {
  const repoRoot = resolve(process.cwd());
  const findings = scan(repoRoot);
  if (findings.length > 0) {
    console.error(formatFindings(findings));
    process.exit(1);
  }
  console.log("locale-normalization-single-owner: ok (0 findings)");
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /locale-normalization-single-owner\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
