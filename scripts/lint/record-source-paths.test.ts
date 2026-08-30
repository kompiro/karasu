import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  ABSENT_PATH_MARKER,
  absentPathReason,
  check,
  checkMarkdown,
  isGeneratedPath,
  SCANNED_DIRS,
  sourcePathsInLine,
} from "./record-source-paths.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

describe("sourcePathsInLine", () => {
  it("takes a span that is a source path and nothing else", () => {
    expect(sourcePathsInLine("see `packages/core/src/index.ts` for the entry")).toEqual([
      "packages/core/src/index.ts",
    ]);
    expect(sourcePathsInLine("- `scripts/lint/krs-fences.ts`")).toEqual([
      "scripts/lint/krs-fences.ts",
    ]);
  });

  it("takes every span on the line", () => {
    const line = "- **対象**: `packages/app/src/App.tsx`, `packages/core/src/index.ts`";
    expect(sourcePathsInLine(line)).toEqual([
      "packages/app/src/App.tsx",
      "packages/core/src/index.ts",
    ]);
  });

  it("ignores a path written as prose rather than in a code span", () => {
    expect(sourcePathsInLine("the renderer lives in packages/core/src/renderer/")).toEqual([]);
  });

  it("ignores a span that is not a path end to end", () => {
    // Globs, placeholders and shell lines are excluded by requiring the whole
    // span to be path characters — no deny-list of illustrative names.
    expect(sourcePathsInLine("`packages/e2e/tests/at-*.spec.ts`")).toEqual([]);
    expect(sourcePathsInLine("`packages/docs-site/scripts/lib/{site-map,rewrite}.ts`")).toEqual([]);
    expect(sourcePathsInLine("`> ✅ Automated by \\`<spec path>\\``")).toEqual([]);
    expect(sourcePathsInLine("`cp packages/lsp/out/* packages/vscode/lsp/`")).toEqual([]);
  });

  it("ignores a path outside packages/ and scripts/", () => {
    expect(sourcePathsInLine("`docs/adr/706-rename-preview-column.md`")).toEqual([]);
    expect(sourcePathsInLine("`examples/en/feature-samples/nope.krs`")).toEqual([]);
  });

  it("ignores build output, whose absence from a clean checkout is normal", () => {
    expect(sourcePathsInLine("`packages/cli/dist/index.js`")).toEqual([]);
    expect(sourcePathsInLine("`packages/lsp/out/server.js`")).toEqual([]);
    expect(sourcePathsInLine("`packages/vscode/THIRD_PARTY_NOTICES.md`")).toEqual([]);
  });
});

describe("isGeneratedPath", () => {
  it("matches on a whole segment, not a substring", () => {
    expect(isGeneratedPath("packages/app/dist/index.js")).toBe(true);
    // `distribution` is not `dist`; `outline` is not `out`.
    expect(isGeneratedPath("packages/app/src/distribution.ts")).toBe(false);
    expect(isGeneratedPath("packages/app/src/components/OutlineView.tsx")).toBe(false);
  });
});

describe("absentPathReason", () => {
  it("reads the reason declared by the marker", () => {
    expect(absentPathReason(`<!-- ${ABSENT_PATH_MARKER}: retired test (#1585) -->`)).toBe(
      "retired test (#1585)",
    );
  });

  it("returns an empty reason when the colon is followed by nothing", () => {
    expect(absentPathReason(`<!-- ${ABSENT_PATH_MARKER}: -->`)).toBe("");
  });

  it("returns undefined for an ordinary line or another comment", () => {
    expect(absentPathReason("- `packages/core/src/index.ts`")).toBeUndefined();
    expect(absentPathReason("<!-- prettier-ignore -->")).toBeUndefined();
  });

  it("ignores the marker quoted inside prose, so documenting it declares nothing", () => {
    // This guard's own AT record and TPL-2254 both spell the syntax out in a
    // sentence. Matching anywhere made those lines declare an absent path and
    // then fail as unused.
    const documenting = `不在が正しい行は \`<!-- ${ABSENT_PATH_MARKER}: <理由> -->\` で宣言する`;
    expect(absentPathReason(documenting)).toBeUndefined();
  });

  it("allows the marker to be indented, so it can sit inside a list item", () => {
    expect(absentPathReason(`   <!-- ${ABSENT_PATH_MARKER}: planned -->`)).toBe("planned");
  });
});

describe("checkMarkdown", () => {
  const root = mkdtempSync(join(tmpdir(), "record-source-paths-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  function writeSource(path: string): void {
    const abs = join(root, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, "");
  }
  writeSource("packages/core/src/index.ts");

  function findings(markdown: string) {
    return checkMarkdown("docs/acceptance/demo.md", markdown, root);
  }

  it("passes a path that is in the working tree", () => {
    expect(findings("- `packages/core/src/index.ts`")).toEqual([]);
  });

  it("reports the file, line and path of a path that is not", () => {
    expect(findings("intro\n\n- `packages/core/src/gone.ts`")).toEqual([
      {
        kind: "missing-source-path",
        file: "docs/acceptance/demo.md",
        line: 3,
        path: "packages/core/src/gone.ts",
      },
    ]);
  });

  it("does not read YAML frontmatter", () => {
    // TPL frontmatter carries prose with stand-in names (`packages/foo`).
    const md = [
      "---",
      "applicable_to:",
      '  - "`packages/foo` から `packages/bar` を参照するとき"',
      "---",
      "",
      "- `packages/core/src/index.ts`",
    ].join("\n");
    expect(findings(md)).toEqual([]);
  });

  it("does not read fenced code blocks", () => {
    const md = ["text", "```bash", "rm packages/core/src/gone.ts", "```", "more"].join("\n");
    expect(findings(md)).toEqual([]);
  });

  it("closes a fence only on the same character and at least the same run", () => {
    // A ```` fence quoting a ``` example, and a ~~~ fence: toggling on any ```
    // line read the quoted example as prose and swallowed the rest as fence.
    const backticks = [
      "````markdown",
      "```krs",
      "- `packages/core/src/gone.ts`",
      "```",
      "````",
      "- `packages/core/src/index.ts`",
    ].join("\n");
    expect(findings(backticks)).toEqual([]);

    const tildes = ["~~~bash", "rm packages/core/src/gone.ts", "~~~"].join("\n");
    expect(findings(tildes)).toEqual([]);
  });

  it("reports a marker whose next line is another marker", () => {
    // The first declaration stands for nothing; overwriting `pendingMarker`
    // hid it.
    const md = [
      `<!-- ${ABSENT_PATH_MARKER}: first -->`,
      `<!-- ${ABSENT_PATH_MARKER}: second -->`,
      "- かつて `packages/core/src/gone.ts` があった",
    ].join("\n");
    expect(findings(md)).toEqual([
      {
        kind: "absent-path-marker-unused",
        file: "docs/acceptance/demo.md",
        line: 1,
        path: "",
      },
    ]);
  });

  it("accepts an absent path declared by the marker on the line above", () => {
    const md = [
      `<!-- ${ABSENT_PATH_MARKER}: retired test, named as history (#1585) -->`,
      "- かつて `packages/core/src/gone.ts` があった",
    ].join("\n");
    expect(findings(md)).toEqual([]);
  });

  it("rejects a marker with no reason", () => {
    const md = [
      `<!-- ${ABSENT_PATH_MARKER}: -->`,
      "- かつて `packages/core/src/gone.ts` があった",
    ].join("\n");
    expect(findings(md).map((f) => f.kind)).toEqual(["absent-path-marker-empty-reason"]);
  });

  it("rejects a marker whose next line has no absent path", () => {
    // The reverse direction: once the design doc's file is implemented, or the
    // history is rewritten, the declaration outlives its claim and must go.
    const md = [
      `<!-- ${ABSENT_PATH_MARKER}: planned by this design -->`,
      "- `packages/core/src/index.ts`",
    ].join("\n");
    expect(findings(md)).toEqual([
      {
        kind: "absent-path-marker-unused",
        file: "docs/acceptance/demo.md",
        line: 1,
        path: "",
      },
    ]);
  });

  it("rejects a marker that is not immediately above the path", () => {
    const md = [
      `<!-- ${ABSENT_PATH_MARKER}: planned by this design -->`,
      "",
      "- `packages/core/src/gone.ts`",
    ].join("\n");
    expect(findings(md).map((f) => f.kind)).toEqual([
      "absent-path-marker-unused",
      "missing-source-path",
    ]);
  });

  it("rejects a marker on the last line, which declares nothing", () => {
    const md = ["- `packages/core/src/index.ts`", `<!-- ${ABSENT_PATH_MARKER}: dangling -->`].join(
      "\n",
    );
    expect(findings(md).map((f) => f.kind)).toEqual(["absent-path-marker-unused"]);
  });
});

describe("the real records name paths that exist", () => {
  it("has no finding in any scanned directory", () => {
    expect(check(REPO_ROOT).map((f) => `${f.file}:${f.line} ${f.path}`.trim())).toEqual([]);
  });

  it("does not scan docs/adr, whose bodies are records of their time (ADR-706)", () => {
    expect(SCANNED_DIRS).not.toContain("docs/adr");
  });
});
