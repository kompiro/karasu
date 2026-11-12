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

/** The permission names and levels a job grants, as "name: level". */
function permissions(job: string): string[] {
  const block = /^ {4}permissions:\n((?: {6}[a-z-]+: [a-z]+.*\n)+)/m.exec(job);
  if (!block) return [];
  return block[1]
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replace(/#.*$/, "").trim());
}

describe("release.yml", () => {
  it("stages from a pack job and a stage job instead of publishing", () => {
    expect(rootPackage.scripts.release).toBeUndefined();
    expect(releaseJobs.get("pack")).toContain("stage.mts pack --out-dir");
    expect(releaseJobs.get("stage")).toContain("stage.mts publish --tarballs");
    expect(release).not.toContain("changeset publish`");
  });

  it("gives the OIDC token only to the stage and vscode jobs", () => {
    const withToken = [...releaseJobs].filter(([, job]) => OIDC.test(job)).map(([id]) => id);
    expect(withToken.sort()).toEqual(["stage", "vscode"]);
    expect(release.slice(0, release.indexOf("\njobs:\n"))).not.toMatch(OIDC);
  });

  it("builds only in the pack job, which holds no token", () => {
    const pack = releaseJobs.get("pack")!;
    expect(pack).toContain("pnpm install --frozen-lockfile");
    expect(permissions(pack).sort()).toEqual(["contents: read", "pull-requests: read"]);
  });

  it("runs no dependency code in the stage job (#3240)", () => {
    const stage = releaseJobs.get("stage")!;
    expect(permissions(stage).sort()).toEqual([
      "contents: read",
      "id-token: write",
      "pull-requests: read",
    ]);
    expect(stage).toMatch(/^ {4}environment: npm$/m);
    expect(stage).toContain("package-manager-cache: false");
    expect(stage).not.toMatch(
      /pnpm install|pnpm build|npm ci|npm install|pnpm\/action-setup|cache: "?pnpm/,
    );
    expect(stage).not.toMatch(/actions\/cache/);
    // The pack job may be hijacked: nothing of it reaches the stage job
    // through an expression, only the artifact's files.
    expect(stage).not.toMatch(/needs\.pack\.outputs/);
    // The artifact lands outside the checkout, so it cannot replace the
    // stage.mts that reads it.
    expect(stage).toMatch(
      /download-artifact@[^\n]*\n(?:\s+[^\n]*\n)*?\s+path: \$\{\{ runner\.temp \}\}\/stage-tarballs/,
    );
  });

  it("no longer records from the staging run", () => {
    expect(releaseJobs.has("record")).toBe(false);
    expect(release).not.toContain("published-packages.mts");
  });

  it("judges the train in the same concurrency group as release-confirm.yml", () => {
    const closeTrain = releaseJobs.get("close-train")!;
    expect(closeTrain).toContain("group: release-record");
    expect(closeTrain).toContain("confirm.mts close-train");
  });

  it("reads both npm jobs when closing the train, so a skipped stage is not a success", () => {
    const closeTrain = releaseJobs.get("close-train")!;
    expect(closeTrain).toContain("needs: [pack, stage, vscode]");
    expect(closeTrain).toContain("needs.pack.result");
    expect(closeTrain).toContain("needs.stage.result");
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
