/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
// Decides a PR's review tier from the change itself (Issue #3286).
//
// `docs/process.md` "リスク段階" sets how far a PR's review goes from the paths
// it changes, never from who wrote it or how big it is: Low merges on its own
// once CodeRabbit approves, Design and Medium go to the maintainer, High has the
// maintainer read the diff. This module is the deterministic half of that rule,
// plus the two diff questions the review rounds ask:
//
// - did merging main leave the PR's own lines alone? (`changedLines`)
// - does a finding sit inside the PR's diff? (`lineInDiff`)
//
// The functions are pure and take text; the CLI at the bottom reads git and gh.
// Every input that no rule names falls to the stricter side (TPL-3286): an
// unknown path is Medium, an unreadable effort estimate keeps a PR out of Low.
//
// Dependency-free on purpose: the `Review tier` workflow runs this file with
// plain `node` (type stripping), so the check needs no `pnpm install`.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { CODERABBIT_LOGINS } from "../coderabbit/review-state.ts";

export type Tier = "low" | "design" | "medium" | "high";

const ORDER: readonly Tier[] = ["low", "design", "medium", "high"];
const stricter = (a: Tier, b: Tier): Tier => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

/** Authors whose PRs may take the lighter tiers. Everyone else is High. */
export const TRUSTED_AUTHORS: ReadonlySet<string> = new Set(["kompiro"]);

/** Checked first: a High path wins over a Low pattern it also matches. */
export const HIGH_GLOBS: readonly string[] = [
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
  // The review machinery itself: a change here decides how every later PR is read.
  "scripts/review/**",
  "scripts/coderabbit/**",
  ".claude/skills/coderabbit-converge/**",
];

export const DESIGN_GLOBS: readonly string[] = ["docs/design/**"];

export const LOW_GLOBS: readonly string[] = [
  "docs/adr/**",
  "docs/test-perspectives/**",
  "docs/guide/**",
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.ts",
];

/** A diff touching these also gets `/security-review`, whatever its tier. */
export const SECURITY_GLOBS: readonly string[] = ["packages/nest/**", ".github/workflows/**"];

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

/** CodeRabbit's effort estimate at or above this keeps a PR out of Low. */
export const EFFORT_RAISES_LOW_AT = 4;

const matchesAny = (path: string, globs: readonly string[]): boolean =>
  globs.some((g) => matchesGlob(path, g));

const isPackageJson = (path: string): boolean =>
  path === "package.json" || path.endsWith("/package.json");

/** The tier one path asks for. A `package.json` is judged by {@link packageJsonTier}. */
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

export interface ChangedFile {
  path: string;
  /** Both sides of a `package.json`; `null` where the file does not exist. */
  packageJson?: { before: string | null; after: string | null };
}

/**
 * CodeRabbit's estimate for the PR. Absent when CodeRabbit has not written its
 * summary (or is down): the paths alone decide. `"unreadable"` when the summary
 * is there but the estimate does not parse as 1..5.
 */
export type Effort = number | "unreadable" | undefined;

export interface Classification {
  tier: Tier;
  /** Whether `/security-review` is due on top of the tier's review. */
  securityReview: boolean;
  /** Why the tier is what it is, one line per cause, for the check's log. */
  reasons: string[];
}

export function classifyChange(input: {
  files: readonly ChangedFile[];
  author: string;
  effort?: Effort;
}): Classification {
  const reasons: string[] = [];
  // No change at all is not a reason to skip the human: treat it as Medium.
  let tier: Tier = input.files.length === 0 ? "medium" : "low";
  if (input.files.length === 0) reasons.push("no changed files");

  for (const f of input.files) {
    const t = isPackageJson(f.path)
      ? packageJsonTier(f.packageJson?.before ?? null, f.packageJson?.after ?? null)
      : pathTier(f.path);
    if (ORDER.indexOf(t) > ORDER.indexOf("low")) reasons.push(`${f.path}: ${t}`);
    tier = stricter(tier, t);
  }

  if (tier === "low" && input.effort !== undefined) {
    if (input.effort === "unreadable") {
      tier = "medium";
      reasons.push("CodeRabbit's effort estimate is unreadable: not Low");
    } else if (input.effort >= EFFORT_RAISES_LOW_AT) {
      tier = "medium";
      reasons.push(`CodeRabbit's effort estimate ${input.effort} raises Low to Medium`);
    }
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

const EFFORT_MARKER = "Estimated code review effort";

/** Reads the estimate out of a CodeRabbit summary comment. */
export function parseEffort(summary: string): Effort {
  const at = summary.indexOf(EFFORT_MARKER);
  if (at < 0) return undefined;
  const m = /^[^0-9\n]*?([0-9]+)/.exec(summary.slice(at + EFFORT_MARKER.length));
  if (!m) return "unreadable";
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : "unreadable";
}

/**
 * The estimate from comments on a PR, read only from CodeRabbit's own: anyone can
 * comment on a public repository's PR, and a pasted estimate must not count.
 * CodeRabbit rewrites one summary comment on each review, so the newest one wins.
 */
export function effortFromComments(
  comments: readonly { login: string; body: string; updatedAt: string }[],
): Effort {
  const summaries = comments
    .filter((c) => CODERABBIT_LOGINS.has(c.login) && c.body.includes(EFFORT_MARKER))
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
  const latest = summaries.at(-1);
  return latest === undefined ? undefined : parseEffort(latest.body);
}

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

/** The file a diff section is about, from its `+++` / `---` headers. */
function diffFile(minus: string | null, plus: string): string | null {
  const strip = (h: string) => h.replace(/^[ab]\//, "");
  if (plus !== "/dev/null") return strip(plus);
  return minus !== null && minus !== "/dev/null" ? strip(minus) : null;
}

/**
 * Every added and removed line of a unified diff as `<file>\t<sign><text>`,
 * sorted, leaving out files CodeRabbit does not read. Two diffs of the same PR
 * compare equal when they change the same lines, wherever the hunks sit: what a
 * merge of main does to hunk positions and context is not a change to the PR.
 */
export function changedLines(diff: string, excluded: readonly string[] = []): string[] {
  const out: string[] = [];
  let minus: string | null = null;
  let file: string | null = null;
  // `---` / `+++` are headers only before a section's first hunk. Inside a hunk the
  // same prefix is content: removing a SQL comment `-- x` prints `--- x`.
  let inHeader = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      minus = null;
      file = null;
      inHeader = true;
    } else if (inHeader && line.startsWith("--- ")) {
      minus = line.slice(4);
    } else if (inHeader && line.startsWith("+++ ")) {
      file = diffFile(minus, line.slice(4));
    } else if (line.startsWith("@@")) {
      inHeader = false;
    } else if (!inHeader && file !== null && (line.startsWith("+") || line.startsWith("-"))) {
      if (!matchesAny(file, excluded)) out.push(`${file}\t${line}`);
    }
  }
  return out.sort();
}

export const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, i) => line === b[i]);

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
      file = diffFile(minus, line.slice(4));
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

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
}

const git = (...args: string[]): string => run("git", args);

function gitShow(rev: string, path: string): string | null {
  try {
    return git("show", `${rev}:${path}`);
  } catch {
    return null;
  }
}

/** The PR's own diff: from where it left `base` to `head`. */
function prDiff(base: string, head: string, unified0 = true): string {
  const mergeBase = git("merge-base", base, head).trim();
  // `--no-renames`: a rename shows as a delete plus an add, so the old path counts too.
  return git("diff", "--no-renames", ...(unified0 ? ["-U0"] : []), mergeBase, head);
}

function changedFiles(base: string, head: string): ChangedFile[] {
  const mergeBase = git("merge-base", base, head).trim();
  // `--no-renames`: moving a High file under docs/adr/ must not read as a Low change.
  return git("diff", "--name-only", "--no-renames", mergeBase, head)
    .split("\n")
    .filter((p) => p !== "")
    .map((path) =>
      isPackageJson(path)
        ? { path, packageJson: { before: gitShow(mergeBase, path), after: gitShow(head, path) } }
        : { path },
    );
}

function readExcluded(): string[] {
  try {
    return excludedPathFilters(readFileSync(".coderabbit.yaml", "utf-8"));
  } catch {
    return [];
  }
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
}

interface RestComment {
  user: { login: string } | null;
  body: string;
  updated_at: string;
}

function prEffort(pr: string): Effort {
  const pages = JSON.parse(
    run("gh", ["api", "--paginate", "--slurp", `repos/${REPO}/issues/${pr}/comments`]),
  ) as RestComment[][];
  return effortFromComments(
    pages
      .flat()
      .map((c) => ({ login: c.user?.login ?? "", body: c.body, updatedAt: c.updated_at })),
  );
}

const USAGE = `usage:
  tier.ts classify [--base <ref>] [--author <login>] [--pr <n>]
  tier.ts check --pr <n>
  tier.ts same-lines --approved <sha> [--base <ref>]
  tier.ts in-diff <path> <line>[-<end>] [--base <ref>]`;

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  const base = flag(rest, "--base") ?? "origin/main";

  if (cmd === "classify") {
    const pr = flag(rest, "--pr");
    const author = flag(rest, "--author") ?? run("gh", ["api", "user", "--jq", ".login"]).trim();
    const result = classifyChange({
      files: changedFiles(base, "HEAD"),
      author,
      effort: pr === undefined ? undefined : prEffort(pr),
    });
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  if (cmd === "check") {
    const pr = flag(rest, "--pr");
    if (pr === undefined) throw new Error(USAGE);
    const view = JSON.parse(
      run("gh", [
        "pr",
        "view",
        pr,
        "--repo",
        REPO,
        "--json",
        "author,labels,headRefOid,baseRefName",
      ]),
    ) as PrView;
    const result = classifyChange({
      files: changedFiles(`origin/${view.baseRefName}`, view.headRefOid),
      author: view.author.login,
      effort: prEffort(pr),
    });
    const labeledLow = view.labels.some((l) => l.name === "risk: low");
    console.log(JSON.stringify({ pr: Number(pr), labeledLow, ...result }, null, 2));
    if (labeledLow && result.tier !== "low") {
      console.error(
        `::error::PR #${pr} is labeled "risk: low" but its tier is ${result.tier}. ` +
          `Replace the label with "risk: ${result.tier}" (docs/process.md "リスク段階").`,
      );
      return 1;
    }
    return 0;
  }

  if (cmd === "same-lines") {
    const approved = flag(rest, "--approved");
    if (approved === undefined) throw new Error(USAGE);
    const excluded = readExcluded();
    const same = sameLines(
      changedLines(prDiff(base, approved), excluded),
      changedLines(prDiff(base, "HEAD"), excluded),
    );
    console.log(JSON.stringify({ approved, same }));
    return 0;
  }

  if (cmd === "in-diff") {
    const [path, range] = rest.filter((a, i) => !a.startsWith("--") && rest[i - 1] !== "--base");
    const m = /^(\d+)(?:-(\d+))?$/.exec(range ?? "");
    const placement = lineInDiff(
      prDiff(base, "HEAD"),
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
