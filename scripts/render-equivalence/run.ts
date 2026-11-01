/* eslint-disable no-console -- CLI entry point; the comparison's report is the job */
// `Render equivalence` (Issue #3509, #3505 slice B): renders every example and
// acceptance-test fence at the merge base and at HEAD, and lists every view,
// diagnostic and formatter output that differs.
//
//   pnpm render:equivalence                 # merge base with origin/main vs the working tree
//   pnpm render:equivalence --base <ref>    # another base
//   pnpm render:equivalence --base-dir <checkout> [--head-dir <checkout>] [--out <file>]
//                                           # CI: both checkouts already installed
//
// Writes the result as JSON (`--out`, by default
// reports/render-equivalence/result.json, gitignored per ADR-2419) and exits 1
// when anything differs. Whether a difference fails the PR is `verdict.ts`'s
// call, from the PR title.
//
// The CI job runs the merge base's copy of this script (TPL-3286), and each
// side's core in a child process of its own (see render-child.ts).

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { headSha, mergeBase, withBaseWorktree } from "../pr-shots/base-worktree.ts";
import { compareOutputs, countKeys, type ComparisonResult, type SideOutput } from "./compare.ts";
import { buildManifest, mergeInputs } from "./inputs.ts";

const SCRIPT_ROOT = resolve(import.meta.dirname, "../..");
const CHILD = join(import.meta.dirname, "render-child.ts");

/**
 * A side renders in seconds; one that hangs should not hold the job to its
 * timeout. The workflow's comparison step is bounded by two of these.
 */
const CHILD_TIMEOUT_MS = 8 * 60 * 1000;

/**
 * The environment a side's child gets: enough to run node, nothing that
 * reaches the workflow. `GITHUB_ENV`, `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`
 * and the rest of the runner's variables stay with the parent, so HEAD's code
 * cannot write the job's outputs or summary.
 */
export function childEnv(env: NodeJS.ProcessEnv, root?: string): NodeJS.ProcessEnv {
  const kept: NodeJS.ProcessEnv = { NODE_ENV: "production", TZ: "UTC", LANG: "C.UTF-8" };
  // tsx would otherwise read this script's checkout's tsconfig for the other
  // side's sources too.
  const tsconfig = root === undefined ? undefined : join(root, "tsconfig.json");
  if (tsconfig !== undefined && existsSync(tsconfig)) kept.TSX_TSCONFIG_PATH = tsconfig;
  for (const name of ["PATH", "HOME", "TMPDIR"]) {
    if (env[name] !== undefined) kept[name] = env[name];
  }
  return kept;
}

/**
 * Renders the manifest with the checkout at `root` in a child process, and
 * reads its outcomes back before returning. The child's stdout is dropped and
 * its stderr shown only when it fails, prefixed, so a line from HEAD's code
 * is never read as a workflow command.
 */
export function renderInChild(root: string, manifestPath: string, outPath: string): SideOutput {
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=development",
      "--import",
      "tsx",
      CHILD,
      "--root",
      root,
      "--manifest",
      manifestPath,
      "--out",
      outPath,
    ],
    {
      // `--import tsx` resolves from here: this script's checkout has tsx.
      cwd: SCRIPT_ROOT,
      env: childEnv(process.env, root),
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: CHILD_TIMEOUT_MS,
    },
  );
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trimEnd().split("\n").slice(-30);
    const cause = result.error?.message ?? `exit ${result.status ?? result.signal}`;
    throw new Error(
      `rendering with ${root} failed (${cause}):\n${stderr.map((l) => `| ${l}`).join("\n")}`,
    );
  }
  return JSON.parse(readFileSync(outPath, "utf8")) as SideOutput;
}

export interface CompareOptions {
  baseRoot: string;
  headRoot: string;
  baseSha: string;
  headSha: string;
}

export function compareCheckouts(options: CompareOptions): ComparisonResult {
  const work = mkdtempSync(join(tmpdir(), "render-equivalence-"));
  try {
    const inputs = join(work, "inputs");
    const files = mergeInputs(options.baseRoot, options.headRoot, inputs);
    const manifest = buildManifest(inputs, files);
    const manifestPath = join(work, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify(manifest));
    console.log(
      `Rendering ${manifest.entries.length} models, formatting ${manifest.krs.length} .krs and ` +
        `tidying ${manifest.styles.length} .krs.style at ${options.baseSha.slice(0, 7)} and ` +
        `${options.headSha.slice(0, 7)}.`,
    );
    const base = renderInChild(options.baseRoot, manifestPath, join(work, "base.json"));
    const head = renderInChild(options.headRoot, manifestPath, join(work, "head.json"));
    return {
      version: 1,
      baseSha: options.baseSha,
      headSha: options.headSha,
      compared: countKeys(base, head),
      differences: compareOutputs(base, head),
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function revParse(root: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git rev-parse HEAD failed in ${root}`);
  return result.stdout.trim();
}

/** Written whole and renamed into place: a reader sees the full result or none. */
function writeResult(path: string, result: ComparisonResult): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify(result, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      base: { type: "string", default: "origin/main" },
      "base-dir": { type: "string" },
      "head-dir": { type: "string" },
      out: { type: "string", default: "reports/render-equivalence/result.json" },
    },
  });
  const out = resolve(values.out);
  rmSync(out, { force: true });
  const headRoot = resolve(values["head-dir"] ?? process.cwd());

  let result: ComparisonResult;
  if (values["base-dir"] !== undefined) {
    const baseRoot = resolve(values["base-dir"]);
    result = compareCheckouts({
      baseRoot,
      headRoot,
      baseSha: revParse(baseRoot),
      headSha: revParse(headRoot),
    });
  } else {
    const baseSha = mergeBase(headRoot, values.base);
    result = await withBaseWorktree(headRoot, baseSha, async (baseRoot) =>
      compareCheckouts({ baseRoot, headRoot, baseSha, headSha: headSha(headRoot) }),
    );
  }
  writeResult(out, result);

  for (const difference of result.differences) {
    console.log(`DIFFERS  ${difference.key}: ${difference.reason}`);
  }
  console.log(
    result.differences.length === 0
      ? `No difference in ${result.compared} outputs.`
      : `${result.differences.length} of ${result.compared} outputs differ.`,
  );
  console.log(`Wrote ${out}.`);
  if (result.differences.length > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  });
}
