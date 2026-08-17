/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// The docs site publishes the files listed in `PUBLISHED_EN_FILES`
// (packages/docs-site/scripts/lib/site-map.ts). Two workflows are triggered by
// that same set through hand-written `paths:` lists: `reference-docs-check.yml`
// runs the site's guards on a PR (Issue #2257), and `docs-preview.yml` deploys
// the PR's preview (Issue #2260).
// Hand-written lists describing one set drift, and the drift is silent: a doc
// added to the published set but not to `paths:` simply stops triggering the
// workflow, and the PR that adds it is green (TPL-2253 — a removal or a trigger
// closed by a file list rather than by a search).
//
// So this asserts the containment that matters: every published doc is matched
// by at least one glob in every triggered workflow's `paths:`, and the skip
// workflow's `paths-ignore:` mirrors the guard workflow's `paths:` (ADR-953: the
// two must stay complementary or a required check hangs pending). The preview
// workflow has no required status and therefore no paired stub to mirror.

export interface Problem {
  kind: "error" | "warning";
  message: string;
}

/** One workflow triggered by the published set, with the `paths:` it declares. */
export interface TriggeredWorkflow {
  readonly file: string;
  readonly paths: readonly string[];
}

const SITE_MAP_PATH = "packages/docs-site/scripts/lib/site-map.ts";
export const CHECK_WORKFLOW = ".github/workflows/reference-docs-check.yml";
export const SKIP_WORKFLOW = ".github/workflows/reference-docs-check-skip.yml";
export const PREVIEW_WORKFLOW = ".github/workflows/docs-preview.yml";

/**
 * Pull the string literals out of the `PUBLISHED_EN_FILES` array.
 *
 * Anchored on `= [` rather than the first `[` after the identifier, because the
 * declaration is annotated `readonly string[]` and that bracket pair comes
 * first — reading it yields an empty list, which would make this guard pass
 * while covering nothing.
 */
export function parsePublishedFiles(source: string): string[] {
  const match = /PUBLISHED_EN_FILES[\s\S]*?=\s*\[([\s\S]*?)\]/.exec(source);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Pull the entries of every `paths:` / `paths-ignore:` block. Returns the union
 * across blocks — a workflow repeats the list for `pull_request` and `push`,
 * and a doc only needs to be covered by one of them to trigger the job.
 */
export function parseWorkflowPaths(source: string, key: "paths" | "paths-ignore"): string[] {
  const entries: string[] = [];
  const lines = source.split("\n");
  let inBlock = false;
  for (const line of lines) {
    if (new RegExp(`^\\s*${key}:\\s*$`).test(line)) {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    const item = /^\s*-\s*"([^"]+)"\s*$/.exec(line);
    if (item) {
      entries.push(item[1]);
      continue;
    }
    inBlock = false;
  }
  return [...new Set(entries)];
}

/**
 * Add the `.ja.md` sibling of every published en file that exists on disk.
 *
 * `sync.ts` publishes each sibling as the `ja` locale page, so a ja-only edit
 * changes the site exactly as much as an en one — but `PUBLISHED_EN_FILES` names
 * only the en base, so a `paths:` list written from it alone leaves the ja file
 * untriggered. `exists` is injected so this stays pure and testable.
 */
export function expandLocaleSiblings(
  enFiles: readonly string[],
  exists: (docsRelative: string) => boolean,
): string[] {
  const expanded = [...enFiles];
  for (const file of enFiles) {
    // A `.ja.md` entry is already the sibling; deriving from it would ask for a
    // `.ja.ja.md` that can never exist.
    if (!file.endsWith(".md") || file.endsWith(".ja.md")) continue;
    const ja = `${file.slice(0, -".md".length)}.ja.md`;
    if (exists(ja)) expanded.push(ja);
  }
  return expanded;
}

/** Does a GitHub Actions path filter glob match this repo-relative path? */
export function globMatches(glob: string, path: string): boolean {
  const pattern = glob
    .split("**")
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"))
    .join(".*");
  return new RegExp(`^${pattern}$`).test(path);
}

export function check(
  publishedFiles: string[],
  workflows: readonly TriggeredWorkflow[],
  skipPathsIgnore: string[],
): Problem[] {
  const problems: Problem[] = [];

  if (publishedFiles.length === 0) {
    problems.push({
      kind: "error",
      message: `Could not read PUBLISHED_EN_FILES from ${SITE_MAP_PATH} — the parser needs updating before it can guard anything.`,
    });
    return problems;
  }

  for (const workflow of workflows) {
    for (const file of publishedFiles) {
      const docPath = `docs/${file}`;
      if (!workflow.paths.some((glob) => globMatches(glob, docPath))) {
        problems.push({
          kind: "error",
          message: `${docPath} is published by the docs site but no \`paths:\` entry in ${workflow.file} matches it, so editing it does not trigger that workflow.`,
        });
      }
    }
  }

  // Only the guard workflow carries a Required status, so only its list has a
  // paired stub to stay complementary with.
  const checkPaths = workflows.find((w) => w.file === CHECK_WORKFLOW)?.paths ?? [];
  const missingFromSkip = checkPaths.filter((p) => !skipPathsIgnore.includes(p));
  const extraInSkip = skipPathsIgnore.filter((p) => !checkPaths.includes(p));
  for (const p of missingFromSkip) {
    problems.push({
      kind: "error",
      message: `\`${p}\` is in ${CHECK_WORKFLOW}'s \`paths:\` but not in ${SKIP_WORKFLOW}'s \`paths-ignore:\`. Both workflows would fire for it (ADR-953: they must be complementary).`,
    });
  }
  for (const p of extraInSkip) {
    problems.push({
      kind: "error",
      message: `\`${p}\` is in ${SKIP_WORKFLOW}'s \`paths-ignore:\` but not in ${CHECK_WORKFLOW}'s \`paths:\`. Neither workflow fires for it and the required check hangs pending (ADR-953).`,
    });
  }

  return problems;
}

export function formatProblems(problems: Problem[]): string {
  const errors = problems.filter((p) => p.kind === "error");
  const lines: string[] = [];
  if (errors.length > 0) {
    lines.push(`docs-site-ci-paths-sync: ${errors.length} error(s):`);
    for (const e of errors) lines.push(`  ✗ ${e.message}`);
  }
  return lines.join("\n");
}

function main(): void {
  const root = resolve(process.cwd());
  const read = (p: string): string => readFileSync(resolve(root, p), "utf8");

  const published = expandLocaleSiblings(parsePublishedFiles(read(SITE_MAP_PATH)), (docsRelative) =>
    existsSync(resolve(root, "docs", docsRelative)),
  );
  const workflows: TriggeredWorkflow[] = [CHECK_WORKFLOW, PREVIEW_WORKFLOW].map((file) => ({
    file,
    paths: parseWorkflowPaths(read(file), "paths"),
  }));
  const skipPaths = parseWorkflowPaths(read(SKIP_WORKFLOW), "paths-ignore");

  const problems = check(published, workflows, skipPaths);
  if (problems.length > 0) {
    console.error(formatProblems(problems));
    process.exit(1);
  }
  console.log(
    `docs-site-ci-paths-sync: ok (${published.length} published doc(s) covered by ${workflows.length} workflow(s))`,
  );
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /docs-site-ci-paths-sync\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
