import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readAdrPaths, rootGlobs } from "../adr/generated.ts";
import { type GitFacts, parseRecord } from "./local-review-record.ts";
import {
  ADR_GENERATED_GLOBS,
  adrEditIsRecordOnly,
  agreedSpecFiles,
  backingDesignDoc,
  contextHunks,
  type DesignDocFacts,
  designCheckGap,
  type ChangedFile,
  checkExitCode,
  type Hunk,
  classifyChange,
  diffFingerprint,
  excludedPathFilters,
  isLinkInsert,
  isLinkSwap,
  labelTier,
  unknownRiskLabels,
  lineInDiff,
  matchesAgreedText,
  packageJsonTier,
  parseDiff,
  pathTier,
  readFailure,
  regenerationWaivesRecord,
  specBlocks,
  tierSummary,
  triggerIssues,
  UNREADABLE_PATH,
  unquoteGitPath,
} from "./tier.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const pkg = (fields: Record<string, unknown>) => JSON.stringify({ name: "x", ...fields });

describe("pathTier", () => {
  it.each([
    ["docs/test-perspectives/README.md", "low"],
    ["docs/guide/02-onboarding.md", "low"],
    ["packages/core/src/parser/parser.test.ts", "low"],
    ["packages/app/src/App.test.tsx", "low"],
    ["packages/e2e/tests/share.spec.ts", "low"],
    ["docs/design/risk-based-review-tiers.md", "design"],
    ["packages/core/src/renderer/layout.ts", "medium"],
    ["packages/cli/src/render.ts", "medium"],
    ["packages/app/src/components/Toolbar.tsx", "medium"],
    ["docs/acceptance/permalink-deep-element.md", "medium"],
    ["examples/ja/ec-platform/index.krs", "medium"],
    [".github/workflows/ci.yml", "high"],
    // Security boundaries (#3505).
    ["packages/nest/src/worker.ts", "high"],
    ["packages/cli/src/serve.ts", "high"],
    ["packages/cli/src/serve-host.ts", "high"],
    ["packages/cli/src/render-fetch.ts", "high"],
    ["packages/cli/src/node-fs.ts", "high"],
    ["packages/cli/src/path-arg.ts", "high"],
    ["packages/cli/src/watcher.ts", "high"],
    ["packages/core/src/fs/import-resolver.ts", "high"],
    ["packages/vscode/src/message-validation.ts", "high"],
    ["packages/vscode/src/webview-html.ts", "high"],
    ["packages/vscode/src/host-files.ts", "high"],
    ["packages/vscode/src/preview-panel.ts", "high"],
    ["packages/core/src/renderer/svg-builder.ts", "high"],
    ["packages/app/src/utils/inline-share.ts", "high"],
    ["packages/app/src/components/ChatPane.tsx", "high"],
    ["packages/app/src/components/NodeDetailPanel.tsx", "high"],
    ["packages/app/src/components/EdgeDetailPanel.tsx", "high"],
    // Language behavior (#3505).
    ["packages/core/src/lexer/lexer.ts", "high"],
    ["packages/core/src/parser/parser.ts", "high"],
    ["packages/core/src/resolver/resolve.ts", "high"],
    ["packages/core/src/spec/operations.ts", "high"],
    ["packages/core/src/style/parser.ts", "high"],
    ["packages/core/src/formatter/format.ts", "high"],
    ["packages/core/src/annotations/index.ts", "high"],
    ["packages/core/src/language-version.ts", "high"],
    ["packages/core/src/builtins/default-style.ts", "high"],
    ["packages/lsp/src/diagnostics.ts", "high"],
    // A test file stays out of both: adding a test must not make a PR High.
    ["packages/cli/src/serve.test.ts", "low"],
    ["packages/nest/src/worker.test.ts", "low"],
    ["packages/core/src/renderer/svg-builder.test.ts", "low"],
    ["packages/lsp/src/diagnostics.test.ts", "low"],
    [".github/actions/purge-preview-deployments/action.yml", "high"],
    ["packages/cli/CHANGELOG.md", "high"],
    ["pnpm-workspace.yaml", "high"],
    ["docs/spec/syntax.md", "high"],
    ["docs/concepts.ja.md", "high"],
    ["docs/process.md", "high"],
    ["docs/process/review.md", "high"],
    [".claude/rules/adr.md", "high"],
    [".coderabbit.yaml", "high"],
    ["lefthook.yml", "high"],
    ["scripts/lint/record-source-paths.ts", "high"],
    // The review machinery decides how every later PR is read (TPL-3286).
    ["scripts/review/tier.ts", "high"],
    ["scripts/review/local-review-record.test.ts", "high"],
    ["scripts/coderabbit/review-state.ts", "high"],
    ["scripts/render-equivalence/verdict.ts", "high"],
    ["scripts/pr-shots/candidates.ts", "high"],
    ["scripts/bin/gh", "high"],
    [".claude/settings.json", "high"],
    [".claude/skills/coderabbit-converge/SKILL.md", "high"],
    [".claude/skills/demo-video/SKILL.md", "high"],
    [".github/PULL_REQUEST_TEMPLATE.md", "high"],
    [".claude/agents/qa.md", "high"],
    // CI policy tests and drift guards are not Low test files.
    ["scripts/ci/copilot-inference-policy.test.ts", "high"],
    ["scripts/ci/workflow-draft-gate.test.ts", "high"],
    ["pnpm-lock.yaml", "high"],
    [".npmrc", "high"],
    ["packages/cli/.npmrc", "high"],
    [".github/dependabot.yml", "high"],
    [".github/dependabot.yaml", "high"],
  ])("%s is %s", (path, tier) => {
    expect(pathTier(path)).toBe(tier);
  });

  it("puts a path no rule names in Medium, never Low", () => {
    expect(pathTier("docs/some-new-area/notes.md")).toBe("medium");
    expect(pathTier("brand-new-top-level-file.txt")).toBe("medium");
    // docs/adr/ is read from the diff, not the path (classifyChange).
    expect(pathTier("docs/adr/3286-risk-based-review-tiers.md")).toBe("medium");
  });

  it("lets a High path win over the Low test-file pattern it also matches", () => {
    expect(pathTier("scripts/lint/record-source-paths.test.ts")).toBe("high");
  });
});

describe("packageJsonTier", () => {
  it("is Medium when only scripts change", () => {
    expect(
      packageJsonTier(pkg({ scripts: { a: "x" } }), pkg({ scripts: { a: "y", b: "z" } })),
    ).toBe("medium");
  });

  it.each([
    ["dependencies", { dependencies: { a: "1" } }, { dependencies: { a: "2" } }],
    ["devDependencies", { devDependencies: {} }, { devDependencies: { b: "1" } }],
    ["version", { version: "1.0.0" }, { version: "1.1.0" }],
    ["pnpm.overrides", { pnpm: { overrides: {} } }, { pnpm: { overrides: { c: "1" } } }],
  ])("is High when %s changes", (_field, before, after) => {
    expect(packageJsonTier(pkg(before), pkg(after))).toBe("high");
  });

  it.each([
    ["packageManager", { packageManager: "pnpm@11.0.0" }, { packageManager: "pnpm@11.1.0" }],
    ["engines", { engines: { node: ">=22" } }, { engines: { node: ">=24" } }],
    ["exports", { exports: "./a.js" }, { exports: "./b.js" }],
    ["files", { files: ["dist"] }, { files: ["dist", "src"] }],
  ])("is High when %s changes (install or release)", (_field, before, after) => {
    expect(packageJsonTier(pkg(before), pkg(after))).toBe("high");
  });

  it("is High when a script npm runs on install or publish changes", () => {
    expect(
      packageJsonTier(
        pkg({ scripts: { test: "x" } }),
        pkg({ scripts: { test: "x", postinstall: "y" } }),
      ),
    ).toBe("high");
  });

  it("is High when the file is added, removed or unparseable", () => {
    expect(packageJsonTier(null, pkg({}))).toBe("high");
    expect(packageJsonTier(pkg({}), null)).toBe("high");
    expect(packageJsonTier("{", pkg({}))).toBe("high");
  });
});

const modified = (path: string, extra: Partial<ChangedFile> = {}): ChangedFile => ({
  path,
  status: "modified",
  hunks: [],
  ...extra,
});
const added = (path: string): ChangedFile => ({ path, status: "added", hunks: [] });
const deleted = (path: string): ChangedFile => ({ path, status: "deleted", hunks: [] });
const tierOf = (...files: ChangedFile[]) => classifyChange({ files, author: "kompiro" }).tier;

/** An AT record as the tests below change it. */
const AT_DOC = [
  "---",
  "type: product",
  "---",
  "",
  "# AT: x",
  "",
  "- **日付**: 2026-10-30",
  "- **関連 Issue**: [#1](https://github.com/kompiro/karasu/issues/1)",
  "- **関連 ADR**: [ADR-7](../adr/7-y.md)",
  "",
  "## 受け入れ条件",
  "",
  "| a | b |",
  "| --- | --- |",
  "",
  "```sh",
  "- **関連 ADR**: [ADR-7](../adr/7-y.md)",
  "```",
  "",
  "- [ ] AT-A: 確かめる",
  "",
  "### AC-1",
  "",
  "- **手順**: run",
  "- **期待**: ok",
];

/**
 * The single `-U0` hunk between two versions of a document, found from their
 * common first and last lines, with the new side as `after`.
 */
function hunkBetween(before: string[], after: string[]): { hunk: Hunk; after: string } {
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  )
    tail++;
  return {
    hunk: {
      oldStart: head + 1,
      removed: before.slice(head, before.length - tail),
      newStart: head + 1,
      added: after.slice(head, after.length - tail),
    },
    after: after.join("\n"),
  };
}

/** The AT record with line `at` replaced by `lines` (0 lines to delete, 2 to insert one more). */
const editAt = (at: number, ...lines: string[]): string[] => [
  ...AT_DOC.slice(0, at),
  ...lines,
  ...AT_DOC.slice(at + 1),
];
/** The AT record with `lines` inserted before line `at`. */
const insertAt = (at: number, ...lines: string[]): string[] => [
  ...AT_DOC.slice(0, at),
  ...lines,
  ...AT_DOC.slice(at),
];

describe("classifyChange", () => {
  it("takes the strictest tier across the files", () => {
    expect(tierOf(modified("docs/guide/a.md"), modified("docs/design/x.md"))).toBe("design");
    expect(tierOf(modified("docs/guide/a.md"), modified("packages/core/a.ts"))).toBe("medium");
    expect(tierOf(modified("docs/guide/a.md"), modified(".github/workflows/x.yml"))).toBe("high");
  });

  it("lists every file with its own tier, strictest first and in diff order within a tier", () => {
    const { files } = classifyChange({
      files: [
        modified("docs/guide/a.md"),
        modified("packages/core/a.ts"),
        modified("docs/spec/syntax.md"),
        modified("packages/core/b.ts"),
        modified(UNREADABLE_PATH),
      ],
      author: "kompiro",
    });
    expect(files).toEqual([
      { path: "docs/spec/syntax.md", tier: "high", boundary: false, narrowable: true },
      {
        path: "(a diff section whose path could not be read)",
        tier: "high",
        boundary: true,
        narrowable: false,
      },
      { path: "packages/core/a.ts", tier: "medium", boundary: false, narrowable: false },
      { path: "packages/core/b.ts", tier: "medium", boundary: false, narrowable: false },
      { path: "docs/guide/a.md", tier: "low", boundary: false, narrowable: false },
    ]);
  });

  it.each([
    ["docs/spec/syntax.md", false, true],
    ["docs/process/review.md", false, true],
    [".claude/rules/adr.md", false, true],
    ["packages/core/src/parser/parser.ts", false, true],
    ["scripts/review/tier.ts", false, false],
    [".claude/skills/coderabbit-converge/SKILL.md", false, false],
    ["pnpm-lock.yaml", false, false],
    [".github/workflows/ci.yml", true, false],
    ["packages/cli/src/serve.ts", true, false],
    ["packages/nest/src/index.test.ts", true, false],
  ])(
    "marks %s boundary=%s narrowable=%s for the narrowed reading (#3542)",
    (path, boundary, narrowable) => {
      const [f] = classifyChange({ files: [modified(path)], author: "kompiro" }).files;
      expect({ boundary: f.boundary, narrowable: f.narrowable }).toEqual({ boundary, narrowable });
    },
  );

  it("keeps each file's own tier when the author makes the PR High", () => {
    expect(
      classifyChange({ files: [modified("docs/guide/a.md")], author: "someone" }).files,
    ).toEqual([{ path: "docs/guide/a.md", tier: "low", boundary: false, narrowable: false }]);
  });

  it("reads package.json by the fields that moved", () => {
    const scriptsOnly = modified("package.json", {
      before: pkg({ scripts: {} }),
      after: pkg({ scripts: { a: "b" } }),
    });
    expect(tierOf(scriptsOnly)).toBe("medium");
  });

  it("is High for an author not on the trusted list, whatever the paths", () => {
    expect(classifyChange({ files: [modified("docs/guide/a.md")], author: "someone" }).tier).toBe(
      "high",
    );
  });

  it("asks for a security review on security boundaries and workflow changes", () => {
    const sec = (path: string) =>
      classifyChange({ files: [modified(path)], author: "kompiro" }).securityReview;
    expect(sec("packages/nest/src/a.ts")).toBe(true);
    expect(sec("packages/cli/src/render-fetch.ts")).toBe(true);
    expect(sec("packages/core/src/renderer/svg-builder.ts")).toBe(true);
    expect(sec(".github/workflows/x.yml")).toBe(true);
    expect(sec("packages/core/a.ts")).toBe(false);
    expect(sec("packages/core/src/parser/parser.ts")).toBe(false);
  });

  describe("dangerous sinks (#3505)", () => {
    const changing = (path: string, removed: string[], addedLines: string[]) =>
      modified(path, { hunks: [{ oldStart: 3, removed, newStart: 3, added: addedLines }] });

    it.each([
      ["el.innerHTML = svg;"],
      ["<div dangerouslySetInnerHTML={{ __html: html }} />"],
      ["const clean = DOMPurify.sanitize(html);"],
      ["vscode.env.openExternal(uri);"],
      ["return eval (code);"],
      ["const f = new Function('x', body);"],
    ])("is High for a code file whose added line names a sink: %s", (line) => {
      expect(tierOf(changing("packages/app/src/components/New.tsx", [], [line]))).toBe("high");
    });

    it("asks for a security review too", () => {
      const f = changing("packages/app/src/components/New.tsx", [], ["el.innerHTML = svg;"]);
      expect(classifyChange({ files: [f], author: "kompiro" }).securityReview).toBe(true);
    });

    it("is High when the line naming a sink is removed", () => {
      expect(
        tierOf(changing("packages/app/src/x.ts", ["const clean = DOMPurify.sanitize(html);"], [])),
      ).toBe("high");
    });

    it("does not read prose or tests, nor names that only contain the word", () => {
      const line = "el.innerHTML = svg;";
      expect(tierOf(changing("docs/acceptance/x.md", [], [line]))).toBe("medium");
      expect(tierOf(changing("packages/app/src/x.test.ts", [], [line]))).toBe("medium");
      expect(tierOf(changing("packages/app/src/x.ts", [], ["const medieval = 1;"]))).toBe("medium");
    });
  });

  it("treats an empty change as Medium", () => {
    expect(tierOf()).toBe("medium");
  });

  it("is High, with a security review, for a diff section whose path could not be read", () => {
    expect(classifyChange({ files: [modified(UNREADABLE_PATH)], author: "kompiro" })).toMatchObject(
      {
        tier: "high",
        securityReview: true,
      },
    );
  });

  it("keeps a package.json under a High directory High, even for a scripts-only change", () => {
    const scriptsOnly = modified("scripts/review/package.json", {
      before: pkg({ scripts: {} }),
      after: pkg({ scripts: { a: "b" } }),
    });
    expect(tierOf(scriptsOnly)).toBe("high");
  });

  describe("test files", () => {
    const T = "packages/core/src/a.test.ts";
    const hunk = (removed: string[], addedLines: string[]) => ({
      oldStart: 1,
      removed,
      newStart: 1,
      added: addedLines,
    });

    it("is Low only for a new test file", () => {
      expect(tierOf(added(T))).toBe("low");
    });

    it("asks no security review for a new test of a security boundary", () => {
      const f = added("packages/vscode/src/message-validation.test.ts");
      expect(classifyChange({ files: [f], author: "kompiro" })).toMatchObject({
        tier: "low",
        securityReview: false,
      });
    });

    it("is High when lines are removed from a security-boundary test (#3505)", () => {
      for (const path of [
        "packages/cli/src/render-fetch.test.ts",
        "packages/cli/src/serve.e2e.test.ts",
        "packages/core/src/renderer/svg-builder.test.ts",
        "packages/core/src/fs/import-resolver.test.ts",
        "packages/nest/test/upload.test.ts",
        "packages/app/src/components/ChatPane.test.tsx",
      ]) {
        const removedLine = "it('blocks 10.0.0.1', () => {});";
        const removal = modified(path, {
          before: `${removedLine}\nit('blocks ::1', () => {});`,
          after: "it('blocks ::1', () => {});",
          hunks: [{ oldStart: 1, removed: [removedLine], newStart: 0, added: [] }],
        });
        expect(classifyChange({ files: [removal], author: "kompiro" })).toMatchObject({
          tier: "high",
          securityReview: true,
        });
        expect(classifyChange({ files: [deleted(path)], author: "kompiro" })).toMatchObject({
          tier: "high",
          securityReview: true,
        });
        const before = "it('blocks 10.0.0.1', () => {\n  expect(fetchIt()).rejects;\n});";
        const classify = (f: ChangedFile) => classifyChange({ files: [f], author: "kompiro" });
        const sides = (after: string, inserted: string[]) =>
          modified(path, {
            before,
            after,
            hunks: [{ oldStart: 0, removed: [], newStart: 1, added: inserted }],
          });
        // Adding a case stays Medium, with no security review.
        expect(
          classify(
            sides(`it('blocks ::1', () => {});\n${before}`, ["it('blocks ::1', () => {});"]),
          ),
        ).toMatchObject({ tier: "medium", securityReview: false });
        // Turning the test off without removing a line is High too.
        expect(tierOf(sides(`/*\n${before}\n*/`, ["/*"]))).toBe("high");
        expect(tierOf(sides(`return;\n${before}`, ["return;"]))).toBe("high");
        // Rewording a comment there is not turning it off.
        const commented = `// SSRF guard\n${before}`;
        expect(
          classify(
            modified(path, {
              before: commented,
              after: `// The SSRF guard\n${before}`,
              hunks: [
                {
                  oldStart: 1,
                  removed: ["// SSRF guard"],
                  newStart: 1,
                  added: ["// The SSRF guard"],
                },
              ],
            }),
          ),
        ).toMatchObject({ tier: "medium", securityReview: false });
      }
      // A test of a file outside the boundary is Medium either way, with no security review.
      expect(
        classifyChange({
          files: [
            modified("packages/cli/src/render.test.ts", {
              hunks: [hunk(["it('x', ...)"], [])],
            }),
          ],
          author: "kompiro",
        }),
      ).toMatchObject({ tier: "medium", securityReview: false });
    });

    it("is Medium for any change to an existing test file (TPL-3286)", () => {
      // Add-only hunks can still disable tests: an early return, a comment or
      // template literal opened around tests, a skip or fixme modifier.
      for (const lines of [
        ["it('y', () => {", "});"],
        ["  if (!process.env.CI) return;"],
        ["/*"],
        ["test.fixme('x', () => {"],
      ]) {
        expect(tierOf(modified(T, { hunks: [hunk([], lines)] }))).toBe("medium");
      }
      expect(
        tierOf(
          modified(T, {
            hunks: [hunk(["expect(drift()).toEqual([])"], ["expect(true).toBe(true)"])],
          }),
        ),
      ).toBe("medium");
    });

    it("is Medium when a change takes coverage away (TPL-3286)", () => {
      expect(tierOf(deleted(T))).toBe("medium");
      expect(tierOf(modified(T, { hunks: [hunk(["it('x', ...)"], [])] }))).toBe("medium");
      expect(
        tierOf(modified(T, { hunks: [hunk(["it('x', () => {"], ["it.skip('x', () => {"])] })),
      ).toBe("medium");
      expect(tierOf(modified(T, { hunks: [hunk([], ["describe.only('y', () => {"])] }))).toBe(
        "medium",
      );
    });
  });

  describe("docs/adr/", () => {
    const ADR = "docs/adr/3286-risk-based-review-tiers.md";

    it("is Low for a new ADR and the generated files", () => {
      expect(tierOf(added(ADR), modified("docs/adr/effective.md"))).toBe("low");
      expect(tierOf(added(ADR), modified("docs/adr/graph/build.md"))).toBe("low");
    });

    it("is Low for a PR that changes only the generated files (Issue #3416)", () => {
      expect(
        tierOf(
          modified("docs/adr/effective.md"),
          added("docs/adr/graph/new-topic.md"),
          deleted("docs/adr/graph/old-topic.md"),
        ),
      ).toBe("low");
    });

    it("stays Low for a new ADR once ADR PRs stop carrying the generated files", () => {
      expect(tierOf(added(ADR))).toBe("low");
    });

    it("is Medium for README, TEMPLATE and a deleted ADR", () => {
      expect(tierOf(modified("docs/adr/README.md"))).toBe("medium");
      expect(tierOf(modified("docs/adr/TEMPLATE.md"))).toBe("medium");
      expect(tierOf(deleted(ADR))).toBe("medium");
    });

    const before = [
      "---",
      "id: ADR-2716",
      "status: accepted",
      "---",
      "",
      "# ADR-2716: title",
      "",
      "- **ステータス**: 決定済み",
      "",
      "Body prose.",
    ].join("\n");

    it("is Low when an existing ADR changes only its frontmatter and the superseded status line", () => {
      const after = before
        .replace("status: accepted", "status: superseded\nsuperseded_by: ADR-3286")
        .replace("決定済み", "Superseded by ADR-3286");
      const hunks = parseDiff(
        [
          `diff --git a/${ADR} b/${ADR}`,
          `--- a/${ADR}`,
          `+++ b/${ADR}`,
          "@@ -3 +3,2 @@",
          "-status: accepted",
          "+status: superseded",
          "+superseded_by: ADR-3286",
          "@@ -8 +9 @@",
          "-- **ステータス**: 決定済み",
          "+- **ステータス**: Superseded by ADR-3286",
        ].join("\n"),
      )[0].hunks;
      expect(adrEditIsRecordOnly(before, after, hunks)).toBe(true);
      expect(tierOf(modified(ADR, { before, after, hunks }))).toBe("low");
    });

    const OLD_STATUS = "- **ステータス**: 決定済み";
    /** An existing ADR whose status line becomes `line`, with or without the frontmatter saying so. */
    const supersede = (
      line: string,
      frontmatter = "status: superseded\nsuperseded_by: ADR-3286",
    ) => {
      const fmAdded = frontmatter.split("\n");
      const after = before.replace("status: accepted", frontmatter).replace(OLD_STATUS, line);
      const shift = fmAdded.length - 1;
      return modified(ADR, {
        before,
        after,
        hunks: [
          { oldStart: 3, removed: ["status: accepted"], newStart: 3, added: fmAdded },
          { oldStart: 8, removed: [OLD_STATUS], newStart: 8 + shift, added: [line] },
        ],
      });
    };
    const LINKED = "- **ステータス**: Superseded by [ADR-3286](3286-risk-based-review-tiers.md)";

    it("is Low when the superseded status line links the new ADR, as most ADRs write it", () => {
      expect(tierOf(supersede(LINKED))).toBe("low");
      expect(tierOf(supersede(`${LINKED}（決定 2 は引き継がれている）`))).toBe("low");
    });

    it("is Medium when the frontmatter does not record the supersession by the same ADR", () => {
      expect(tierOf(supersede(LINKED, "status: accepted"))).toBe("medium");
      expect(tierOf(supersede(LINKED, "status: superseded\nsuperseded_by: ADR-9999"))).toBe(
        "medium",
      );
      // The value counts, not a mention of the ADR elsewhere on the line.
      expect(
        tierOf(supersede(LINKED, "status: superseded\nsuperseded_by: ADR-9999 # ADR-3286")),
      ).toBe("medium");
    });

    it("is Medium when the status line carries prose or points somewhere else", () => {
      expect(tierOf(supersede(`${LINKED}. The decision above is reversed.`))).toBe("medium");
      expect(
        tierOf(supersede("- **ステータス**: Superseded by [ADR-3286](https://example.com/x)")),
      ).toBe("medium");
      expect(tierOf(supersede("- **ステータス**: Superseded by [ADR-3286](1-unrelated.md)"))).toBe(
        "medium",
      );
    });

    it("is Medium when a status line is only inserted or only deleted", () => {
      const fm = {
        oldStart: 3,
        removed: ["status: accepted"],
        newStart: 3,
        added: ["status: superseded", "superseded_by: ADR-3286"],
      };
      const after = before.replace(
        "status: accepted",
        "status: superseded\nsuperseded_by: ADR-3286",
      );
      const inserted = { oldStart: 10, removed: [], newStart: 12, added: [LINKED] };
      const statusDeleted = { oldStart: 8, removed: [OLD_STATUS], newStart: 8, added: [] };
      expect(tierOf(modified(ADR, { before, after, hunks: [fm, inserted] }))).toBe("medium");
      expect(tierOf(modified(ADR, { before, after, hunks: [fm, statusDeleted] }))).toBe("medium");
    });

    it("is Medium when an existing ADR's prose changes (ADR-2687 keeps it immutable)", () => {
      const after = before.replace("Body prose.", "Rewritten prose.");
      const hunks = [
        { oldStart: 10, removed: ["Body prose."], newStart: 10, added: ["Rewritten prose."] },
      ];
      expect(adrEditIsRecordOnly(before, after, hunks)).toBe(false);
      expect(tierOf(modified(ADR, { before, after, hunks }))).toBe("medium");
    });

    it("is Medium when the status line changes to anything but Superseded", () => {
      const after = before.replace("決定済み", "却下");
      const hunks = [
        {
          oldStart: 8,
          removed: ["- **ステータス**: 決定済み"],
          newStart: 8,
          added: ["- **ステータス**: 却下"],
        },
      ];
      expect(tierOf(modified(ADR, { before, after, hunks }))).toBe("medium");
    });

    it("is Medium when the before or after side could not be read", () => {
      expect(tierOf(modified(ADR, { hunks: [] }))).toBe("medium");
    });

    it("is Medium for an existing ADR changed with no text hunk (binary, mode-only)", () => {
      expect(tierOf(modified(ADR, { before, after: before, hunks: [] }))).toBe("medium");
    });
  });

  describe("ADR promotion (ADR-2331)", () => {
    const NEW_ADR = "docs/adr/3286-risk-based-review-tiers.md";
    const DESIGN = "docs/design/risk-based-review-tiers.md";
    const swap = modified("docs/acceptance/x.md", {
      hunks: [
        {
          oldStart: 5,
          removed: ["- 設計: [risk-based-review-tiers.md](../design/risk-based-review-tiers.md)"],
          newStart: 5,
          added: ["- 設計: [ADR-3286](../adr/3286-risk-based-review-tiers.md)"],
        },
      ],
    });

    it("is Low when a new ADR replaces a deleted Design Doc and links are swapped", () => {
      expect(tierOf(added(NEW_ADR), deleted(DESIGN), swap)).toBe("low");
    });

    it("falls back to the path rules without a new ADR in the same PR", () => {
      expect(tierOf(deleted(DESIGN))).toBe("design");
      expect(tierOf(deleted(DESIGN), swap)).toBe("medium");
    });

    it("keeps a link edit that changes anything else at its path's tier", () => {
      const extra = modified("docs/acceptance/x.md", {
        hunks: [
          {
            oldStart: 5,
            removed: ["- 設計: [x](../design/risk-based-review-tiers.md)"],
            newStart: 5,
            added: ["- 設計（完了）: [ADR-3286](../adr/3286-risk-based-review-tiers.md)"],
          },
        ],
      });
      expect(tierOf(added(NEW_ADR), deleted(DESIGN), extra)).toBe("medium");
    });

    it("never lowers a High path through a link swap", () => {
      const swapIn = (path: string) =>
        modified(path, {
          hunks: [
            {
              oldStart: 5,
              removed: ["See [the design](../design/risk-based-review-tiers.md)."],
              newStart: 5,
              added: ["See [the design](../adr/3286-risk-based-review-tiers.md)."],
            },
          ],
        });
      expect(tierOf(added(NEW_ADR), deleted(DESIGN), swapIn(".claude/skills/x/SKILL.md"))).toBe(
        "high",
      );
      expect(tierOf(added(NEW_ADR), deleted(DESIGN), swapIn("docs/spec/syntax.md"))).toBe("high");
    });

    const atChange = (path: string, lines: string[]) => {
      const { hunk, after } = hunkBetween(AT_DOC, lines);
      return modified(path, { hunks: [hunk], before: AT_DOC.join("\n"), after });
    };
    const ADR_LINK = "[ADR-3286](../adr/3286-risk-based-review-tiers.md)";

    it("is Low when the AT gains a link to the new ADR it never had (#3405)", () => {
      // ATs point at their Issue (ADR-2348), so there is no Design Doc link to swap.
      const prepend = atChange(
        "docs/acceptance/x.md",
        editAt(8, `- **関連 ADR**: ${ADR_LINK}、[ADR-7](../adr/7-y.md)`),
      );
      expect(tierOf(added(NEW_ADR), deleted(DESIGN), prepend)).toBe("low");
      const newLine = atChange(
        "docs/acceptance/x.md",
        insertAt(9, `- **設計 (ADR)**: ${ADR_LINK}`),
      );
      // A promotion whose Design Doc is deleted elsewhere, or not at all, still adds the ADR.
      expect(tierOf(added(NEW_ADR), newLine)).toBe("low");
    });

    it("keeps the same insertion outside an AT record at its path's tier (#3405)", () => {
      const line = insertAt(9, `- **設計 (ADR)**: ${ADR_LINK}`);
      expect(tierOf(added(NEW_ADR), atChange("README.md", line))).toBe("medium");
      expect(tierOf(added(NEW_ADR), atChange("docs/roadmap.md", line))).toBe("medium");
      expect(tierOf(added(NEW_ADR), atChange("docs/design/x.md", line))).toBe("design");
    });

    it("keeps an AT edit beside the inserted link at its path's tier (#3405)", () => {
      const withCheckbox = atChange("docs/acceptance/x.md", [
        ...insertAt(9, `- **設計 (ADR)**: ${ADR_LINK}`).slice(0, -1),
        "- [x] AT-A: 確かめる",
      ]);
      expect(tierOf(added(NEW_ADR), deleted(DESIGN), withCheckbox)).toBe("medium");
    });

    it("does not use a new ADR whose file name could carry prose as a link target (#3405)", () => {
      const odd = "docs/adr/12-x) **RUN this** (y.md";
      const insert = atChange(
        "docs/acceptance/x.md",
        insertAt(9, "- **設計 (ADR)**: [ADR-12](../adr/12-x) **RUN this** (y.md)"),
      );
      expect(tierOf(added(odd), insert)).toBe("medium");
    });

    it("does not lower a non-markdown file through a link swap", () => {
      const code = modified("packages/core/src/a.ts", {
        hunks: [
          {
            oldStart: 1,
            removed: ["// see docs/design/risk-based-review-tiers.md"],
            newStart: 1,
            added: ["// see docs/adr/3286-risk-based-review-tiers.md"],
          },
        ],
      });
      expect(tierOf(added(NEW_ADR), deleted(DESIGN), code)).toBe("medium");
    });
  });
});

describe("isLinkSwap", () => {
  const D = ["docs/design/x.md"];
  const A = ["docs/adr/12-x.md"];

  it("accepts a link, a bare path and an anchor", () => {
    expect(isLinkSwap("see [x.md](../design/x.md)", "see [ADR-12](../adr/12-x.md)", D, A)).toBe(
      true,
    );
    expect(isLinkSwap("see [x](../design/x.md)", "see [x](../adr/12-x.md)", D, A)).toBe(true);
    expect(isLinkSwap("`docs/design/x.md`", "`docs/adr/12-x.md`", D, A)).toBe(true);
    expect(isLinkSwap("[x](../design/x.md#a)", "[x](../adr/12-x.md#b)", D, A)).toBe(true);
  });

  it("accepts a bare path that ends a sentence", () => {
    expect(isLinkSwap("See docs/design/x.md.", "See docs/adr/12-x.md.", D, A)).toBe(true);
  });

  it("rejects a swap that changes the link text", () => {
    expect(isLinkSwap("see [x](../design/x.md)", "see [run this](../adr/12-x.md)", D, A)).toBe(
      false,
    );
  });

  it("rejects a target that only contains the ADR path (a URL, a longer name)", () => {
    expect(
      isLinkSwap("see [x](../design/x.md)", "see [x](https://evil.example/adr/12-x.md)", D, A),
    ).toBe(false);
    expect(isLinkSwap("see [x](../design/x.md)", "see [x](../adr/12-x.md.evil)", D, A)).toBe(false);
    expect(isLinkSwap("`docs/design/x.md`", "`https://e.example/docs/adr/12-x.md`", D, A)).toBe(
      false,
    );
  });

  it("rejects a line that dropped the link or pointed elsewhere", () => {
    expect(isLinkSwap("see [x](../design/x.md)", "see ADR-12", D, A)).toBe(false);
    expect(isLinkSwap("see [x](../design/y.md)", "see [x](../adr/12-x.md)", D, A)).toBe(false);
  });
});
describe("isLinkSwap: sibling names, the item label and ADR-<n> (#3620)", () => {
  const D = ["docs/design/x.md"];
  const A = ["docs/adr/12-x.md"];
  const IN = "docs/design/y.md";
  const swap = (before: string, after: string, path = IN, d = D, a = A) =>
    isLinkSwap(before, after, d, a, path);

  it("reads a sibling's bare name as a whole link target or a whole code span", () => {
    expect(swap("see [x.md](x.md)", "see [ADR-12](../adr/12-x.md)")).toBe(true);
    expect(swap("see [x](./x.md#a)", "see [x](../adr/12-x.md#b)")).toBe(true);
    expect(swap("see `x.md`", "see `docs/adr/12-x.md`")).toBe(true);
    expect(swap("see [`x.md`](x.md)", "see [ADR-12](../adr/12-x.md)")).toBe(true);
  });

  it("keeps swaps it accepted before", () => {
    expect(swap("`docs/design/x.md`", "`docs/adr/12-x.md`")).toBe(true);
    // a path inside a code span, and in the text of a link to anything
    expect(swap("run `cat docs/design/x.md` now", "run `cat docs/adr/12-x.md` now")).toBe(true);
    expect(
      swap(
        "[docs/design/x.md の議論](https://e.example/pull/1)",
        "[docs/adr/12-x.md の議論](https://e.example/pull/1)",
        "docs/roadmap.md",
      ),
    ).toBe(true);
    expect(
      swap(
        "see [see docs/design/x.md](../design/x.md)",
        "see [see docs/adr/12-x.md](../adr/12-x.md)",
      ),
    ).toBe(true);
    expect(swap("See docs/design/x.md.", "See docs/adr/12-x.md.")).toBe(true);
  });

  it("does not read a bare name outside a whole target or code span, or outside docs/design/", () => {
    expect(swap("see [a](old-x.md)", "see [a](../adr/12-x.md)")).toBe(false);
    expect(swap("see [a](../other/x.md)", "see [a](../adr/12-x.md)")).toBe(false);
    expect(swap("see [a](z.md)", "see [a](../adr/12-x.md)", IN, ["docs/design/x.md"])).toBe(false);
    expect(swap("see x.md here", "see docs/adr/12-x.md here")).toBe(false);
    expect(swap("run `cat x.md`", "run `cat docs/adr/12-x.md`")).toBe(false);
    expect(swap("run `x.md foo`", "run `docs/adr/12-x.md foo`")).toBe(false);
    for (const path of ["docs/acceptance/a.md", "docs/roadmap.md"]) {
      expect(swap("see [x](x.md)", "see [x](../adr/12-x.md)", path)).toBe(false);
      expect(swap("see `x.md`", "see ADR-12", path)).toBe(false);
    }
    // without the changed file's path, as before #3620
    expect(isLinkSwap("see [x](x.md)", "see [x](../adr/12-x.md)", D, A)).toBe(false);
  });

  it("allows the item label 関連 Design Doc to become 関連 ADR on a swapped line", () => {
    const L = "[ADR-12](../adr/12-x.md)";
    expect(swap("  - 関連 Design Doc: [x.md](x.md)（注）", `  - 関連 ADR: ${L}（注）`)).toBe(true);
    expect(swap("- **関連 Design Doc**: [x.md](x.md)", `- **関連 ADR**: ${L}`)).toBe(true);
    expect(swap("- 関連 Design Doc：[x.md](x.md)", `- 関連 ADR：${L}`)).toBe(true);
    // Any bare .md name on the added line holds the label back, even the new
    // ADR's own file name as its link text: cutting links out of the line to
    // tell them apart joined or split the text around them (PR #3781).
    expect(swap("- 関連 Design Doc: [x.md](x.md)", "- 関連 ADR: [12-x.md](../adr/12-x.md)")).toBe(
      false,
    );
    expect(swap("- 関連 Design Doc: [x.md](x.md)", "- 関連 ADR: [x.md](../adr/12-x.md)")).toBe(
      false,
    );
    // Design Doc names around or across the link, which removing the link would hide
    for (const [before, after] of [
      ["- 関連 Design Doc: /[x.md](x.md)", "- 関連 ADR: /[x.md](../adr/12-x.md)"],
      ["- 関連 Design Doc: .[x.md](x.md)", "- 関連 ADR: .[x.md](../adr/12-x.md)"],
      ["- 関連 Design Doc: /[x.md](x.md)z.md", "- 関連 ADR: /[ADR-12](../adr/12-x.md)z.md"],
      ["- 関連 Design Doc: .[x.md](x.md)z.md", "- 関連 ADR: .[12-x.md](../adr/12-x.md)z.md"],
    ]) {
      expect(swap(before, after)).toBe(false);
    }
  });

  it("rejects any other label change", () => {
    const L = "[ADR-12](../adr/12-x.md)";
    const S = "[x.md](x.md)";
    // the label alone, the reverse direction, another word
    expect(swap(`- 関連 Design Doc: ${L}`, `- 関連 ADR: ${L}`)).toBe(false);
    expect(swap(`- 関連 ADR: ${S}`, `- 関連 Design Doc: ${L}`)).toBe(false);
    expect(swap(`- 関連 Design Doc: ${S}`, `- 承認済み ADR: ${L}`)).toBe(false);
    // not at the item's label position
    expect(swap(`- 注: 関連 Design Doc ${S}`, `- 注: 関連 ADR ${L}`)).toBe(false);
    expect(swap(`See 関連 Design Doc: ${S}`, `See 関連 ADR: ${L}`)).toBe(false);
    // indentation, the list marker, bold or the colon moved
    expect(swap(`- 関連 Design Doc: ${S}`, `  - 関連 ADR: ${L}`)).toBe(false);
    expect(swap(`- 関連 Design Doc: ${S}`, `* 関連 ADR: ${L}`)).toBe(false);
    expect(swap(`- 関連 Design Doc: ${S}`, `- **関連 ADR**: ${L}`)).toBe(false);
    expect(swap(`- 関連 Design Doc:${S}`, `- 関連 ADR：${L}`)).toBe(false);
  });

  it("rejects the label change while the line still refers to a Design Doc", () => {
    const L = "[ADR-12](../adr/12-x.md)";
    for (const rest of [
      "[z](../design/z.md)",
      "[z](./z.md)",
      "[z](z.md#a)",
      "`z.md`",
      "z.md",
      "docs/design/z.md",
      "docs/design/ 配下",
      "my-design/z.md",
    ]) {
      expect(swap(`- 関連 Design Doc: [x.md](x.md)、${rest}`, `- 関連 ADR: ${L}、${rest}`)).toBe(
        false,
      );
    }
  });

  it("allows a code span holding the Design Doc's reference to become ADR-<n>", () => {
    expect(swap("（`x.md` の D5）", "（ADR-12 の D5）")).toBe(true);
    // prose neighbours: Japanese text, brackets, a colon or period before a space
    expect(swap("設計は`x.md`の D5", "設計はADR-12の D5")).toBe(true);
    expect(swap("「`x.md`」", "「ADR-12」")).toBe(true);
    // ASCII parentheses may close a link destination opened on the line before
    expect(swap("see (`x.md`)", "see (ADR-12)")).toBe(false);
    expect(swap("`x.md`: the design", "ADR-12: the design")).toBe(true);
    expect(swap("（`./x.md#d5` の D5）", "（ADR-12 の D5）")).toBe(true);
    expect(swap("see `docs/design/x.md`.", "see ADR-12.", "docs/roadmap.md")).toBe(true);
  });

  it("rejects ADR-<n> that is not a standalone name of the same-stem ADR", () => {
    expect(swap("see `x.md`", "see ADR-12", IN, D, ["docs/adr/12-other.md"])).toBe(false);
    expect(swap("see `x.md`", "see ADR-120")).toBe(false);
    expect(swap("see `x.md`", "see `ADR-12`")).toBe(false);
    expect(swap("see `x.md`", "see [ADR-12](https://e.example/x)")).toBe(false);
    // The neighbouring character stays on both lines, so only the boundary rejects.
    for (const [before, after] of [
      ["see 1`x.md`", "see 1ADR-12"],
      ["see /`x.md`", "see /ADR-12"],
      ["see :`x.md`", "see :ADR-12"],
      ["see `x.md`a", "see ADR-12a"],
      ["see `x.md`.md", "see ADR-12.md"],
      ["see `x.md`/x", "see ADR-12/x"],
      ["https://e.example/?id=`x.md`", "https://e.example/?id=ADR-12"],
      ["https://e.example/#`x.md`", "https://e.example/#ADR-12"],
      ["<https://e.example/?a=1&`x.md`>", "<https://e.example/?a=1&ADR-12>"],
      ["https://e.example/?`x.md`", "https://e.example/?ADR-12"],
      ["see x.`x.md`", "see x.ADR-12"],
      ["see x-`x.md`", "see x-ADR-12"],
      ["see `x.md`-y", "see ADR-12-y"],
      // URLs: no line holding one counts as prose
      ["<https://e.example/?q=a+`x.md`>", "<https://e.example/?q=a+ADR-12>"],
      ["https://e.example/a;`x.md`", "https://e.example/a;ADR-12"],
      ["https://e.example/~`x.md`", "https://e.example/~ADR-12"],
      ["https://e.example/a%`x.md`", "https://e.example/a%ADR-12"],
      ["see <`x.md`>", "see <ADR-12>"],
      // inside a URL that markdown links
      ["https://e.example/（`x.md`）", "https://e.example/（ADR-12）"],
      // links and autolinks the link pattern does not see
      ['see [`x.md`](https://e.example/x "t")', 'see [ADR-12](https://e.example/x "t")'],
      ["see [a [`x.md`] b](https://e.example/x)", "see [a [ADR-12] b](https://e.example/x)"],
    ]) {
      expect(swap(before, after)).toBe(false);
    }
    // a name outside a code span, and the reverse direction
    expect(swap("see x.md", "see ADR-12")).toBe(false);
    expect(swap("see ADR-12 and `x.md`", "see `x.md` and ADR-12")).toBe(false);
  });

  it("pairs each ADR-<n> with the Design Doc of the same stem, by position", () => {
    const d = ["docs/design/foo.md", "docs/design/bar.md"];
    const a = ["docs/adr/12-foo.md", "docs/adr/13-bar.md"];
    expect(swap("`foo.md`、`bar.md`", "ADR-12、ADR-13", IN, d, a)).toBe(true);
    expect(swap("`foo.md`、`bar.md`", "ADR-13、ADR-12", IN, d, a)).toBe(false);
    // swapping positions within the line, with one stem and with two
    expect(swap("`x.md` と ADR-12", "ADR-12 と `x.md`")).toBe(false);
    expect(swap("`foo.md` と ADR-13", "ADR-13 と `foo.md`", IN, d, a)).toBe(false);
  });

  it("no longer accepts a whole-path code span swapped to an ADR of another stem", () => {
    expect(
      swap("`docs/design/x.md`", "`docs/adr/12-y.md`", "docs/roadmap.md", D, ["docs/adr/12-y.md"]),
    ).toBe(false);
  });

  it("rewrites a code span to ADR-<n> only where markdown reads prose", () => {
    for (const [before, after] of [
      // links and autolinks, whatever the words around the number
      [
        'see [the `x.md` doc](https://e.example/x "t")',
        'see [the ADR-12 doc](https://e.example/x "t")',
      ],
      [
        "see [a [b `x.md` c] d](https://e.example/x)",
        "see [a [b ADR-12 c] d](https://e.example/x)",
      ],
      ["(www.e.example/a,`x.md`)", "(www.e.example/a,ADR-12)"],
      ["see [a](https://e.example/x\u3000`x.md`)", "see [a](https://e.example/x\u3000ADR-12)"],
      // raw HTML
      ["<b>設計は`x.md`の</b>", "<b>設計はADR-12の</b>"],
      ["see <code>`x.md`</code>", "see <code>ADR-12</code>"],
      [
        'see <a href="https://e.example/">`x.md`</a>',
        'see <a href="https://e.example/">ADR-12</a>',
      ],
      // an identifier joined by underscores
      ["prefix_`x.md`", "prefix_ADR-12"],
      ["`x.md`_suffix", "ADR-12_suffix"],
      // a sibling's bare name in the text of a link the link pattern misses
      [
        'see [`x.md`](https://e.example/x "t")',
        'see [`docs/adr/12-x.md`](https://e.example/x "t")',
      ],
      // code spans the single-backtick pattern misreads
      ["`` a ` `x.md` ``", "`` a ` ADR-12 ``"],
      ["`a [l](t) `x.md` b`", "`a [l](t) ADR-12 b`"],
    ]) {
      expect(swap(before, after)).toBe(false);
    }
  });

  it("rewrites a code span to ADR-<n> on a nested item, but not on a line a browser may read a URL in", () => {
    // a nested item indented four spaces is prose in its document
    expect(swap("    設計は`x.md`の D5", "    設計はADR-12の D5")).toBe(true);
    expect(swap("    3. 詳細は `x.md` の D5", "    3. 詳細は ADR-12 の D5")).toBe(true);
    for (const [before, after] of [
      ["`@import`の扱いは`x.md`の D5", "`@import`の扱いはADR-12の D5"],
      ["see [the `x.md` doc][r]", "see [the ADR-12 doc][r]"],
      ["see [^a `x.md` b]", "see [^a ADR-12 b]"],
      ["mailto:a@`x.md`", "mailto:a@ADR-12"],
      // a URL with an invisible character, which GitHub keeps inside the URL
      ["https://e.example\uFEFF`x.md`", "https://e.example\uFEFFADR-12"],
      // the rest of a link destination, a title or an HTML attribute opened on
      // an earlier line, which a line pair cannot see
      ["`x.md`)", "ADR-12)"],
      ["foo `x.md`?q=1)", "foo ADR-12?q=1)"],
      ['foo `x.md` "title"', 'foo ADR-12 "title"'],
      ["foo `x.md`'", "foo ADR-12'"],
      ["href=`x.md`", "href=ADR-12"],
      ['`x.md`">link</a>', 'ADR-12">link</a>'],
      // a reference definition's destination on its own line
      ["`x.md`", "ADR-12"],
    ]) {
      expect(swap(before, after)).toBe(false);
    }
  });

  it("accepts ADR-<n> beside a full-width paren, in bold, and after a label's full-width colon", () => {
    expect(
      swap("既存設計は`x.md`（拡張ホスト）を参照", "既存設計はADR-12（拡張ホスト）を参照"),
    ).toBe(true);
    expect(swap("**`x.md`** を読む", "**ADR-12** を読む")).toBe(true);
    expect(swap("- 関連 Design Doc：`x.md`", "- 関連 ADR：ADR-12")).toBe(true);
  });

  it("requires the added line to refer to a new ADR, and ADR-<n> to share a deleted stem", () => {
    expect(swap("[x.md](../design/x.md)", "[docs/design/x.md](../design/x.md)")).toBe(false);
    expect(
      swap(
        "`docs/adr/12-other.md` と docs/design/x.md",
        "ADR-12 と docs/adr/12-other.md",
        "docs/roadmap.md",
        D,
        ["docs/adr/12-other.md"],
      ),
    ).toBe(false);
  });

  it("swaps a path inside a link target that is not a whole reference, as before", () => {
    expect(
      swap("[a](../design/x.md?plain=1)", "[a](../adr/12-x.md?plain=1)", "docs/roadmap.md"),
    ).toBe(true);
  });

  it("compares references as symbols, as the Design Doc does (kompiro on #3781)", () => {
    // a swap back to the Design Doc happens only in a revert, which is meant
    expect(swap("`x.md` と `docs/adr/12-x.md`", "ADR-12 と `x.md`")).toBe(true);
    expect(swap("[x](x.md) と [x](../adr/12-x.md)", "[x](../adr/12-x.md) と [x](x.md)")).toBe(true);
    expect(
      swap(
        "see [a](../design/x.md) and [b](../design/x.md)",
        "see [a](../adr/12-x.md) and [b](../design/x.md)",
      ),
    ).toBe(true);
    // an ADR-<n> already on the line is not one the swap wrote, so it stays out of Low
    expect(
      swap(
        "see `docs/design/x.md` (ADR-12).",
        "see `docs/adr/12-x.md` (ADR-12).",
        "docs/roadmap.md",
      ),
    ).toBe(false);
    expect(swap("see `x.md` (ADR-12).", "see ADR-12 (ADR-12).")).toBe(false);
    // ... also on a line that does not take D3
    expect(
      swap("see [x](../design/x.md) ADR-12", "see [x](../adr/12-x.md) ADR-12", "docs/roadmap.md"),
    ).toBe(false);
  });

  it("pairs a code span between two new ADRs only within one stem", () => {
    const a = ["docs/adr/12-x.md", "docs/adr/5-a.md", "docs/adr/6-b.md"];
    expect(swap("`x.md` `docs/adr/5-a.md`", "`docs/adr/12-x.md` `docs/adr/6-b.md`", IN, D, a)).toBe(
      false,
    );
    expect(swap("`x.md` `docs/adr/5-a.md`", "`docs/adr/12-x.md` `../adr/5-a.md#b`", IN, D, a)).toBe(
      true,
    );
    // an ADR-<n> already on the line keeps it out, even with same-stem twins
    const twins = ["docs/adr/12-x.md", "docs/adr/13-x.md"];
    expect(swap("`x.md` ADR-12 の D5", "ADR-12 ADR-13 の D5", IN, D, twins)).toBe(false);
  });

  it("never lowers a High path through the new forms", () => {
    const spec = modified("docs/spec/syntax.md", {
      hunks: [
        {
          oldStart: 3,
          removed: ["- 関連 Design Doc: `docs/design/x.md` の D5"],
          newStart: 3,
          added: ["- 関連 ADR: ADR-12 の D5"],
        },
      ],
    });
    expect(tierOf(added("docs/adr/12-x.md"), deleted("docs/design/x.md"), spec)).toBe("high");
  });

  describe("the promotions that motivated it", () => {
    const hunk = (before: string, after: string) => ({
      oldStart: 9,
      removed: [before],
      newStart: 9,
      added: [after],
    });

    it("classifies #3621 (ADR-3038) as Low", () => {
      const recall = modified("docs/design/tpl-changed-files-recall.md", {
        hunks: [
          hunk(
            "  - 関連 Design Doc: [`tpl-enforcement-status.md`](tpl-enforcement-status.md)（#3038。D5 で本件を分けた）",
            "  - 関連 ADR: [ADR-3038](../adr/3038-tpl-enforcement-status.md)（#3038。D5 で本件を分けた）",
          ),
          hunk(
            "TPL を結ぶ鍵が無いので、設計を分けた（`tpl-enforcement-status.md` の D5）。",
            "TPL を結ぶ鍵が無いので、設計を分けた（ADR-3038 の D5）。",
          ),
        ],
      });
      expect(
        tierOf(
          added("docs/adr/3038-tpl-enforcement-status.md"),
          deleted("docs/design/tpl-enforcement-status.md"),
          recall,
        ),
      ).toBe("low");
    });

    it("keeps #3352 (ADR-2922) out of Low, because it also rewrites a note", () => {
      const channel = modified("docs/design/vscode-pre-release-channel.md", {
        hunks: [
          hunk(
            "  - 関連 Design Doc: [monthly-release-train.md](monthly-release-train.md)（月次トレイン。ADR 昇格待ち）",
            "  - 関連 ADR: [ADR-2922](../adr/2922-monthly-release-train.md)（月次トレイン）",
          ),
        ],
      });
      const adr = added("docs/adr/2922-monthly-release-train.md");
      const design = deleted("docs/design/monthly-release-train.md");
      expect(tierOf(adr, design, channel)).toBe("design");
    });
  });
});

describe("isLinkInsert", () => {
  const A = ["docs/adr/12-x.md"];
  const L = "[ADR-12](../adr/12-x.md)";
  const judge = (lines: string[], adrs: readonly string[] = A) => {
    const { hunk, after } = hunkBetween(AT_DOC, lines);
    return isLinkInsert(hunk, after, adrs, "docs/acceptance/x.md");
  };
  const OLD = "[ADR-7](../adr/7-y.md)";

  it("accepts an ADR line that gains links at the start or end of its value", () => {
    expect(judge(editAt(8, `- **関連 ADR**: ${L}、${OLD}`))).toBe(true);
    expect(judge(editAt(8, `- **関連 ADR**: ${OLD}, ${L}`))).toBe(true);
    expect(judge(editAt(8, `- **関連 ADR**: ${OLD}、${L}、${L}`))).toBe(true);
  });

  it("accepts a new ADR line right after another item, or an empty one filled", () => {
    expect(judge(insertAt(9, `- **設計 (ADR)**: ${L}`))).toBe(true);
    expect(judge(insertAt(8, "- **設計 (ADR)**：[12-x.md](../adr/12-x.md)"))).toBe(true);
    const empty = insertAt(9, "- **設計 (ADR)**:");
    const { hunk, after } = hunkBetween(empty, insertAt(9, `- **設計 (ADR)**: ${L}`));
    expect(isLinkInsert(hunk, after, A, "docs/acceptance/x.md")).toBe(true);
  });

  it("rejects a hunk that adds no link to a new ADR, or has no record to place it in", () => {
    expect(judge(insertAt(9, "- **設計 (ADR)**:"))).toBe(false);
    expect(judge(insertAt(9, "- **設計 (ADR)**: [ADR-7](../adr/7-y.md)"))).toBe(false);
    expect(judge(insertAt(9, `- **設計 (ADR)**: ${L}`), [])).toBe(false);
    const { hunk } = hunkBetween(AT_DOC, insertAt(9, `- **設計 (ADR)**: ${L}`));
    expect(isLinkInsert(hunk, null, A, "docs/acceptance/x.md")).toBe(false);
    expect(
      isLinkInsert({ ...hunk, newStart: 2 }, AT_DOC.join("\n"), A, "docs/acceptance/x.md"),
    ).toBe(false);
  });

  it("rejects a link whose text names another ADR, no ADR, or carries an anchor", () => {
    const two = ["docs/adr/12-x.md", "docs/adr/13-y.md"];
    expect(judge(insertAt(9, "- **設計 (ADR)**: [ADR-12](../adr/13-y.md)"), two)).toBe(false);
    expect(judge(insertAt(9, "- **設計 (ADR)**: [run this](../adr/12-x.md)"))).toBe(false);
    expect(judge(insertAt(9, "- **設計 (ADR)**: [ADR-12](https://evil.example/adr/12-x.md)"))).toBe(
      false,
    );
    expect(judge(insertAt(9, "- **設計 (ADR)**: [ADR-12](../adr/12-x.md#no-manual-check)"))).toBe(
      false,
    );
    // Resolved from the AT, these do not reach docs/adr/12-x.md.
    expect(judge(insertAt(9, "- **設計 (ADR)**: [ADR-12](adr/12-x.md)"))).toBe(false);
    expect(judge(insertAt(9, "- **設計 (ADR)**: [ADR-12](../../docs/adr/12-x.md)"))).toBe(true);
    expect(judge(insertAt(9, "- **設計 (ADR)**: [ADR-12](/docs/adr/12-x.md)"))).toBe(false);
  });

  it("rejects a line that is not an ADR line of the metadata list", () => {
    // Any other label would let a new claim in under cover of the link.
    expect(judge(insertAt(9, `- **承認済み**: ${L}`))).toBe(false);
    expect(judge(insertAt(9, `  - **関連 ADR**: ${L}`))).toBe(false);
    // An ADR line anywhere else would change the structure around it.
    expect(judge(insertAt(0, `- **関連 ADR**: ${L}`))).toBe(false); // above the frontmatter
    expect(judge(insertAt(2, `- **関連 ADR**: ${L}`))).toBe(false); // inside it
    expect(judge(insertAt(10, `- **関連 ADR**: ${L}`))).toBe(false); // after a blank line
    expect(judge(insertAt(13, `- **関連 ADR**: ${L}`))).toBe(false); // inside a table
    expect(judge(insertAt(17, `- **関連 ADR**: ${L}`))).toBe(false); // in a code fence
    expect(judge(editAt(16, `- **関連 ADR**: ${OLD}、${L}`))).toBe(false); // edited in a fence
    // In the body, the same line is no metadata.
    expect(judge(insertAt(24, `- **関連 ADR**: ${L}`))).toBe(false); // between 手順 and 期待
    expect(judge(editAt(24, `- **関連 ADR**: ${L}`, "- **期待**: ok"))).toBe(false);
    // A link put in front of structure would break it.
    expect(judge(editAt(19, `${L}, - [ ] AT-A: 確かめる`))).toBe(false);
    expect(judge(editAt(10, `${L}、## 受け入れ条件`))).toBe(false);
  });

  it("rejects a new line that would take over what follows the item above", () => {
    const withSubList = [
      "# AT: x",
      "",
      "- **対象ファイル**:",
      "  - `a.ts`",
      "- **関連 ADR**: [ADR-7](../adr/7-y.md)",
    ];
    const at = (i: number, doc: string[]) => [
      ...doc.slice(0, i),
      `- **設計 (ADR)**: ${L}`,
      ...doc.slice(i),
    ];
    const judgeDoc = (before: string[], after: string[]) => {
      const { hunk, after: text } = hunkBetween(before, after);
      return isLinkInsert(hunk, text, A, "docs/acceptance/x.md");
    };
    expect(judgeDoc(withSubList, at(3, withSubList))).toBe(false); // the sub-list would follow it
    const lazy = [
      "# AT: x",
      "",
      "- **期待**:",
      "結果が出る",
      "- **関連 ADR**: [ADR-7](../adr/7-y.md)",
    ];
    expect(judgeDoc(lazy, at(3, lazy))).toBe(false); // a lazy continuation would follow it
    expect(judgeDoc(withSubList, at(5, withSubList))).toBe(true); // the end of the list
    expect(judgeDoc(withSubList, at(4, withSubList))).toBe(true); // after the sub-list
    const blankThenSub = ["# AT: x", "", "- **対象ファイル**:", "", "  - `a.ts`", ""];
    expect(judgeDoc(blankThenSub, at(3, blankThenSub))).toBe(false); // the sub-list after the blank
    const blankThenText = ["# AT: x", "", "- **日付**: 2026-10-30", "", "本文", ""];
    expect(judgeDoc(blankThenText, at(3, blankThenText))).toBe(true); // the list ends there
    const quoted = ["# AT: x", "", "- **日付**: 2026-10-30", "", "> 説明", "> 続き", ""];
    expect(judgeDoc(quoted, at(6, quoted))).toBe(false); // after a blockquote, not the list
  });

  it("rejects any other change on the ADR line or in the hunk", () => {
    expect(
      judge(editAt(8, `- **関連 ADR**: [ADR-6](../adr/6-z.md)、${L}、[ADR-7](../adr/7-y.md)`)),
    ).toBe(false); // the middle of the value

    expect(judge(editAt(8, `- **関連 ADR（完了）**: ${OLD}、${L}`))).toBe(false);
    expect(judge(editAt(8, `- **関連 ADR**:  ${OLD}、${L}`))).toBe(false);
    expect(judge(editAt(8, `- **関連 ADR**: ${OLD}、${L}  `))).toBe(false);
    expect(judge(insertAt(9, `- **設計 (ADR)**: ${L} を参照`))).toBe(false);
    expect(judge(insertAt(9, `- **設計 (ADR)**: ${L}`, "- **手動確認**:"))).toBe(false);
  });
});

describe("ADR_GENERATED_GLOBS", () => {
  it("names the same paths as adr.config.json paths.outputs", () => {
    const config = readAdrPaths(readFileSync(resolve(REPO_ROOT, "adr.config.json"), "utf-8"));
    expect([...ADR_GENERATED_GLOBS].sort()).toEqual(rootGlobs(config));
  });
});

describe("regenerationWaivesRecord", () => {
  const configs = {
    adr: readFileSync(resolve(REPO_ROOT, "adr.config.json"), "utf-8"),
    tpl: readFileSync(resolve(REPO_ROOT, "tpl.config.json"), "utf-8"),
  };
  const waives = (
    nameStatus: string,
    extra: Partial<Parameters<typeof regenerationWaivesRecord>[0]> = {},
  ) =>
    regenerationWaivesRecord({
      tier: "low",
      baseConfigs: configs,
      headConfigs: configs,
      nameStatus,
      ...extra,
    });
  const regeneration = "M\0docs/adr/effective.md\0A\0docs/adr/graph/x.md\0";

  it("waives the record for a Low PR that changes only generated files", () => {
    expect(waives(regeneration)).toBe(true);
  });

  it("keeps the record for a PR that also changes an ADR", () => {
    expect(waives(`${regeneration}A\0docs/adr/3416-x.md\0`)).toBe(false);
  });

  it("keeps the record for a PR that changes no generated file", () => {
    expect(waives("A\0docs/adr/3416-x.md\0")).toBe(false);
  });

  it("keeps the record above Low", () => {
    expect(waives(regeneration, { tier: "medium" })).toBe(false);
  });

  it("waives the record for a PR that changes only the TPL index", () => {
    expect(waives("A\0docs/test-perspectives/index.md\0")).toBe(true);
    expect(waives(`${regeneration}M\0docs/test-perspectives/index.md\0`)).toBe(true);
  });

  it("keeps the record for a PR that writes the TPL index with a TPL", () => {
    expect(
      waives("A\0docs/test-perspectives/TPL-3289-x.md\0M\0docs/test-perspectives/index.md\0"),
    ).toBe(false);
  });

  it("keeps the record when adr.config.json is missing or a config is unreadable", () => {
    expect(waives(regeneration, { baseConfigs: { ...configs, adr: null } })).toBe(false);
    expect(waives(regeneration, { headConfigs: { ...configs, adr: "{" } })).toBe(false);
    expect(waives(regeneration, { headConfigs: { ...configs, tpl: "{" } })).toBe(false);
  });

  it("keeps the record when the outputs differ between base and head", () => {
    const moved = JSON.stringify({
      paths: { adrDir: "docs/adr", outputs: { effective: "effective.md" } },
    });
    expect(waives(regeneration, { headConfigs: { ...configs, adr: moved } })).toBe(false);
    const noIndex = JSON.stringify({ idFormat: "issue-number" });
    expect(waives(regeneration, { baseConfigs: { ...configs, tpl: noIndex } })).toBe(false);
  });
});

describe("unknownRiskLabels", () => {
  it("names risk labels that are not one of the four tiers", () => {
    expect(unknownRiskLabels(["risk: high", "risk: experimental", "risk:low", "bug"])).toEqual([
      "risk: experimental",
      "risk:low",
    ]);
  });
});

describe("labelTier", () => {
  it("is null without a risk label and the strictest one otherwise", () => {
    expect(labelTier(["documentation"])).toBeNull();
    expect(labelTier(["risk: low"])).toBe("low");
    expect(labelTier(["risk: low", "risk: high"])).toBe("high");
  });
});

describe("excludedPathFilters", () => {
  it("reads the excluded globs from the repository's .coderabbit.yaml", () => {
    const globs = excludedPathFilters(readFileSync(resolve(REPO_ROOT, ".coderabbit.yaml"), "utf8"));
    expect(globs).toContain("pnpm-lock.yaml");
    expect(globs).toContain("docs/adr/effective.md");
    expect(globs.every((g) => !g.startsWith("!"))).toBe(true);
  });

  it("stops at the end of the block and skips included entries", () => {
    const yaml = `reviews:
  path_filters:
    # comment
    - "!a/**"
    - "b/**"
    - '!c.md'
  path_instructions:
    - path: "!d"
`;
    expect(excludedPathFilters(yaml)).toEqual(["a/**", "c.md"]);
  });
});

/** A diff of one file with the given hunks, as `git diff -U0` prints it. */
const diffOf = (file: string, ...hunks: string[]) =>
  [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, ...hunks].join("\n");

describe("diffFingerprint", () => {
  const same = (a: string, b: string, excluded: string[] = []) =>
    diffFingerprint(a, excluded) === diffFingerprint(b, excluded);

  it("is the same when only hunk positions moved, as a merge of main does", () => {
    expect(
      same(
        diffOf("docs/test-perspectives/README.md", "@@ -582,0 +583 @@", "+| [TPL-3286] |"),
        diffOf("docs/test-perspectives/README.md", "@@ -583,0 +584 @@", "+| [TPL-3286] |"),
      ),
    ).toBe(true);
  });

  it("differs when the resolution rewrote one of the PR's lines", () => {
    expect(
      same(
        diffOf("a.md", "@@ -1,0 +2 @@", "+one"),
        diffOf("a.md", "@@ -1,0 +2 @@", "+one, merged"),
      ),
    ).toBe(false);
  });

  it("differs when lines in one file are reordered", () => {
    expect(
      same(
        diffOf("a.md", "@@ -1,0 +2,2 @@", "+one", "+two"),
        diffOf("a.md", "@@ -1,0 +2,2 @@", "+two", "+one"),
      ),
    ).toBe(false);
  });

  it("differs when a line moves to another file or occurs a different number of times", () => {
    expect(
      same(diffOf("a.md", "@@ -1,0 +2 @@", "+same"), diffOf("b.md", "@@ -1,0 +2 @@", "+same")),
    ).toBe(false);
    expect(
      same(
        diffOf("a.md", "@@ -1,0 +2 @@", "+x"),
        diffOf("a.md", "@@ -1,0 +2 @@", "+x", "@@ -9,0 +11 @@", "+x"),
      ),
    ).toBe(false);
  });

  it("differs on a mode-only change and on a binary change", () => {
    const mode = (m: string) =>
      [`diff --git a/run.sh b/run.sh`, "old mode 100644", `new mode ${m}`].join("\n");
    expect(same(mode("100755"), mode("100644"))).toBe(false);
    const bin = (blob: string) =>
      [
        "diff --git a/i.png b/i.png",
        `index ${"1".repeat(40)}..${blob} 100644`,
        "Binary files a/i.png and b/i.png differ",
      ].join("\n");
    expect(same(bin("2".repeat(40)), bin("3".repeat(40)))).toBe(false);
    expect(same(bin("2".repeat(40)), bin("2".repeat(40)))).toBe(true);
  });

  it("leaves out files CodeRabbit does not read", () => {
    const before = [
      diffOf("a.md", "@@ -1,0 +2 @@", "+one"),
      diffOf("pnpm-lock.yaml", "@@ -1 +1 @@", "-x", "+y"),
    ].join("\n");
    const after = [
      diffOf("a.md", "@@ -1,0 +2 @@", "+one"),
      diffOf("pnpm-lock.yaml", "@@ -1 +1 @@", "-x", "+z"),
    ].join("\n");
    expect(same(before, after)).toBe(false);
    expect(same(before, after, ["pnpm-lock.yaml"])).toBe(true);
  });
});

describe("unquoteGitPath", () => {
  it("decodes git's C-style quoting, octal UTF-8 bytes included", () => {
    expect(unquoteGitPath('"a/d\\303\\251.md"')).toBe("a/dé.md");
    expect(unquoteGitPath('"b/say \\"hi\\".md"')).toBe('b/say "hi".md');
    expect(unquoteGitPath("a/plain.md")).toBeNull();
  });
});

describe("parseDiff", () => {
  it("reads quoted paths, and paths of sections with no ---/+++ lines", () => {
    const files = parseDiff(
      [
        'diff --git "a/.github/workflows/d\\303\\251.yml" "b/.github/workflows/d\\303\\251.yml"',
        "new file mode 100644",
        "--- /dev/null",
        '+++ "b/.github/workflows/d\\303\\251.yml"',
        "@@ -0,0 +1 @@",
        "+on: push",
        'diff --git "a/scripts/bin/\\303\\274" "b/scripts/bin/\\303\\274"',
        "new file mode 100755",
        `index ${"0".repeat(40)}..e69de29bb2d1d6434b8b29ae775ad8c2e48c5391`,
        "diff --git a/i.png b/i.png",
        "Binary files a/i.png and b/i.png differ",
      ].join("\n"),
    );
    expect(files.map((f) => f.path)).toEqual([
      ".github/workflows/dé.yml",
      "scripts/bin/ü",
      "i.png",
    ]);
    expect(
      classifyChange({
        files: files.map((f) => ({ path: f.path, status: f.status, hunks: f.hunks })),
        author: "kompiro",
      }),
    ).toMatchObject({ tier: "high", securityReview: true });
  });

  it("keeps a section whose path it cannot read, under a path that classifies High", () => {
    const [f] = parseDiff(["diff --git x y", "Binary files x and y differ"].join("\n"));
    expect(f.path).toBe(UNREADABLE_PATH);
  });

  it("reads a removed `-- x` or an added `++ x` as content, not as a file header", () => {
    // Inside a hunk, git prints them as `--- x` and `+++ x`.
    const [f] = parseDiff(diffOf("db/schema.sql", "@@ -3 +3 @@", "--- old comment", "+++ new"));
    expect(f.path).toBe("db/schema.sql");
    expect(f.hunks[0]).toEqual({
      oldStart: 3,
      removed: ["-- old comment"],
      newStart: 3,
      added: ["++ new"],
    });
  });

  it("names a deleted file by its old path and reads added and deleted status", () => {
    const [gone, born] = parseDiff(
      [
        "diff --git a/gone.md b/gone.md",
        "deleted file mode 100644",
        "--- a/gone.md",
        "+++ /dev/null",
        "@@ -1 +0,0 @@",
        "-bye",
        "diff --git a/new.md b/new.md",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/new.md",
        "@@ -0,0 +1 @@",
        "+hi",
      ].join("\n"),
    );
    expect([gone.path, gone.status]).toEqual(["gone.md", "deleted"]);
    expect([born.path, born.status]).toEqual(["new.md", "added"]);
  });
});

describe("lineInDiff", () => {
  const diff = diffOf(
    "docs/design/x.md",
    "@@ -10,0 +11,3 @@",
    "+a",
    "+b",
    "+c",
    "@@ -40 +43,0 @@",
    "-gone",
  );

  it("is inside when the finding overlaps an added range", () => {
    expect(lineInDiff(diff, "docs/design/x.md", 12)).toBe("inside");
    expect(lineInDiff(diff, "docs/design/x.md", 9, 11)).toBe("inside");
  });

  it("is outside for lines the PR did not change, and for other files", () => {
    expect(lineInDiff(diff, "docs/design/x.md", 30)).toBe("outside");
    expect(lineInDiff(diff, "docs/design/x.md", 43)).toBe("outside");
    expect(lineInDiff(diff, "docs/other.md", 12)).toBe("outside");
  });

  it("is unknown for a finding with no file or line, which stays in the PR's scope", () => {
    expect(lineInDiff(diff, undefined, 12)).toBe("unknown");
    expect(lineInDiff(diff, "docs/design/x.md", undefined)).toBe("unknown");
  });
});

describe("readFailure", () => {
  it("reads 404 and 410 as a reference the PR has to fix", () => {
    expect(readFailure("gh: Not Found (HTTP 404)")).toBe("missing");
    expect(readFailure("gh: This issue was deleted (HTTP 410)")).toBe("missing");
  });

  it("reads anything else as a fact that could not be read, which a rerun may fix", () => {
    expect(readFailure("gh: Server Error (HTTP 502)")).toBe("unreadable");
    expect(readFailure("gh: API rate limit exceeded (HTTP 403)")).toBe("unreadable");
    expect(readFailure("error connecting to api.github.com")).toBe("unreadable");
    expect(readFailure("")).toBe("unreadable");
  });
});

describe("checkExitCode", () => {
  it("fails on a broken rule and on an unread fact, with different codes", () => {
    expect(checkExitCode({ errors: [], unreadable: [] })).toBe(0);
    expect(checkExitCode({ errors: ["x"], unreadable: [] })).toBe(1);
    expect(checkExitCode({ errors: [], unreadable: ["y"] })).toBe(4);
  });

  it("lets a broken rule outrank an unread fact: the PR has to change either way", () => {
    expect(checkExitCode({ errors: ["x"], unreadable: ["y"] })).toBe(1);
  });
});

describe("tierSummary (#3543)", () => {
  const files = [
    { path: "docs/spec/syntax.md", tier: "high" as const },
    { path: "packages/core/a.ts", tier: "medium" as const },
  ];
  const summary = (extra: Partial<Parameters<typeof tierSummary>[0]> = {}) =>
    tierSummary({ effective: "high", trustedAuthor: true, files, ...extra });

  it("tells the reviewer to read the High files and For Reviewers on a High PR", () => {
    expect(summary().split("\n")).toEqual([
      "### Files by tier",
      "",
      "The PR is High. The reviewer reads the High files below and the PR's `## For Reviewers` section.",
      "",
      "| Tier | File |",
      "| --- | --- |",
      "| high | <code>docs/spec/syntax.md</code> |",
      "| medium | <code>packages/core/a.ts</code> |",
      "",
    ]);
  });

  it.each([
    ["no file is High", { files: [files[1]] }, "its label (or a missing one)"],
    ["the author is not trusted", { trustedAuthor: false }, "not on the trusted list"],
    [
      "a diff section could not be read",
      {
        files: [
          ...files,
          {
            path: classifyChange({ files: [modified(UNREADABLE_PATH)], author: "kompiro" }).files[0]
              .path,
            tier: "high" as const,
          },
        ],
      },
      "could not be read",
    ],
  ])("asks for the whole diff when %s", (_, extra, why) => {
    const text = summary(extra);
    expect(text).toContain("The reviewer reads the whole diff");
    expect(text).toContain(why);
    expect(text).not.toContain("High files below");
  });

  it("names the tier without a reading line below High", () => {
    const text = summary({ effective: "medium", files: [files[1]] });
    expect(text).toContain("The PR is medium.");
    expect(text).not.toContain("reviewer reads");
  });

  const many = (high: number, medium: number) => [
    ...Array.from({ length: high }, (_, i) => ({
      path: `docs/spec/${i}.md`,
      tier: "high" as const,
    })),
    ...Array.from({ length: medium }, (_, i) => ({
      path: `packages/core/${i}.ts`,
      tier: "medium" as const,
    })),
  ];

  it("lists the first 200 files strictest first and counts the rest", () => {
    const rows = summary({ files: many(150, 100) }).split("\n");
    expect(rows.filter((l) => l.startsWith("| high"))).toHaveLength(150);
    expect(rows.filter((l) => l.startsWith("| medium"))).toHaveLength(50);
    expect(rows).toContain("50 more files are not listed.");
    expect(rows).toContain(
      "The PR is High. The reviewer reads the High files below and the PR's `## For Reviewers` section.",
    );
    expect(summary({ files: many(150, 51) })).toContain("1 more file is not listed.");
  });

  it("asks for the whole diff when the High files do not fit in the rows", () => {
    const text = summary({ files: many(201, 0) });
    expect(text).toContain("more High files than the 200 rows listed");
    expect(text).toContain("The reviewer reads the whole diff");
  });

  it("cuts a path past 200 code points and keeps the table under 1 MiB", () => {
    const long = `${"|".repeat(4000)}.md`;
    const text = summary({
      files: Array.from({ length: 300 }, () => ({ path: long, tier: "high" as const })),
    });
    expect(text).toContain(`<code>${"&#124;".repeat(200)}&#8230;</code>`);
    expect(Buffer.byteLength(text)).toBeLessThan(1024 * 1024);
  });

  it.each([
    ["a|b.md", "a&#124;b.md"],
    ["a`b`.md", "a&#96;b&#96;.md"],
    ["[x](https://e.example).md", "&#91;x&#93;&#40;https&#58;//e.example&#41;.md"],
    ["<img src=x>.md", "&#60;img&#32;src&#61;x&#62;.md"],
    ["a\n| high | b.md", "a&#10;&#124;&#32;high&#32;&#124;&#32;b.md"],
    ["_x_/*y*.md", "&#95;x&#95;/&#42;y&#42;.md"],
  ])("renders the path %j as literal text in one cell", (path, cell) => {
    const rows = summary({ files: [{ path, tier: "high" }] })
      .split("\n")
      .filter((l) => l.startsWith("| high"));
    expect(rows).toEqual([`| high | <code>${cell}</code> |`]);
  });
});

const issueLink = (n: number) => `[#${n}](https://github.com/kompiro/karasu/issues/${n})`;
const designDoc = (trigger: string, parent = issueLink(3546)) =>
  [
    "# Title",
    "",
    "- **関連**:",
    `  - 引き金 Issue: ${trigger}`,
    `  - 親 Issue: ${parent}`,
    "",
    "## 背景・課題",
    "",
    `- 引き金 Issue: ${issueLink(9999)}`,
  ].join("\n");

describe("triggerIssues (#3542)", () => {
  it("reads every Issue link on the 引き金 Issue line", () => {
    expect(triggerIssues(designDoc(`${issueLink(3542)}（A）、${issueLink(3543)}（B）`))).toEqual([
      3542, 3543,
    ]);
  });

  it("ignores a bare #N in the line's prose, the parent line, and lines below the metadata", () => {
    expect(triggerIssues(designDoc(`${issueLink(3542)}（#3505 の制約）`))).toEqual([3542]);
    expect(triggerIssues(designDoc("#3542"))).toEqual([]);
  });

  it("ignores a link inside the line's full-width parenthesized prose", () => {
    expect(
      triggerIssues(designDoc(`${issueLink(3542)}（${issueLink(2917)} の再点検で切り出した）`)),
    ).toEqual([3542]);
  });

  it("ignores a link to another repository", () => {
    expect(
      triggerIssues(designDoc("[#3542](https://github.com/other/karasu/issues/3542)")),
    ).toEqual([]);
  });
});

describe("backingDesignDoc (#3542)", () => {
  const DOC = "docs/design/agreed.md";
  const BLOB = "1".repeat(40);
  const docFacts = (over: Partial<DesignDocFacts> = {}): DesignDocFacts => ({
    docsAtMergeBase: () => [
      { path: DOC, text: designDoc(issueLink(3542)) },
      { path: "docs/design/TEMPLATE.md", text: designDoc(issueLink(3542)) },
      { path: "docs/design/other.md", text: designDoc(issueLink(1)) },
    ],
    blobs: () => ({ mergeBase: BLOB, tip: BLOB }),
    history: () => ({ shas: ["a".repeat(40), "b".repeat(40)], renamed: false }),
    commitTier: () => "design",
    ...over,
  });
  const back = (over: Partial<Parameters<typeof backingDesignDoc>[0]> = {}) =>
    backingDesignDoc({
      baseRefName: "main",
      closes: [3542],
      changed: ["docs/spec/syntax.md"],
      facts: docFacts(),
      ...over,
    });

  it("backs a PR with the one Design Doc whose 引き金 Issue line links an Issue it closes", () => {
    expect(back()).toEqual({ state: "backed", path: DOC, blob: BLOB });
  });

  it.each([
    ["the base is not main", { baseRefName: "feat/lower" }, "base is not main"],
    ["the PR closes no Issue", { closes: [] }, "closes no Issue"],
    ["no Design Doc links the Issue", { closes: [7] }, "no Design Doc"],
    ["the PR changes the Design Doc", { changed: [DOC] }, "the PR changes"],
    [
      "main's tip has another blob",
      { facts: docFacts({ blobs: () => ({ mergeBase: BLOB, tip: "2".repeat(40) }) }) },
      "merge main",
    ],
    [
      "main's tip has no such file",
      { facts: docFacts({ blobs: () => ({ mergeBase: BLOB, tip: null }) }) },
      "merge main",
    ],
    [
      "the merge base has no such file",
      { facts: docFacts({ blobs: () => ({ mergeBase: null, tip: null }) }) },
      "merge main",
    ],
    [
      "the history is empty",
      { facts: docFacts({ history: () => ({ shas: [], renamed: false }) }) },
      "no history",
    ],
    [
      "the history goes through a rename",
      { facts: docFacts({ history: () => ({ shas: ["a".repeat(40)], renamed: true }) }) },
      "renamed",
    ],
    [
      "an earlier commit was Medium though the last was Design",
      {
        facts: docFacts({ commitTier: (sha) => (sha.startsWith("b") ? "medium" : "design") }),
      },
      "medium change",
    ],
    [
      "a commit was High (a Design Doc changed in a High PR is not read as a design)",
      { facts: docFacts({ commitTier: () => "high" }) },
      "high change",
    ],
    [
      "two Design Docs link the Issue",
      {
        facts: docFacts({
          docsAtMergeBase: () => [
            { path: DOC, text: designDoc(issueLink(3542)) },
            { path: "docs/design/second.md", text: designDoc(issueLink(3542)) },
          ],
        }),
      },
      "more than one",
    ],
  ])("gives no backing when %s", (_, over, reason) => {
    const b = back(over);
    expect(b.state).toBe("none");
    expect(b.state === "none" && b.reason).toContain(reason);
  });

  it("never uses the template, even when it links the Issue", () => {
    const onlyTemplate = docFacts({
      docsAtMergeBase: () => [
        { path: "docs/design/TEMPLATE.md", text: designDoc(issueLink(3542)) },
      ],
    });
    expect(back({ facts: onlyTemplate }).state).toBe("none");
  });

  it("does not take an Issue named only on the parent line", () => {
    const parentOnly = docFacts({
      docsAtMergeBase: () => [{ path: DOC, text: designDoc(issueLink(1), issueLink(3542)) }],
    });
    expect(back({ facts: parentOnly }).state).toBe("none");
  });
});

describe("tierSummary with a backing Design Doc (#3542)", () => {
  const files = [
    { path: "docs/spec/syntax.md", tier: "high" as const, boundary: false, narrowable: true },
    { path: "packages/cli/src/serve.ts", tier: "high" as const, boundary: true, narrowable: false },
    { path: "scripts/review/tier.ts", tier: "high" as const, boundary: false, narrowable: false },
    { path: "packages/core/a.ts", tier: "medium" as const, boundary: false, narrowable: false },
  ];
  const backed = { state: "backed" as const, path: "docs/design/agreed.md", blob: "1".repeat(40) };
  const summary = (design: Parameters<typeof tierSummary>[0]["design"], trustedAuthor = true) =>
    tierSummary({ effective: "high", trustedAuthor, files, design });

  it("narrows the reading to For Reviewers, the boundary files and the non-narrowable High files", () => {
    const text = summary({ backing: backed, checked: true });
    expect(text).toContain("the agreed Design Doc <code>docs/design/agreed.md</code>");
    expect(text).toContain("<code>111111111111</code>");
    expect(text).toContain("reads the PR's `## For Reviewers` section and the files listed here");
    expect(text).toContain("- <code>packages/cli/src/serve.ts</code>");
    expect(text).toContain("- <code>scripts/review/tier.ts</code>");
    expect(text).not.toContain("- <code>docs/spec/syntax.md</code>");
    expect(text).not.toContain("- <code>packages/core/a.ts</code>");
    expect(text).not.toContain("High files below");
  });

  it("does not narrow when more files must still be read than the rows listed", () => {
    const many = Array.from({ length: 201 }, (_, i) => ({
      path: `packages/nest/src/${i}.test.ts`,
      tier: "low" as const,
      boundary: true,
      narrowable: false,
    }));
    const text = tierSummary({
      effective: "high",
      trustedAuthor: true,
      files: [files[0], ...many],
      design: { backing: backed, checked: true },
    });
    expect(text).toContain("but the reading is not narrowed: more files must still be read");
    expect(text).toContain("The reviewer reads the High files below");
  });

  it("says so when nothing but the section needs reading", () => {
    const text = tierSummary({
      effective: "high",
      trustedAuthor: true,
      files: [files[0]],
      design: { backing: backed, checked: true },
    });
    expect(text).toContain("No file needs reading beyond the section.");
  });

  it("does not narrow when the conformance check does not cover HEAD, and says why", () => {
    const text = summary({
      backing: backed,
      checked: false,
      why: "the local review record is waived",
    });
    expect(text).toContain("but the reading is not narrowed: the local review record is waived.");
    expect(text).toContain("The reviewer reads the High files below");
  });

  it("names why no Design Doc backs the PR, as literal text", () => {
    const text = summary({
      backing: { state: "none", reason: "the PR changes docs/design/<x>.md" },
      checked: false,
    });
    expect(text).toContain(
      "No Design Doc backs the PR: the PR changes docs/design/&#60;x&#62;.md.",
    );
    expect(text).toContain("The reviewer reads the High files below");
  });

  it("reads the whole diff of an untrusted author's PR, backing or not", () => {
    const text = summary({ backing: backed, checked: true }, false);
    expect(text).toContain("The reviewer reads the whole diff");
    expect(text).not.toContain("files listed here");
  });
});

describe("designCheckGap (#3542)", () => {
  const HEAD = "a".repeat(40);
  const BASE = "b".repeat(40);
  const git: GitFacts = {
    headSha: HEAD,
    mergeBase: () => BASE,
    resolve: (rev) => (HEAD.startsWith(rev) ? HEAD : null),
    isAncestor: (a, b) => a === b,
    onlyBaseMerges: () => true,
    sameChange: () => true,
  };
  const record = (rows: string[], extra = "") =>
    [
      `<!-- local-review:v1 base=${BASE} head=${HEAD} -->`,
      "## Local review",
      "",
      "Reviewers: subagent, coderabbit CLI --deep",
      extra,
      "",
      "| # | Reviewer | Sev | Where | Finding | Disposition |",
      "| --- | --- | --- | --- | --- | --- |",
      ...rows,
      "<!-- /local-review -->",
    ].join("\n");
  const BLOB = "1234567890abcdef".repeat(2) + "12345678";
  const DESIGN_ROW = `| 1 | design | Trivial | docs/design/agreed.md@${BLOB.slice(0, 12)} | No deviation | no deviation |`;
  const gap = (body: string) =>
    designCheckGap(body, parseRecord(body), git, { path: "docs/design/agreed.md", blob: BLOB });
  const withSection = (r: string) => `## For Reviewers\n\nNone.\n\n${r}`;

  it("passes a body with the section and a fresh record holding a design row", () => {
    expect(gap(withSection(record([DESIGN_ROW])))).toBeNull();
  });

  it("reads a section saved with CRLF line ends", () => {
    expect(gap(withSection(record([DESIGN_ROW])).replace(/\n/g, "\r\n"))).toBeNull();
  });

  it.each([
    ["the section is missing", record([DESIGN_ROW]), "no ## For Reviewers section"],
    [
      "the section is only inside a comment",
      `<!--\n## For Reviewers\n-->\n${record([DESIGN_ROW])}`,
      "no ## For Reviewers section",
    ],
    ["there is no record", "## For Reviewers\n\nNone.\n", "no local review record"],
    [
      "the section holds only the template's comment",
      `## For Reviewers\n\n<!-- On a High PR... -->\n\n## Local review\n${record([DESIGN_ROW])}`,
      "is empty",
    ],
    ["the record has no design row", withSection(record([])), "no design row"],
    ["the record is waived", withSection(record([DESIGN_ROW], "Waived: by hand")), "waived"],
    [
      "a design row names no blob",
      withSection(
        record(["| 1 | design | Trivial | docs/design/agreed.md | No deviation | no deviation |"]),
      ),
      "another version",
    ],
    [
      "a design row names another blob (main revised the Design Doc)",
      withSection(record([DESIGN_ROW.replace(BLOB.slice(0, 12), "fedcba987654")])),
      "another version",
    ],
    [
      "a design row names another Design Doc",
      withSection(record([DESIGN_ROW.replace("agreed.md", "other.md")])),
      "another version",
    ],
    [
      "another row has no disposition",
      withSection(record([DESIGN_ROW, "| 2 | engineering | Major | x.ts | y | later |"])),
      "does not pass",
    ],
  ])("reports a gap when %s", (_, body, why) => {
    expect(gap(body)).toContain(why);
  });
});

describe("specBlocks (#3542)", () => {
  const doc = (...lines: string[]) => lines.join("\n");

  it("reads each diff block under ### 仕様の変更 as hunks, split at @@ lines", () => {
    const blocks = specBlocks(
      doc(
        "## 現時点の方針",
        "",
        "### 仕様の変更",
        "",
        "```diff file=docs/spec/a.md",
        " context",
        "-old",
        "+new",
        "",
        "@@ -40,3 +40,3 @@ heading text",
        " more",
        "+added   ",
        "```",
        "",
        "```diff file=docs/spec/b.md",
        "+b",
        "```",
      ),
    );
    expect([...blocks.entries()]).toEqual([
      [
        "docs/spec/a.md",
        [
          [" context", "-old", "+new", " "],
          [" more", "+added"],
        ],
      ],
      ["docs/spec/b.md", [["+b"]]],
    ]);
  });

  it("reads only top-level fences in the section, not an example nested in another fence", () => {
    const blocks = specBlocks(
      doc(
        "```diff file=docs/spec/before.md",
        "+outside the section",
        "```",
        "### 仕様の変更",
        "````md",
        "### 仕様の変更",
        "```diff file=docs/spec/nested.md",
        "+an example",
        "```",
        "````",
        "  ```diff file=docs/spec/indented.md",
        "+indented",
        "  ```",
        "```diff file=docs/spec/top.md",
        "+top",
        "```",
        "### 次の節",
        "```diff file=docs/spec/after.md",
        "+after the section",
        "```",
      ),
    );
    expect([...blocks.keys()]).toEqual(["docs/spec/top.md"]);
  });

  it("closes a block only on a fence at least as long, so a longer fence can hold one", () => {
    const blocks = specBlocks(
      doc("### 仕様の変更", "````diff file=docs/spec/a.md", " ```css", "+x", " ```", "````"),
    );
    expect(blocks.get("docs/spec/a.md")).toEqual([[" ```css", "+x", " ```"]]);
  });

  it("reads a tilde fence, and not a block inside an HTML comment, which GitHub does not show", () => {
    const blocks = specBlocks(
      doc(
        "### 仕様の変更",
        "<!-- a note -->",
        "~~~diff file=docs/spec/tilde.md",
        "+t",
        "~~~",
        "<!--",
        "```diff file=docs/spec/hidden.md",
        "+h",
        "```",
        "-->",
      ),
    );
    expect([...blocks.keys()]).toEqual(["docs/spec/tilde.md"]);
    expect(
      specBlocks(doc("### 仕様の変更", "<!--", "```diff file=docs/spec/a.md", "+a")).size,
    ).toBe(0);
  });

  it("ends the section at any other heading, a sub-heading included", () => {
    const blocks = specBlocks(
      doc("### 仕様の変更", "#### 補足", "```diff file=docs/spec/a.md", "+a", "```"),
    );
    expect(blocks.size).toBe(0);
  });

  it("reads a CRLF doc", () => {
    const blocks = specBlocks("### 仕様の変更\r\n```diff file=docs/spec/a.md\r\n+x\r\n```\r\n");
    expect(blocks.get("docs/spec/a.md")).toEqual([["+x"]]);
  });

  it("gives null for a path with two blocks and for a line that is not a hunk line", () => {
    const blocks = specBlocks(
      doc(
        "### 仕様の変更",
        "```diff file=docs/spec/twice.md",
        "+1",
        "```",
        "```diff file=docs/spec/twice.md",
        "+2",
        "```",
        "```diff file=docs/spec/prose.md",
        "+1",
        "prose, not a hunk line",
        "```",
      ),
    );
    expect(blocks.get("docs/spec/twice.md")).toBeNull();
    expect(blocks.get("docs/spec/prose.md")).toBeNull();
  });

  it("gives nothing for two 仕様の変更 sections or an unclosed fence", () => {
    const block = ["```diff file=docs/spec/a.md", "+x", "```"];
    expect(specBlocks(doc("### 仕様の変更", ...block, "### 仕様の変更", "+y")).size).toBe(0);
    expect(specBlocks(doc("### 仕様の変更", ...block, "```diff file=docs/spec/b.md")).size).toBe(0);
  });
});

describe("contextHunks (#3542)", () => {
  it("reads a -U3 diff's hunks with their signs, dropping the no-newline marker", () => {
    const diff = [
      "diff --git a/x.md b/x.md",
      "index 1..2 100644",
      "--- a/x.md",
      "+++ b/x.md",
      "@@ -1,2 +1,2 @@",
      " a  ",
      "-b",
      "\\ No newline at end of file",
      "+c",
      "",
    ].join("\n");
    expect(contextHunks(diff)).toEqual([[" a", "-b", "+c"]]);
  });

  it("gives null for a diff of two files, so neither can match", () => {
    const one = ["diff --git a/x.md b/x.md", "--- a/x.md", "+++ b/x.md", "@@ -1 +1 @@", "-b", "+c"];
    expect(contextHunks([...one, ...one, ""].join("\n"))).toBeNull();
  });
});

/** #3320's spec diff (Issue #3155): the past PR the Design Doc's AT names. */
describe("agreed spec text, with #3320's spec diff (#3542)", () => {
  const FIXTURES = resolve(import.meta.dirname, "fixtures/spec-agreement-3320");
  const fixture = (name: string) => readFileSync(resolve(FIXTURES, name), "utf-8");
  const EN = "docs/spec/style.md";
  const JA = "docs/spec/style.ja.md";
  const diffs: Record<string, string> = {
    [EN]: fixture("style.md.diff"),
    [JA]: fixture("style.ja.md.diff"),
  };
  const bases: Record<string, string> = {
    [EN]: fixture("style.md.base"),
    [JA]: fixture("style.ja.md.base"),
  };
  /** The diff's hunk lines, from its first `@@` header, as the block's lines. */
  const hunkLines = (diff: string) =>
    diff
      .slice(diff.indexOf("\n@@") + 1)
      .replace(/\n$/, "")
      .split("\n");
  const docWith = (blocks: Record<string, string[]>) =>
    [
      "# Doc",
      "",
      "## 現時点の方針",
      "",
      "### 仕様の変更",
      "",
      ...Object.entries(blocks).flatMap(([path, lines]) => [
        "```diff file=" + path,
        ...lines,
        "```",
        "",
      ]),
    ].join("\n");
  const candidates = (over: Partial<Record<string, string | null>> = {}) =>
    [EN, JA].map((path) => ({
      path,
      diff: diffs[path],
      base: path in over ? (over[path] ?? null) : bases[path],
    }));
  // The Japanese block drops the line numbers: a bare `@@` separates its hunks.
  const agreedDoc = docWith({
    [EN]: hunkLines(diffs[EN]),
    [JA]: hunkLines(diffs[JA]).map((l) => (l.startsWith("@@") ? "@@" : l)),
  });

  it("agrees both files when the Design Doc holds their hunks", () => {
    expect(agreedSpecFiles(agreedDoc, candidates())).toEqual([EN, JA]);
  });

  it("agrees neither file when one block has a line reworded: all or nothing", () => {
    const lines = hunkLines(diffs[EN]).map((l) =>
      l.startsWith("+label, another edge's line") ? `${l} too` : l,
    );
    expect(lines).not.toEqual(hunkLines(diffs[EN]));
    expect(
      agreedSpecFiles(docWith({ [EN]: lines, [JA]: hunkLines(diffs[JA]) }), candidates()),
    ).toEqual([]);
  });

  it("does not agree a file with a hunk dropped from the block, or the hunks reordered", () => {
    const hunks = hunkLines(diffs[EN])
      .join("\n")
      .split(/\n(?=@@)/);
    expect(hunks).toHaveLength(3);
    const dropped = hunks.slice(1).join("\n").split("\n");
    const reordered = [hunks[1], hunks[0], ...hunks.slice(2)].join("\n").split("\n");
    for (const lines of [dropped, reordered]) {
      expect(agreedSpecFiles(docWith({ [EN]: lines }), candidates())).toEqual([]);
    }
  });

  it("does not agree a file whose block moves an agreed line within its hunk", () => {
    const lines = hunkLines(diffs[JA]);
    const i = lines.findIndex((l) => l.startsWith("+"));
    const moved = [...lines];
    [moved[i - 1], moved[i]] = [moved[i], moved[i - 1]];
    expect(agreedSpecFiles(docWith({ [JA]: moved }), candidates())).toEqual([]);
  });

  it("does not agree a file whose block is only an example nested in another fence", () => {
    const nested = [
      "# Doc",
      "",
      "### 仕様の変更",
      "",
      "````md",
      ...agreedDoc.split("\n"),
      "````",
    ].join("\n");
    expect(agreedSpecFiles(nested, candidates())).toEqual([]);
  });

  it("does not agree a file whose block's context sits at two places in the base", () => {
    const twice = `${bases[JA]}\n${bases[JA]}`;
    expect(agreedSpecFiles(agreedDoc, candidates({ [JA]: twice }))).toEqual([]);
  });

  it("agrees nothing when the PR leaves out a file the Design Doc has a block for", () => {
    expect(agreedSpecFiles(agreedDoc, candidates().slice(0, 1))).toEqual([]);
  });

  it("agrees when a line differs only in trailing spaces, but not in a full-width space", () => {
    const en = hunkLines(diffs[EN]).map((l) => (l.startsWith("+") ? `${l}  ` : l));
    const doc = docWith({ [EN]: en, [JA]: hunkLines(diffs[JA]) });
    expect(agreedSpecFiles(doc, candidates())).toEqual([EN, JA]);
    const wide = hunkLines(diffs[EN]).map((l) => (l.startsWith("+") ? `${l}\u3000` : l));
    expect(
      agreedSpecFiles(docWith({ [EN]: wide, [JA]: hunkLines(diffs[JA]) }), candidates()),
    ).toEqual([]);
  });

  it("does not agree a path outside the decision paths, whatever its block says", () => {
    const path = "scripts/review/tier.ts";
    const doc = docWith({ [path]: hunkLines(diffs[EN]) });
    expect(agreedSpecFiles(doc, [{ path, diff: diffs[EN], base: bases[EN] }])).toEqual([]);
  });

  const fileDiff = (header: string[], hunks: string[]) =>
    ["diff --git a/docs/spec/n.md b/docs/spec/n.md", ...header, ...hunks, ""].join("\n");

  it("agrees a new file only when the base has none", () => {
    const diff = fileDiff(
      ["new file mode 100644", "index 0..1", "--- /dev/null", "+++ b/docs/spec/n.md"],
      ["@@ -0,0 +1,2 @@", "+# N", "+A new rule."],
    );
    const block = [["+# N", "+A new rule."]];
    expect(matchesAgreedText({ block, diff, base: null })).toBe(true);
    expect(matchesAgreedText({ block, diff, base: "# N\n" })).toBe(false);
  });

  it("does not agree a deleted file or a mode change", () => {
    const removal = fileDiff(
      ["deleted file mode 100644", "index 1..0", "--- a/docs/spec/n.md", "+++ /dev/null"],
      ["@@ -1 +0,0 @@", "-A rule."],
    );
    expect(matchesAgreedText({ block: [["-A rule."]], diff: removal, base: "A rule.\n" })).toBe(
      false,
    );
    const mode = fileDiff(
      [
        "old mode 100644",
        "new mode 100755",
        "index 1..2",
        "--- a/docs/spec/n.md",
        "+++ b/docs/spec/n.md",
      ],
      ["@@ -1 +1 @@", "-A rule.", "+A new rule."],
    );
    expect(
      matchesAgreedText({ block: [["-A rule.", "+A new rule."]], diff: mode, base: "A rule.\n" }),
    ).toBe(false);
  });

  it("does not agree a binary file, a symlink, a submodule or a modified file the base lacks", () => {
    const rule = ["@@ -1 +1 @@", "-A rule.", "+A new rule."];
    const block = [["-A rule.", "+A new rule."]];
    const head = (mode: string) => [
      `index 1..2 ${mode}`,
      "--- a/docs/spec/n.md",
      "+++ b/docs/spec/n.md",
    ];
    const base = "A rule.\n";
    expect(matchesAgreedText({ block, diff: fileDiff(head("100644"), rule), base })).toBe(true);
    expect(matchesAgreedText({ block, diff: fileDiff(head("100644"), rule), base: null })).toBe(
      false,
    );
    expect(matchesAgreedText({ block, diff: fileDiff(head("120000"), rule), base })).toBe(false);
    const gitlink = fileDiff(
      ["new file mode 160000", "index 0..1", "--- /dev/null", "+++ b/docs/spec/n.md"],
      ["@@ -0,0 +1 @@", "+Subproject commit 1111"],
    );
    expect(
      matchesAgreedText({ block: [["+Subproject commit 1111"]], diff: gitlink, base: null }),
    ).toBe(false);
    const binary = fileDiff(
      ["index 1..2 100644", "Binary files a/docs/spec/n.md and b/docs/spec/n.md differ"],
      [],
    );
    expect(matchesAgreedText({ block, diff: binary, base })).toBe(false);
  });

  it("does not agree a hunk that changes only blank lines or a table rule", () => {
    const diff = fileDiff(
      ["index 1..2 100644", "--- a/docs/spec/n.md", "+++ b/docs/spec/n.md"],
      ["@@ -1,3 +1,3 @@", " | a | b |", "-|---|---|", "+| --- | --- |", " | 1 | 2 |"],
    );
    const block = [[" | a | b |", "-|---|---|", "+| --- | --- |", " | 1 | 2 |"]];
    expect(matchesAgreedText({ block, diff, base: "| a | b |\n|---|---|\n| 1 | 2 |\n" })).toBe(
      false,
    );
  });
});

describe("classifyChange with agreed spec text (#3542)", () => {
  const spec: ChangedFile = { path: "docs/spec/style.md", status: "modified", hunks: [] };
  const code: ChangedFile = { path: "packages/app/src/x.ts", status: "modified", hunks: [] };

  it("counts an agreed decision-path file as Medium, so the PR can be Medium", () => {
    const r = classifyChange({ files: [spec, code], author: "kompiro", agreed: [spec.path] });
    expect(r.tier).toBe("medium");
    expect(r.reasons).toContain(
      "docs/spec/style.md: medium (the text the backing Design Doc agreed)",
    );
    expect(r.files[0]).toEqual({
      path: spec.path,
      tier: "medium",
      boundary: false,
      narrowable: true,
      agreed: true,
    });
  });

  it("keeps High what is not a decision path, another High file, and an untrusted author", () => {
    const tier = (files: ChangedFile[], author = "kompiro") =>
      classifyChange({ files, author, agreed: files.map((f) => f.path) }).tier;
    const machinery: ChangedFile = {
      path: "scripts/review/tier.ts",
      status: "modified",
      hunks: [],
    };
    const language: ChangedFile = {
      path: "packages/core/src/parser/x.ts",
      status: "modified",
      hunks: [],
    };
    expect(tier([machinery])).toBe("high");
    expect(tier([language])).toBe("high");
    expect(
      classifyChange({ files: [spec, machinery], author: "kompiro", agreed: [spec.path] }).tier,
    ).toBe("high");
    expect(tier([spec], "someone")).toBe("high");
  });

  it("keeps High a decision-path file that is also High for another reason or on the boundary", () => {
    const changelog: ChangedFile = {
      path: "docs/spec/CHANGELOG.md",
      status: "modified",
      hunks: [],
    };
    const manifest: ChangedFile = { path: "docs/spec/package.json", status: "modified", hunks: [] };
    const sink: ChangedFile = {
      path: ".claude/rules/x.html",
      status: "modified",
      hunks: [{ oldStart: 1, removed: [], newStart: 1, added: ["el.innerHTML = s;"] }],
    };
    for (const f of [changelog, manifest, sink]) {
      const r = classifyChange({ files: [f], author: "kompiro", agreed: [f.path] });
      expect(r.files[0].tier).toBe("high");
    }
  });

  it("is High as before when nothing is agreed", () => {
    expect(classifyChange({ files: [spec], author: "kompiro" }).tier).toBe("high");
  });
});

describe("tierSummary with agreed spec text (#3542)", () => {
  it("names the Design Doc that made a Medium PR lighter and marks the agreed files", () => {
    const out = tierSummary({
      effective: "medium",
      trustedAuthor: true,
      files: [
        { path: "docs/spec/style.md", tier: "medium", agreed: true },
        { path: "packages/app/src/x.ts", tier: "medium" },
      ],
      design: {
        backing: { state: "backed", path: "docs/design/agreed.md", blob: "1".repeat(40) },
        checked: false,
      },
    });
    expect(out).toContain("One file is Medium, marked agreed below");
    expect(out).toContain("<code>docs/design/agreed.md</code>");
    expect(out).toContain("Rerun Review tier right before hand-off");
    expect(out).toContain("| medium (agreed) | <code>docs/spec/style.md</code> |");
    expect(out).toContain("| medium | <code>packages/app/src/x.ts</code> |");
  });

  it("marks an agreed file on a High PR too", () => {
    const out = tierSummary({
      effective: "high",
      trustedAuthor: true,
      files: [
        { path: "scripts/review/tier.ts", tier: "high" },
        { path: "docs/spec/style.md", tier: "medium", agreed: true },
      ],
    });
    expect(out).toContain("| medium (agreed) | <code>docs/spec/style.md</code> |");
  });
});
