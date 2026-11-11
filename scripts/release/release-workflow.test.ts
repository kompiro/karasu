import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Fences the permissions of the staged npm release (#3240). release.yml can
// only stage; release-confirm.yml records what was approved and cannot publish
// at all. Text checks on purpose: the invariants are which job holds which
// permission, and reading the jobs as text keeps this test free of a YAML
// dependency.

const read = (path: string): string =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const release = read(".github/workflows/release.yml");
const confirm = read(".github/workflows/release-confirm.yml");
const rootPackage = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

/** The top-level jobs of a workflow, by id, as text. */
function jobs(workflow: string): Map<string, string> {
  const body = workflow.slice(workflow.indexOf("\njobs:\n") + "\njobs:\n".length);
  const map = new Map<string, string>();
  const starts = [...body.matchAll(/^ {2}([a-z][a-z0-9-]*):\n/gm)];
  starts.forEach((match, i) => {
    map.set(match[1], body.slice(match.index, starts[i + 1]?.index ?? body.length));
  });
  return map;
}

/** A permission entry granting the OIDC token (comments may name it). */
const OIDC = /^\s+id-token:\s*write/m;

const releaseJobs = jobs(release);
const confirmJobs = jobs(confirm);

describe("release.yml", () => {
  it("stages instead of publishing", () => {
    expect(rootPackage.scripts.release).toBe("pnpm build && node scripts/release/stage.mts");
    expect(releaseJobs.get("release")).toContain("run: pnpm run release");
    expect(release).not.toContain("changeset publish`");
  });

  it("gives the OIDC token only to the release and vscode jobs", () => {
    const withToken = [...releaseJobs].filter(([, job]) => OIDC.test(job)).map(([id]) => id);
    expect(withToken.sort()).toEqual(["release", "vscode"]);
    expect(release.slice(0, release.indexOf("\njobs:\n"))).not.toMatch(OIDC);
  });

  it("keeps the staging job read-only apart from finding the release PR", () => {
    const job = releaseJobs.get("release")!;
    expect(job).toContain("contents: read");
    expect(job).toContain("pull-requests: read");
    expect(job).not.toMatch(/contents: write|issues: write/);
  });

  it("no longer records from the staging run", () => {
    expect(releaseJobs.has("record")).toBe(false);
    expect(release).not.toContain("published-packages.mts");
  });

  it("judges the train in the same concurrency group as release-confirm.yml", () => {
    expect(releaseJobs.get("close-train")).toContain("group: release-record");
    expect(releaseJobs.get("close-train")).toContain("confirm.mts close-train");
  });
});

describe("release-confirm.yml", () => {
  it("cannot publish to npm", () => {
    expect(confirm).not.toMatch(OIDC);
  });

  it("builds the release commit only in the job that cannot write", () => {
    const verify = confirmJobs.get("verify")!;
    expect(verify).toContain("pnpm install --frozen-lockfile");
    expect(verify).not.toMatch(/contents: write|issues: write/);
  });

  it("installs nothing in the job that pushes tags", () => {
    const record = confirmJobs.get("record")!;
    expect(record).toContain("contents: write");
    expect(record).not.toMatch(/pnpm install|npm ci|pnpm\/action-setup/);
    expect(record).toContain("group: release-record");
  });
});
