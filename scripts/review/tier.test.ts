import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adrEditIsRecordOnly,
  type ChangedFile,
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
    ["packages/core/src/parser/parser.ts", "medium"],
    ["packages/nest/src/worker.ts", "medium"],
    ["docs/acceptance/permalink-deep-element.md", "medium"],
    ["examples/ja/ec-platform/index.krs", "medium"],
    [".github/workflows/ci.yml", "high"],
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
    ["scripts/bin/gh", "high"],
    [".claude/settings.json", "high"],
    [".claude/skills/coderabbit-converge/SKILL.md", "high"],
    [".claude/skills/demo-video/SKILL.md", "high"],
    [".github/PULL_REQUEST_TEMPLATE.md", "high"],
    [".claude/agents/qa.md", "high"],
    // CI policy tests and drift guards are not Low test files.
    ["scripts/ci/agentic-workflow-safety.test.ts", "high"],
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

describe("classifyChange", () => {
  it("takes the strictest tier across the files", () => {
    expect(tierOf(modified("docs/guide/a.md"), modified("docs/design/x.md"))).toBe("design");
    expect(tierOf(modified("docs/guide/a.md"), modified("packages/core/a.ts"))).toBe("medium");
    expect(tierOf(modified("docs/guide/a.md"), modified(".github/workflows/x.yml"))).toBe("high");
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

  it("asks for a security review on nest and workflow changes", () => {
    const sec = (path: string) =>
      classifyChange({ files: [modified(path)], author: "kompiro" }).securityReview;
    expect(sec("packages/nest/src/a.ts")).toBe(true);
    expect(sec(".github/workflows/x.yml")).toBe(true);
    expect(sec("packages/core/a.ts")).toBe(false);
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

    it("is Low when the AT gains a link to the new ADR it never had (#3405)", () => {
      // ATs point at their Issue (ADR-2348), so there is no Design Doc link to swap.
      const insert = modified("docs/acceptance/x.md", {
        hunks: [
          {
            oldStart: 9,
            removed: ["- **関連 ADR**: [ADR-3026](../adr/3026-same-row-channel-route.md)"],
            newStart: 9,
            added: [
              "- **関連 ADR**: [ADR-3286](../adr/3286-risk-based-review-tiers.md)、[ADR-3026](../adr/3026-same-row-channel-route.md)",
            ],
          },
          {
            oldStart: 12,
            removed: [],
            newStart: 13,
            added: ["- **設計 (ADR)**: [ADR-3286](../adr/3286-risk-based-review-tiers.md)"],
          },
        ],
      });
      expect(tierOf(added(NEW_ADR), deleted(DESIGN), insert)).toBe("low");
      // A promotion whose Design Doc is deleted elsewhere, or not at all, still adds the ADR.
      expect(tierOf(added(NEW_ADR), insert)).toBe("low");
    });

    it("keeps an AT edit beside the inserted link at its path's tier (#3405)", () => {
      const withCheckbox = modified("docs/acceptance/x.md", {
        hunks: [
          {
            oldStart: 12,
            removed: ["- [ ] AT-A: 手で確かめる"],
            newStart: 12,
            added: [
              "- **設計 (ADR)**: [ADR-3286](../adr/3286-risk-based-review-tiers.md)",
              "- [x] AT-A: 手で確かめる",
            ],
          },
        ],
      });
      expect(tierOf(added(NEW_ADR), deleted(DESIGN), withCheckbox)).toBe("medium");
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

  it("accepts a link inserted at the start, middle or end of a list, or a run of them", () => {
    expect(isLinkInsert(["- 関連: [a](a.md)"], [`- 関連: ${L}、[a](a.md)`], A)).toBe(true);
    expect(
      isLinkInsert(["- 関連: [a](a.md)、[b](b.md)"], [`- 関連: [a](a.md)、${L}、[b](b.md)`], A),
    ).toBe(true);
    expect(isLinkInsert(["- 関連: [a](a.md)"], [`- 関連: [a](a.md), ${L}`], A)).toBe(true);
    expect(isLinkInsert(["- 関連: [a](a.md)"], [`- 関連: [a](a.md)、${L}、${L}`], A)).toBe(true);
  });

  it("accepts a new line that holds only a label and the link", () => {
    expect(isLinkInsert([], [`- **設計 (ADR)**: ${L}`], A)).toBe(true);
    expect(isLinkInsert([], [`- **設計 (ADR)**：[12-x.md](../adr/12-x.md)`], A)).toBe(true);
  });

  it("rejects a hunk that inserts no link to the new ADR", () => {
    expect(isLinkInsert([], ["- **設計 (ADR)**:"], A)).toBe(false);
    expect(isLinkInsert(["a"], ["a"], A)).toBe(false);
    expect(isLinkInsert([], ["- **設計 (ADR)**: [ADR-7](../adr/7-y.md)"], A)).toBe(false);
  });

  it("rejects a link whose text is not a name of the ADR", () => {
    expect(isLinkInsert([], ["- **設計 (ADR)**: [run this](../adr/12-x.md)"], A)).toBe(false);
  });

  it("rejects a target that only contains the ADR path", () => {
    expect(
      isLinkInsert([], ["- **設計 (ADR)**: [ADR-12](https://evil.example/adr/12-x.md)"], A),
    ).toBe(false);
  });

  it("rejects any other change on the line or in the hunk", () => {
    expect(isLinkInsert(["- 関連: [a](a.md)"], [`- 関連（完了）: [a](a.md)、${L}`], A)).toBe(false);
    expect(isLinkInsert([], [`- **設計 (ADR)**: ${L}`, "- **手動確認**:"], A)).toBe(false);
    expect(isLinkInsert([], [`see ${L} now`], A)).toBe(false);
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
