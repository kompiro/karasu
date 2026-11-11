/**
 * What a release commit holds and where its npm versions are (#3240).
 *
 * Shared by stage.mts (CI stages a release), approve.mts (the maintainer
 * approves it) and confirm.mts (release-confirm.yml records it). The decisions
 * are pure functions; the thin IO helpers below them shell out to git, gh and
 * npm.
 *
 * Runs on Node's type stripping (the record job installs nothing), so it uses
 * erasable TypeScript only and imports nothing but node builtins and siblings.
 */
import { spawnSync } from "node:child_process";
import { RELEASED_PACKAGES } from "./github-release.mts";
import { branchFromIssueBody } from "./train.mts";

export const REPOSITORY = process.env.GITHUB_REPOSITORY ?? "kompiro/karasu";

export type NpmPackage = {
  name: string;
  dir: string;
  version: string;
  /** Workspace packages this one depends on with `workspace:`, by name. */
  workspaceDependencies: string[];
};

type PackageJson = {
  name: string;
  version: string;
  private?: boolean;
  dependencies?: Record<string, string>;
};

// ------------------------------------------------------------------ decisions

/** The released packages that go to npm (the extension goes to the Marketplace). */
export function npmPackagesOf(read: (dir: string) => PackageJson | null): NpmPackage[] {
  return RELEASED_PACKAGES.flatMap(({ name, dir }) => {
    const pkg = read(dir);
    if (pkg === null || pkg.private) return [];
    if (pkg.name !== name)
      throw new Error(`${dir}/package.json names ${pkg.name}, expected ${name}`);
    const workspaceDependencies = Object.entries(pkg.dependencies ?? {})
      .filter(([, spec]) => spec.startsWith("workspace:"))
      .map(([dependency]) => dependency);
    return [{ name, dir, version: pkg.version, workspaceDependencies }];
  });
}

/**
 * The npm packages whose version the release commit changed against its first
 * parent. Only these are this release's to stage, tag and wait for: a package
 * left alone keeps the tag of the release that published it.
 */
export function bumpedNpmPackages(
  current: NpmPackage[],
  parentVersion: (name: string) => string | null,
): NpmPackage[] {
  return current.filter((pkg) => parentVersion(pkg.name) !== pkg.version);
}

export const isReleaseBranch = (ref: string | null | undefined): boolean =>
  typeof ref === "string" && ref.startsWith("chore/release-");

export type TrainIssue = { number: number; body: string };

/** The one open train Issue and its branch, or null when no train is open. */
export function pickTrain(issues: TrainIssue[]): { issue: number; branch: string } | null {
  const trains = issues.flatMap((issue) => {
    const branch = branchFromIssueBody(issue.body);
    return branch ? [{ issue: issue.number, branch }] : [];
  });
  if (trains.length > 1) {
    throw new Error(
      `more than one open train Issue: ${trains.map((t) => `#${t.issue}`).join(", ")}`,
    );
  }
  return trains[0] ?? null;
}

export type MergedPull = { baseRefName: string; mergeCommit: { oid: string } | null };

/** The merge commit of the release branch into main, or null before it merged. */
export function pickMergeCommit(pulls: MergedPull[]): string | null {
  const merged = pulls.filter((pull) => pull.baseRefName === "main" && pull.mergeCommit);
  if (merged.length > 1) throw new Error("the release branch was merged into main more than once");
  return merged[0]?.mergeCommit?.oid ?? null;
}

export type CommandResult = { status: number | null; stdout: string; stderr: string };

/**
 * Whether `npm view <name>@<version> version --json` found the version. Only
 * "the version or the package does not exist" counts as absent; any other
 * failure is an error, so a registry outage is never read as "not published
 * yet" (TPL-2804).
 */
export function classifyNpmView(result: CommandResult, version: string): "present" | "absent" {
  if (result.status === 0) {
    const out = result.stdout.trim();
    if (out === "") return "absent";
    const parsed = JSON.parse(out) as string | string[];
    const versions = Array.isArray(parsed) ? parsed : [parsed];
    if (versions.includes(version)) return "present";
    throw new Error(`npm view answered ${out} for version ${version}`);
  }
  if (/\bE404\b/.test(result.stderr)) return "absent";
  throw new Error(`npm view failed (exit ${result.status}): ${result.stderr.trim()}`);
}

/**
 * Published bumped packages whose exactly pinned workspace dependency is not on
 * npm, which leaves them uninstallable (TPL-3240).
 */
export function orderViolations(
  bumped: NpmPackage[],
  all: NpmPackage[],
  present: (name: string, version: string) => boolean,
): { pkg: string; missing: string }[] {
  return bumped.flatMap((pkg) => {
    if (!present(pkg.name, pkg.version)) return [];
    return pkg.workspaceDependencies.flatMap((dependency) => {
      const target = all.find((candidate) => candidate.name === dependency);
      if (!target || present(target.name, target.version)) return [];
      return [{ pkg: `${pkg.name}@${pkg.version}`, missing: `${target.name}@${target.version}` }];
    });
  });
}

/**
 * Versions of a package published after its newest tagged version that are not
 * the release commit's version. A version approved on npmjs.com outside the
 * plan, under any dist-tag, shows up here and nowhere else. Versions published
 * before that point predate the staged releases and are left alone. Null when
 * no version is tagged yet.
 */
export function unplannedVersions(opts: {
  time: Record<string, string>;
  versions: string[];
  tagged: string[];
  releaseVersion: string;
}): string[] | null {
  const taggedTimes = opts.tagged.flatMap((version) =>
    opts.time[version] ? [Date.parse(opts.time[version])] : [],
  );
  // A package with no tagged version yet (a newly public one) has nothing to
  // measure from: its manually published first version is not unplanned.
  if (taggedTimes.length === 0) return null;
  const since = Math.max(...taggedTimes);
  return opts.versions.filter(
    (version) =>
      version !== opts.releaseVersion &&
      opts.time[version] !== undefined &&
      Date.parse(opts.time[version]) > since,
  );
}

// ------------------------------------------------------------------ IO

export function run(cmd: string, args: string[], cwd?: string): CommandResult {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function runOk(cmd: string, args: string[], cwd?: string): string {
  const result = run(cmd, args, cwd);
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed (exit ${result.status}): ${result.stderr.trim()}`,
    );
  }
  return result.stdout.trim();
}

/** `package.json` of `dir` at `rev`, or null when the file is not there. */
export function packageJsonAt(rev: string, dir: string): PackageJson | null {
  const result = run("git", ["show", `${rev}:${dir}/package.json`]);
  return result.status === 0 ? (JSON.parse(result.stdout) as PackageJson) : null;
}

export function npmPackagesAt(rev: string): NpmPackage[] {
  return npmPackagesOf((dir) => packageJsonAt(rev, dir));
}

export function bumpedPackagesAt(sha: string): NpmPackage[] {
  const parent = npmPackagesAt(`${sha}^1`);
  return bumpedNpmPackages(
    npmPackagesAt(sha),
    (name) => parent.find((pkg) => pkg.name === name)?.version ?? null,
  );
}

/** Whether `sha` is the merge of a `chore/release-*` branch (the release commit). */
export function isReleaseCommit(sha: string): boolean {
  const ref = runOk("gh", [
    "api",
    `repos/${REPOSITORY}/commits/${sha}/pulls`,
    "--jq",
    ".[0].head.ref // empty",
  ]);
  return isReleaseBranch(ref);
}

export type Train = { issue: number; branch: string; sha: string | null };

/** The open train, and its release commit once the release PR merged. */
export function findTrain(): Train | null {
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
  const train = pickTrain(issues);
  if (train === null) return null;
  const pulls = JSON.parse(
    runOk("gh", [
      "pr",
      "list",
      "--head",
      train.branch,
      "--state",
      "merged",
      "--json",
      "baseRefName,mergeCommit",
    ]),
  ) as MergedPull[];
  return { ...train, sha: pickMergeCommit(pulls) };
}

export function isOnNpm(name: string, version: string): boolean {
  const result = run("npm", ["view", `${name}@${version}`, "version", "--json"]);
  return classifyNpmView(result, version) === "present";
}

/** The commit a package tag points at, or null without the tag. */
export function tagTarget(tag: string): string | null {
  const result = run("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}^{commit}`]);
  return result.status === 0 ? result.stdout.trim() : null;
}

export const packageTag = (pkg: { name: string; version: string }): string =>
  `${pkg.name}@${pkg.version}`;
