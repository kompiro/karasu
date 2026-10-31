import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the removal decided in ADR-3421: no workflow runs Copilot inference.
// The Copilot seat available to the maintainer is provided by their employer's
// organization, and a workflow that asks for `copilot-requests: write` (or
// hands the engine a `COPILOT_GITHUB_TOKEN`) bills its inference to that seat.
// The gh-aw workflows that did so were removed; this guard keeps a new one from
// landing until a personally billed engine is available. Bringing them back is
// #3421, and doing so replaces this guard in the same PR.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const SCANNED_DIRS = [".github/workflows", ".github/actions"];

/** Lines that route inference to a Copilot seat, matched outside comments. */
const COPILOT_INFERENCE = [
  /^\s*copilot-requests\s*:/,
  /^\s*engine\s*:\s*copilot\b/,
  /COPILOT_GITHUB_TOKEN/,
];

function listFiles(dir: string): string[] {
  return readdirSync(join(REPO_ROOT, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(REPO_ROOT, join(entry.parentPath, entry.name)))
    .sort();
}

describe("Copilot inference policy (ADR-3421)", () => {
  const files = SCANNED_DIRS.flatMap(listFiles);

  it("scans the workflow directory", () => {
    // Parser sanity: an empty scan would make the assertion below pass vacuously.
    expect(files.filter((file) => file.endsWith(".yml")).length).toBeGreaterThan(0);
  });

  it("has no workflow that bills inference to a Copilot seat", () => {
    const hits = files.flatMap((file) =>
      readFileSync(join(REPO_ROOT, file), "utf8")
        .split("\n")
        .map((line, index) => ({ line, at: `${file}:${index + 1}` }))
        .filter(({ line }) => !/^\s*#/.test(line))
        .filter(({ line }) => COPILOT_INFERENCE.some((pattern) => pattern.test(line)))
        .map(({ line, at }) => `${at} ${line.trim().slice(0, 120)}`),
    );
    expect(hits).toEqual([]);
  });
});
