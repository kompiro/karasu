import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUNDLE_README, BUNDLED_DOCS, check, write } from "./skill-reference-bundle-sync.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** A throwaway repo skeleton with the given files, as `path → contents`. */
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "bundle-sync-"));
  for (const [path, content] of Object.entries(files)) {
    const abs = resolve(root, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

/** Every manifest path, with matching contents — the in-sync state. */
function inSyncFiles(): Record<string, string> {
  const files: Record<string, string> = { [BUNDLE_README]: "# notice\n" };
  for (const { source, bundled } of BUNDLED_DOCS) {
    files[source] = `contents of ${source}\n`;
    files[bundled] = `contents of ${source}\n`;
  }
  return files;
}

describe("the skill's bundled reference docs", () => {
  it("are in sync in this repository", () => {
    expect(check(REPO_ROOT)).toEqual([]);
  });

  it("actually names the sources it claims to guard", () => {
    // Without this, an empty or mistyped manifest would make the assertion
    // above pass vacuously — the failure mode the ADR-2077 sync test calls out.
    const sources = BUNDLED_DOCS.map((d) => d.source);
    expect(sources).toContain("docs/spec/syntax.md");
    expect(sources.length).toBeGreaterThanOrEqual(4);
  });

  it("bundles the grammar itself, not a stub", () => {
    // A copy that exists but is empty would satisfy byte-equality against an
    // empty source; the point of the bundle is that the grammar travels.
    const syntax = BUNDLED_DOCS.find((d) => d.source === "docs/spec/syntax.md");
    const bundled = readFileSync(resolve(REPO_ROOT, syntax!.bundled), "utf8");
    expect(bundled).toContain("# .krs Syntax Reference");
    expect(bundled.length).toBeGreaterThan(10_000);
  });
});

describe("check()", () => {
  it("reports a copy that drifted from its source", () => {
    const files = inSyncFiles();
    const drifted = BUNDLED_DOCS[0];
    files[drifted.bundled] = "edited in the wrong place\n";
    const root = fixture(files);
    try {
      expect(check(root)).toEqual([
        { kind: "stale-copy", file: drifted.bundled, source: drifted.source },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports a copy that was never generated", () => {
    const files = inSyncFiles();
    const missing = BUNDLED_DOCS[1];
    delete files[missing.bundled];
    const root = fixture(files);
    try {
      expect(check(root)).toEqual([
        { kind: "missing-copy", file: missing.bundled, source: missing.source },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("blames the manifest, not the copy, when a source is renamed away", () => {
    const files = inSyncFiles();
    const renamed = BUNDLED_DOCS[0];
    delete files[renamed.source];
    const root = fixture(files);
    try {
      expect(check(root)).toEqual([{ kind: "missing-source", file: renamed.source }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires the bundle's do-not-edit notice", () => {
    const files = inSyncFiles();
    delete files[BUNDLE_README];
    const root = fixture(files);
    try {
      expect(check(root)).toEqual([{ kind: "missing-readme", file: BUNDLE_README }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("write()", () => {
  it("brings a drifted copy back and reports only what it touched", () => {
    const files = inSyncFiles();
    const drifted = BUNDLED_DOCS[0];
    files[drifted.bundled] = "edited in the wrong place\n";
    const root = fixture(files);
    try {
      expect(write(root)).toEqual([drifted.bundled]);
      expect(check(root)).toEqual([]);
      expect(write(root)).toEqual([]); // idempotent — nothing left to write
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
