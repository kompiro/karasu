import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readAdrPaths, rootGlobs } from "../adr/generated.ts";
import {
  ADR_GENERATED_GLOBS,
  adrEditIsRecordOnly,
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
  packageJsonTier,
  parseDiff,
  pathTier,
  readFailure,
  regenerationWaivesRecord,
  tierSummary,
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
      { path: "docs/spec/syntax.md", tier: "high" },
      { path: "(a diff section whose path could not be read)", tier: "high" },
      { path: "packages/core/a.ts", tier: "medium" },
      { path: "packages/core/b.ts", tier: "medium" },
      { path: "docs/guide/a.md", tier: "low" },
    ]);
  });

  it("keeps each file's own tier when the author makes the PR High", () => {
    expect(
      classifyChange({ files: [modified("docs/guide/a.md")], author: "someone" }).files,
    ).toEqual([{ path: "docs/guide/a.md", tier: "low" }]);
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

  it("tells kompiro to read the High files and For kompiro on a High PR", () => {
    expect(tierSummary({ effective: "high", files }).split("\n")).toEqual([
      "### Files by tier",
      "",
      "The PR is High. kompiro reads the High files below and the PR's `## For kompiro` section.",
      "",
      "| Tier | File |",
      "| --- | --- |",
      "| high | <code>docs/spec/syntax.md</code> |",
      "| medium | <code>packages/core/a.ts</code> |",
      "",
    ]);
  });

  it("asks for the whole diff when no file is High but the PR is", () => {
    const text = tierSummary({ effective: "high", files: [files[1]] });
    expect(text).toContain("kompiro reads the whole diff");
    expect(text).not.toContain("High files below");
  });

  it("names the tier without a reading line below High", () => {
    const text = tierSummary({ effective: "medium", files: [files[1]] });
    expect(text).toContain("The PR is medium.");
    expect(text).not.toContain("kompiro reads");
  });

  it.each([
    ["a|b.md", "a&#124;b.md"],
    ["a`b`.md", "a&#96;b&#96;.md"],
    ["[x](https://e.example).md", "&#91;x&#93;&#40;https&#58;//e.example&#41;.md"],
    ["<img src=x>.md", "&#60;img&#32;src&#61;x&#62;.md"],
    ["a\n| high | b.md", "a&#10;&#124;&#32;high&#32;&#124;&#32;b.md"],
    ["_x_/*y*.md", "&#95;x&#95;/&#42;y&#42;.md"],
  ])("renders the path %j as literal text in one cell", (path, cell) => {
    const rows = tierSummary({ effective: "high", files: [{ path, tier: "high" }] })
      .split("\n")
      .filter((l) => l.startsWith("| high"));
    expect(rows).toEqual([`| high | <code>${cell}</code> |`]);
  });
});
