/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
// Decides a PR's review tier from the change itself (Issue #3286).
//
// `docs/process/review.md` "リスク段階" sets how a PR is reviewed from what it changes,
// never from how big it is: High gets CodeRabbit rounds and a human reading the
// diff, Design one advisory CodeRabbit pass and a human, Medium a human, and Low
// merges on its own. Below High, the gate is the local review record in the PR
// body (`local-review-record.ts`). This module is the deterministic half of that
// rule, plus the two diff questions the review rounds ask:
//
// - did merging main leave the PR's own change alone? (`diffFingerprint`)
// - does a finding sit inside the PR's diff? (`lineInDiff`)
//
// The functions are pure and take text; the CLI at the bottom reads git and gh.
// Every input that no rule names falls to the stricter side (TPL-3286): an
// unknown path is Medium, a missing label is High.
//
// Dependency-free on purpose: the `Review tier` workflow runs this file with
// plain `node` (type stripping), so the check needs no `pnpm install`.

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { matchesGlob, posix } from "node:path";
import {
  CONFIG_FILES,
  type ConfigTexts,
  classifyGeneratedDiff,
  parseNameStatus,
  readGeneratedPaths,
} from "../adr/generated.ts";
import {
  type GitFacts,
  isDesignRow,
  type ParseResult,
  parseRecord,
  verifyRecord,
} from "./local-review-record.ts";
import {
  checkTestChanges,
  closedIssueNumbers,
  type Waiver,
  isRunnerConfig,
  isTestFile,
  isTestInput,
  TEST_GLOBS,
  visibleBody,
  weakensTests,
} from "./test-changes.ts";

export type Tier = "low" | "design" | "medium" | "high";

const TIERS: readonly Tier[] = ["low", "design", "medium", "high"];
const rank = (t: Tier): number => TIERS.indexOf(t);
const stricter = (a: Tier, b: Tier): Tier => (rank(a) >= rank(b) ? a : b);

/** Authors whose PRs may take the lighter tiers. Everyone else is High. */
const TRUSTED_AUTHORS: ReadonlySet<string> = new Set(["kompiro"]);

/** Checked first: a High path wins over a Low pattern it also matches. */
const HIGH_GLOBS: readonly string[] = [
  ".github/workflows/**",
  ".github/actions/**",
  "**/CHANGELOG.md",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "**/.npmrc",
  ".github/dependabot.y*ml",
  "docs/spec/**",
  "docs/concepts*.md",
  "docs/process.md",
  "docs/process/**",
  ".claude/rules/**",
  ".coderabbit.yaml",
  "lefthook.yml",
  "scripts/lint/**",
  // The CI policy and drift guards (workflow safety, draft gate, timeouts):
  // weakening one of these tests must not read as a Low test change.
  "scripts/ci/**",
  // The review machinery itself. A PR that edits it must not be able to read
  // itself as lighter: Medium and Low get no CodeRabbit review (TPL-3286).
  "scripts/review/**",
  // The comparison behind `Render equivalence`, which judges a refactor
  // (#3505), is review machinery too.
  "scripts/render-equivalence/**",
  "scripts/pr-shots/**",
  "scripts/coderabbit/**",
  "scripts/bin/**",
  ".claude/settings.json",
  ".claude/skills/**",
  ".claude/agents/**",
  ".github/PULL_REQUEST_TEMPLATE.md",
];

/**
 * Code that stands between karasu and what it does not trust: a `.krs` from a
 * stranger, a URL, a webview message, a path on disk (#3505). Always High, and
 * `/security-review` too. A test file is not matched here ({@link pathTier});
 * only removing lines from one is High ({@link fileTier}).
 */
const SECURITY_TIER_GLOBS: readonly string[] = [
  "packages/nest/**",
  "packages/cli/src/{serve,render-*,node-fs,path-arg,watcher}*",
  "packages/core/src/fs/**",
  "packages/vscode/src/{message-validation,webview-html,host-files}*",
  // `openExternal`.
  "packages/vscode/src/preview-panel.ts",
  // Escapes the SVG text and attributes that the app, nest and the webview
  // insert as HTML.
  "packages/core/src/renderer/svg-builder.ts",
  // Decodes the payload of a shared URL.
  "packages/app/src/utils/inline-share.ts",
  // DOMPurify and `dangerouslySetInnerHTML`.
  "packages/app/src/components/{ChatPane,NodeDetailPanel,EdgeDetailPanel}.tsx",
];

/**
 * Code whose change changes what the language accepts, means or rewrites
 * (#3505). High, so a change to it gets CodeRabbit's rounds even without a spec
 * change. A `refactor` will drop to Medium here only once `Render equivalence`
 * is a required check that proves it (#3540); until then a refactor is High too.
 */
const LANGUAGE_TIER_GLOBS: readonly string[] = [
  "packages/core/src/{lexer,parser,resolver,spec,style,formatter,annotations}/**",
  "packages/core/src/language-version.ts",
  "packages/core/src/builtins/default-style.ts",
  // Turns diagnostics into what the editor shows; nothing compares its output.
  "packages/lsp/src/diagnostics*",
];

/**
 * Calls that put text into the DOM, run it as code or open it outside karasu. A
 * changed line naming one makes a code file High wherever it lives, so a new
 * file does not wait for {@link SECURITY_TIER_GLOBS} to learn its name (TPL-2446).
 */
const DANGEROUS_SINKS: readonly RegExp[] = [
  /dangerouslySetInnerHTML/,
  /innerHTML/,
  /outerHTML/,
  /insertAdjacentHTML/,
  /\bsrcdoc\b/,
  /\bdocument\.write/,
  /DOMPurify/,
  /openExternal/,
  /\beval\s*\(/,
  /\bnew\s+Function\b/,
];

/** Where {@link DANGEROUS_SINKS} is read: code, not prose that names the calls. */
const CODE_FILE = /\.(?:[cm]?[jt]sx?|html|vue|svelte)$/;

const DESIGN_GLOBS: readonly string[] = ["docs/design/**"];

/** `docs/adr/**` is not here: its Low cases are read from the diff ({@link adrFileTier}). */
const LOW_GLOBS: readonly string[] = ["docs/test-perspectives/**", "docs/guide/**", ...TEST_GLOBS];

/**
 * `pnpm adr:regenerate` output. Pinned to `adr.config.json` `paths.outputs` by a
 * test, so the classifier and the `Validate` check own the same paths.
 */
export const ADR_GENERATED_GLOBS: readonly string[] = [
  "docs/adr/effective.md",
  "docs/adr/graph.md",
  "docs/adr/graph/**",
];

/** An ADR record, `docs/adr/<n>-<name>.md` (not README or TEMPLATE). */
const ADR_RECORD = /^docs\/adr\/\d+-[^/]+\.md$/;
const DESIGN_DOC = /^docs\/design\/[^/]+\.md$/;
/** An acceptance-test record: the only file whose ADR line a promotion may extend (#3405). */
const AT_RECORD = /^docs\/acceptance\/[^/]+\.md$/;
/** A new ADR whose path may stand as a link target in a promotion's link rules. */
const LINKABLE_ADR = /^docs\/adr\/\d+-[a-z0-9-]+\.md$/;

/** A diff touching these also gets `/security-review`, whatever its tier. */
const SECURITY_GLOBS: readonly string[] = [
  ...SECURITY_TIER_GLOBS,
  ".github/workflows/**",
  ".github/actions/**",
];

/**
 * The `package.json` fields whose change is a dependency or release change. The
 * same file also holds `scripts`, whose change is ordinary (Medium), so the tier
 * is read from the fields that moved, not from the file name.
 */
const HIGH_PACKAGE_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "version",
  "pnpm",
  "packageManager",
  "overrides",
  "resolutions",
  "engines",
  // What a published package ships and how it is reached.
  "private",
  "publishConfig",
  "files",
  "exports",
  "bin",
  "main",
  "module",
  "types",
] as const;

/** `scripts` entries that npm and pnpm run on install or publish. */
const LIFECYCLE_SCRIPTS = [
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepublish",
  "prepublishOnly",
  "prepack",
  "postpack",
] as const;

const matchesAny = (path: string, globs: readonly string[]): boolean =>
  globs.some((g) => matchesGlob(path, g));

const isPackageJson = (path: string): boolean =>
  path === "package.json" || path.endsWith("/package.json");

/**
 * The tier one path asks for by its location alone. A test file stays out of
 * the security and language rules: adding a test must not make a PR High.
 */
export function pathTier(path: string): Tier {
  if (matchesAny(path, HIGH_GLOBS)) return "high";
  if (!isTestFile(path) && matchesAny(path, [...SECURITY_TIER_GLOBS, ...LANGUAGE_TIER_GLOBS])) {
    return "high";
  }
  if (matchesAny(path, DESIGN_GLOBS)) return "design";
  if (matchesAny(path, LOW_GLOBS)) return "low";
  return "medium";
}

/**
 * High when a dependency, release or pnpm field changed, Medium otherwise. A file
 * added, removed or not parseable on either side is High: nothing tells us which
 * fields moved.
 */
export function packageJsonTier(before: string | null, after: string | null): Tier {
  if (before === null || after === null) return "high";
  let a: Record<string, unknown>;
  let b: Record<string, unknown>;
  try {
    a = JSON.parse(before) as Record<string, unknown>;
    b = JSON.parse(after) as Record<string, unknown>;
  } catch {
    return "high";
  }
  const moved = HIGH_PACKAGE_FIELDS.some(
    (field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]),
  );
  // Other scripts are ordinary, but these run on install and publish.
  const scripts = (o: Record<string, unknown>) =>
    (typeof o.scripts === "object" && o.scripts !== null ? o.scripts : {}) as Record<
      string,
      unknown
    >;
  const lifecycleMoved = LIFECYCLE_SCRIPTS.some(
    (key) => JSON.stringify(scripts(a)[key]) !== JSON.stringify(scripts(b)[key]),
  );
  return moved || lifecycleMoved ? "high" : "medium";
}

// ---------------------------------------------------------------------------
// Diff parsing

type FileStatus = "added" | "deleted" | "modified";

/** One `-U0` hunk: the lines it removes from the old side and adds on the new side. */
export interface Hunk {
  oldStart: number;
  removed: string[];
  newStart: number;
  added: string[];
}

/** One file of `git diff --no-renames --full-index -U0`. */
export interface FileDiff {
  path: string;
  status: FileStatus;
  oldMode: string | null;
  newMode: string | null;
  oldBlob: string | null;
  newBlob: string | null;
  binary: boolean;
  hunks: Hunk[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Undoes git's C-style path quoting (`"a/d\303\251.md"` → `a/dé.md`): what git
 * prints for a path with `"`, `\`, control characters, and, unless
 * `core.quotePath` is off, any non-ASCII byte. Null when `quoted` is not one.
 */
export function unquoteGitPath(quoted: string): string | null {
  if (!quoted.startsWith('"') || !quoted.endsWith('"') || quoted.length < 2) return null;
  const bytes: number[] = [];
  const body = quoted.slice(1, -1);
  const escapes: Record<string, number> = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11 };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== "\\") {
      bytes.push(...Buffer.from(c, "utf-8"));
      continue;
    }
    const next = body[++i];
    if (next === undefined) return null;
    if (/[0-7]/.test(next)) {
      const oct = body.slice(i, i + 3);
      if (!/^[0-7]{3}$/.test(oct)) return null;
      bytes.push(parseInt(oct, 8));
      i += 2;
    } else if (next in escapes) bytes.push(escapes[next]);
    else bytes.push(...Buffer.from(next, "utf-8"));
  }
  return Buffer.from(bytes).toString("utf-8");
}

/**
 * The path of a `diff --git` header. Renames are off, so both halves name the
 * same path: `a/P b/P`, or each half quoted. Null when it cannot be read.
 */
function pathFromDiffGit(rest: string): string | null {
  if (rest.startsWith('"')) {
    const m = /^("(?:[^"\\]|\\.)*") ("(?:[^"\\]|\\.)*")$/.exec(rest);
    const a = m ? unquoteGitPath(m[1]) : null;
    const b = m ? unquoteGitPath(m[2]) : null;
    return a !== null && b !== null && a.startsWith("a/") && b === `b/${a.slice(2)}`
      ? a.slice(2)
      : null;
  }
  const length = (rest.length - 5) / 2;
  if (!Number.isInteger(length) || length <= 0) return null;
  const path = rest.slice(2, 2 + length);
  return rest === `a/${path} b/${path}` ? path : null;
}

/** A `--- ` / `+++ ` header's path without its `a/` / `b/` prefix, unquoted when quoted. */
function headerPath(raw: string, prefix: "a/" | "b/"): string {
  const unquoted = raw.startsWith('"') ? unquoteGitPath(raw) : raw;
  return unquoted !== null && unquoted.startsWith(prefix) ? unquoted.slice(2) : "";
}

/**
 * The path given to a diff section whose path could not be read. It matches no
 * rule's glob, and {@link classifyChange} classifies it High: a file the
 * classifier cannot name must not be dropped or read as light (TPL-3286).
 */
export const UNREADABLE_PATH = "\u0000unreadable";

/**
 * Splits a unified diff into files. `--- ` / `+++ ` are headers only before a
 * section's first hunk; inside a hunk the same prefix is content (removing a SQL
 * comment `-- x` prints `--- x`).
 */
export function parseDiff(diff: string): FileDiff[] {
  const files: FileDiff[] = [];
  let cur: FileDiff | null = null;
  let hunk: Hunk | null = null;
  let inHeader = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      cur = {
        path: pathFromDiffGit(line.slice("diff --git ".length)) ?? UNREADABLE_PATH,
        status: "modified",
        oldMode: null,
        newMode: null,
        oldBlob: null,
        newBlob: null,
        binary: false,
        hunks: [],
      };
      files.push(cur);
      hunk = null;
      inHeader = true;
      continue;
    }
    if (cur === null) continue;
    if (inHeader) {
      let m: RegExpExecArray | null;
      if ((m = /^new file mode (\d+)$/.exec(line))) {
        cur.status = "added";
        cur.newMode = m[1];
      } else if ((m = /^deleted file mode (\d+)$/.exec(line))) {
        cur.status = "deleted";
        cur.oldMode = m[1];
      } else if ((m = /^old mode (\d+)$/.exec(line))) cur.oldMode = m[1];
      else if ((m = /^new mode (\d+)$/.exec(line))) cur.newMode = m[1];
      else if ((m = /^index ([0-9a-f]+)\.\.([0-9a-f]+)(?: (\d+))?$/.exec(line))) {
        cur.oldBlob = m[1];
        cur.newBlob = m[2];
        if (m[3] !== undefined) {
          cur.oldMode ??= m[3];
          cur.newMode ??= m[3];
        }
      } else if (line.startsWith("Binary files ")) cur.binary = true;
      else if (line.startsWith("--- ") && cur.path === UNREADABLE_PATH) {
        if (line !== "--- /dev/null") cur.path = headerPath(line.slice(4), "a/") || UNREADABLE_PATH;
      } else if (line.startsWith("+++ ") && cur.path === UNREADABLE_PATH) {
        if (line !== "+++ /dev/null") cur.path = headerPath(line.slice(4), "b/") || UNREADABLE_PATH;
      }
    }
    const h = HUNK_HEADER.exec(line);
    if (h) {
      inHeader = false;
      hunk = { oldStart: Number(h[1]), removed: [], newStart: Number(h[2]), added: [] };
      cur.hunks.push(hunk);
    } else if (!inHeader && hunk !== null) {
      if (line.startsWith("-")) hunk.removed.push(line.slice(1));
      else if (line.startsWith("+")) hunk.added.push(line.slice(1));
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Classification

/** One changed file, with what the rules below need to read beyond its path. */
export interface ChangedFile {
  path: string;
  status: FileStatus;
  hunks: Hunk[];
  /** Both sides, for `package.json`, ADRs and AT records; `null` where the file does not exist. */
  before?: string | null;
  after?: string | null;
}

export interface Classification {
  tier: Tier;
  /** Whether `/security-review` is due on top of the tier's review. */
  securityReview: boolean;
  /** Why the tier is what it is, one line per cause, for the check's log. */
  reasons: string[];
  /**
   * Every changed file with its own tier, strictest first (Issue #3543). For the
   * reading an agreed Design Doc narrows (Issue #3542): `boundary` when it is on
   * a security boundary, which is always read, and `narrowable` when it is a
   * decision or language-behavior path off the boundary, whose agreed content
   * need not be read again.
   */
  files: { path: string; tier: Tier; boundary: boolean; narrowable: boolean }[];
}

/** 1-based inclusive line range of the YAML frontmatter, or null when there is none. */
function frontmatterRange(text: string): [number, number] | null {
  const lines = text.split("\n");
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  return end < 0 ? null : [1, end + 1];
}

const STATUS_LINE = /^- \*\*ステータス\*\*[:：]/;
/**
 * The superseded status line: "Superseded by ADR-<n>" or, as most ADRs write it,
 * "Superseded by [ADR-<n>](<n>-<name>.md)", optionally followed by a （…） note
 * and nothing else. The ADR number is captured (group 1 or 2).
 */
const SUPERSEDED_STATUS =
  /^- \*\*ステータス\*\*[:：]\s*Superseded by (?:ADR-(\d+)|\[ADR-(\d+)\]\(\2-[^)\s/]+\.md\))(?:（[^）]*）)?\s*$/;

/** The ADR number a superseded status line names, or null when `line` is not one. */
function supersededBy(line: string): string | null {
  const m = SUPERSEDED_STATUS.exec(line);
  return m === null ? null : (m[1] ?? m[2]);
}

/** Whether the frontmatter lines record the ADR as superseded by `adr`. */
function frontmatterSupersededBy(text: string, range: [number, number], adr: string): boolean {
  const lines = text.split("\n").slice(range[0] - 1, range[1]);
  return (
    lines.some((l) => /^status:\s*superseded\s*$/.test(l)) &&
    // The value itself, not a mention elsewhere on the line (a comment).
    lines.some((l) => /^superseded_by:\s*["']?ADR-(\d+)["']?\s*$/.exec(l)?.[1] === adr)
  );
}

/**
 * An edit to an existing ADR is Low only when it stays where `.claude/rules/adr.md`
 * allows edits: the frontmatter, and the body status line replaced, in place, by
 * the superseded status line naming the ADR the frontmatter says supersedes it.
 * Any other body change (prose, an inserted or deleted status line, a status line
 * whose frontmatter does not agree) is Medium: a human reads the rare diff that
 * breaks that rule (ADR-2687).
 */
export function adrEditIsRecordOnly(
  before: string,
  after: string,
  hunks: readonly Hunk[],
): boolean {
  const oldFm = frontmatterRange(before);
  const newFm = frontmatterRange(after);
  if (oldFm === null || newFm === null) return false;
  const inside = (range: [number, number], n: number) => n >= range[0] && n <= range[1];
  let statusSwaps = 0;
  for (const h of hunks) {
    const removed = h.removed.flatMap((line, i) =>
      inside(oldFm, h.oldStart + i) ? [] : [{ line, i }],
    );
    const added = h.added.flatMap((line, i) =>
      inside(newFm, h.newStart + i) ? [] : [{ line, i }],
    );
    if (removed.length === 0 && added.length === 0) continue;
    // The only body change allowed: one status line replaced by the superseded
    // one, at the same position in the hunk.
    if (removed.length !== 1 || added.length !== 1 || removed[0].i !== added[0].i) return false;
    if (!STATUS_LINE.test(removed[0].line)) return false;
    const adr = supersededBy(added[0].line);
    if (adr === null || !frontmatterSupersededBy(after, newFm, adr)) return false;
    statusSwaps += 1;
  }
  return statusSwaps <= 1;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A reference to one of `paths`: a relative or repo path, with an optional anchor. */
function referenceSource(paths: readonly string[]): string | null {
  if (paths.length === 0) return null;
  const alts = paths.map((p) => {
    const [dir, file] = [p.split("/").at(-2) ?? "", p.split("/").at(-1) ?? ""];
    return `(?:\\.\\.?/)*(?:docs/)?${escapeRe(dir)}/${escapeRe(file)}(?:#[\\w-]*)?`;
  });
  return `(?:${alts.join("|")})`;
}

/** The text a link to one of `paths` may carry: its path or file name, or `ADR-<n>`. */
function namesOf(paths: readonly string[]): Set<string> {
  const names = new Set(paths.flatMap((p) => [p, p.split("/").at(-1) ?? p]));
  for (const p of paths) {
    const n = /^docs\/adr\/(\d+)-/.exec(p)?.[1];
    if (n !== undefined) names.add(`ADR-${n}`);
  }
  return names;
}

const isNameIn = (names: ReadonlySet<string>, text: string): boolean =>
  names.has(text.trim().replace(/^`(.*)`$/, "$1"));

/**
 * Whether one changed line pair only swaps a reference to a deleted Design Doc for
 * a reference to the ADR that replaced it (ADR-2331's "張り替え"). Only the
 * reference itself may change: a markdown link's target, whole, or a bare path
 * that stands on its own (not inside a URL or a longer name). Link text and
 * every other character must stay as they were.
 */
export function isLinkSwap(
  removed: string,
  added: string,
  deletedDesigns: readonly string[],
  newAdrs: readonly string[],
): boolean {
  const oldRef = referenceSource(deletedDesigns);
  const newRef = referenceSource(newAdrs);
  if (oldRef === null || newRef === null) return false;
  // A trailing period ends a sentence; it continues the name only when a name
  // character follows it.
  const bare = (ref: string) => new RegExp(`(?<![\\w./:-])${ref}(?![\\w-]|\\.[\\w-])`, "g");
  const target = (ref: string) => new RegExp(`^${ref}$`);
  const mentions = (line: string, ref: string) =>
    bare(ref).test(line) ||
    [...line.matchAll(/\]\(([^)\s]+)\)/g)].some((m) => target(ref).test(m[1]));
  if (!mentions(removed, oldRef) || !mentions(added, newRef)) return false;
  const either = `(?:${oldRef}|${newRef})`;
  // A link's text may change only from one name of what it points at to another:
  // the file name or path (in backticks or not), or the ADR's number.
  const names = namesOf([...deletedDesigns, ...newAdrs]);
  const isName = (text: string) => isNameIn(names, text);
  const normalize = (line: string) =>
    line
      .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (link, text: string, t: string) =>
        target(either).test(t)
          ? `[${isName(text) ? "\u27E6name\u27E7" : text}](\u27E6ref\u27E7)`
          : link,
      )
      .replace(bare(either), "\u27E6ref\u27E7");
  return normalize(removed) === normalize(added);
}

/** The labels of an ADR line in a record: `- **設計 (ADR)**:`, `- **関連 ADR**:` and their spellings. */
const ADR_LINE_LABEL = /^(?:設計 ?[(（]ADR[)）]|関連 ?ADR|ADR)$/;
/** A labelled list item: the label, the colon, and the value after it. */
const LABELLED_ITEM = /^- \*\*([^*]+)\*\*([:：])( ?)(.*)$/;
/** A line that may open or close a fenced code block. */
const FENCE = /^\s*(?:```|~~~)/;
/** The record's title, and any heading after it. */
const TITLE = /^# /;
const HEADING = /^ {0,3}#{1,6}(?:\s|$)/;
/** A blockquote or table line, which ends the metadata list above it. */
const QUOTE_OR_TABLE = /^\s*[>|]/;
/** What joins two links in a list of them. */
const LINK_SEPARATOR = /^\s*[、,，]\s*/;
const TRAILING_SEPARATOR = /\s*[、,，]\s*$/;

/** The new ADR a link target resolves to from the record, if it is one. */
type LinkTarget = (href: string) => string | undefined;

/**
 * How many links a value is, when it is nothing but links to the new ADRs
 * joined by separators; 0 otherwise. Each link must resolve to one new ADR and
 * carry a name of that same ADR as its text.
 */
function adrLinksOnly(value: string, target: LinkTarget): number {
  let rest = value;
  let count = 0;
  for (;;) {
    const m = /^\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest);
    if (!m) return 0;
    const adr = target(m[2]);
    if (adr === undefined || !isNameIn(namesOf([adr]), m[1])) return 0;
    count++;
    rest = rest.slice(m[0].length);
    if (rest === "") return count;
    const sep = LINK_SEPARATOR.exec(rest);
    if (!sep) return 0;
    rest = rest.slice(sep[0].length);
  }
}

/** An ADR line added whole: its value is only links to the new ADRs. */
function isNewAdrLine(line: string, target: LinkTarget): boolean {
  const m = LABELLED_ITEM.exec(line);
  return (
    m !== null && ADR_LINE_LABEL.test(m[1]) && spacedAfter(m) && adrLinksOnly(m[4], target) > 0
  );
}

/** One space after `:`, as the records write it; none or one after the full-width `：`. */
const spacedAfter = (m: RegExpExecArray): boolean => m[3] === " " || (m[2] === "：" && m[3] === "");

/**
 * Whether line `index` (0-based) of `lines` sits in the record's metadata list,
 * where an ADR line belongs: after the title (`# `) and before any other
 * heading or fence line, outside the frontmatter. A line added whole must also
 * stand between items of that list: after the lines of another labelled item, and
 * followed by another one, a blank line or nothing, so it takes over no
 * continuation or sub-list of the item above and no heading, table or block
 * around it changes. The line above may be the last line of an item's
 * continuation or sub-list: the new item starts after it.
 */
function inMetadataList(lines: readonly string[], index: number, whole: boolean): boolean {
  if (index <= 0 || index >= lines.length) return false;
  let start = 0;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end < 0) return false;
    start = end + 1;
  }
  const title = lines.findIndex((line, i) => i >= start && TITLE.test(line));
  if (title < 0 || index <= title) return false;
  for (let i = title + 1; i < index; i++) {
    if (HEADING.test(lines[i]) || FENCE.test(lines[i])) return false;
  }
  if (!whole) return true;
  // Upward, without a blank line, to the labelled item whose lines it follows;
  // its continuation and sub-list stay its own.
  let item = index - 1;
  while (
    item > title &&
    lines[item].trim() !== "" &&
    !LABELLED_ITEM.test(lines[item]) &&
    !QUOTE_OR_TABLE.test(lines[item])
  )
    item--;
  // Below: another item, or the end of the list. A blank line ends it only when
  // what follows is not indented: an indented block after a blank line would
  // still belong to the new item, taking it from the item above.
  const next = lines[index + 1];
  let block = index + 1;
  while (block < lines.length && lines[block].trim() === "") block++;
  return (
    LABELLED_ITEM.test(lines[item]) &&
    (next === undefined ||
      LABELLED_ITEM.test(next) ||
      (next.trim() === "" && (block >= lines.length || !/^\s/.test(lines[block]))))
  );
}

/**
 * An ADR line whose value only gained links to the new ADRs: filled when it was
 * empty, or extended at its start or its end. The label, the colon and the
 * existing value stay as they were.
 */
function gainedAdrLinks(removed: string, added: string, target: LinkTarget): boolean {
  const before = LABELLED_ITEM.exec(removed);
  const after = LABELLED_ITEM.exec(added);
  if (before === null || after === null || !ADR_LINE_LABEL.test(before[1])) return false;
  if (before[1] !== after[1] || before[2] !== after[2]) return false;
  const [old, now] = [before[4], after[4]];
  if (old === "") return spacedAfter(after) && adrLinksOnly(now, target) > 0;
  if (before[3] !== after[3]) return false;
  if (now.endsWith(old)) {
    const head = now.slice(0, now.length - old.length);
    const sep = TRAILING_SEPARATOR.exec(head);
    if (sep && adrLinksOnly(head.slice(0, sep.index), target) > 0) return true;
  }
  if (now.startsWith(old)) {
    const tail = now.slice(old.length);
    const sep = LINK_SEPARATOR.exec(tail);
    if (sep && adrLinksOnly(tail.slice(sep[0].length), target) > 0) return true;
  }
  return false;
}

/**
 * Whether one hunk of an AT record only adds links to ADRs added in the same PR
 * (#3405). An AT points at its Issue, never at a Design Doc (ADR-2348), so its
 * promotion PR adds the ADR link rather than swapping one (ADR-2331). Only an
 * ADR line of the metadata list (`- **設計 (ADR)**:`, `- **関連 ADR**:`) may
 * change: a new one, right after another labelled item, whose value is only
 * links to the new ADRs, or an existing one that gains such links at the start
 * or end of its value. Every removed line must be one of those existing lines,
 * in order. `after` is the record as the PR leaves it, which places the hunk;
 * without it nothing is accepted.
 */
export function isLinkInsert(
  hunk: Hunk,
  after: string | null | undefined,
  newAdrs: readonly string[],
  recordPath: string,
): boolean {
  const { removed, added } = hunk;
  if (newAdrs.length === 0 || added.length === 0 || typeof after !== "string") return false;
  // Resolved from the record, as a renderer does: `adr/12-x.md` beside an AT
  // is not the ADR. No scheme, root-relative path, anchor or query.
  const dir = posix.dirname(recordPath);
  const target: LinkTarget = (href) => {
    if (/^[a-z][a-z0-9+.-]*:|^\/|[#?]/i.test(href)) return undefined;
    const resolved = posix.normalize(posix.join(dir, href));
    return newAdrs.includes(resolved) ? resolved : undefined;
  };
  const lines = after.split("\n");
  let i = 0;
  for (const [j, line] of added.entries()) {
    const at = hunk.newStart - 1 + j;
    if (lines[at] !== line) return false;
    if (i < removed.length && gainedAdrLinks(removed[i], line, target)) {
      if (!inMetadataList(lines, at, false)) return false;
      i++;
    } else if (!isNewAdrLine(line, target) || !inMetadataList(lines, at, true)) {
      return false;
    }
  }
  return i === removed.length;
}

/**
 * The tier of a file under `docs/adr/`. Low: a new ADR record, the generated
 * graph files, and record-only edits to an existing ADR. Anything else there
 * (README, TEMPLATE, a deleted ADR, prose edits) is Medium.
 */
function adrFileTier(f: ChangedFile): Tier {
  if (matchesAny(f.path, ADR_GENERATED_GLOBS)) return "low";
  if (!ADR_RECORD.test(f.path)) return "medium";
  if (f.status === "added") return "low";
  if (f.status === "deleted") return "medium";
  // No hunks (a binary or mode-only change) leaves nothing to prove record-only.
  if (f.hunks.length === 0) return "medium";
  if (typeof f.before !== "string" || typeof f.after !== "string") return "medium";
  return adrEditIsRecordOnly(f.before, f.after, f.hunks) ? "low" : "medium";
}

/**
 * A test file is Low only when it is new. A new file adds tests and can take no
 * existing coverage away. Any change to an existing test file can (a deleted
 * case, a weakened assertion, an early return, a comment or template literal
 * opened around tests, a skip modifier), and two review rounds showed that no
 * pattern list catches every way, so such a change is Medium and a human reads
 * it (TPL-3286).
 */
const isNewFile = (f: ChangedFile): boolean => f.status === "added";

/**
 * Whether a test file covers a security boundary: it sits under one of
 * {@link SECURITY_TIER_GLOBS}, or names a file there once its `.test` / `.spec`
 * part is dropped (`serve.e2e.test.ts` covers `serve.ts`).
 */
function isSecurityTest(path: string): boolean {
  const source = path.replace(/(?:\.e2e)?\.(?:test|spec)(?=\.tsx?$)/, "");
  return matchesAny(path, SECURITY_TIER_GLOBS) || matchesAny(source, SECURITY_TIER_GLOBS);
}

/** Whether any line the file adds or removes names one of {@link DANGEROUS_SINKS}. */
const touchesDangerousSink = (f: ChangedFile): boolean =>
  f.hunks.some((h) =>
    [...h.removed, ...h.added].some((line) => DANGEROUS_SINKS.some((re) => re.test(line))),
  );

/** A code file outside the tests whose changed lines name a dangerous sink. */
const isSinkChange = (f: ChangedFile): boolean =>
  !isTestFile(f.path) && CODE_FILE.test(f.path) && touchesDangerousSink(f);

function fileTier(
  f: ChangedFile,
  promotion: { deletedDesigns: string[]; newAdrs: string[] },
): Tier {
  if (f.path === UNREADABLE_PATH) return "high";
  if (isPackageJson(f.path)) {
    return stricter(pathTier(f.path), packageJsonTier(f.before ?? null, f.after ?? null));
  }
  if (f.path.startsWith("docs/adr/")) return adrFileTier(f);
  const byPath = pathTier(f.path);
  // Nothing below lowers a High path: the review machinery, rules and specs are
  // read by a human however small the change is.
  if (byPath === "high") return "high";
  if (isTestFile(f.path)) {
    if (isNewFile(f)) return byPath;
    // A reason line must not be enough to drop or turn off an SSRF or symlink
    // regression test. Moving imports or rewording a comment there is not that.
    if (isSecurityTest(f.path) && weakensTests(f)) return "high";
    return "medium";
  }
  if (isSinkChange(f)) return "high";
  // ADR promotion (ADR-2331): only in a PR that adds an ADR record. A hunk
  // either swaps Design Doc links for the ADR or inserts links to it (#3405).
  if (promotion.newAdrs.length > 0) {
    if (f.status === "deleted" && DESIGN_DOC.test(f.path)) return "low";
    const isSwap = (h: Hunk) =>
      h.removed.length > 0 &&
      h.removed.length === h.added.length &&
      h.removed.every((line, i) =>
        isLinkSwap(line, h.added[i], promotion.deletedDesigns, promotion.newAdrs),
      );
    if (
      f.status === "modified" &&
      f.path.endsWith(".md") &&
      f.hunks.length > 0 &&
      f.hunks.every(
        (h) =>
          isSwap(h) ||
          (AT_RECORD.test(f.path) && isLinkInsert(h, f.after, promotion.newAdrs, f.path)),
      )
    ) {
      return "low";
    }
  }
  return byPath;
}

/**
 * The paths whose content a Design Doc agrees on: decisions (spec, concepts,
 * process, rules) and the code that carries the language's behavior. Everything
 * else that is High, the review and release machinery or a dependency change,
 * is read even when a Design Doc backs the PR: its wording can match the design
 * while its behavior does not (Issue #3542, kompiro's decision of 2026-11-02).
 */
const NARROWABLE_GLOBS: readonly string[] = [
  "docs/spec/**",
  "docs/concepts*.md",
  "docs/process.md",
  "docs/process/**",
  ".claude/rules/**",
  ...LANGUAGE_TIER_GLOBS,
];

/**
 * Whether `f` is on a security boundary for the narrowed reading: by its path
 * alone, test files included, so no exception keeps such a file out of the read.
 */
const onBoundary = (f: ChangedFile): boolean =>
  f.path === UNREADABLE_PATH ||
  isSinkChange(f) ||
  matchesAny(f.path, SECURITY_GLOBS) ||
  (isTestFile(f.path) && isSecurityTest(f.path));

/**
 * Whether the change to `f` asks for `/security-review`. A test file asks for one
 * only when it weakens a security-boundary test, as its tier does: adding a test
 * is not a security change.
 */
const isSecurityChange = (f: ChangedFile): boolean =>
  f.path === UNREADABLE_PATH ||
  isSinkChange(f) ||
  (isTestFile(f.path)
    ? !isNewFile(f) && isSecurityTest(f.path) && weakensTests(f)
    : matchesAny(f.path, SECURITY_GLOBS));

export function classifyChange(input: {
  files: readonly ChangedFile[];
  author: string;
}): Classification {
  const reasons: string[] = [];
  // No change at all is not a reason to skip the human: treat it as Medium.
  let tier: Tier = input.files.length === 0 ? "medium" : "low";
  if (input.files.length === 0) reasons.push("no changed files");

  const promotion = {
    // A file name outside this shape is not used as a link target: its text is
    // matched against links, so `)` or `]` in it could carry prose (#3405).
    newAdrs: input.files
      .filter((f) => f.status === "added" && LINKABLE_ADR.test(f.path))
      .map((f) => f.path),
    deletedDesigns: input.files
      .filter((f) => f.status === "deleted" && DESIGN_DOC.test(f.path))
      .map((f) => f.path),
  };

  const files: Classification["files"] = [];
  for (const f of input.files) {
    const t = fileTier(f, promotion);
    const name = f.path === UNREADABLE_PATH ? UNREADABLE_NAME : f.path;
    if (rank(t) > rank("low")) reasons.push(`${name}: ${t}`);
    const boundary = onBoundary(f);
    files.push({
      path: name,
      tier: t,
      boundary,
      narrowable: !boundary && matchesAny(f.path, NARROWABLE_GLOBS),
    });
    tier = stricter(tier, t);
  }
  // A stable sort keeps the diff's order within a tier.
  files.sort((a, b) => rank(b.tier) - rank(a.tier));

  if (!TRUSTED_AUTHORS.has(input.author)) {
    tier = "high";
    reasons.push(`author ${input.author} is not on the trusted list`);
  }

  return {
    tier,
    securityReview: input.files.some(isSecurityChange),
    reasons,
    files,
  };
}

// ---------------------------------------------------------------------------
// The Design Doc that backs a PR (Issue #3542)

/** The line of a Design Doc's metadata that names the Issues it was written for. */
const TRIGGER_LINE = /^\s*-\s*引き金 Issue\s*[:：](.*)$/;
const ISSUE_LINK = /\]\(https:\/\/github\.com\/kompiro\/karasu\/issues\/(\d+)\)/g;

/**
 * The Issues a Design Doc's 「引き金 Issue」 line links to, read from its metadata
 * (above the first `## ` heading). Only links outside full-width parentheses
 * count: a bare `#N`, or a link in the line's （…） prose, names a related Issue,
 * not a trigger.
 */
export function triggerIssues(text: string): number[] {
  const numbers = new Set<number>();
  for (const line of text.split("\n")) {
    if (/^## /.test(line)) break;
    const m = TRIGGER_LINE.exec(line);
    // A link inside （…） is prose about the trigger, not one: 「（[#2917](…) の再点検で切り出した）」.
    if (m)
      for (const l of m[1].replace(/（[^）]*）/g, "").matchAll(ISSUE_LINK))
        numbers.add(Number(l[1]));
  }
  return [...numbers];
}

/** The git questions {@link backingDesignDoc} asks, answered from the checkout. */
export interface DesignDocFacts {
  /** The Design Docs at the PR's merge base with main, with their text. */
  docsAtMergeBase(): { path: string; text: string }[];
  /** The blob of `path` at the merge base and at main's tip, or null where it is absent. */
  blobs(path: string): { mergeBase: string | null; tip: string | null };
  /**
   * The first-parent commits on main's tip that changed `path`, and whether its
   * history goes back through a rename (then its content came in under another
   * name, which this history does not show).
   */
  history(path: string): { shas: string[]; renamed: boolean };
  /** The tier of what a commit on main changed against its first parent. */
  commitTier(sha: string): Tier;
}

export type Backing =
  | { state: "backed"; path: string; blob: string }
  | { state: "none"; reason: string };

/** On a High PR: the backing, and whether the conformance check covers HEAD, with why not. */
export interface DesignCheck {
  backing: Backing;
  checked: boolean;
  why?: string;
}

/**
 * The Design Doc that backs a PR, so its agreed content need not be read again
 * (Issue #3542, `docs/design/high-pr-review-scope.md` 制約・前提). Every rule
 * falls to "none" when in doubt (TPL-3286): the doc is the one Design Doc at the
 * merge base with main whose 「引き金 Issue」 line links an Issue the PR closes;
 * the PR does not change it; main's tip has the same blob; and every commit on
 * main that ever changed it was a Design-tier change, which kompiro read.
 */
export function backingDesignDoc(input: {
  baseRefName: string;
  closes: readonly number[];
  changed: readonly string[];
  facts: DesignDocFacts;
}): Backing {
  const none = (reason: string): Backing => ({ state: "none", reason });
  if (input.baseRefName !== "main") return none("the PR's base is not main");
  if (input.closes.length === 0) return none("the PR closes no Issue");
  const candidates = input.facts
    .docsAtMergeBase()
    .filter((d) => DESIGN_DOC.test(d.path) && d.path !== "docs/design/TEMPLATE.md")
    .filter((d) => triggerIssues(d.text).some((n) => input.closes.includes(n)));
  if (candidates.length === 0) {
    return none("no Design Doc links an Issue the PR closes on its 引き金 Issue line");
  }
  if (candidates.length > 1) {
    return none(
      `more than one Design Doc names the Issue: ${candidates.map((d) => d.path).join(", ")}`,
    );
  }
  const { path } = candidates[0];
  if (input.changed.includes(path)) return none(`the PR changes ${path}`);
  const blobs = input.facts.blobs(path);
  if (blobs.mergeBase === null || blobs.tip !== blobs.mergeBase) {
    return none(`${path} changed on main after the PR's merge base; merge main`);
  }
  const history = input.facts.history(path);
  if (history.renamed) return none(`${path} was renamed, so its history is not all here`);
  if (history.shas.length === 0) return none(`${path} has no history on main`);
  for (const sha of history.shas) {
    const t = input.facts.commitTier(sha);
    if (t !== "design") {
      return none(
        `${sha.slice(0, 7)} changed ${path} in a ${t} change, which no one read as a design`,
      );
    }
  }
  return { state: "backed", path, blob: blobs.mergeBase };
}

/** Code points of a path the summary shows: a longer one is cut and marked. */
const SUMMARY_PATH_CHARS = 200;

/**
 * A path as job-summary Markdown that renders as the literal path: every
 * character outside a plain path alphabet becomes a numeric entity, so a file
 * name cannot open a table cell, a link or emphasis.
 */
function summaryPath(path: string): string {
  const chars = [...path];
  const shown = chars.length > SUMMARY_PATH_CHARS ? chars.slice(0, SUMMARY_PATH_CHARS) : chars;
  const cut = shown.length < chars.length ? "&#8230;" : "";
  return `<code>${shown.join("").replace(/[^A-Za-z0-9/.-]/gu, (c) => `&#${c.codePointAt(0)};`)}${cut}</code>`;
}

/** Free text (a reason naming paths) as job-summary Markdown that renders literally. */
function summaryText(text: string): string {
  return text.replace(/[^A-Za-z0-9/.,;:' -]/gu, (c) => `&#${c.codePointAt(0)};`);
}

/** The name {@link classifyChange} lists a diff section under when its path could not be read. */
const UNREADABLE_NAME = "(a diff section whose path could not be read)";

/**
 * Rows the table lists before it counts the rest. With {@link SUMMARY_PATH_CHARS}
 * this keeps the table well under 1 MiB, past which GitHub drops the whole step
 * summary.
 */
const SUMMARY_ROWS = 200;

/**
 * The Review tier job summary of what a human reads (Issue #3543): the files by
 * tier, strictest first, rebuilt from HEAD on every run, so it never goes stale
 * as a list in the PR body would (TPL-1032). The reviewer reads only the High files
 * when the High comes from them and the table lists them all. Otherwise the PR
 * is read whole: an author off the trusted list, a PR High by its label alone,
 * a diff section whose path could not be read, or more High files than rows.
 */
export function tierSummary(input: {
  effective: Tier;
  trustedAuthor: boolean;
  files: readonly { path: string; tier: Tier; boundary?: boolean; narrowable?: boolean }[];
  /**
   * On a High PR: the Design Doc that backs it, and whether the conformance check
   * covers HEAD (Issue #3542), with why not. The reading is narrowed only when
   * both hold.
   */
  design?: DesignCheck | null;
}): string {
  const lines = ["### Files by tier", ""];
  if (input.effective === "high") {
    const high = input.files.filter((f) => f.tier === "high");
    const why = !input.trustedAuthor
      ? "its author is not on the trusted list"
      : high.some((f) => f.path === UNREADABLE_NAME)
        ? "a diff section's path could not be read"
        : high.length === 0
          ? "it is High by its label (or a missing one), not by a file"
          : high.length > SUMMARY_ROWS
            ? `it has more High files than the ${SUMMARY_ROWS} rows listed`
            : null;
    const backing = input.design?.backing;
    if (why !== null) {
      lines.push(
        `The PR is High and ${why}. The reviewer reads the whole diff and the PR's \`## For Reviewers\` section.`,
        "",
      );
    } else if (backing?.state === "backed" && input.design?.checked) {
      // The table lists every High file (`why` above), so these fit in it too.
      const kept = input.files.filter((f) => f.boundary || (f.tier === "high" && !f.narrowable));
      lines.push(
        `The PR is High and the agreed Design Doc ${summaryPath(backing.path)} ` +
          `(blob <code>${backing.blob.slice(0, 12)}</code>) backs it. The reviewer reads the PR's ` +
          "`## For Reviewers` section and the files listed here (security boundaries, and High files " +
          "outside the decision and language-behavior paths), and opens the other files only to check " +
          "what the section points to.",
        "",
        ...(kept.length === 0
          ? ["No file needs reading beyond the section."]
          : [
              "Files still read:",
              "",
              ...kept.slice(0, SUMMARY_ROWS).map((f) => `- ${summaryPath(f.path)}`),
            ]),
        "",
      );
    } else {
      if (backing?.state === "backed") {
        lines.push(
          `The agreed Design Doc ${summaryPath(backing.path)} backs the PR, but the reading is not ` +
            `narrowed: ${summaryText(input.design?.why ?? "the conformance check was not read")}.`,
          "",
        );
      } else if (backing?.state === "none") {
        lines.push(`No Design Doc backs the PR: ${summaryText(backing.reason)}.`, "");
      }
      lines.push(
        "The PR is High. The reviewer reads the High files below and the PR's `## For Reviewers` section.",
        "",
      );
    }
  } else {
    lines.push(`The PR is ${input.effective}.`, "");
  }
  const listed = input.files.slice(0, SUMMARY_ROWS);
  lines.push("| Tier | File |", "| --- | --- |");
  for (const f of listed) lines.push(`| ${f.tier} | ${summaryPath(f.path)} |`);
  const rest = input.files.length - listed.length;
  if (rest > 0) lines.push("", `${rest} more ${rest === 1 ? "file is" : "files are"} not listed.`);
  return [...lines, ""].join("\n");
}

/**
 * Whether a PR's local review record is waived because the PR is the daily
 * regeneration of the ADR and TPL indexes (Issues #3416, #3289): a Low PR whose diff changes only
 * generated files, with the same outputs on both sides. `Validate` holds such a
 * PR to an exact regeneration, so a reviewer would have nothing to read. The
 * kind comes from the same module and the same diff (`--no-renames`, merge base
 * to head) that `Validate` uses, so the two checks cannot disagree on it. A
 * missing `adr.config.json` or an unreadable config on either side keeps the
 * record required.
 */
export function regenerationWaivesRecord(input: {
  tier: Tier;
  baseConfigs: ConfigTexts;
  headConfigs: ConfigTexts;
  /** `git diff --no-renames --name-status -z <merge-base> <head>`. */
  nameStatus: string;
}): boolean {
  if (input.tier !== "low") return false;
  try {
    return (
      classifyGeneratedDiff({
        base: readGeneratedPaths(input.baseConfigs),
        head: readGeneratedPaths(input.headConfigs),
        files: parseNameStatus(input.nameStatus),
      }).kind === "regeneration"
    );
  } catch {
    return false;
  }
}

/**
 * `risk: *` labels that name no tier (a misspelling, a made-up tier). They count
 * as no label, which is High, but the check fails on them so the label is fixed:
 * CodeRabbit and the Review request workflow read only the four real ones.
 */
export function unknownRiskLabels(labels: readonly string[]): string[] {
  return labels.filter((l) => l.startsWith("risk:") && !/^risk: (low|design|medium|high)$/.test(l));
}

/** The tier a set of `risk: *` labels asks for (the strictest), or null when none is set. */
export function labelTier(labels: readonly string[]): Tier | null {
  let tier: Tier | null = null;
  for (const name of labels) {
    const m = /^risk: (low|design|medium|high)$/.exec(name);
    if (m) tier = tier === null ? (m[1] as Tier) : stricter(tier, m[1] as Tier);
  }
  return tier;
}

// ---------------------------------------------------------------------------
// Diff equality

/**
 * The `!`-prefixed globs under `reviews.path_filters` in `.coderabbit.yaml`: the
 * files CodeRabbit never reads. A line scan rather than a YAML parser keeps this
 * module dependency-free; the file is hand-formatted and the block is a plain
 * list of quoted strings.
 */
export function excludedPathFilters(coderabbitYaml: string): string[] {
  const lines = coderabbitYaml.split("\n");
  const start = lines.findIndex((l) => /^\s*path_filters:\s*$/.test(l));
  if (start < 0) return [];
  const indent = /^(\s*)/.exec(lines[start])?.[1].length ?? 0;
  const globs: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if ((/^(\s*)/.exec(line)?.[1].length ?? 0) <= indent) break;
    const m = /^\s*-\s*["']?(!?)([^"'\s]+)["']?\s*$/.exec(line);
    if (m && m[1] === "!") globs.push(m[2]);
  }
  return globs;
}

/**
 * What a PR's diff changes, without where its hunks sit: per file, the kind of
 * change, the modes, the added lines in order and the removed lines in order.
 * A file whose change shows no text line (binary, empty, mode-only) also keeps
 * its blob ids. Two diffs of the same PR are the same change when their
 * fingerprints are equal: a merge of main moves hunks and context, which is not
 * a change to the PR. A move between files, a change in how many times a line
 * occurs, a reorder inside a file, and a mode or binary change all differ
 * (TPL-3286). Files CodeRabbit does not read are left out.
 */
export function diffFingerprint(diff: string, excluded: readonly string[] = []): string {
  const files = parseDiff(diff)
    .filter((f) => !matchesAny(f.path, excluded))
    .map((f) => {
      const removed = f.hunks.flatMap((h) => h.removed);
      const added = f.hunks.flatMap((h) => h.added);
      const noText = removed.length === 0 && added.length === 0;
      return {
        path: f.path,
        status: f.status,
        modes: [f.oldMode, f.newMode],
        blobs: noText || f.binary ? [f.oldBlob, f.newBlob] : null,
        removed,
        added,
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return JSON.stringify(files);
}

export type DiffPlacement = "inside" | "outside" | "unknown";

/**
 * Whether a finding on `path` lines `start..end` (new side) touches the PR's own
 * diff. `diff` must be `git diff -U0 <base>...HEAD`, so hunks hold only changed
 * lines. A finding with no file or line is `"unknown"`, and the review rounds
 * treat that as inside: it is never filed away as someone else's problem.
 */
export function lineInDiff(
  diff: string,
  path: string | undefined,
  start: number | undefined,
  end: number | undefined = start,
): DiffPlacement {
  if (path === undefined || start === undefined || !Number.isInteger(start)) return "unknown";
  const last = end !== undefined && Number.isInteger(end) && end >= start ? end : start;
  const inside = parseDiff(diff)
    .filter((f) => f.path === path)
    .some((f) =>
      f.hunks.some(
        (h) => h.added.length > 0 && h.newStart <= last && start <= h.newStart + h.added.length - 1,
      ),
    );
  return inside ? "inside" : "outside";
}

// ---------------------------------------------------------------------------
// CLI

const REPO = "kompiro/karasu";

function run(cmd: string, args: string[], quiet = false): string {
  return execFileSync(cmd, args, {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
    // A missing side of a file is an expected answer, not something to print.
    stdio: quiet ? ["ignore", "pipe", "ignore"] : undefined,
  });
}

const git = (...args: string[]): string => run("git", args);

/**
 * `git diff` with its output pinned, so a local config (color, mnemonic prefixes,
 * an external diff driver, path quoting) cannot change what the parser reads.
 */
const gitDiff = (...args: string[]): string =>
  run("git", [
    "-c",
    "core.quotePath=false",
    "diff",
    "--no-color",
    "--no-ext-diff",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    ...args,
  ]);

function gitShow(rev: string, path: string): string | null {
  try {
    return run("git", ["show", `${rev}:${path}`], true);
  } catch {
    return null;
  }
}

const mergeBaseOf = (base: string, head: string): string => git("merge-base", base, head).trim();

/** The PR's own diff: from where it left `base` to `head`, renames off. */
function prDiff(base: string, head: string): string {
  // `--no-renames`: moving a High file under a Low directory must not read as a Low change.
  return gitDiff("--no-renames", "--full-index", "-U0", mergeBaseOf(base, head), head);
}

/** The files a PR changes, with the sides the rules read. */
function changedFiles(base: string, head: string): ChangedFile[] {
  const mergeBase = mergeBaseOf(base, head);
  return parseDiff(prDiff(base, head)).map((d) => {
    const f: ChangedFile = { path: d.path, status: d.status, hunks: d.hunks };
    if (
      isPackageJson(d.path) ||
      ADR_RECORD.test(d.path) ||
      AT_RECORD.test(d.path) ||
      isTestFile(d.path) ||
      // Test helpers, runner configs and test inputs, for the test rules.
      CODE_FILE.test(d.path) ||
      isRunnerConfig(d.path) ||
      isTestInput(d.path)
    ) {
      f.before = d.status === "added" ? null : gitShow(mergeBase, d.path);
      f.after = d.status === "deleted" ? null : gitShow(head, d.path);
    }
    return f;
  });
}

function readExcluded(): string[] {
  try {
    return excludedPathFilters(readFileSync(".coderabbit.yaml", "utf-8"));
  } catch {
    return [];
  }
}

/** Whether `a` and `b` change the same thing relative to `base` ({@link diffFingerprint}). */
function sameChange(base: string, a: string, b: string): boolean {
  const excluded = readExcluded();
  return diffFingerprint(prDiff(base, a), excluded) === diffFingerprint(prDiff(base, b), excluded);
}

/** Git answers for {@link backingDesignDoc}, read from the checkout the CLI runs in. */
function designDocFacts(mergeBase: string): DesignDocFacts {
  const blob = (rev: string, path: string): string | null => {
    try {
      return (
        run("git", ["rev-parse", "--verify", "--quiet", `${rev}:${path}`], true).trim() || null
      );
    } catch {
      return null;
    }
  };
  const log = (path: string, follow: boolean): string[] =>
    git(
      "log",
      "--first-parent",
      "--format=%H",
      ...(follow ? ["--follow"] : []),
      "origin/main",
      "--",
      path,
    )
      .split("\n")
      .filter((l) => l !== "");
  return {
    docsAtMergeBase: () =>
      // `-z`: an unquoted path, so a non-ASCII name is matched, not dropped.
      git("ls-tree", "-z", "--name-only", mergeBase, "docs/design/")
        .split("\0")
        .filter((path) => DESIGN_DOC.test(path))
        .map((path) => ({ path, text: gitShow(mergeBase, path) ?? "" })),
    blobs: (path) => ({ mergeBase: blob(mergeBase, path), tip: blob("origin/main", path) }),
    history: (path) => {
      const shas = log(path, false);
      return { shas, renamed: log(path, true).length !== shas.length };
    },
    commitTier: (sha) => {
      try {
        // The path rules only: who wrote a commit on main does not change what it touched.
        return classifyChange({ files: changedFiles(`${sha}^`, sha), author: "kompiro" }).tier;
      } catch {
        // A root commit, or one git cannot diff: nothing shows a human read it.
        return "high";
      }
    },
  };
}

/**
 * Why the Design Doc conformance check does not cover HEAD, or null when it
 * does: the body has a `## For Reviewers` section, and a local review record that
 * is not waived, holds a `design` row, and passes as a Medium record would. On
 * High the check never fails on this: it only decides whether the reading is
 * narrowed (Issue #3542).
 */
export function designCheckGap(body: string, parsed: ParseResult, facts: GitFacts): string | null {
  if (!/^## For Reviewers[ \t]*$/m.test(visibleBody(body))) {
    return "the PR body has no ## For Reviewers section";
  }
  if ("error" in parsed) return parsed.error;
  if (parsed.record.waived !== undefined) return "the local review record is waived";
  if (!parsed.record.findings.some(isDesignRow)) {
    return "the local review record has no design row (docs/process/review.md, Design Doc との照合)";
  }
  const errors = verifyRecord(parsed, "medium", facts);
  return errors.length === 0 ? null : `the local review record does not pass: ${errors[0]}`;
}

/** Git answers for {@link verifyRecord}, read from the checkout the CLI runs in. */
export function gitFacts(baseRef: string, headSha: string): GitFacts {
  const resolve = (rev: string): string | null => {
    try {
      return git("rev-parse", "--verify", "--quiet", `${rev}^{commit}`).trim();
    } catch {
      return null;
    }
  };
  const isAncestor = (a: string, b: string): boolean => {
    try {
      git("merge-base", "--is-ancestor", a, b);
      return true;
    } catch {
      return false;
    }
  };
  return {
    headSha,
    mergeBase: (rev) => mergeBaseOf(baseRef, rev),
    resolve,
    isAncestor,
    onlyBaseMerges: (from, to) =>
      git("rev-list", "--first-parent", "--parents", `${from}..${to}`)
        .split("\n")
        .filter((l) => l !== "")
        .every((l) => {
          const [, , ...merged] = l.split(" ");
          return merged.length > 0 && merged.every((p) => isAncestor(p, baseRef));
        }),
    sameChange: (a, b) => sameChange(baseRef, a, b),
  };
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

interface PrView {
  author: { login: string };
  labels: { name: string }[];
  headRefOid: string;
  baseRefName: string;
  title: string;
  body: string;
  autoMergeRequest: unknown;
  closingIssuesReferences: {
    number: number;
    repository: { name: string; owner: { login: string } };
  }[];
}

/**
 * What a failed `gh api` read means: the thing is not there (404, 410), which
 * the PR has to fix, or GitHub did not answer, which a rerun may fix.
 */
export function readFailure(stderr: string): "missing" | "unreadable" {
  return /\bHTTP (?:404|410)\b/.test(stderr) ? "missing" : "unreadable";
}

/**
 * Whether the PR closes an Issue labeled `bug`: one GitHub links to it, or one
 * its body closes by keyword. An Issue that cannot be read is reported rather
 * than counted as not a bug (TPL-3286).
 */
function closedIssues(view: PrView): number[] {
  const linked = view.closingIssuesReferences
    .filter((r) => `${r.repository.owner.login}/${r.repository.name}` === REPO)
    .map((r) => r.number);
  return [...new Set([...linked, ...closedIssueNumbers(view.body ?? "", REPO)])];
}

function closesBug(view: PrView): { bug: boolean; missing: number[]; unreadable: number[] } {
  const numbers = closedIssues(view);
  const missing: number[] = [];
  const unreadable: number[] = [];
  let bug = false;
  for (const n of numbers) {
    try {
      const labels = execFileSync(
        "gh",
        ["api", `repos/${REPO}/issues/${n}`, "--jq", ".labels[].name"],
        { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
      );
      bug ||= labels.split("\n").includes("bug");
    } catch (e) {
      const failure = readFailure(String((e as { stderr?: unknown }).stderr ?? ""));
      (failure === "missing" ? missing : unreadable).push(n);
    }
  }
  return { bug, missing, unreadable };
}

/** What the `Review tier` check found on one head of a PR. */
export type PrCheck =
  /** The PR's head is not the one asked for: a push arrived. */
  | { state: "moved"; head: string }
  | {
      state: "checked";
      head: string;
      /** The classification, as the check logs it. */
      summary: Record<string, unknown>;
      /** The stricter of the label and the change. */
      effective: Tier;
      /** Every changed file with its own tier, for the job summary. */
      files: Classification["files"];
      /** Whether the author is on the trusted list: the job summary reads the rest whole. */
      trustedAuthor: boolean;
      /** On a High PR, the Design Doc that backs it and whether its conformance check covers HEAD. */
      design: DesignCheck | null;
      /** Rules the PR breaks: it has to change before it passes. */
      errors: string[];
      /** What could not be read: the PR may pass on a rerun. */
      unreadable: string[];
      /** The rules a reason line in the body waived. */
      waivers: Waiver[];
    };

/**
 * The `Review tier` check on the PR's current head, or on `head` when given (the
 * Low PR merger, Issue #3673, judges the head it read the checks of). A tier
 * below High also needs a valid local review record. Git and GitHub failures
 * other than an Issue read throw.
 */
export function checkPr(pr: string, head?: string): PrCheck {
  const view = JSON.parse(
    run("gh", [
      "pr",
      "view",
      pr,
      "--repo",
      REPO,
      "--json",
      "author,labels,headRefOid,baseRefName,title,body,autoMergeRequest,closingIssuesReferences",
    ]),
  ) as PrView;
  if (head !== undefined && view.headRefOid !== head) {
    return { state: "moved", head: view.headRefOid };
  }
  const baseRef = `origin/${view.baseRefName}`;
  const files = changedFiles(baseRef, view.headRefOid);
  const result = classifyChange({ files, author: view.author.login });
  const labeled = labelTier(view.labels.map((l) => l.name));
  // No label is High: an outside author or a bot cannot add one, and a forgotten
  // label must fall to the heavier side.
  const tier = labeled === null ? "high" : stricter(labeled, result.tier);
  const summary = { pr: Number(pr), label: labeled, effective: tier, ...result };

  const errors: string[] = [];
  for (const label of unknownRiskLabels(view.labels.map((l) => l.name))) {
    errors.push(
      `PR #${pr} has the label "${label}", which names no tier. Use one of "risk: low", ` +
        `"risk: design", "risk: medium" or "risk: high".`,
    );
  }
  if (labeled !== null && rank(labeled) < rank(result.tier)) {
    errors.push(
      `PR #${pr} is labeled "risk: ${labeled}" but its change is ${result.tier}. ` +
        `Replace the label with "risk: ${result.tier}" (docs/process/review.md "リスク段階").`,
    );
  }
  // Every tier, High included: CodeRabbit's rounds do not ask for a test either.
  const closes = closesBug(view);
  for (const n of closes.missing) {
    errors.push(`PR #${pr} closes #${n}, which does not exist. Fix the reference.`);
  }
  const unreadable = closes.unreadable.map(
    (n) =>
      `PR #${pr} closes #${n}, which could not be read to see whether it is a bug. ` +
      `Rerun the check if GitHub was unavailable.`,
  );
  const tests = checkTestChanges({
    title: view.title,
    body: view.body ?? "",
    closesBug: closes.bug,
    files,
  });
  errors.push(...tests.errors);
  if (view.autoMergeRequest !== null && tier !== "low") {
    errors.push(
      `PR #${pr} has auto-merge enabled but its tier is ${tier}; only Low merges on its own. ` +
        `Disable it with gh pr merge ${pr} --disable-auto.`,
    );
  }
  let design: DesignCheck | null = null;
  if (tier === "high") {
    // Advisory: a git failure here gives no backing rather than failing the check.
    try {
      const backing = backingDesignDoc({
        baseRefName: view.baseRefName,
        closes: closedIssues(view),
        changed: files.map((f) => f.path),
        facts: designDocFacts(mergeBaseOf(baseRef, view.headRefOid)),
      });
      const why =
        backing.state === "backed"
          ? designCheckGap(
              view.body ?? "",
              parseRecord(view.body ?? ""),
              gitFacts(baseRef, view.headRefOid),
            )
          : null;
      design = {
        backing,
        checked: backing.state === "backed" && why === null,
        ...(why ? { why } : {}),
      };
    } catch (e) {
      design = {
        backing: { state: "none", reason: `git could not answer: ${String(e).split("\n")[0]}` },
        checked: false,
      };
    }
    Object.assign(summary, {
      designDoc: design.backing,
      designChecked: design.checked,
      designGap: design.why,
    });
  }
  if (tier !== "high") {
    const mergeBase = mergeBaseOf(baseRef, view.headRefOid);
    const waived = regenerationWaivesRecord({
      tier,
      baseConfigs: {
        adr: gitShow(mergeBase, CONFIG_FILES.adr),
        tpl: gitShow(mergeBase, CONFIG_FILES.tpl),
      },
      headConfigs: {
        adr: gitShow(view.headRefOid, CONFIG_FILES.adr),
        tpl: gitShow(view.headRefOid, CONFIG_FILES.tpl),
      },
      nameStatus: run("git", [
        "diff",
        "--no-renames",
        "--name-status",
        "-z",
        mergeBase,
        view.headRefOid,
      ]),
    });
    if (waived) {
      Object.assign(summary, { recordWaived: "index regeneration (ADR, TPL); Validate checks it" });
    } else {
      const record = parseRecord(view.body ?? "");
      errors.push(...verifyRecord(record, tier, gitFacts(baseRef, view.headRefOid)));
    }
  }
  return {
    state: "checked",
    head: view.headRefOid,
    summary,
    effective: tier,
    files: result.files,
    trustedAuthor: TRUSTED_AUTHORS.has(view.author.login),
    design,
    errors,
    unreadable,
    waivers: tests.waivers,
  };
}

/** The CLI's exit code for a checked head: a broken rule outranks an unread fact. */
export function checkExitCode(result: { errors: string[]; unreadable: string[] }): number {
  if (result.errors.length > 0) return 1;
  return result.unreadable.length > 0 ? 4 : 0;
}

const USAGE = `usage:
  tier.ts classify [--base <ref>] [--head <rev>] [--author <login>]
  tier.ts check --pr <n> [--head <sha>]
    exit 0 passes, 1 breaks a rule, 3 the head is not <sha>, 4 something could not be read
  tier.ts same-change --from <rev> [--to <rev>] [--base <ref>]
  tier.ts in-diff <path> <line>[-<end>] [--base <ref>]`;

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  const base = flag(rest, "--base") ?? "origin/main";

  if (cmd === "classify") {
    const author = flag(rest, "--author") ?? run("gh", ["api", "user", "--jq", ".login"]).trim();
    const result = classifyChange({
      files: changedFiles(base, flag(rest, "--head") ?? "HEAD"),
      author,
    });
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  if (cmd === "check") {
    const pr = flag(rest, "--pr");
    if (pr === undefined) throw new Error(USAGE);
    const head = flag(rest, "--head");
    const result = checkPr(pr, head);
    if (result.state === "moved") {
      console.error(`::error::PR #${pr} is at ${result.head}, not ${head}: a push arrived.`);
      return 3;
    }
    console.log(JSON.stringify(result.summary, null, 2));
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (result.waivers.length > 0) {
      const lines = result.waivers.map((w) => `- ${w.label}: ${w.reason}`);
      console.log(["Passed by a reason line:", ...lines].join("\n"));
      // The run's summary, so a human sees every PR that passed this way.
      if (summary) {
        appendFileSync(summary, ["### Passed by a reason line", "", ...lines, ""].join("\n"));
      }
    }
    if (summary) appendFileSync(summary, tierSummary(result));
    for (const e of [...result.errors, ...result.unreadable]) console.error(`::error::${e}`);
    return checkExitCode(result);
  }

  if (cmd === "same-change") {
    const from = flag(rest, "--from");
    if (from === undefined) throw new Error(USAGE);
    const to = flag(rest, "--to") ?? "HEAD";
    console.log(JSON.stringify({ from, to, same: sameChange(base, from, to) }));
    return 0;
  }

  if (cmd === "in-diff") {
    const [path, range] = rest.filter((a, i) => !a.startsWith("--") && rest[i - 1] !== "--base");
    const m = /^(\d+)(?:-(\d+))?$/.exec(range ?? "");
    const placement = lineInDiff(
      gitDiff("--no-renames", "-U0", mergeBaseOf(base, "HEAD"), "HEAD"),
      path,
      m ? Number(m[1]) : undefined,
      m?.[2] === undefined ? undefined : Number(m[2]),
    );
    console.log(JSON.stringify({ path, range: range ?? null, placement }));
    return 0;
  }

  console.error(USAGE);
  return 2;
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2));
}
