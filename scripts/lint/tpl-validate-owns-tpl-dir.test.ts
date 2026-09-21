import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Fences the handover made in Issue #2810: `docs/test-perspectives` is checked
// for dangling `packages/…` / `scripts/…` source paths by
// `@kompiro/tpl-tools`, not by the local `scripts/lint/record-source-paths.ts`
// guard, and that check runs where it can stop a merge.
//
// Two things can silently undo this, and neither shows up as a red build:
//
//   1. `--source-prefix` disappears from the `tpl:validate` script. `tpl
//      validate` still passes — it just stops reading bodies at all — so the
//      TPL directory would be checked by nobody, since ADR-2648's guard no
//      longer scans it either.
//   2. The check moves back to a workflow that is not the Required `Check`
//      context. `tpl-validate.yml` was exactly that: its job was named `TPL
//      validate` and its own header said "not a required check yet". A check
//      that cannot stop a merge is not a check (TPL-2446), and its
//      `paths:` filter meant it never ran on the code PRs most likely to rot a
//      reference — a rename or a deletion need not touch a single TPL.
//
// So the assertions below are about ownership and reach, not about re-testing
// tpl-tools: the behavioural cases only prove the flag is doing its job and
// that the marker spelling is shared between the two implementations, which is
// what lets a record keep its meaning when it moves between repos.

const REPO_ROOT = resolve(import.meta.dirname, "../..");

const TPL_CLI = join(REPO_ROOT, "node_modules/.bin/tpl");

/** The `Check` job is the Required status context; `TPL validate` never was. */
const REQUIRED_CHECK_WORKFLOWS = [
  ".github/workflows/ci.yml",
  ".github/workflows/at-check-coverage.yml",
];

interface ValidateResult {
  status: number;
  output: string;
}

/**
 * Runs the validator from the repo root, because `--source-prefix` resolves
 * paths against the working directory — a fixture run from its own temp
 * directory would report every real path as missing.
 */
function runTplValidate(tplDir: string): ValidateResult {
  const run = spawnSync(
    TPL_CLI,
    ["validate", "--tpl-dir", tplDir, "--source-prefix", "packages", "--source-prefix", "scripts"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  return { status: run.status ?? -1, output: `${run.stdout}${run.stderr}` };
}

let fixtureRoot: string;

/** A TPL that satisfies every other rule, so the only finding can be the body. */
function writeFixture(body: string): string {
  const dir = mkdtempSync(join(fixtureRoot, "tpl-"));
  writeFileSync(
    join(dir, "TPL-2810-fixture-record.md"),
    [
      "---",
      "id: TPL-2810",
      'title: "fixture"',
      "status: active",
      "date: 2026-09-20",
      "applicable_to:",
      '  - "fixture"',
      "discovered_from:",
      '  - issue: "#2810"',
      "topic: testing",
      "scope:",
      "  packages: []",
      "---",
      "",
      "# TPL-2810: fixture",
      "",
      "## 観点",
      "",
      body,
      "",
    ].join("\n"),
  );
  writeFileSync(join(dir, "README.md"), "# index\n\n- [TPL-2810](TPL-2810-fixture-record.md)\n");
  return dir;
}

const read = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");

describe("tpl-tools owns the source paths named in TPL bodies", () => {
  beforeAll(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "tpl-validate-owns-"));
  });

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("fails when a TPL body names a path that is not in the tree", () => {
    const result = runTplValidate(
      writeFixture("本文で `packages/core/src/nope-2810.ts` を名指しする。"),
    );

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("packages/core/src/nope-2810.ts");
  });

  it("accepts a path that is in the tree", () => {
    const result = runTplValidate(
      writeFixture("本文で `packages/core/src/index.ts` を名指しする。"),
    );

    expect(result.output).toContain("Validated 1 TPL");
    expect(result.status).toBe(0);
  });

  // The whole point of keeping the spelling identical upstream: a record that
  // moves between repos keeps its declaration, and a declaration written for
  // the local guard still means the same thing here.
  it("honours the same absent-path-next-line marker the local guard uses", () => {
    const result = runTplValidate(
      writeFixture(
        [
          "<!-- absent-path-next-line: illustration, not a path this repo has -->",
          "本文で `packages/core/src/nope-2810.ts` を名指しする。",
        ].join("\n"),
      ),
    );

    expect(result.status).toBe(0);
  });

  it("passes on the current corpus", () => {
    const result = runTplValidate(join(REPO_ROOT, "docs/test-perspectives"));

    expect(result.output).toContain("Validated");
    expect(result.status).toBe(0);
  });
});

describe("the check runs where it can stop a merge", () => {
  // Without the prefixes `tpl validate` still exits 0 — it just never opens a
  // body. That is the silent half of this regression, so assert the flags
  // rather than the command name.
  it("passes both source prefixes from the tpl:validate script", () => {
    const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> })
      .scripts;

    expect(scripts["tpl:validate"]).toContain("--source-prefix packages");
    expect(scripts["tpl:validate"]).toContain("--source-prefix scripts");
  });

  it.each(REQUIRED_CHECK_WORKFLOWS)(
    "runs tpl:validate from both Required Check jobs (%s)",
    (workflow) => {
      const yaml = read(workflow);

      expect(yaml).toContain("name: Check");
      expect(yaml).toContain("pnpm run tpl:validate");
    },
  );

  // Deleted in #2810 rather than left alongside: both Required jobs now run the
  // same command, so keeping it would have spent CI minutes re-running a check
  // whose only distinguishing feature was that it could not gate anything.
  it("no longer relies on the informative-only TPL validate workflow", () => {
    expect(existsSync(join(REPO_ROOT, ".github/workflows/tpl-validate.yml"))).toBe(false);
  });

  it("runs on every push locally, with no path filter to skip code-only pushes", () => {
    const lefthook = read("lefthook.yml");
    const hook = lefthook.slice(lefthook.indexOf("tpl-validate:"));

    expect(hook).toContain("pnpm run tpl:validate");
    expect(hook.slice(0, hook.indexOf("pnpm run tpl:validate"))).not.toContain("glob:");
  });
});
