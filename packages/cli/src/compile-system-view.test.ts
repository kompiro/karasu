import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Diagnostic } from "@karasu-tools/core";
import { diagLocFormatter } from "./compile-system-view.js";

/**
 * `diagLocFormatter` decides which document a printed position names (#2715,
 * TPL-2715). The end-to-end form, over a real multi-file project, lives in
 * `render.e2e.test.ts`; these pin each branch of the display rule.
 */
describe("diagLocFormatter", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-diag-loc-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const formatDiagLoc = (filePath: string, d: Diagnostic) => diagLocFormatter(filePath)(d);

  const at = (line: number, column: number, file?: string): Diagnostic => ({
    severity: "error",
    code: "top-level-declaration",
    params: { construct: "user" },
    loc: {
      start: { line, column, offset: 0 },
      end: { line, column, offset: 0 },
      ...(file !== undefined ? { file } : {}),
    },
  });

  it("prints the bare path for a diagnostic with no position", () => {
    const d: Diagnostic = { severity: "error", code: "file-not-found", params: { filePath: "x" } };

    expect(formatDiagLoc("index.krs", d)).toBe("index.krs");
  });

  // Core positions are 1-based. The formatter used to add 1, so `user Bob` on
  // line 4, column 1 of a 4-line file printed as `5:2`.
  it("prints the 1-based position as it is", () => {
    expect(formatDiagLoc("single.krs", at(4, 1))).toBe("single.krs:4:1");
  });

  it("reads a position without a file as the entry's, in the user's spelling", () => {
    expect(formatDiagLoc("./index.krs", at(2, 3))).toBe("./index.krs:2:3");
  });

  it("keeps the user's spelling when the file is the entry reached another way", () => {
    const entry = join(tmpDir, "index.krs");
    writeFileSync(entry, "");
    const link = join(tmpDir, "link.krs");
    symlinkSync(entry, link);

    // Typed through the symlink; the resolver recorded the target.
    expect(formatDiagLoc(link, at(2, 3, entry))).toBe(`${link}:2:3`);
  });

  // `realpathSync` throws for a path that no longer exists; the lexical
  // fallback still folds a relative spelling onto its absolute form.
  it("folds a relative entry onto its absolute form without touching the disk", () => {
    const absolute = join(process.cwd(), "not-on-disk", "index.krs");

    expect(formatDiagLoc("./not-on-disk/index.krs", at(1, 1, absolute))).toBe(
      "./not-on-disk/index.krs:1:1",
    );
  });

  // One formatter serves a whole report and caches canonical paths; the cache
  // must not blur the entry and another file together.
  it("keeps the entry and other files apart across one report", () => {
    const locOf = diagLocFormatter("index.krs");
    const imported = join(process.cwd(), "slices", "legacy.krs");

    expect([
      locOf(at(1, 1, join(process.cwd(), "index.krs"))),
      locOf(at(12, 3, imported)),
      locOf(at(2, 1)),
      locOf(at(13, 3, imported)),
    ]).toEqual([
      "index.krs:1:1",
      `${join("slices", "legacy.krs")}:12:3`,
      "index.krs:2:1",
      `${join("slices", "legacy.krs")}:13:3`,
    ]);
  });

  it("names any other file relative to the working directory", () => {
    const imported = join(process.cwd(), "slices", "legacy.krs");

    expect(formatDiagLoc("index.krs", at(12, 3, imported))).toBe(
      `${join("slices", "legacy.krs")}:12:3`,
    );
  });
});
