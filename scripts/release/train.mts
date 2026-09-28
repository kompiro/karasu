/* eslint-disable no-console -- CLI entry point; its stdout is read by the workflows */
/**
 * The decisions of the monthly release train (#2922), kept out of the workflow
 * YAML so they can be tested.
 *
 *   node scripts/release/train.mts depart --event <github.event_name>
 *   node scripts/release/train.mts versions                       > before.json
 *   node scripts/release/train.mts issue-body --before before.json --branch <b> --date <d>
 *   node scripts/release/train.mts commit-subject --before before.json
 *   node scripts/release/train.mts marketplace-status --version <v> < vsce-show.json
 *
 * Runs on Node's type stripping (no install needed in the workflow), so it uses
 * erasable TypeScript only and imports nothing but node builtins and its sibling.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { RELEASED_PACKAGES } from "./github-release.mts";

// ------------------------------------------------------------------ departure

/**
 * The scheduled run fires every Sunday; the train departs only on the last
 * Sunday of the month, i.e. when a week later is already next month. A manual
 * `workflow_dispatch` always departs (an ad-hoc release).
 */
export function shouldDepart(event: string, now: Date): boolean {
  if (event !== "schedule") return true;
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return weekLater.getUTCMonth() !== now.getUTCMonth();
}

// ------------------------------------------------------------------ bumped packages

export type Versions = Record<string, string>;
export type Bump = { name: string; from: string; to: string };

/** The released packages whose version changed, in the fixed release order. */
export function bumpedPackages(before: Versions, after: Versions): Bump[] {
  return RELEASED_PACKAGES.flatMap(({ name }) => {
    const from = before[name];
    const to = after[name];
    return from !== undefined && to !== undefined && from !== to ? [{ name, from, to }] : [];
  });
}

export function composeCommitSubject(bumps: Bump[]): string {
  return `chore: release ${bumps.map((b) => `${b.name} ${b.to}`).join(", ")}`;
}

// ------------------------------------------------------------------ tracking Issue

/** The line the tracking Issue carries; the close job finds the Issue by it. */
export const branchLine = (branch: string): string => `Release branch: \`${branch}\``;

/** The release branch named in a tracking Issue body, or null. */
export function branchFromIssueBody(body: string): string | null {
  const m = /^Release branch: `(chore\/release-[^`]+)`$/m.exec(body);
  return m ? m[1] : null;
}

export function composeTrainIssueTitle(date: string): string {
  return `Release train ${date}`;
}

export function composeTrainIssueBody(opts: {
  repository: string;
  branch: string;
  bumps: Bump[];
}): string {
  const compare = `https://github.com/${opts.repository}/compare/main...${opts.branch}?expand=1`;
  const rows = opts.bumps.map((b) => `| \`${b.name}\` | ${b.from} | ${b.to} |`).join("\n");
  return [
    branchLine(opts.branch),
    "",
    "The monthly release train has pushed its release branch (#2922).",
    "",
    "| Package | From | To |",
    "| --- | --- | --- |",
    rows,
    "",
    "## Checklist",
    "",
    `- [ ] Open the release PR: ${compare}`,
    "- [ ] Read the versions and every `packages/*/CHANGELOG.md` in the PR (docs/release.md)",
    "- [ ] If the CHANGELOG promotes experimental notation or changes the language, confirm the promotion gate (ADR-1820) and the `.krs language vX.Y` note (ADR-2124)",
    "- [ ] Squash-merge the PR",
    "",
    "Merging runs `release.yml`: npm publish, the VS Code Marketplace publish, the package tags and the `release-YYYY-MM-DD` GitHub Release. This Issue is closed with the Release link when every step succeeded, and gets a comment with the failed run otherwise.",
    "",
    "While this Issue or its release PR is open, the next train does not depart.",
  ].join("\n");
}

// ------------------------------------------------------------------ Marketplace

export type MarketplaceStatus = "stable" | "prerelease-only" | "absent";

type VsceShow = {
  versions?: { version: string; properties?: { key: string; value: string }[] }[];
};

const PRE_RELEASE_KEY = "Microsoft.VisualStudio.Code.PreRelease";

/**
 * Where `version` already is on the Marketplace. The Marketplace does not take
 * the same version number again in the other channel, so a version that exists
 * only as a pre-release blocks the stable publish and must fail loudly.
 */
export function marketplaceStatus(show: VsceShow, version: string): MarketplaceStatus {
  const found = (show.versions ?? []).filter((v) => v.version === version);
  if (found.length === 0) return "absent";
  const isPreRelease = (v: (typeof found)[number]) =>
    (v.properties ?? []).some((p) => p.key === PRE_RELEASE_KEY && p.value === "true");
  return found.some((v) => !isPreRelease(v)) ? "stable" : "prerelease-only";
}

// ------------------------------------------------------------------ CLI

function readVersions(): Versions {
  return Object.fromEntries(
    RELEASED_PACKAGES.map(({ name, dir }) => [
      name,
      (JSON.parse(readFileSync(`${dir}/package.json`, "utf8")) as { version: string }).version,
    ]),
  );
}

function flag(argv: string[], name: string): string {
  const i = argv.indexOf(`--${name}`);
  const value = i === -1 ? undefined : argv[i + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`--${name} is required`);
  return value;
}

const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

export function main(argv: string[]): void {
  const [command, ...rest] = argv;
  switch (command) {
    case "depart":
      console.log(shouldDepart(flag(rest, "event"), new Date()) ? "true" : "false");
      return;
    case "versions":
      console.log(JSON.stringify(readVersions()));
      return;
    case "commit-subject":
      console.log(
        composeCommitSubject(bumpedPackages(readJson(flag(rest, "before")), readVersions())),
      );
      return;
    case "issue-body":
      console.log(
        composeTrainIssueBody({
          repository: process.env.GITHUB_REPOSITORY ?? "kompiro/karasu",
          branch: flag(rest, "branch"),
          bumps: bumpedPackages(readJson(flag(rest, "before")), readVersions()),
        }),
      );
      return;
    case "issue-branch":
      console.log(branchFromIssueBody(readFileSync(0, "utf8")) ?? "");
      return;
    case "marketplace-status":
      console.log(
        marketplaceStatus(JSON.parse(readFileSync(0, "utf8")) as VsceShow, flag(rest, "version")),
      );
      return;
    default:
      throw new Error(`unknown command: ${command ?? "(none)"}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
