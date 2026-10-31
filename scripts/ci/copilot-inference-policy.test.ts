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
 * Lines that route inference to a Copilot seat, matched outside comments. Not
 * anchored to the line start, so a flow-style `permissions: { …, copilot-requests:
 * write }` is caught too, and quoted keys and values are accepted. `write-all`
 * grants `copilot-requests` along with every other scope. The patterns run over
 * the whole file, so `\s*` also spans a value written on the next line.
 */
const COPILOT_INFERENCE = [
  /\bcopilot-requests["']?\s*:/g,
  /\bengine["']?\s*:\s*["']?copilot\b/g,
  /COPILOT_GITHUB_TOKEN/g,
  /\bpermissions["']?\s*:\s*["']?write-all\b/g,
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
    // A gh-aw source (`.github/workflows/*.md`) defaults to the copilot engine
    // when it names none, or names it in the object form (`engine:` / `id:`),
    // which the line match below does not read. The safety tests that fenced
    // these sources left with them (ADR-3421), so any source is out until the
    // restore in #3421 brings both back.
    const sources = files.filter(
      (file) => file.startsWith(`${WORKFLOW_DIR}/`) && file.endsWith(".md"),
    );
    expect(sources).toEqual([]);
  });

  it("has no workflow that bills inference to a Copilot seat", () => {
    const hits = files.flatMap((file) => {
      // Comment lines are blanked rather than dropped, so offsets keep their line numbers.
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
