import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BUNDLE_READMES,
  BUNDLED_DOCS,
  REPOSITORY_BLOB_URL,
  bundledContent,
  fenceScanner,
  check,
  write,
} from "./skill-reference-bundle-sync.js";

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
  const files: Record<string, string> = Object.fromEntries(
    BUNDLE_READMES.map((readme) => [readme, "# notice\n"]),
  );
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
    delete files[BUNDLE_READMES[0]];
    const root = fixture(files);
    try {
      expect(check(root)).toEqual([{ kind: "missing-readme", file: BUNDLE_READMES[0] }]);
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

describe("bundledContent() (#3103)", () => {
  const SPEC = "docs/spec/syntax.md";
  const GUIDE = "docs/guide/notation-cookbook.md";

  it("points a link to a file that is not bundled at the file on GitHub", () => {
    expect(bundledContent(SPEC, "See [TPL](../test-perspectives/TPL-1.md#x).")).toBe(
      `See [TPL](${REPOSITORY_BLOB_URL}docs/test-perspectives/TPL-1.md#x).`,
    );
    expect(bundledContent(SPEC, "[ja](syntax.ja.md)")).toBe(
      `[ja](${REPOSITORY_BLOB_URL}docs/spec/syntax.ja.md)`,
    );
  });

  it("points a link to a bundled source at its sibling copy", () => {
    expect(bundledContent(GUIDE, "[grammar](../spec/syntax.md#node)")).toBe(
      "[grammar](syntax.md#node)",
    );
  });

  it("leaves a link that already reads as its sibling copy as it is", () => {
    const text = "[a](./tags-annotations.md#x) [b](diagnostics.md)";
    expect(bundledContent(SPEC, text)).toBe(text);
  });

  it("leaves URLs, anchors, absolute paths and fenced code alone", () => {
    const text = [
      "[web](https://example.com/a.md) [mail](mailto:a@b.c) [here](#top) [root](/docs/x.md)",
      "```md",
      "[example](../adr/1.md)",
      "```",
    ].join("\n");
    expect(bundledContent(SPEC, text)).toBe(text);
  });

  it("closes a fence only on a matching fence line", () => {
    const text = [
      "~~~md",
      "```",
      "[example](../adr/1.md)",
      "~~~",
      "````md",
      "```",
      "[example](../adr/2.md)",
      "``` not a closer",
      "````",
      "[after](../adr/3.md)",
    ].join("\n");
    expect(bundledContent(SPEC, text).split("\n")).toEqual([
      ...text.split("\n").slice(0, 9),
      `[after](${REPOSITORY_BLOB_URL}docs/adr/3.md)`,
    ]);
  });

  it("keeps a link title", () => {
    expect(bundledContent(SPEC, '[a](../adr/1.md "ADR 1")')).toBe(
      `[a](${REPOSITORY_BLOB_URL}docs/adr/1.md "ADR 1")`,
    );
  });
});

/**
 * The point of the transform, checked on the real copies: the installed skill
 * has only its own directory, so every link must resolve there or be absolute.
 */
describe("links in the bundled copies", () => {
  const LINK = /\]\(([^)\s]+)/g;

  for (const { source, bundled } of BUNDLED_DOCS.filter((d) =>
    d.bundled.startsWith("packages/skills/skills/karasu-author/"),
  )) {
    it(`${source}: every link resolves inside the bundle or on GitHub`, () => {
      const text = readFileSync(resolve(REPO_ROOT, bundled), "utf8");
      const dangling: string[] = [];
      const inFence = fenceScanner();
      for (const line of text.split("\n")) {
        if (inFence(line)) continue;
        for (const [, target] of line.matchAll(LINK)) {
          const path = target.split("#")[0];
          if (path === "" || /^mailto:/.test(path)) continue;
          if (path.startsWith(REPOSITORY_BLOB_URL)) {
            // A GitHub link must name a file this repository has.
            const repoPath = path.slice(REPOSITORY_BLOB_URL.length);
            if (!existsSync(resolve(REPO_ROOT, repoPath))) dangling.push(target);
            continue;
          }
          if (/^[a-z][a-z0-9+.-]*:/i.test(path)) continue;
          if (!existsSync(resolve(REPO_ROOT, dirname(bundled), path))) dangling.push(target);
        }
      }
      expect(dangling).toEqual([]);
    });
  }
});
