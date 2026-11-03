/* eslint-disable no-console -- CI entry point; the log is the job */
// Adds or removes the `rendering-change` label from the `Render equivalence`
// run that started this job (Issue #3510, #3505 slice C). The label tells the
// maintainer to review the PR and try it on the preview; it blocks nothing.
//
// | the run                                         | label     |
// | ----------------------------------------------- | --------- |
// | skipped (a draft), cancelled, not started       | unchanged |
// | no open PR whose head is the run's commit       | unchanged |
// | verdict `equal`                                 | removed   |
// | verdict `different` or `incomparable`           | added     |
// | no artifact, two, or a verdict of another shape | added     |
//
// The artifact comes from a job that ran the PR's code, so its author decides
// what is in it. Only the verdict's `status` and `differences` are read, and
// the PR is found from the run (its head commit, repository and branch), never
// from the artifact: a PR can set its own label, not another PR's. A PR whose
// head has moved past the run's commit keeps its label until the newer run
// ends, so a late run cannot put back an older answer.
//
// Runs with plain `node` and imports only node builtins (type-only imports are
// erased), on a checkout of the default branch.
//
//   GH_TOKEN=… GITHUB_REPOSITORY=owner/repo RUN_ID=<id> node scripts/render-equivalence/label.ts

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Verdict } from "./verdict.ts";

export const LABEL = "rendering-change";
const ARTIFACT = "render-equivalence";
/** A verdict lists at most 200 keys; anything near this size is not one. */
const MAX_ARTIFACT_BYTES = 1024 * 1024;
const MAX_VERDICT_BYTES = 64 * 1024;

/**
 * Conclusions of a run that compared nothing: a skipped job (a draft), a run a
 * newer event cancelled, or one that never started. Any other conclusion,
 * including one GitHub adds later, reads the artifact, and a missing artifact
 * adds the label.
 */
const NOTHING_RAN = new Set(["skipped", "cancelled", "action_required", "stale", "neutral"]);

export interface Run {
  conclusion: string | null;
  headSha: string;
  /** `owner/name` of the repository the PR's branch lives in. */
  headRepo: string;
  headBranch: string;
}

export interface Pull {
  number: number;
  headSha: string;
  headRepo: string | null;
  labels: string[];
}

export interface Artifact {
  id: number;
  name: string;
  expired: boolean;
  size: number;
}

/** What the verdict says about the rendering; null when it is not a verdict. */
export function readVerdict(text: string | null): "equal" | "changed" | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  const { version, status, differences } = value as Partial<Record<keyof Verdict, unknown>>;
  if (version !== 1) return null;
  if (typeof differences !== "number" || !Number.isInteger(differences) || differences < 0) {
    return null;
  }
  if (status === "equal") return differences === 0 ? "equal" : null;
  if (status === "different") return differences > 0 ? "changed" : null;
  // An incomparable run lists no differences, but nothing showed it is equal.
  if (status === "incomparable") return differences === 0 ? "changed" : null;
  return null;
}

/** The one open PR whose head is the run's commit, or null when there is not exactly one. */
export function targetPull(run: Run, pulls: Pull[]): Pull | null {
  const matching = pulls.filter((p) => p.headSha === run.headSha && p.headRepo === run.headRepo);
  return matching.length === 1 ? matching[0] : null;
}

/** The run's one unexpired verdict artifact of a plausible size, or null. */
export function pickArtifact(artifacts: Artifact[]): Artifact | null {
  const named = artifacts.filter((a) => a.name === ARTIFACT);
  if (named.length !== 1) return null;
  const [artifact] = named;
  // Written so a size the API left out (NaN) fails too.
  return !artifact.expired && artifact.size <= MAX_ARTIFACT_BYTES ? artifact : null;
}

export interface Io {
  run(): Run;
  /** The base repository's open PRs whose head branch is the run's. */
  pulls(run: Run): Pull[];
  artifacts(): Artifact[];
  /** `verdict.json` from the artifact, or null when it cannot be read. */
  verdict(artifact: Artifact): string | null;
  setLabel(pull: number, on: boolean): void;
  log(message: string): void;
}

export function label(io: Io): void {
  const run = io.run();
  if (run.conclusion === null || NOTHING_RAN.has(run.conclusion)) {
    io.log(`The run concluded ${run.conclusion ?? "nothing"}; the label is left as it is.`);
    return;
  }
  const pull = targetPull(run, io.pulls(run));
  if (pull === null) {
    io.log(
      `No single open PR has ${run.headRepo}@${run.headSha} as its head (closed, or pushed ` +
        `since); the label is left as it is.`,
    );
    return;
  }
  const artifact = pickArtifact(io.artifacts());
  const verdict = artifact === null ? null : readVerdict(io.verdict(artifact));
  const on = verdict !== "equal";
  if (verdict === null) {
    io.log(`#${pull.number}: no readable verdict in the run, so it counts as a change.`);
  } else {
    io.log(`#${pull.number}: the verdict says the rendering is ${verdict}.`);
  }
  if (pull.labels.includes(LABEL) === on) {
    io.log(`#${pull.number} already ${on ? "has" : "lacks"} ${LABEL}.`);
    return;
  }
  io.setLabel(pull.number, on);
  io.log(`#${pull.number}: ${on ? "added" : "removed"} ${LABEL}.`);
}

function gh(args: string[], maxBuffer = 16 * 1024 * 1024): Buffer {
  return execFileSync("gh", args, { maxBuffer, stdio: ["ignore", "pipe", "inherit"] });
}

function ghJson(args: string[]): unknown {
  return JSON.parse(gh(["api", ...args]).toString("utf8"));
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function githubIo(repo: string, runId: string): Io {
  return {
    run() {
      const r = ghJson([`repos/${repo}/actions/runs/${runId}`]) as Record<string, unknown>;
      const headRepo = (r.head_repository ?? {}) as Record<string, unknown>;
      return {
        conclusion: typeof r.conclusion === "string" ? r.conclusion : null,
        headSha: str(r.head_sha),
        headRepo: str(headRepo.full_name),
        headBranch: str(r.head_branch),
      };
    },
    pulls(run) {
      const owner = run.headRepo.split("/")[0];
      const list = ghJson([
        "-X",
        "GET",
        `repos/${repo}/pulls`,
        "-f",
        "state=open",
        "-f",
        `head=${owner}:${run.headBranch}`,
        "-f",
        "per_page=100",
      ]) as Record<string, unknown>[];
      return list.map((p) => {
        const head = (p.head ?? {}) as Record<string, unknown>;
        const headRepo = (head.repo ?? null) as Record<string, unknown> | null;
        const labels = (Array.isArray(p.labels) ? p.labels : []) as Record<string, unknown>[];
        return {
          number: Number(p.number),
          headSha: str(head.sha),
          headRepo: headRepo === null ? null : str(headRepo.full_name),
          labels: labels.map((l) => str(l.name)),
        };
      });
    },
    artifacts() {
      const page = ghJson([
        "-X",
        "GET",
        `repos/${repo}/actions/runs/${runId}/artifacts`,
        "-f",
        "per_page=100",
      ]) as Record<string, unknown>;
      const list = (Array.isArray(page.artifacts) ? page.artifacts : []) as Record<
        string,
        unknown
      >[];
      return list.map((a) => ({
        id: Number(a.id),
        name: str(a.name),
        expired: a.expired !== false,
        size: Number(a.size_in_bytes),
      }));
    },
    verdict(artifact) {
      const dir = mkdtempSync(join(tmpdir(), "rendering-change-"));
      try {
        const zip = join(dir, "artifact.zip");
        writeFileSync(
          zip,
          gh(["api", `repos/${repo}/actions/artifacts/${artifact.id}/zip`], MAX_ARTIFACT_BYTES * 2),
        );
        // `-p` writes the one entry to stdout: nothing from the archive lands on disk.
        return execFileSync("unzip", ["-p", zip, "verdict.json"], {
          maxBuffer: MAX_VERDICT_BYTES,
          stdio: ["ignore", "pipe", "inherit"],
        }).toString("utf8");
      } catch (error) {
        console.log(`Could not read verdict.json: ${(error as Error).message}`);
        return null;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    setLabel(pull, on) {
      gh([
        "pr",
        "edit",
        String(pull),
        "--repo",
        repo,
        on ? "--add-label" : "--remove-label",
        LABEL,
      ]);
    },
    log: (message) => console.log(message),
  };
}

function main(): void {
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  const runId = process.env.RUN_ID ?? "";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^\d+$/.test(runId)) {
    throw new Error("label: GITHUB_REPOSITORY (owner/repo) and RUN_ID (a number) are required");
  }
  label(githubIo(repo, runId));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
