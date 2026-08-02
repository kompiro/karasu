/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The docs site publishes the files listed in `PUBLISHED_EN_FILES`
// (packages/docs-site/scripts/lib/site-map.ts). Its PR guards run from
// `reference-docs-check.yml`, whose `paths:` is a second hand-written list.
// Two hand-written lists describing one set drift, and the drift is silent:
// a doc added to the published set but not to `paths:` simply stops triggering
// the guards, and the PR that adds it is green (Issue #2257, TPL-2253 — a
// removal or a trigger closed by a file list rather than by a search).
//
// So this asserts the containment that matters: every published doc is matched
// by at least one glob in `paths:`, and the skip workflow's `paths-ignore:` is
// its mirror image (ADR-953: the two must stay complementary or a required
// check hangs pending).

export interface Problem {
  kind: "error" | "warning";
  message: string;
}

const SITE_MAP_PATH = "packages/docs-site/scripts/lib/site-map.ts";
const CHECK_WORKFLOW = ".github/workflows/reference-docs-check.yml";
const SKIP_WORKFLOW = ".github/workflows/reference-docs-check-skip.yml";

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
  checkPaths: string[],
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

  for (const file of publishedFiles) {
    const docPath = `docs/${file}`;
    if (!checkPaths.some((glob) => globMatches(glob, docPath))) {
      problems.push({
        kind: "error",
        message: `${docPath} is published by the docs site but no \`paths:\` entry in ${CHECK_WORKFLOW} matches it, so editing it triggers none of the site's guards.`,
      });
    }
  }

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

  const published = parsePublishedFiles(read(SITE_MAP_PATH));
  const checkPaths = parseWorkflowPaths(read(CHECK_WORKFLOW), "paths");
  const skipPaths = parseWorkflowPaths(read(SKIP_WORKFLOW), "paths-ignore");

  const problems = check(published, checkPaths, skipPaths);
  if (problems.length > 0) {
    console.error(formatProblems(problems));
    process.exit(1);
  }
  console.log(`docs-site-ci-paths-sync: ok (${published.length} published doc(s) covered)`);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /docs-site-ci-paths-sync\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
