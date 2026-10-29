/* eslint-disable no-console -- CLI entry point; telling the agent what to attach is the job */
// Before/after screenshots for a PR that changes rendered output (Issue #3359,
// ADR-3359):
//
//   pnpm pr:shots                      # merge base with origin/main vs HEAD
//   pnpm pr:shots --base <ref>         # another base
//   pnpm pr:shots --file path/to.krs   # shoot this model first (repeatable)
//   pnpm pr:shots --url '/?file=…'     # app UI: production vs `pnpm dev`
//                 [--after-origin http://localhost:5173]
//
// Writes PNGs and a `## Before / after` section to reports/pr-shots/<branch>/
// (gitignored, ADR-2419) and prints the `gh pr edit --attach` that uploads
// them. Nothing is committed. Run from the repo root, like the other scripts.

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { capture } from "../report/screenshot.ts";
import {
  baseWorktreePath,
  changedFiles,
  headSha,
  mergeBase,
  withBaseWorktree,
} from "./base-worktree.ts";
import { collectCandidates, VIEWS } from "./candidates.ts";
import {
  compareSides,
  IMAGE_LIMIT,
  pairLabel,
  pairStem,
  renderBody,
  SECTION_HEADING,
  type Shot,
} from "./compare.ts";
import { coreSide, loadCore } from "./render-side.ts";

const PRODUCTION_ORIGIN = "https://karasu.kompiro.dev";

function currentBranch(): string {
  const result = spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" });
  return result.stdout.trim() || "detached";
}

/**
 * reports/pr-shots/<branch with / made ->/, emptied before anything else runs
 * so a failed run never leaves the previous run's shots to be attached.
 */
function freshOutDir(): string {
  const dir = join("reports/pr-shots", currentBranch().replaceAll("/", "-"));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Wraps an SVG in a document Chromium can load; the shot is clipped to the SVG. */
function svgDocument(svg: string): string {
  return `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#ffffff">${svg}`;
}

function printAttach(dir: string, files: readonly string[]): void {
  const body = join(dir, "body.md");
  console.log(`\nWrote ${body}${files.length > 0 ? ` and ${files.length} PNGs` : ""}.`);
  console.log(
    `Put its ${SECTION_HEADING} section into the PR body (replacing the template's), save the ` +
      `whole body to a file, then:\n`,
  );
  const attach = files.map((f) => ` --attach ./${f}`).join("");
  console.log(`  gh pr edit <n> --body-file <body file>${attach}\n`);
}

async function shootRendered(options: { base: string; files: string[] }): Promise<void> {
  const dir = freshOutDir();
  const cwd = process.cwd();
  const baseSha = mergeBase(cwd, options.base);
  const head = headSha(cwd);
  const candidates = collectCandidates({
    headRoot: cwd,
    files: options.files,
    changedFiles: changedFiles(cwd, baseSha),
  });
  console.log(
    `Rendering ${candidates.length} candidates × ${VIEWS.length} views at ${baseSha.slice(0, 7)} ` +
      `(${baseWorktreePath(cwd, baseSha)}) and HEAD.`,
  );

  const comparison = await withBaseWorktree(cwd, baseSha, async (baseDir) =>
    compareSides(
      candidates,
      VIEWS,
      coreSide(await loadCore(baseDir), baseDir),
      coreSide(await loadCore(cwd), cwd),
    ),
  );

  const shown = comparison.changed.slice(0, IMAGE_LIMIT);
  const shots: Shot[] = [];
  const specs: { html: string; selector: string }[] = [];
  const files: string[] = [];
  for (const pair of shown) {
    const stem = pairStem(pair);
    const shot: Shot = { pair, after: `./${join(dir, `${stem}.after.png`)}` };
    if (pair.before.ok) {
      shot.before = `./${join(dir, `${stem}.before.png`)}`;
      specs.push({ html: svgDocument(pair.before.svg), selector: "body > svg" });
      files.push(join(dir, `${stem}.before.png`));
    }
    specs.push({ html: svgDocument(pair.after.svg), selector: "body > svg" });
    files.push(join(dir, `${stem}.after.png`));
    shots.push(shot);
  }
  if (specs.length > 0) {
    const pngs = await capture(specs, { colorScheme: "light" });
    pngs.forEach((png, i) => writeFileSync(files[i], png));
  }
  writeFileSync(join(dir, "body.md"), renderBody(comparison, shots, { baseSha, headSha: head }));

  for (const pair of comparison.changed) {
    console.log(`${shown.includes(pair) ? "shot   " : "listed "} ${pairLabel(pair)}`);
  }
  for (const failure of comparison.headFailures) {
    console.log(`FAILED  ${pairLabel(failure)} at HEAD: ${failure.reason}`);
  }
  if (comparison.changed.length === 0 && comparison.headFailures.length === 0) {
    console.log("No rendering change.");
  }
  printAttach(dir, files);
  // A model this branch can no longer render is a regression to fix, not a
  // section to paste.
  if (comparison.headFailures.length > 0) process.exitCode = 1;
}

async function shootApp(options: { path: string; afterOrigin: string }): Promise<void> {
  if (/^[a-z][a-z0-9+.-]*:/i.test(options.path)) {
    throw new Error(`pr:shots: --url takes a path such as '/?file=index.krs', not ${options.path}`);
  }
  const dir = freshOutDir();
  const path = options.path.startsWith("/") ? options.path : `/${options.path}`;
  const files = [join(dir, "app.before.png"), join(dir, "app.after.png")];
  const pngs = await capture(
    [{ url: `${PRODUCTION_ORIGIN}${path}` }, { url: `${options.afterOrigin}${path}` }],
    { colorScheme: "light" },
  );
  pngs.forEach((png, i) => writeFileSync(files[i], png));
  const body = [
    SECTION_HEADING,
    "",
    `\`${path}\` in production (${PRODUCTION_ORIGIN}) and on this branch (\`pnpm dev\`).`,
    "",
    "| Before | After |",
    "| --- | --- |",
    `| ![before: ${path}](./${files[0]}) | ![after: ${path}](./${files[1]}) |`,
    "",
  ].join("\n");
  writeFileSync(join(dir, "body.md"), body);
  printAttach(dir, files);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      base: { type: "string", default: "origin/main" },
      file: { type: "string", multiple: true, default: [] },
      url: { type: "string" },
      "after-origin": { type: "string", default: "http://localhost:5173" },
    },
  });
  if (values.url !== undefined) {
    await shootApp({ path: values.url, afterOrigin: values["after-origin"] });
  } else {
    await shootRendered({ base: values.base, files: values.file });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
