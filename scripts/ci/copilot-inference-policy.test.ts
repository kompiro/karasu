import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the removal decided in ADR-3421: no workflow runs Copilot inference.
// The Copilot seat available to the maintainer is provided by their employer's
// organization, and a workflow that asks for `copilot-requests: write` (or
// hands the engine a `COPILOT_GITHUB_TOKEN`) bills its inference to that seat.
// The gh-aw workflows that did so were removed; this guard keeps a new one from
// landing until a personally billed engine is available. Bringing them back is
// #3421, and doing so replaces this guard in the same PR.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOW_DIR = ".github/workflows";
const SCANNED_DIRS = [WORKFLOW_DIR, ".github/actions"];

/**
 * Words that route inference to a Copilot seat, matched case-insensitively
 * anywhere outside lines that start with `#`. They are matched as bare words
 * rather than as `key: value` pairs, so no YAML spelling hides them: flow style,
 * quotes, anchors (`&all write-all`), a value on the next line or after a
 * comment all still contain the word. The words have no other use in a
 * workflow, so a hit in a string or a trailing comment fails the guard rather
 * than slipping past it.
 *
 * - `copilot-requests` / `write-all`: let `GITHUB_TOKEN` pay for inference
 *   (`write-all` grants every scope). The repository default token is read-only,
 *   so a job without a `permissions:` block cannot get it.
 * - `COPILOT_GITHUB_TOKEN`: the secret gh-aw hands its copilot engine.
 * - `@github/copilot` / `gh copilot`: the Copilot CLI run as a step.
 *
 * A token for another route has to be added as a repository secret first,
 * which only the maintainer can do; this guard fences the routes a pull
 * request can open on its own.
 */
const COPILOT_INFERENCE = [
  /\bcopilot-requests\b/gi,
  /\bwrite-all\b/gi,
  /\bCOPILOT_GITHUB_TOKEN\b/gi,
  /@github\/copilot\b/gi,
  /\bgh\s+copilot\b/gi,
];

function listFiles(dir: string): string[] {
  if (!existsSync(join(REPO_ROOT, dir))) return [];
  return (
    readdirSync(join(REPO_ROOT, dir), { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile())
      // Forward slashes on every platform, so the prefix checks below hold on Windows.
      .map((entry) => relative(REPO_ROOT, join(entry.parentPath, entry.name)).replaceAll(sep, "/"))
      .sort()
  );
}

describe("Copilot inference policy (ADR-3421)", () => {
  const files = SCANNED_DIRS.flatMap(listFiles);

  it("scans the workflow directory", () => {
    // Parser sanity: an empty scan would make the assertions below pass vacuously.
    const workflows = files.filter(
      (file) => file.startsWith(`${WORKFLOW_DIR}/`) && file.endsWith(".yml"),
    );
    expect(workflows.length).toBeGreaterThan(0);
  });

  it("has no gh-aw workflow source", () => {
    // A gh-aw source (`.github/workflows/**/*.md`, imports included) defaults to
    // the copilot engine when it names none, and names it as `engine: copilot`
    // or in the object form, none of which the word match below reads. The safety tests that fenced
    // these sources left with them (ADR-3421), so any source is out until the
    // restore in #3421 brings both back.
    const sources = files.filter(
      (file) => file.startsWith(`${WORKFLOW_DIR}/`) && file.toLowerCase().endsWith(".md"),
    );
    expect(sources).toEqual([]);
  });

  it("has no workflow that bills inference to a Copilot seat", () => {
    const hits = files.flatMap((file) => {
      // Lines starting with `#` are blanked rather than dropped, so offsets keep
      // their line numbers.
      const lines = readFileSync(join(REPO_ROOT, file), "utf8")
        .split("\n")
        .map((line) => (/^\s*#/.test(line) ? "" : line));
      const text = lines.join("\n");
      return COPILOT_INFERENCE.flatMap((pattern) =>
        [...text.matchAll(pattern)].map((match) => {
          const line = text.slice(0, match.index).split("\n").length;
          return `${file}:${line} ${lines[line - 1].trim().slice(0, 120)}`;
        }),
      );
    });
    expect(hits).toEqual([]);
  });
});
