/* eslint-disable no-console -- CLI entry point; the workflows read its output */
/**
 * Records a staged npm release once its versions are approved (#3240).
 *
 *   node scripts/release/confirm.mts locate
 *   node scripts/release/confirm.mts verify --tree <dir> --candidates <json>
 *   node scripts/release/confirm.mts record --sha <sha> --issue <n> --verified "<tags>" --verify-result <r> --run-url <url>
 *   node scripts/release/confirm.mts close-train --pack-result <r> --stage-result <r> --vscode-result <r> --run-url <url>
 *
 * release-confirm.yml runs `locate` and `verify` in a job that can read only,
 * and `record` in a job that can push tags but installs nothing:
 *
 * - `locate` finds the open train and its release commit, lists the bumped
 *   versions that are on npm but untagged (the ones to verify), and reports any
 *   version published outside the plan.
 * - `verify` packs each of them from a checkout of the release commit and
 *   compares the files with the tarball on npm. However a version was approved
 *   (by `pnpm release:approve` or on npmjs.com), it is tagged only if it
 *   matches.
 * - `record` tags the verified versions, builds the GitHub Release, and closes
 *   the train Issue once every bumped npm version is tagged and the VS Code job
 *   of release.yml succeeded.
 *
 * `close-train` is release.yml's last job: it closes a train that published
 * nothing to npm, and otherwise leaves the Issue open with what waits for
 * approval.
 *
 * Runs on Node's type stripping (the record job installs nothing), so it uses
 * erasable TypeScript only and imports nothing but node builtins and siblings.
 */
import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  REPOSITORY,
  bumpedPackagesAt,
  findTrain,
  isOnNpm,
  isReleaseBranch,
  NPM_REGISTRY,
  npmHistory,
  npmPackagesAt,
  orderViolations,
  packageTag,
  pickTrain,
  runOk,
  tagTarget,
  unplannedVersions,
  type NpmPackage,
  type TrainIssue,
  workflowCommand,
} from "./release-state.mts";
import {
  compareTarballs,
  describeDifference,
  isSame,
  manifestDifferences,
  platformPackages,
  readTarball,
} from "./tarball.mts";
import { npmTrainState } from "./train.mts";

// ------------------------------------------------------------------ decisions

export type Job = { name: string; conclusion: string | null };

/**
 * Whether the VS Code extension job of a release.yml run succeeded. It calls a
 * reusable workflow, so the API lists its jobs as `VS Code extension / <job>`.
 * A skipped Marketplace publish (no `AZURE_CLIENT_ID`) still counts.
 */
export function vscodeSucceeded(jobs: Job[]): boolean {
  const vscode = jobs.filter((job) => job.name.startsWith("VS Code extension / "));
  return (
    vscode.length > 0 &&
    vscode.every((job) => job.conclusion === "success" || job.conclusion === "skipped")
  );
}

/**
 * Bumped versions where only some of a release's npm packages reached npm: the
 * next group waits for a re-run of release.yml to be staged.
 */
export function partialRelease(
  bumped: NpmPackage[],
  present: (pkg: NpmPackage) => boolean,
): string[] {
  const published = bumped.filter(present);
  if (published.length === 0 || published.length === bumped.length) return [];
  return bumped.filter((pkg) => !present(pkg)).map(packageTag);
}

/**
 * The handed-over tags that `record` may push: only bumped, untagged versions
 * of the release commit that are on npm. The list comes from the verify job,
 * which runs the release commit's build, so `record` (which can push tags)
 * does not take its word for which names to push.
 */
export function taggable(
  verified: string[],
  bumped: NpmPackage[],
  isUntaggedOnNpm: (pkg: NpmPackage) => boolean,
): { accepted: string[]; refused: string[] } {
  const allowed = new Set(bumped.filter(isUntaggedOnNpm).map(packageTag));
  return {
    accepted: verified.filter((tag) => allowed.has(tag)),
    refused: verified.filter((tag) => !allowed.has(tag)),
  };
}

/** A hidden marker that keeps a scheduled run from repeating the same comment. */
export const marker = (kind: string, subject: string): string =>
  `<!-- release-confirm:${kind}:${subject} -->`;

// ------------------------------------------------------------------ IO helpers

function output(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) {
    console.log(`${name}=${value}`);
    return;
  }
  const delimiter = `EOF_${Math.random().toString(36).slice(2)}`;
  appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function flag(argv: string[], name: string): string {
  const i = argv.indexOf(`--${name}`);
  const value = i === -1 ? undefined : argv[i + 1];
  if (value === undefined) throw new Error(`--${name} is required`);
  return value;
}

/**
 * Comments on the train Issue unless a comment with the same marker by GitHub
 * Actions is already there. Only the bot's own comments count: anyone can
 * comment on a public repository, and a planted marker must not silence a
 * warning.
 */
function commentOnce(issue: number, mark: string, body: string): void {
  const comments = JSON.parse(
    runOk("gh", ["issue", "view", String(issue), "--json", "comments"]),
  ) as { comments: { author: { login: string }; body: string }[] };
  const seen = comments.comments.some(
    (comment) => comment.author.login === "github-actions" && comment.body.includes(mark),
  );
  if (!seen) runOk("gh", ["issue", "comment", String(issue), "--body", `${body}\n\n${mark}`]);
}

function releaseTagOn(sha: string): string | null {
  return (
    runOk("git", ["tag", "--points-at", sha])
      .split("\n")
      .find((tag) => tag.startsWith("release-")) ?? null
  );
}

const releaseLink = (tag: string): string => `https://github.com/${REPOSITORY}/releases/tag/${tag}`;

// ------------------------------------------------------------------ locate

function tagsOf(name: string): string[] {
  return runOk("git", ["tag", "-l", `${name}@*`])
    .split("\n")
    .filter((tag) => tag !== "")
    .map((tag) => tag.slice(name.length + 1));
}

function unplannedReport(sha: string, packages: NpmPackage[]): string[] {
  return packages.flatMap((pkg) => {
    const info = npmHistory(pkg.name);
    const tagged = tagsOf(pkg.name);
    const after = unplannedVersions({
      time: info.time,
      versions: info.versions,
      tagged,
      taggedOnRelease: tagged.filter(
        (version) => tagTarget(packageTag({ name: pkg.name, version })) === sha,
      ),
      releaseVersion: pkg.version,
    });
    if (after === null) {
      console.log(
        workflowCommand(
          "notice",
          `${pkg.name} has no tagged version before this release: no unplanned-version check for it.`,
        ),
      );
      return [];
    }
    const found = after.filter(
      (version) =>
        runOk("npm", [
          "view",
          `${pkg.name}@${version}`,
          "deprecated",
          "--registry",
          NPM_REGISTRY,
        ]) === "",
    );
    return found.map(
      (version) =>
        `${pkg.name}@${version} is on npm but is not this release's version. It was approved outside the plan.`,
    );
  });
}

function locate(): void {
  const train = findTrain();
  if (train === null || train.sha === null) {
    console.log(
      train === null
        ? "::notice::No train is open: nothing to record."
        : workflowCommand(
            "notice",
            `The release PR of ${train.branch} has not merged yet: nothing to record.`,
          ),
    );
    output("sha", "");
    return;
  }
  runOk("git", ["fetch", "--quiet", "--tags", "origin"]);
  const bumped = bumpedPackagesAt(train.sha);
  const candidates = bumped.filter(
    (pkg) => tagTarget(packageTag(pkg)) === null && isOnNpm(pkg.name, pkg.version),
  );
  const unplanned = unplannedReport(train.sha, npmPackagesAt(train.sha));
  console.log(`Release commit ${train.sha} (train #${train.issue}, ${train.branch}).`);
  console.log(`To verify: ${candidates.map(packageTag).join(", ") || "none"}`);
  output("sha", train.sha);
  output("issue", String(train.issue));
  output("candidates", JSON.stringify(candidates));
  output("unplanned", unplanned.join("\n"));
}

// ------------------------------------------------------------------ verify

function onlyTarball(dir: string): string {
  const tarballs = readdirSync(dir).filter((file) => file.endsWith(".tgz"));
  if (tarballs.length !== 1)
    throw new Error(`expected one tarball in ${dir}, found ${tarballs.length}`);
  return join(dir, tarballs[0]);
}

function verify(argv: string[]): void {
  const tree = flag(argv, "tree");
  const candidates = JSON.parse(flag(argv, "candidates")) as NpmPackage[];
  const platform = platformPackages(readFileSync(join(tree, "pnpm-lock.yaml"), "utf8"));
  const verified: string[] = [];
  const mismatches: string[] = [];
  for (const pkg of candidates) {
    const ours = mkdtempSync(join(tmpdir(), "karasu-pack-"));
    runOk("pnpm", ["pack", "--pack-destination", ours], join(tree, pkg.dir));
    const theirs = mkdtempSync(join(tmpdir(), "karasu-npm-"));
    runOk("npm", [
      "pack",
      packageTag(pkg),
      "--ignore-scripts",
      "--pack-destination",
      theirs,
      "--registry",
      NPM_REGISTRY,
    ]);
    const expected = readTarball(readFileSync(onlyTarball(ours)));
    // A published tarball the readers refuse is reported like a mismatch: it is
    // live on npm, and a refusal is what a crafted archive would produce. A
    // failure to build or fetch, above, stops the run instead (TPL-2804).
    let published: ReturnType<typeof readTarball>;
    try {
      published = readTarball(readFileSync(onlyTarball(theirs)));
    } catch (error) {
      mismatches.push(
        `${packageTag(pkg)}: the published tarball could not be read safely (${(error as Error).message}).`,
      );
      continue;
    }
    const diff = compareTarballs(expected, published, platform);
    if (!isSame(diff)) {
      mismatches.push(describeDifference(packageTag(pkg), diff));
      continue;
    }
    // npm installs from the registry's metadata, not from the tarball's
    // package.json, so the install fields there must match the pack too.
    const manifest = expected.get("package.json");
    if (manifest === undefined)
      throw new Error(`the pack of ${packageTag(pkg)} has no package.json`);
    const fields = manifestDifferences(
      JSON.parse(manifest.toString("utf8")) as Record<string, unknown>,
      JSON.parse(
        runOk("npm", ["view", packageTag(pkg), "--json", "--registry", NPM_REGISTRY]),
      ) as Record<string, unknown>,
    );
    if (fields.length > 0) {
      mismatches.push(
        `${packageTag(pkg)}: the registry metadata differs from the packed package.json in ${fields.join(", ")}.`,
      );
      continue;
    }
    verified.push(packageTag(pkg));
  }
  console.log(`Verified: ${verified.join(", ") || "none"}`);
  for (const mismatch of mismatches) console.log(workflowCommand("error", mismatch));
  output("verified", verified.join(" "));
  output("mismatches", mismatches.join("\n\n"));
  if (mismatches.length > 0) process.exitCode = 1;
}

// ------------------------------------------------------------------ record

function latestReleaseRunJobs(sha: string): Job[] {
  const runs = JSON.parse(
    runOk("gh", [
      "api",
      `repos/${REPOSITORY}/actions/workflows/release.yml/runs?head_sha=${sha}&per_page=1`,
    ]),
  ) as { workflow_runs: { id: number }[] };
  const latest = runs.workflow_runs[0];
  if (!latest) return [];
  // A release.yml run has a handful of jobs, well within one page.
  const jobs = JSON.parse(
    runOk("gh", [
      "api",
      `repos/${REPOSITORY}/actions/runs/${latest.id}/jobs?filter=latest&per_page=100`,
    ]),
  ) as { jobs: Job[] };
  return jobs.jobs;
}

function pushTags(sha: string, tags: string[]): void {
  for (const tag of tags) {
    const target = tagTarget(tag);
    if (target === sha) continue;
    if (target !== null) throw new Error(`${tag} already exists on ${target}, not on ${sha}`);
    runOk("git", ["tag", tag, sha]);
    runOk("git", ["push", "origin", `refs/tags/${tag}`]);
  }
}

/** Whether a package tag of `packages` points at `sha`. */
export function hasPackageTag(
  packages: NpmPackage[],
  target: (tag: string) => string | null,
  sha: string,
): boolean {
  return packages.some((pkg) => target(packageTag(pkg)) === sha);
}

const hasPackageTagOn = (sha: string, packages: NpmPackage[]): boolean =>
  hasPackageTag(packages, tagTarget, sha);

function record(argv: string[]): void {
  const sha = flag(argv, "sha");
  const issue = Number(flag(argv, "issue"));
  const verified = flag(argv, "verified")
    .split(" ")
    .filter((tag) => tag !== "");
  const failures = (process.env.VERIFY_REPORT ?? "").trim();
  const verifyResult = flag(argv, "verify-result");
  const runUrl = flag(argv, "run-url");
  // verify can fail before it writes a report (a build or npm failure). That
  // is not a mismatch, but it must not pass silently or close the train.
  const verifyBroke = verifyResult !== "success" && failures === "";
  runOk("git", ["fetch", "--quiet", "--tags", "origin"]);

  if (verifyBroke) {
    commentOnce(
      issue,
      marker("verify-broke", `${sha}:${runUrl}`),
      `The check of the published npm tarballs did not finish (${verifyResult}): ${runUrl}. Nothing new was tagged. Fix the cause and start release-confirm.yml again; this Issue stays open.`,
    );
    process.exitCode = 1;
  }

  if (failures !== "") {
    commentOnce(
      issue,
      // A new failure on the same commit is a new comment.
      marker(
        "failed",
        `${sha}:${createHash("sha256").update(failures).digest("hex").slice(0, 12)}`,
      ),
      [
        "The published npm tarballs did not pass the check against the release commit (#3240). Nothing was tagged for these versions, and this Issue stays open. See docs/release.md for what to do.",
        "",
        "```",
        // Paths come from the registry tarball: a backtick must not end the fence.
        failures.replaceAll("`", "'"),
        "```",
      ].join("\n"),
    );
  }

  const all = npmPackagesAt(sha);
  const bumped = bumpedPackagesAt(sha);
  const present = new Map<string, boolean>();
  const onNpm = (name: string, version: string): boolean => {
    const key = `${name}@${version}`;
    if (!present.has(key)) present.set(key, isOnNpm(name, version));
    return present.get(key)!;
  };

  const tags = taggable(
    verified,
    bumped,
    (pkg) => tagTarget(packageTag(pkg)) === null && onNpm(pkg.name, pkg.version),
  );
  if (tags.refused.length > 0) {
    console.log(
      workflowCommand(
        "error",
        `Not a bumped, untagged version on npm, so not tagged: ${tags.refused.join(", ")}`,
      ),
    );
    process.exitCode = 1;
  }
  pushTags(sha, tags.accepted);
  // Any package tag on this commit, not only the ones pushed now: a run that
  // pushed tags and then failed to create the Release leaves nothing to
  // accept on the retry, and the Release would be skipped for good.
  if (releaseTagOn(sha) !== null || hasPackageTagOn(sha, all)) {
    runOk("node", ["scripts/release/github-release.mts", "--commit", sha]);
    runOk("git", ["fetch", "--quiet", "--tags", "origin"]);
  }

  const violations = orderViolations(bumped, all, onNpm);
  if (violations.length > 0) {
    const lines = violations.map(
      (v) => `- \`${v.pkg}\` is on npm, but \`${v.missing}\`, which it pins, is not.`,
    );
    commentOnce(
      issue,
      marker("order", violations.map((v) => v.pkg).join(",")),
      [
        "`npm i` of these versions fails until their dependency is approved (TPL-3240):",
        "",
        ...lines,
      ].join("\n"),
    );
    console.log(workflowCommand("error", lines.join(" ")));
    process.exitCode = 1;
  }

  const waiting = partialRelease(bumped, (pkg) => onNpm(pkg.name, pkg.version));
  if (waiting.length > 0) {
    commentOnce(
      issue,
      marker("next-group", waiting.join(",")),
      `Part of this release is on npm. ${waiting.map((t) => `\`${t}\``).join(", ")} still has to be staged: run \`pnpm release:approve\`, or re-run the release.yml run of ${sha}, then approve it.`,
    );
  }

  const state = npmTrainState(bumped, tagTarget, sha);
  if (state.misplaced.length > 0) {
    console.log(
      workflowCommand(
        "error",
        `Tagged on another commit than ${sha}: ${state.misplaced.join(", ")}`,
      ),
    );
    process.exitCode = 1;
  }
  const npmDone = state.pending.length === 0 && state.misplaced.length === 0;
  const vscodeDone = vscodeSucceeded(latestReleaseRunJobs(sha));
  if (failures !== "" || violations.length > 0) process.exitCode = 1;
  if (!npmDone || !vscodeDone || failures !== "" || verifyBroke || violations.length > 0) {
    console.log(
      `Train #${issue} stays open (npm pending: ${state.pending.join(", ") || "none"}; VS Code done: ${vscodeDone}).`,
    );
    return;
  }
  const tag = releaseTagOn(sha);
  runOk("gh", [
    "issue",
    "close",
    String(issue),
    "--comment",
    tag ? `Released: ${releaseLink(tag)}` : `Every version of ${sha} was already released.`,
  ]);
}

// ------------------------------------------------------------------ close-train

function trainIssueOf(sha: string): number | null {
  const branch = runOk("gh", [
    "api",
    `repos/${REPOSITORY}/commits/${sha}/pulls`,
    "--jq",
    ".[0].head.ref // empty",
  ]);
  if (!isReleaseBranch(branch)) {
    console.log(
      workflowCommand("notice", `${sha} was not merged from a release branch: no train to close.`),
    );
    return null;
  }
  const issues = JSON.parse(
    runOk("gh", [
      "issue",
      "list",
      "--label",
      "release",
      "--state",
      "open",
      "--json",
      "number,body",
    ]),
  ) as TrainIssue[];
  const train = pickTrain(issues.filter((issue) => issue.body.includes(`\`${branch}\``)));
  if (train === null || train.branch !== branch) {
    console.log(workflowCommand("notice", `No open tracking Issue names ${branch}.`));
    return null;
  }
  return train.issue;
}

/**
 * Whether a release.yml run failed, from the results of its pack, stage and
 * vscode jobs. Each is read on its own: a failed pack skips stage, and a
 * skipped job is not a success.
 */
export const releaseRunFailed = (results: (string | null)[]): boolean =>
  results.some((result) => result !== "success");

function closeTrain(argv: string[]): void {
  const sha = process.env.GITHUB_SHA ?? runOk("git", ["rev-parse", "HEAD"]);
  const packResult = flag(argv, "pack-result");
  const stageResult = flag(argv, "stage-result");
  const vscodeResult = flag(argv, "vscode-result");
  const runUrl = flag(argv, "run-url");
  const issue = trainIssueOf(sha);
  if (issue === null) return;

  if (releaseRunFailed([packResult, stageResult, vscodeResult])) {
    runOk("gh", [
      "issue",
      "comment",
      String(issue),
      "--body",
      `The release run did not finish: ${runUrl} (npm pack: ${packResult}, npm stage: ${stageResult}, VS Code: ${vscodeResult}). Fix it and re-run the failed jobs; this Issue stays open and the next train waits for it.`,
    ]);
    process.exitCode = 1;
    return;
  }

  runOk("git", ["fetch", "--quiet", "--tags", "origin"]);
  const state = npmTrainState(bumpedPackagesAt(sha), tagTarget, sha);
  if (state.misplaced.length > 0) {
    console.log(
      workflowCommand(
        "error",
        `Tagged on another commit than ${sha}: ${state.misplaced.join(", ")}`,
      ),
    );
    process.exitCode = 1;
    return;
  }
  if (state.pending.length > 0) {
    commentOnce(
      issue,
      marker("staged", state.pending.join(",")),
      [
        `${runUrl} staged the npm versions it could. Waiting for approval: ${state.pending.map((t) => `\`${t}\``).join(", ")}.`,
        "",
        "Run `pnpm release:approve` (docs/release.md). It checks each staged tarball against a pack of this commit, approves the versions in dependency order, and starts `release-confirm.yml`, which tags them and closes this Issue.",
      ].join("\n"),
    );
    return;
  }
  const tag = releaseTagOn(sha);
  runOk("gh", [
    "issue",
    "close",
    String(issue),
    "--comment",
    tag
      ? `Released: ${releaseLink(tag)}`
      : `Nothing was published by ${runUrl} (every version was already released).`,
  ]);
}

// ------------------------------------------------------------------ CLI

export function main(argv: string[]): void {
  const [command, ...rest] = argv;
  switch (command) {
    case "locate":
      return locate();
    case "verify":
      return verify(rest);
    case "record":
      return record(rest);
    case "close-train":
      return closeTrain(rest);
    default:
      throw new Error(`unknown command: ${command ?? "(none)"}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
