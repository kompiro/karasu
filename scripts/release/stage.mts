/* eslint-disable no-console -- CLI entry point; release.yml shows its output */
/**
 * Stages the npm packages of a release (#3240), from two jobs of release.yml.
 *
 *   node scripts/release/stage.mts pack --out-dir <dir> [--any-commit]
 *   node scripts/release/stage.mts publish --tarballs <dir> [--tag <tag>] [--any-commit]
 *
 * `pack` runs in the `pack` job, which installs the dependencies and builds,
 * and holds no OIDC token. `changeset pack` writes the publish plan: the
 * versions not yet on npm, in dependency-ordered groups. `pack` checks the plan
 * and copies the tarballs of its first group to `--out-dir`, which the job
 * uploads as an artifact.
 *
 * `publish` runs in the `stage` job, the only one npm accepts a token from. It
 * installs nothing, so no dependency's code runs next to the token, and it
 * trusts nothing of the artifact but the tarball files. What to stage, in which
 * group and under which tag is decided again from the release commit and npm:
 *
 * - the commit is a release commit, and the package was bumped by it;
 * - the version is not on npm yet;
 * - the package is in the first group: every workspace package it needs at
 *   install time is on npm at the release commit's version. A package that
 *   pins another one exactly therefore reaches the stage queue only once its
 *   dependency has been approved and is installable (TPL-3240). Approving the
 *   first group and re-running release.yml stages the next one
 *   (`pnpm release:approve` does both);
 * - the tag follows from the version: `latest`, or `.changeset/pre.json`'s tag
 *   for a prerelease;
 * - the tarball's `package.json` has the release commit's name and version,
 *   and the same `publishConfig`, holding only `access` and `provenance`. npm
 *   builds the version's metadata from the tarball and applies its
 *   `publishConfig` to the publish, so a tarball from a hijacked `pack` job
 *   cannot point the OIDC exchange somewhere else.
 *
 * Anything that does not match stops the run before anything is staged.
 *
 * `--tag` and `--any-commit` exist for the rehearsal on a spike branch only.
 *
 * Authentication is npm's: OIDC in release.yml, or `npm login` on a
 * maintainer's machine when the CI path is down. Outside GitHub Actions
 * provenance cannot be generated, so it is turned off there.
 *
 * Runs on Node's type stripping (the stage job installs nothing), so it uses
 * erasable TypeScript only and imports nothing but node builtins and siblings.
 */
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  bumpedPackagesAt,
  isOnNpm,
  isReleaseCommit,
  NPM_REGISTRY,
  npmPackagesAt,
  packageJsonAt,
  run,
  runOk,
  type CommandResult,
  type NpmPackage,
  type PackageJson,
} from "./release-state.mts";
import { readTarball, readTarballStrict } from "./tarball.mts";

// ------------------------------------------------------------------ pack

export type PlannedRelease = {
  name: string;
  version: string;
  /** changesets' tag, which nothing stages by: `publish` and approve.mts use `tagFor`. */
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

/** Reasons the plan must not be packed for staging; empty when it may. */
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
    return problems;
  });
}

// ------------------------------------------------------------------ publish: decisions

/** A semver prerelease: a `-` before any build metadata (`1.0.0+build-1` is not). */
export const isPrerelease = (version: string): boolean => version.split("+")[0].includes("-");

/** The tag of changesets' pre mode in a `.changeset/pre.json`, or null outside it. */
export function preTagOf(preJson: string | null): string | null {
  if (preJson === null) return null;
  const pre = JSON.parse(preJson) as { mode?: string; tag?: string };
  return pre.mode === "pre" && typeof pre.tag === "string" ? pre.tag : null;
}

/**
 * The tag a version is staged under. A release is `latest`; a prerelease takes
 * the tag of changesets' pre mode (`.changeset/pre.json`). `--tag` replaces
 * either, but never puts a prerelease under `latest`.
 */
export function tagFor(
  version: string,
  opts: { preTag: string | null; override: string | null },
): { tag: string } | { problem: string } {
  const tag = opts.override ?? (isPrerelease(version) ? opts.preTag : "latest");
  if (tag === null) {
    return {
      problem: `${version} is a prerelease, but the release commit has no .changeset/pre.json to name its tag.`,
    };
  }
  if (isPrerelease(version) && tag === "latest") {
    return { problem: `${version} is a prerelease and would be staged under latest.` };
  }
  return { tag };
}

/**
 * What `publish` may stage: the packages the release commit bumped (all npm
 * packages under `--any-commit`) whose version is not on npm yet, split by
 * `firstGroup`. Nothing else is a candidate, whatever the artifact holds.
 */
export function stageGroups(
  all: NpmPackage[],
  bumped: NpmPackage[],
  onNpm: (name: string, version: string) => boolean,
): { candidates: NpmPackage[]; first: NpmPackage[]; later: NpmPackage[] } {
  const candidates = bumped.filter((pkg) => !onNpm(pkg.name, pkg.version));
  return { candidates, ...firstGroup(candidates, all, onNpm) };
}

/**
 * The bumped packages not on npm yet, split into the group to stage now and
 * the ones that wait. A package waits while a workspace package it needs at
 * install time is not on npm at the release commit's version.
 */
export function firstGroup(
  candidates: NpmPackage[],
  all: NpmPackage[],
  onNpm: (name: string, version: string) => boolean,
): { first: NpmPackage[]; later: NpmPackage[] } {
  const ready = (pkg: NpmPackage) =>
    pkg.workspaceDependencies.every((dependency) => {
      const target = all.find((candidate) => candidate.name === dependency);
      // A workspace package outside RELEASED_PACKAGES is never published, so a
      // dependent of it could never be installed.
      return target !== undefined && onNpm(target.name, target.version);
    });
  return {
    first: candidates.filter(ready),
    later: candidates.filter((pkg) => !ready(pkg)),
  };
}

/** The `publishConfig` keys a tarball may carry; npm reads the rest as settings. */
const PUBLISH_CONFIG_KEYS = ["access", "provenance"];

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );

/** Reasons a tarball's `package.json` differs from the release commit's. */
export function manifestProblems(
  file: string,
  inTarball: Partial<PackageJson>,
  atCommit: PackageJson,
): string[] {
  const problems: string[] = [];
  if (inTarball.name !== atCommit.name || inTarball.version !== atCommit.version) {
    problems.push(
      `${file} holds ${String(inTarball.name)}@${String(inTarball.version)}, not ${atCommit.name}@${atCommit.version}.`,
    );
  }
  const config = inTarball.publishConfig;
  if (config !== undefined && (config === null || typeof config !== "object")) {
    problems.push(`${file} has a publishConfig that is not an object.`);
  } else {
    const extra = Object.keys(config ?? {}).filter((key) => !PUBLISH_CONFIG_KEYS.includes(key));
    if (extra.length > 0) {
      problems.push(
        `${file} has publishConfig keys npm would apply as settings: ${extra.join(", ")}.`,
      );
    }
    if (canonical(config ?? {}) !== canonical(atCommit.publishConfig ?? {})) {
      problems.push(`${file} has another publishConfig than the release commit.`);
    }
  }
  return problems;
}

export type Tarball = { file: string; manifest: Partial<PackageJson> };

/**
 * Pairs each package of the first group with its tarball, or the reasons it
 * cannot. Every tarball must belong to the first group and every package of it
 * must have exactly one, so nothing the `pack` job added is staged.
 */
export function matchTarballs(
  tarballs: Tarball[],
  first: NpmPackage[],
  atCommit: (pkg: NpmPackage) => PackageJson,
): { staging: { pkg: NpmPackage; file: string }[]; problems: string[] } {
  const problems: string[] = [];
  const staging: { pkg: NpmPackage; file: string }[] = [];
  for (const tarball of tarballs) {
    const pkg = first.find((candidate) => candidate.name === tarball.manifest.name);
    if (pkg === undefined) {
      problems.push(
        `${tarball.file} holds ${String(tarball.manifest.name)}@${String(tarball.manifest.version)}, which this commit does not stage now.`,
      );
      continue;
    }
    if (staging.some((entry) => entry.pkg === pkg)) {
      problems.push(`More than one tarball holds ${pkg.name}.`);
      continue;
    }
    const mismatches = manifestProblems(tarball.file, tarball.manifest, atCommit(pkg));
    problems.push(...mismatches);
    if (mismatches.length === 0) staging.push({ pkg, file: tarball.file });
  }
  for (const pkg of first) {
    if (!tarballs.some((tarball) => tarball.manifest.name === pkg.name)) {
      problems.push(`No tarball of ${pkg.name}@${pkg.version} came from the pack job.`);
    }
  }
  return { staging: problems.length === 0 ? staging : [], problems };
}

/** A packed tarball's size is a few MB (2026-11); these leave ample room. */
export const MAX_TARBALL_BYTES = 32 * 1024 * 1024;
export const MAX_UNPACKED_BYTES = 128 * 1024 * 1024;

const TARBALL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.tgz$/;

/**
 * The tarballs directly in `dir`. Anything else in it (a directory, a link, a
 * file with another name or past the size bound) is a problem, so a path from
 * the artifact is never followed.
 */
export function listTarballs(dir: string): { files: string[]; problems: string[] } {
  if (!existsSync(dir)) return { files: [], problems: [] };
  const files: string[] = [];
  const problems: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !TARBALL_NAME.test(entry.name)) {
      problems.push(`Unexpected entry in the artifact: ${JSON.stringify(entry.name)}.`);
      continue;
    }
    const file = join(dir, entry.name);
    if (statSync(file).size > MAX_TARBALL_BYTES) {
      problems.push(`${entry.name} is larger than ${MAX_TARBALL_BYTES} bytes.`);
      continue;
    }
    files.push(file);
  }
  return { files: files.sort(), problems };
}

/**
 * The `package.json` inside a tarball, read without any dependency. The bounded
 * strict read stops an archive that unpacks too large; `readTarball` then reads
 * it again with the node-tar of the npm CLI on PATH (the one that stages it)
 * and fails unless both see the same files, so the manifest checked here is
 * the one npm will publish.
 */
export function tarballManifest(gzipped: Buffer): Partial<PackageJson> {
  readTarballStrict(gzipped, { maxBytes: MAX_UNPACKED_BYTES });
  const manifest = readTarball(gzipped).get("package.json");
  if (manifest === undefined) throw new Error("the tarball has no package/package.json");
  return JSON.parse(manifest.toString("utf8")) as Partial<PackageJson>;
}

export function stageArgs(tarball: string, tag: string, opts: { inActions: boolean }): string[] {
  // `latest` is left to npm's default so its own checks still run: it refuses a
  // prerelease without a tag and a version lower than the current latest.
  return [
    "stage",
    "publish",
    tarball,
    "--json",
    "--ignore-scripts",
    "--registry",
    NPM_REGISTRY,
    ...(tag === "latest" ? [] : ["--tag", tag]),
    ...(opts.inActions ? [] : ["--provenance=false"]),
  ];
}

export type StageOutcome =
  | { kind: "staged"; stageId: string; integrity: string }
  | { kind: "already-staged" }
  | { kind: "failed"; message: string };

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The registry's answer when the version is already in the stage queue, as
 * seen in the rehearsal (#3240, run 42486392324 attempt 2):
 *
 *   npm error code E409
 *   npm error 409 Conflict - POST .../-/stage/package/... - Cannot stage
 *   previously published version "0.4.2-rehearsal.0".
 *
 * Both lines must be npm's own error lines and name this version, so a file
 * name in the `npm notice` list cannot pass for it. npm gives the same answer
 * for a version on npm and for one unpublished long ago, so the caller tells
 * them apart. Anything else stops the run (TPL-2804).
 */
export function isAlreadyStaged(stderr: string, version: string): boolean {
  return (
    /^npm error code E409$/m.test(stderr) &&
    new RegExp(
      `^npm error 409 Conflict - .* - Cannot stage previously published version "${escapeRegExp(version)}"\\.?$`,
      "m",
    ).test(stderr)
  );
}

export function classifyStage(result: CommandResult, name: string, version: string): StageOutcome {
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
  if (isAlreadyStaged(result.stderr, version)) {
    return { kind: "already-staged" };
  }
  return { kind: "failed", message: result.stderr.trim() || `npm exited with ${result.status}` };
}

// ------------------------------------------------------------------ CLI

type Options = {
  outDir: string | null;
  tarballs: string | null;
  tag: string | null;
  anyCommit: boolean;
};

function parseArgs(argv: string[], allowed: string[]): Options {
  const options: Options = { outDir: null, tarballs: null, tag: null, anyCommit: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!allowed.includes(arg)) throw new Error(`unknown argument: ${arg}`);
    if (arg === "--out-dir") options.outDir = argv[++i] ?? null;
    else if (arg === "--tarballs") options.tarballs = argv[++i] ?? null;
    else if (arg === "--tag") options.tag = argv[++i] ?? null;
    else if (arg === "--any-commit") options.anyCommit = true;
  }
  return options;
}

function summary(line: string): void {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

function fail(problems: string[]): void {
  for (const problem of problems) console.log(`::error::${problem}`);
  process.exitCode = 1;
}

const currentSha = (): string => process.env.GITHUB_SHA ?? runOk("git", ["rev-parse", "HEAD"]);

function pack(argv: string[]): void {
  const options = parseArgs(argv, ["--out-dir", "--any-commit"]);
  if (options.outDir === null) throw new Error("pack needs --out-dir");
  const sha = currentSha();
  if (!options.anyCommit && !isReleaseCommit(sha)) {
    console.log(`::notice::${sha} is not a release commit: nothing to pack.`);
    return;
  }

  const planDir = mkdtempSync(join(tmpdir(), "karasu-pack-"));
  runOk("pnpm", ["exec", "changeset", "pack", "--out-dir", planDir]);
  const plan = readPlan(readFileSync(join(planDir, "publish-plan.json"), "utf8"));
  if (plan.length === 0) {
    summary("Every npm version of this commit is already published: nothing to pack.");
    return;
  }
  const problems = planProblems(plan, {
    npmNames: npmPackagesAt(sha).map((pkg) => pkg.name),
    bumped: options.anyCommit ? null : bumpedPackagesAt(sha),
  });
  if (problems.length > 0) return fail(problems);

  // Tarballs of an earlier group left in the directory would stop `publish`.
  const outDir = resolve(options.outDir);
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    return fail([`${outDir} is not empty: pack into a new directory.`]);
  }
  mkdirSync(outDir, { recursive: true });
  const [first, ...later] = plan;
  for (const release of first) {
    copyFileSync(join(planDir, release.tarball.path), join(outDir, basename(release.tarball.path)));
    summary(`Packed ${release.name}@${release.version} for the stage job.`);
  }
  for (const group of later) {
    summary(
      `Waiting for the group above to be approved: ${group.map((r) => `${r.name}@${r.version}`).join(", ")}`,
    );
  }
}

/** `.changeset/pre.json`'s tag at `sha`, or null outside pre mode. */
function preTagAt(sha: string): string | null {
  const result = run("git", ["show", `${sha}:.changeset/pre.json`]);
  return preTagOf(result.status === 0 ? result.stdout : null);
}

function publish(argv: string[]): void {
  const options = parseArgs(argv, ["--tarballs", "--tag", "--any-commit"]);
  if (options.tarballs === null) throw new Error("publish needs --tarballs");
  const sha = currentSha();
  if (!options.anyCommit && !isReleaseCommit(sha)) {
    console.log(`::notice::${sha} is not a release commit: nothing to stage.`);
    return;
  }

  const all = npmPackagesAt(sha);
  const bumped = options.anyCommit ? all : bumpedPackagesAt(sha);
  const present = new Map<string, boolean>();
  const onNpm = (name: string, version: string): boolean => {
    const key = `${name}@${version}`;
    if (!present.has(key)) present.set(key, isOnNpm(name, version));
    return present.get(key) ?? false;
  };
  const { candidates, first, later } = stageGroups(all, bumped, onNpm);
  if (candidates.length === 0) {
    summary("Every npm version this commit bumped is already published: nothing to stage.");
    return;
  }
  if (first.length === 0) {
    return fail([
      `None of ${candidates.map((pkg) => `${pkg.name}@${pkg.version}`).join(", ")} can be installed yet: a workspace dependency is missing from npm.`,
    ]);
  }

  const listed = listTarballs(resolve(options.tarballs));
  const problems = [...listed.problems];
  const tarballs: Tarball[] = [];
  for (const file of listed.files) {
    try {
      tarballs.push({ file, manifest: tarballManifest(readFileSync(file)) });
    } catch (error) {
      problems.push(`${basename(file)}: ${(error as Error).message}`);
    }
  }
  const preTag = preTagAt(sha);
  const tags = new Map<string, string>();
  for (const pkg of first) {
    const decided = tagFor(pkg.version, { preTag, override: options.tag });
    if ("problem" in decided) problems.push(`${pkg.name}@${decided.problem}`);
    else tags.set(pkg.name, decided.tag);
  }
  const matched = matchTarballs(tarballs, first, (pkg) => {
    const manifest = packageJsonAt(sha, pkg.dir);
    if (manifest === null) throw new Error(`${pkg.dir}/package.json is missing at ${sha}`);
    return manifest;
  });
  problems.push(...matched.problems);
  if (problems.length > 0) return fail(problems);

  const inActions = process.env.GITHUB_ACTIONS === "true";
  summary("| Package | Tag | Result | Stage id | Integrity |");
  summary("| --- | --- | --- | --- | --- |");
  for (const { pkg, file } of matched.staging) {
    const tag = tags.get(pkg.name) ?? "latest";
    const outcome = classifyStage(
      run("npm", stageArgs(file, tag, { inActions })),
      pkg.name,
      pkg.version,
    );
    const id = `\`${pkg.name}@${pkg.version}\``;
    if (outcome.kind === "failed") {
      summary(`| ${id} | ${tag} | failed | | |`);
      console.log(`::error::Staging ${pkg.name}@${pkg.version} failed: ${outcome.message}`);
      process.exitCode = 1;
      return;
    }
    if (outcome.kind === "already-staged") {
      // Not staged by this run: the approval step checks who made the tarball.
      // The version is not on npm (checked above), so npm's refusal means it
      // waits in the stage queue or was unpublished long ago; approval then
      // finds nothing and the version number needs a bump.
      summary(
        `| ${id} | ${tag} | refused by npm as previously staged or published: expected in the stage queue, otherwise the version number is used up and needs a bump | | |`,
      );
      continue;
    }
    summary(`| ${id} | ${tag} | staged | ${outcome.stageId} | ${outcome.integrity} |`);
  }
  if (later.length > 0) {
    summary(
      `Waiting for the group above to be approved: ${later.map((pkg) => `${pkg.name}@${pkg.version}`).join(", ")}`,
    );
  }
}

export function main(argv: string[]): void {
  const [command, ...rest] = argv;
  switch (command) {
    case "pack":
      return pack(rest);
    case "publish":
      return publish(rest);
    default:
      throw new Error(`unknown command: ${command ?? "(none)"} (expected pack or publish)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
