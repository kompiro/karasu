import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// `exec` and `execSync` take one command string and hand it to a shell, so a
// value interpolated into it becomes shell syntax (TPL-168). Every caller in
// the repo passes the command and its arguments apart (`execFile` / `spawn`),
// and this keeps the shell-string pair from coming back: it parses every
// TypeScript / JavaScript file the repo tracks and fails on any import of
// either, under any alias, and on any namespace or default import of the
// module, which would reach them as `cp.exec`.
//
// The imports are read by oxlint's `no-restricted-imports` (a parser, not a
// text match), run with a config of its own that holds only this rule, so the
// shared `.oxlintrc.json` stays untouched. What it does not see, and why it is
// a related test of TPL-168 rather than a guard: `spawn(..., { shell: true })`,
// a shell run as the command (`spawnSync("bash", ["-c", line])`, which some
// tests here do on purpose), `require`, `import cp = require(...)` and
// `import()` of the module, and strings built for anything other than a shell.

const ROOT = resolve(import.meta.dirname, "../..");
const OXLINT = join(ROOT, "node_modules/.bin/oxlint");

const MODULES = ["node:child_process", "child_process"];
const RESTRICTED = ["exec", "execSync", "default"];

const config = {
  plugins: [],
  categories: Object.fromEntries(
    ["correctness", "suspicious", "pedantic", "perf", "style", "restriction", "nursery"].map(
      (c) => [c, "off"],
    ),
  ),
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: MODULES.map((name) => ({
          name,
          importNames: RESTRICTED,
          message: "Pass the command and its arguments apart: execFile / spawn (TPL-168).",
        })),
      },
    ],
  },
};

const work = mkdtempSync(join(tmpdir(), "karasu-child-process-"));
const configPath = join(work, "oxlintrc.json");
writeFileSync(configPath, JSON.stringify(config));

afterAll(() => rmSync(work, { recursive: true, force: true }));

interface OxlintReport {
  diagnostics: { message: string; filename: string; labels?: { span: { line: number } }[] }[];
  number_of_files: number;
}

function lint(cwd: string, target: string): OxlintReport {
  const run = spawnSync(OXLINT, ["-c", configPath, "-f", "json", target], {
    cwd,
    encoding: "utf8",
  });
  if (run.error) throw run.error;
  try {
    return JSON.parse(run.stdout) as OxlintReport;
  } catch {
    // A rejected config or a crash leaves no JSON; show oxlint's own words.
    throw new Error(`oxlint exited ${run.status} without a JSON report:\n${run.stderr}`);
  }
}

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

describe("no file imports the shell-string child_process API (TPL-168)", () => {
  it("reports every restricted import form in a probe file", () => {
    // The check is only as good as its config: prove it still fires on each
    // form before trusting its silence on the repo.
    const probe = join(work, "probe");
    const lines = [
      `import { exec as run } from "node:child_process";`,
      `import { execSync } from "child_process";`,
      `import * as cp from "node:child_process";`,
      `import cpd from "child_process";`,
      `export { exec } from "child_process";`,
      `run("a"); execSync("b"); cp.spawn("c"); cpd.spawn("d");`,
    ];
    rmSync(probe, { recursive: true, force: true });
    mkdirSync(probe, { recursive: true });
    writeFileSync(join(probe, "probe.ts"), lines.join("\n"));
    const report = lint(probe, ".");
    const hitLines = report.diagnostics.map((d) => d.labels?.[0]?.span.line).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(hitLines).toEqual([1, 2, 3, 4, 5]);
  });

  it("finds none in the files the repo tracks", () => {
    const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter((f) => SOURCE.test(f));
    const report = lint(ROOT, ".");
    // A walk that silently skipped the tree (a changed ignore rule, a wrong
    // cwd) would also report nothing, so it must have read every tracked file.
    expect(report.number_of_files).toBeGreaterThanOrEqual(tracked.length);
    expect(report.diagnostics.map((d) => `${d.filename}: ${d.message}`)).toEqual([]);
  });
});
