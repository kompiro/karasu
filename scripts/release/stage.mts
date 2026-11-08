/* eslint-disable no-console -- CLI entry point; release.yml shows its output */
/**
 * Stages the npm packages of a release (#3240).
 *
 *   node scripts/release/stage.mts [--out-dir <dir>] [--tag <tag>] [--any-commit]
 *
 * `changeset pack` writes the publish plan: the versions not yet on npm, in
 * dependency-ordered groups, each with its tag and tarball. Only the first
 * group is staged. A package that pins another one exactly sits in a later
 * group, so it reaches the stage queue only once its dependency has been
 * approved and is installable (TPL-3240). Approving the first group and
 * re-running release.yml stages the next one (`pnpm release:approve` does
 * both).
 *
 * Nothing is staged unless this commit is a release commit, so a version left
 * in `package.json` by an abandoned release is not staged by a later push or a
 * manual dispatch. The plan must also hold only packages this commit bumped:
 * an abandoned version that the next release did not bump would otherwise be
 * staged with no tag ever made for it.
 *
 * `--tag` and `--any-commit` exist for the rehearsal on a spike branch only.
 *
 * Authentication is npm's: OIDC in release.yml, or `npm login` on a
 * maintainer's machine when the CI path is down. Outside GitHub Actions
 * provenance cannot be generated, so it is turned off there.
 */
import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  bumpedPackagesAt,
  isReleaseCommit,
  npmPackagesAt,
  run,
  runOk,
  type CommandResult,
} from "./release-state.mts";

export type PlannedRelease = {
  name: string;
  version: string;
  tag: string;
  tarball: { path: string; integrity: string };
};

type PlanEntry = { kind: "publish" } & PlannedRelease;
type PlanFile = { version: number; plan: ({ kind: string } | PlanEntry)[][] };

const isPublish = (entry: { kind: string }): entry is PlanEntry => entry.kind === "publish";

/** The non-empty groups of publish releases in a `publish-plan.json`. */
export function readPlan(json: string): PlannedRelease[][] {
  const file = JSON.parse(json) as PlanFile;
  if (file.version !== 1 || !Array.isArray(file.plan)) {
    throw new Error(`unsupported publish plan (version ${String(file.version)})`);
  }
  return file.plan
    .map((group) =>
      group
        .filter(isPublish)
        .map(({ name, version, tag, tarball }) => ({ name, version, tag, tarball })),
    )
    .filter((group) => group.length > 0);
}

const isPrerelease = (version: string): boolean => version.includes("-");

/** Reasons the plan must not be staged; empty when it may. */
export function planProblems(
  plan: PlannedRelease[][],
  opts: { npmNames: string[]; bumped: { name: string; version: string }[] | null },
): string[] {
  return plan.flat().flatMap((release) => {
    const id = `${release.name}@${release.version}`;
    const problems: string[] = [];
    if (!opts.npmNames.includes(release.name)) {
      problems.push(
        `${id} is not in RELEASED_PACKAGES (scripts/release/github-release.mts): it would be approved but never tagged.`,
      );
    }
    if (
      opts.bumped &&
      !opts.bumped.some((pkg) => pkg.name === release.name && pkg.version === release.version)
    ) {
      problems.push(
        `${id} is not on npm but this release did not bump it, as after an abandoned release. Add a patch changeset for ${release.name} and release again.`,
      );
    }
    if (isPrerelease(release.version) && release.tag === "latest") {
      problems.push(`${id} is a prerelease and would be staged under latest.`);
    }
    return problems;
  });
}

export function stageArgs(tarball: string, tag: string, opts: { inActions: boolean }): string[] {
  // `latest` is left to npm's default so its own checks still run: it refuses a
  // prerelease without a tag and a version lower than the current latest.
  return [
    "stage",
    "publish",
    tarball,
    "--json",
    ...(tag === "latest" ? [] : ["--tag", tag]),
    ...(opts.inActions ? [] : ["--provenance=false"]),
  ];
}

export type StageOutcome =
  | { kind: "staged"; stageId: string; integrity: string }
  | { kind: "already-staged" }
  | { kind: "failed"; message: string };

/**
 * Registry rejections that mean "this version is already in the stage queue",
 * as seen in the rehearsal (#3240). Only these are skipped on a re-run; any
 * other failure stops the run (TPL-2804).
 */
export const ALREADY_STAGED: RegExp[] = [];

export function classifyStage(result: CommandResult, name: string): StageOutcome {
  if (result.status === 0) {
    const parsed = JSON.parse(result.stdout) as Record<
      string,
      { stageId?: string; integrity?: string }
    >;
    const entry = parsed[name];
    if (!entry?.stageId || !entry.integrity) {
      return { kind: "failed", message: `npm reported no stage id for ${name}: ${result.stdout}` };
    }
    return { kind: "staged", stageId: entry.stageId, integrity: entry.integrity };
  }
  if (ALREADY_STAGED.some((pattern) => pattern.test(result.stderr))) {
    return { kind: "already-staged" };
  }
  return { kind: "failed", message: result.stderr.trim() || `npm exited with ${result.status}` };
}

// ------------------------------------------------------------------ CLI

type Options = { outDir: string | null; tag: string | null; anyCommit: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = { outDir: null, tag: null, anyCommit: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out-dir") options.outDir = argv[++i] ?? null;
    else if (arg === "--tag") options.tag = argv[++i] ?? null;
    else if (arg === "--any-commit") options.anyCommit = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function summary(line: string): void {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

export function main(argv: string[]): void {
  const options = parseArgs(argv);
  const sha = process.env.GITHUB_SHA ?? runOk("git", ["rev-parse", "HEAD"]);
  if (!options.anyCommit && !isReleaseCommit(sha)) {
    console.log(`::notice::${sha} is not a release commit: nothing to stage.`);
    return;
  }

  const outDir = resolve(options.outDir ?? mkdtempSync(join(tmpdir(), "karasu-stage-")));
  runOk("pnpm", ["exec", "changeset", "pack", "--out-dir", outDir]);
  const plan = readPlan(readFileSync(join(outDir, "publish-plan.json"), "utf8"));
  if (plan.length === 0) {
    summary("Every npm version of this commit is already published: nothing to stage.");
    return;
  }

  const problems = planProblems(plan, {
    npmNames: npmPackagesAt(sha).map((pkg) => pkg.name),
    bumped: options.anyCommit ? null : bumpedPackagesAt(sha),
  });
  if (problems.length > 0) {
    for (const problem of problems) console.log(`::error::${problem}`);
    process.exitCode = 1;
    return;
  }

  const [first, ...later] = plan;
  const inActions = process.env.GITHUB_ACTIONS === "true";
  summary("| Package | Tag | Result | Stage id | Integrity |");
  summary("| --- | --- | --- | --- | --- |");
  for (const release of first) {
    const tag = options.tag ?? release.tag;
    const tarball = join(outDir, release.tarball.path);
    const outcome = classifyStage(run("npm", stageArgs(tarball, tag, { inActions })), release.name);
    const id = `\`${release.name}@${release.version}\``;
    if (outcome.kind === "failed") {
      summary(`| ${id} | ${tag} | failed | | |`);
      console.log(`::error::Staging ${release.name}@${release.version} failed: ${outcome.message}`);
      process.exitCode = 1;
      return;
    }
    if (outcome.kind === "already-staged") {
      // Not staged by this run: the approval step checks who made the tarball.
      summary(`| ${id} | ${tag} | already staged, not by this run | | |`);
      continue;
    }
    summary(`| ${id} | ${tag} | staged | ${outcome.stageId} | ${outcome.integrity} |`);
  }
  for (const group of later) {
    summary(
      `Waiting for the group above to be approved: ${group.map((r) => `${r.name}@${r.version}`).join(", ")}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
