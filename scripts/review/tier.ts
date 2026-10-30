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
import { readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { type GitFacts, parseRecord, verifyRecord } from "./local-review-record.ts";

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
  "scripts/coderabbit/**",
  "scripts/bin/**",
  ".claude/settings.json",
  ".claude/skills/**",
  ".claude/agents/**",
  ".github/PULL_REQUEST_TEMPLATE.md",
];

const DESIGN_GLOBS: readonly string[] = ["docs/design/**"];

/** `docs/adr/**` is not here: its Low cases are read from the diff ({@link adrFileTier}). */
const LOW_GLOBS: readonly string[] = [
  "docs/test-perspectives/**",
  "docs/guide/**",
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.ts",
];

/** `pnpm adr:regenerate` output. */
const ADR_GENERATED_GLOBS: readonly string[] = [
  "docs/adr/effective.md",
  "docs/adr/graph.md",
  "docs/adr/graph/**",
];

/** An ADR record, `docs/adr/<n>-<name>.md` (not README or TEMPLATE). */
const ADR_RECORD = /^docs\/adr\/\d+-[^/]+\.md$/;
const DESIGN_DOC = /^docs\/design\/[^/]+\.md$/;

/** A diff touching these also gets `/security-review`, whatever its tier. */
const SECURITY_GLOBS: readonly string[] = [
  "packages/nest/**",
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

/** The tier one path asks for by its location alone. */
export function pathTier(path: string): Tier {
  if (matchesAny(path, HIGH_GLOBS)) return "high";
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
  /** Both sides, for `package.json` and existing ADRs; `null` where the file does not exist. */
  before?: string | null;
  after?: string | null;
}

export interface Classification {
  tier: Tier;
  /** Whether `/security-review` is due on top of the tier's review. */
  securityReview: boolean;
  /** Why the tier is what it is, one line per cause, for the check's log. */
  reasons: string[];
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
  const names = new Set(
    [...deletedDesigns, ...newAdrs].flatMap((p) => [p, p.split("/").at(-1) ?? p]),
  );
  for (const p of newAdrs) {
    const n = /^docs\/adr\/(\d+)-/.exec(p)?.[1];
    if (n !== undefined) names.add(`ADR-${n}`);
  }
  const isName = (text: string) => names.has(text.trim().replace(/^`(.*)`$/, "$1"));
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

const TEST_GLOBS: readonly string[] = ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"];
/**
 * A test file is Low only when it is new. A new file adds tests and can take no
 * existing coverage away. Any change to an existing test file can (a deleted
 * case, a weakened assertion, an early return, a comment or template literal
 * opened around tests, a skip modifier), and two review rounds showed that no
 * pattern list catches every way, so such a change is Medium and a human reads
 * it (TPL-3286).
 */
const isNewFile = (f: ChangedFile): boolean => f.status === "added";

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
  if (byPath === "low" && matchesAny(f.path, TEST_GLOBS) && !isNewFile(f)) return "medium";
  // ADR promotion (ADR-2331): only in a PR that adds an ADR record.
  if (promotion.newAdrs.length > 0) {
    if (f.status === "deleted" && DESIGN_DOC.test(f.path)) return "low";
    if (
      f.status === "modified" &&
      f.path.endsWith(".md") &&
      f.hunks.length > 0 &&
      f.hunks.every(
        (h) =>
          h.removed.length > 0 &&
          h.removed.length === h.added.length &&
          h.removed.every((line, i) =>
            isLinkSwap(line, h.added[i], promotion.deletedDesigns, promotion.newAdrs),
          ),
      )
    ) {
      return "low";
    }
  }
  return byPath;
}

export function classifyChange(input: {
  files: readonly ChangedFile[];
  author: string;
}): Classification {
  const reasons: string[] = [];
  // No change at all is not a reason to skip the human: treat it as Medium.
  let tier: Tier = input.files.length === 0 ? "medium" : "low";
  if (input.files.length === 0) reasons.push("no changed files");

  const promotion = {
    newAdrs: input.files
      .filter((f) => f.status === "added" && ADR_RECORD.test(f.path))
      .map((f) => f.path),
    deletedDesigns: input.files
      .filter((f) => f.status === "deleted" && DESIGN_DOC.test(f.path))
      .map((f) => f.path),
  };

  for (const f of input.files) {
    const t = fileTier(f, promotion);
    const name =
      f.path === UNREADABLE_PATH ? "(a diff section whose path could not be read)" : f.path;
    if (rank(t) > rank("low")) reasons.push(`${name}: ${t}`);
    tier = stricter(tier, t);
  }

  if (!TRUSTED_AUTHORS.has(input.author)) {
    tier = "high";
    reasons.push(`author ${input.author} is not on the trusted list`);
  }

  return {
    tier,
    securityReview: input.files.some(
      (f) => f.path === UNREADABLE_PATH || matchesAny(f.path, SECURITY_GLOBS),
    ),
    reasons,
  };
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
    if (isPackageJson(d.path) || ADR_RECORD.test(d.path)) {
      f.before = gitShow(mergeBase, d.path);
      f.after = gitShow(head, d.path);
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

/** Git answers for {@link verifyRecord}, read from the checkout the CLI runs in. */
function gitFacts(baseRef: string, headSha: string): GitFacts {
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
  body: string;
  autoMergeRequest: unknown;
}

/**
 * The `Review tier` check. Returns the errors that fail it, and logs the
 * classification. A tier below High also needs a valid local review record.
 */
function checkPr(pr: string): string[] {
  const view = JSON.parse(
    run("gh", [
      "pr",
      "view",
      pr,
      "--repo",
      REPO,
      "--json",
      "author,labels,headRefOid,baseRefName,body,autoMergeRequest",
    ]),
  ) as PrView;
  const baseRef = `origin/${view.baseRefName}`;
  const result = classifyChange({
    files: changedFiles(baseRef, view.headRefOid),
    author: view.author.login,
  });
  const labeled = labelTier(view.labels.map((l) => l.name));
  // No label is High: an outside author or a bot cannot add one, and a forgotten
  // label must fall to the heavier side.
  const tier = labeled === null ? "high" : stricter(labeled, result.tier);
  console.log(
    JSON.stringify({ pr: Number(pr), label: labeled, effective: tier, ...result }, null, 2),
  );

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
  if (view.autoMergeRequest !== null && tier !== "low") {
    errors.push(
      `PR #${pr} has auto-merge enabled but its tier is ${tier}; only Low merges on its own. ` +
        `Disable it with gh pr merge ${pr} --disable-auto.`,
    );
  }
  if (tier !== "high") {
    const record = parseRecord(view.body ?? "");
    errors.push(...verifyRecord(record, tier, gitFacts(baseRef, view.headRefOid)));
  }
  return errors;
}

const USAGE = `usage:
  tier.ts classify [--base <ref>] [--head <rev>] [--author <login>]
  tier.ts check --pr <n>
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
    const errors = checkPr(pr);
    for (const e of errors) console.error(`::error::${e}`);
    return errors.length > 0 ? 1 : 0;
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
