/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
// Decides a PR's review tier from the change itself (Issue #3286).
//
// `docs/process.md` "リスク段階" sets how a PR is reviewed from what it changes,
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
  "docs/spec/**",
  "docs/concepts*.md",
  "docs/process.md",
  ".claude/rules/**",
  ".coderabbit.yaml",
  "lefthook.yml",
  "scripts/lint/**",
  // The review machinery itself. A PR that edits it must not be able to read
  // itself as lighter: Medium and Low get no CodeRabbit review (TPL-3286).
  "scripts/review/**",
  "scripts/coderabbit/**",
  "scripts/bin/**",
  ".claude/settings.json",
  ".claude/skills/**",
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
const SECURITY_GLOBS: readonly string[] = ["packages/nest/**", ".github/workflows/**"];

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
  return moved ? "high" : "medium";
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

/** `a/P b/P` (renames are off, so both halves name the same path) → `P`. */
function pathFromDiffGit(rest: string): string | null {
  const length = (rest.length - 5) / 2;
  if (!Number.isInteger(length) || length <= 0) return null;
  const path = rest.slice(2, 2 + length);
  return rest === `a/${path} b/${path}` ? path : null;
}

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
        path: pathFromDiffGit(line.slice("diff --git ".length)) ?? "",
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
      else if (line.startsWith("--- ") && cur.path === "") {
        if (line !== "--- /dev/null") cur.path = line.slice(4).replace(/^a\//, "");
      } else if (line.startsWith("+++ ")) {
        if (line !== "+++ /dev/null") cur.path = line.slice(4).replace(/^b\//, "");
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
  return files.filter((f) => f.path !== "");
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
const SUPERSEDED_STATUS = /^- \*\*ステータス\*\*[:：]\s*Superseded by ADR-\d+/;

/**
 * An edit to an existing ADR is Low only when it stays where `.claude/rules/adr.md`
 * allows edits: the frontmatter, and the body status line turning into
 * "Superseded by ADR-<n>". Any other line is prose, which ADR-2687 keeps
 * immutable, so it is Medium: a human reads the rare diff that breaks that rule.
 */
export function adrEditIsRecordOnly(
  before: string,
  after: string,
  hunks: readonly Hunk[],
): boolean {
  const oldFm = frontmatterRange(before);
  const newFm = frontmatterRange(after);
  const inside = (range: [number, number] | null, n: number) =>
    range !== null && n >= range[0] && n <= range[1];
  return hunks.every(
    (h) =>
      h.removed.every((line, i) => inside(oldFm, h.oldStart + i) || STATUS_LINE.test(line)) &&
      h.added.every((line, i) => inside(newFm, h.newStart + i) || SUPERSEDED_STATUS.test(line)),
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A reference to one of `paths`, as a relative or repo path with an optional anchor. */
function referenceRe(paths: readonly string[]): RegExp | null {
  if (paths.length === 0) return null;
  const alts = paths.map((p) => {
    const [dir, file] = [p.split("/").at(-2) ?? "", p.split("/").at(-1) ?? ""];
    return `(?:\\.\\.?/)*(?:docs/)?${escapeRe(dir)}/${escapeRe(file)}(?:#[^\\s)\\]]*)?`;
  });
  return new RegExp(alts.join("|"), "g");
}

/**
 * Whether one changed line pair only swaps a link to a deleted Design Doc for a
 * link to the ADR that replaced it (ADR-2331's "張り替え"). Markdown links that
 * point at either side become one placeholder, link text included; bare path
 * mentions too. The pair qualifies when the old line pointed at a deleted Design
 * Doc, the new line points at a new ADR, and nothing else differs.
 */
export function isLinkSwap(
  removed: string,
  added: string,
  deletedDesigns: readonly string[],
  newAdrs: readonly string[],
): boolean {
  const oldRef = referenceRe(deletedDesigns);
  const newRef = referenceRe(newAdrs);
  if (oldRef === null || newRef === null) return false;
  if (!new RegExp(oldRef.source).test(removed) || !new RegExp(newRef.source).test(added)) {
    return false;
  }
  const either = new RegExp(`${oldRef.source}|${newRef.source}`);
  const normalize = (line: string) =>
    line
      .replace(/\[[^\]]*\]\(([^)\s]+)\)/g, (link, target: string) =>
        either.test(target) ? "⟦ref⟧" : link,
      )
      .replace(new RegExp(either.source, "g"), "⟦ref⟧");
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
  if (typeof f.before !== "string" || typeof f.after !== "string") return "medium";
  return adrEditIsRecordOnly(f.before, f.after, f.hunks) ? "low" : "medium";
}

function fileTier(
  f: ChangedFile,
  promotion: { deletedDesigns: string[]; newAdrs: string[] },
): Tier {
  if (isPackageJson(f.path)) return packageJsonTier(f.before ?? null, f.after ?? null);
  if (f.path.startsWith("docs/adr/")) return adrFileTier(f);
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
  return pathTier(f.path);
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
    if (rank(t) > rank("low")) reasons.push(`${f.path}: ${t}`);
    tier = stricter(tier, t);
  }

  if (!TRUSTED_AUTHORS.has(input.author)) {
    tier = "high";
    reasons.push(`author ${input.author} is not on the trusted list`);
  }

  return {
    tier,
    securityReview: input.files.some((f) => matchesAny(f.path, SECURITY_GLOBS)),
    reasons,
  };
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
  let minus: string | null = null;
  let file: string | null = null;
  let inHeader = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      minus = null;
      file = null;
      inHeader = true;
    } else if (inHeader && line.startsWith("--- ")) {
      minus = line.slice(4);
    } else if (inHeader && line.startsWith("+++ ")) {
      const plus = line.slice(4);
      const strip = (h: string) => h.replace(/^[ab]\//, "");
      file =
        plus !== "/dev/null"
          ? strip(plus)
          : minus !== null && minus !== "/dev/null"
            ? strip(minus)
            : null;
    } else if (line.startsWith("@@")) {
      inHeader = false;
      if (file !== path) continue;
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!m) continue;
      const from = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      if (count > 0 && from <= last && start <= from + count - 1) return "inside";
    }
  }
  return "outside";
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
  return git("diff", "--no-renames", "--full-index", "-U0", mergeBaseOf(base, head), head);
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
  if (labeled !== null && rank(labeled) < rank(result.tier)) {
    errors.push(
      `PR #${pr} is labeled "risk: ${labeled}" but its change is ${result.tier}. ` +
        `Replace the label with "risk: ${result.tier}" (docs/process.md "リスク段階").`,
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
      git("diff", "-U0", mergeBaseOf(base, "HEAD"), "HEAD"),
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
