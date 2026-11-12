/* eslint-disable no-console -- CLI entry point run by the maintainer */
/**
 * Approves the staged npm versions of a release, after checking them (#3240).
 *
 *   pnpm release:approve [--commit <sha>] [--dry-run] [--expect-tag <tag>]
 *
 * 1. Finds the release commit of the open train (or takes `--commit`), checks
 *    it out in a temporary worktree, builds it and runs `changeset pack`. The
 *    publish plan gives the order: a package that pins another one exactly
 *    comes in a later group (TPL-3240).
 * 2. For the first group, finds each version in the stage queue and compares
 *    the staged tarball's files with the local pack. The local pack is made
 *    here, outside CI, so a hijacked run that staged a counterfeit first
 *    cannot also forge what it is compared with.
 * 3. Shows the result, and anything else in the stage queue of the released
 *    packages, which should be rejected. On confirmation, approves the group
 *    (npm asks for 2FA each time) and stops at the first failure. Only the
 *    files can be checked here: the stage queue does not show the manifest.
 * 4. Waits until npm serves the approved versions and compares their install
 *    fields with the local pack, stopping on a difference.
 * 5. If the plan has another group, re-runs release.yml on the release commit
 *    to stage it, waits, and goes back to 2.
 * 6. Starts release-confirm.yml, which verifies the published versions again,
 *    tags them and closes the train Issue.
 *
 * `--dry-run` does 1 to 3 for the first group without approving anything; run
 * it before approving on npmjs.com. `--expect-tag` checks the staged tag
 * against the given one instead of the plan's (the rehearsal's `rehearsal`).
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { findTrain, isOnNpm, npmPackagesAt, run, runOk } from "./release-state.mts";
import { readPlan, type PlannedRelease } from "./stage.mts";
import {
  compareTarballs,
  describeDifference,
  isSame,
  manifestDifferences,
  platformPackages,
  readTarball,
  type TarballDifference,
} from "./tarball.mts";

export type StagedItem = {
  id: string;
  packageName: string;
  version: string;
  tag: string;
  createdAt?: string;
  actor?: string;
  actorType?: string;
};

/** The staged item of a planned release; fails when it is staged more than once. */
export function findStaged(items: StagedItem[], release: PlannedRelease): StagedItem | null {
  const matches = items.filter(
    (item) => item.packageName === release.name && item.version === release.version,
  );
  if (matches.length > 1) {
    throw new Error(`${release.name}@${release.version} is staged ${matches.length} times`);
  }
  return matches[0] ?? null;
}

/** Staged items of the released packages that the plan does not hold. */
export function outOfPlan(items: StagedItem[], plan: PlannedRelease[][]): StagedItem[] {
  const planned = new Set(plan.flat().map((release) => `${release.name}@${release.version}`));
  return items.filter((item) => !planned.has(`${item.packageName}@${item.version}`));
}

export type Check = {
  release: PlannedRelease;
  staged: StagedItem | null;
  expectedTag: string;
  diff: TarballDifference | null;
};

export const checkPassed = (check: Check): boolean =>
  check.staged !== null &&
  check.staged.tag === check.expectedTag &&
  check.diff !== null &&
  isSame(check.diff);

export function describeCheck(check: Check): string {
  const id = `${check.release.name}@${check.release.version}`;
  if (check.staged === null) return `${id}: not in the stage queue`;
  const who = `staged ${check.staged.createdAt ?? "?"} by ${check.staged.actor ?? "?"} (${check.staged.actorType ?? "?"})`;
  const lines = [`${id}: stage id ${check.staged.id}, tag ${check.staged.tag}, ${who}`];
  if (check.staged.tag !== check.expectedTag) {
    lines.push(`  tag ${check.staged.tag} is not the expected ${check.expectedTag}`);
  }
  if (check.diff !== null) {
    lines.push(
      isSame(check.diff)
        ? "  files match the local pack"
        : describeDifference(`  ${id}`, check.diff),
    );
  }
  return lines.join("\n");
}

// ------------------------------------------------------------------ IO

type Options = { commit: string | null; dryRun: boolean; expectTag: string | null };

function parseArgs(argv: string[]): Options {
  const options: Options = { commit: null, dryRun: false, expectTag: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--commit") options.commit = argv[++i] ?? null;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--expect-tag") options.expectTag = argv[++i] ?? null;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function step(message: string): void {
  console.log(`\n==> ${message}`);
}

/** Runs a command with the terminal attached (builds, 2FA prompts). */
function attached(cmd: string, args: string[], cwd?: string): void {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${cmd} ${args.join(" ")} failed (exit ${result.status})`);
}

function stagedItems(name: string): StagedItem[] {
  return JSON.parse(runOk("npm", ["stage", "list", name, "--json"])) as StagedItem[];
}

function downloadStaged(id: string): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "karasu-staged-"));
  try {
    runOk("npm", ["stage", "download", id, "--json"], dir);
    const tarballs = readdirSync(dir).filter((file) => file.endsWith(".tgz"));
    if (tarballs.length !== 1)
      throw new Error(`npm stage download ${id} wrote ${tarballs.length} tarballs`);
    return readFileSync(join(dir, tarballs[0]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function pack(tree: string): { plan: PlannedRelease[][]; outDir: string } {
  const outDir = mkdtempSync(join(tmpdir(), "karasu-approve-pack-"));
  attached("pnpm", ["exec", "changeset", "pack", "--out-dir", outDir], tree);
  return { plan: readPlan(readFileSync(join(outDir, "publish-plan.json"), "utf8")), outDir };
}

async function rerunRelease(sha: string): Promise<void> {
  const runs = JSON.parse(
    runOk("gh", [
      "run",
      "list",
      "--workflow",
      "release.yml",
      "--commit",
      sha,
      "--limit",
      "1",
      "--json",
      "databaseId",
    ]),
  ) as { databaseId: number }[];
  if (runs.length === 0) throw new Error(`no release.yml run for ${sha} to re-run`);
  const id = String(runs[0].databaseId);
  const attempt = () =>
    Number(runOk("gh", ["run", "view", id, "--json", "attempt", "--jq", ".attempt"]));
  const before = attempt();
  step(`Re-running release.yml run ${id} to stage the next group`);
  runOk("gh", ["run", "rerun", id]);
  // Watch the new attempt, not the finished one it replaces.
  await waitFor(`attempt ${before + 1} of run ${id}`, () => attempt() > before);
  attached("gh", ["run", "watch", id, "--exit-status"]);
}

/** Polls until `done` holds, for up to five minutes. */
async function waitFor(what: string, done: () => boolean): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (done()) return;
    await sleep(5000);
  }
  throw new Error(`timed out waiting for ${what}`);
}

/**
 * Waits until npm serves the approved versions. The next group's plan and
 * release-confirm.yml both read the registry, which can lag behind an approval.
 */
async function waitForPublished(releases: PlannedRelease[]): Promise<void> {
  for (const release of releases) {
    await waitFor(`${release.name}@${release.version} on npm`, () =>
      isOnNpm(release.name, release.version),
    );
  }
}

/**
 * Compares the install fields npm now serves with the local pack's package.json.
 * npm takes the version manifest from the publish request, apart from the
 * tarball, and the stage queue does not show it (`npm stage view` has no
 * manifest), so this is the first point where a counterfeit manifest can be
 * seen. It runs right after the approval instead of waiting for the daily
 * release-confirm.yml, and stops before the next group.
 */
async function checkInstallFields(packed: Map<string, Record<string, unknown>>): Promise<void> {
  const differing: string[] = [];
  for (const [spec, manifest] of packed) {
    // `npm view` prints nothing for a version it does not serve, and one
    // request may still meet a stale answer right after `waitForPublished`.
    let served = "";
    await waitFor(`the metadata of ${spec} on npm`, () => {
      served = runOk("npm", ["view", spec, "--json"]);
      return served !== "";
    });
    const fields = manifestDifferences(manifest, JSON.parse(served) as Record<string, unknown>);
    if (fields.length > 0) differing.push(`${spec}: ${fields.join(", ")}`);
  }
  if (differing.length > 0) {
    throw new Error(
      [
        "npm serves install fields that differ from the local pack. Follow docs/release.md 「公開後の照合に落ちたとき」 now:",
        ...differing,
      ].join("\n"),
    );
  }
  console.log("Install fields on npm match the local pack.");
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}

export async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const sha =
    options.commit ??
    (() => {
      const train = findTrain();
      if (train === null) throw new Error("no train is open; pass --commit <sha>");
      if (train.sha === null)
        throw new Error(`the release PR of ${train.branch} has not merged yet`);
      return train.sha;
    })();
  runOk("git", ["fetch", "--quiet", "origin"]);
  const resolved = runOk("git", ["rev-parse", `${sha}^{commit}`]);
  const names = npmPackagesAt(resolved).map((pkg) => pkg.name);

  const tree = mkdtempSync(join(tmpdir(), "karasu-approve-"));
  step(`Checking out ${resolved} in ${tree}`);
  runOk("git", ["worktree", "add", "--detach", tree, resolved]);
  let approvedAny = false;
  try {
    attached("pnpm", ["install", "--frozen-lockfile"], tree);
    attached("pnpm", ["build"], tree);
    const platform = platformPackages(readFileSync(join(tree, "pnpm-lock.yaml"), "utf8"));

    for (let round = 0; ; round++) {
      step("Packing the release commit");
      const { plan, outDir } = pack(tree);
      if (plan.length === 0) {
        console.log("Every npm version of this release is published.");
        break;
      }
      const queue = names.flatMap(stagedItems);
      const packed = new Map<string, Record<string, unknown>>();
      const checks: Check[] = plan[0].map((release) => {
        const staged = findStaged(queue, release);
        const local = readTarball(readFileSync(join(outDir, release.tarball.path)));
        packed.set(
          `${release.name}@${release.version}`,
          JSON.parse(local.get("package.json")!.toString("utf8")) as Record<string, unknown>,
        );
        return {
          release,
          staged,
          expectedTag: options.expectTag ?? release.tag,
          diff: staged
            ? compareTarballs(local, readTarball(downloadStaged(staged.id)), platform)
            : null,
        };
      });

      step(`Group ${round + 1} of the plan`);
      for (const check of checks) console.log(describeCheck(check));
      for (const group of plan.slice(1)) {
        console.log(`Later: ${group.map((r) => `${r.name}@${r.version}`).join(", ")}`);
      }
      const stray = outOfPlan(queue, plan);
      if (stray.length > 0) {
        step("Staged but not in the plan: reject these (npm stage reject <id>)");
        for (const item of stray) {
          console.log(
            `${item.packageName}@${item.version}: stage id ${item.id}, tag ${item.tag}, by ${item.actor ?? "?"}`,
          );
        }
      }

      if (!checks.every(checkPassed)) {
        throw new Error(
          checks.some((check) => check.staged === null)
            ? "a version of this group is not staged yet: check the release.yml run of the release commit (a version npm refused as previously published but that is in no queue was unpublished once and needs a new version number)"
            : "a staged version did not pass the check. Do not approve it; reject it and see docs/release.md",
        );
      }
      if (options.dryRun) {
        console.log("\nDry run: nothing approved.");
        return;
      }
      if (!(await confirm(`Approve ${checks.length} version(s)?`))) {
        console.log("Nothing approved.");
        return;
      }
      for (const check of checks) {
        step(`Approving ${check.release.name}@${check.release.version}`);
        attached("npm", ["stage", "approve", check.staged!.id]);
        approvedAny = true;
      }
      await waitForPublished(checks.map((check) => check.release));
      try {
        await checkInstallFields(packed);
      } catch (error) {
        // The train Issue gets the report now, not at the next daily run;
        // release-confirm.yml tags nothing that differs.
        step("Starting release-confirm.yml to report on the train Issue");
        run("gh", ["workflow", "run", "release-confirm.yml"]);
        throw error;
      }
      if (plan.length === 1) break;
      await rerunRelease(resolved);
    }
  } finally {
    run("git", ["worktree", "remove", "--force", tree]);
  }

  if (approvedAny || !options.dryRun) {
    step("Starting release-confirm.yml");
    runOk("gh", ["workflow", "run", "release-confirm.yml"]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
