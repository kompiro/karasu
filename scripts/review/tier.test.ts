import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  changedLines,
  classifyChange,
  effortFromComments,
  excludedPathFilters,
  lineInDiff,
  packageJsonTier,
  parseEffort,
  pathTier,
  sameLines,
} from "./tier.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const pkg = (fields: Record<string, unknown>) => JSON.stringify({ name: "x", ...fields });

describe("pathTier", () => {
  it.each([
    ["docs/adr/3286-risk-based-review-tiers.md", "low"],
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
    [".claude/rules/adr.md", "high"],
    [".coderabbit.yaml", "high"],
    ["lefthook.yml", "high"],
    ["scripts/lint/record-source-paths.ts", "high"],
    ["scripts/review/tier.ts", "high"],
    ["scripts/coderabbit/review-state.ts", "high"],
    [".claude/skills/coderabbit-converge/SKILL.md", "high"],
  ])("%s is %s", (path, tier) => {
    expect(pathTier(path)).toBe(tier);
  });

  it("puts a path no rule names in Medium, never Low", () => {
    expect(pathTier("docs/some-new-area/notes.md")).toBe("medium");
    expect(pathTier("brand-new-top-level-file.txt")).toBe("medium");
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

  it("is High when the file is added, removed or unparseable", () => {
    expect(packageJsonTier(null, pkg({}))).toBe("high");
    expect(packageJsonTier(pkg({}), null)).toBe("high");
    expect(packageJsonTier("{", pkg({}))).toBe("high");
  });
});

describe("classifyChange", () => {
  const files = (...paths: string[]) => paths.map((path) => ({ path }));

  it("takes the strictest tier across the files", () => {
    expect(
      classifyChange({ files: files("docs/adr/1.md", "docs/design/x.md"), author: "kompiro" }).tier,
    ).toBe("design");
    expect(
      classifyChange({ files: files("docs/adr/1.md", "packages/core/a.ts"), author: "kompiro" })
        .tier,
    ).toBe("medium");
    expect(
      classifyChange({
        files: files("docs/adr/1.md", ".github/workflows/x.yml"),
        author: "kompiro",
      }).tier,
    ).toBe("high");
  });

  it("reads package.json by the fields that moved", () => {
    const scriptsOnly = {
      path: "package.json",
      packageJson: { before: pkg({ scripts: {} }), after: pkg({ scripts: { a: "b" } }) },
    };
    expect(classifyChange({ files: [scriptsOnly], author: "kompiro" }).tier).toBe("medium");
  });

  it("is High for an author not on the trusted list, whatever the paths", () => {
    expect(classifyChange({ files: files("docs/adr/1.md"), author: "someone-else" }).tier).toBe(
      "high",
    );
  });

  it("raises Low to Medium on an effort estimate of 4 or more, and never lowers", () => {
    const low = files("docs/guide/x.md");
    expect(classifyChange({ files: low, author: "kompiro", effort: 3 }).tier).toBe("low");
    expect(classifyChange({ files: low, author: "kompiro", effort: 4 }).tier).toBe("medium");
    expect(
      classifyChange({ files: files(".github/workflows/x.yml"), author: "kompiro", effort: 1 })
        .tier,
    ).toBe("high");
  });

  it("keeps a PR out of Low when CodeRabbit's estimate is unreadable, but not when absent", () => {
    const low = files("docs/guide/x.md");
    expect(classifyChange({ files: low, author: "kompiro", effort: "unreadable" }).tier).toBe(
      "medium",
    );
    expect(classifyChange({ files: low, author: "kompiro" }).tier).toBe("low");
  });

  it("asks for a security review on nest and workflow changes", () => {
    expect(
      classifyChange({ files: files("packages/nest/src/a.ts"), author: "kompiro" }).securityReview,
    ).toBe(true);
    expect(
      classifyChange({ files: files(".github/workflows/x.yml"), author: "kompiro" }).securityReview,
    ).toBe(true);
    expect(
      classifyChange({ files: files("packages/core/a.ts"), author: "kompiro" }).securityReview,
    ).toBe(false);
  });

  it("treats an empty change as Medium", () => {
    expect(classifyChange({ files: [], author: "kompiro" }).tier).toBe("medium");
  });
});

describe("parseEffort / effortFromComments", () => {
  it("reads the estimate from CodeRabbit's summary line", () => {
    expect(parseEffort("**Estimated code review effort:** 3 (Moderate) | ~20 minutes")).toBe(3);
    expect(parseEffort("**Estimated code review effort:** 🎯 2 (Simple) | ⏱️ ~10 minutes")).toBe(2);
  });

  it("is undefined without the marker and unreadable outside 1..5", () => {
    expect(parseEffort("no summary here")).toBeUndefined();
    expect(parseEffort("**Estimated code review effort:** high")).toBe("unreadable");
    expect(parseEffort("**Estimated code review effort:** 9")).toBe("unreadable");
  });

  it("reads only CodeRabbit's comments, newest first", () => {
    const line = (n: number) => `**Estimated code review effort:** ${n} (x)`;
    expect(
      effortFromComments([
        { login: "coderabbitai[bot]", body: line(4), updatedAt: "2026-10-20T10:00:00Z" },
        { login: "coderabbitai[bot]", body: line(2), updatedAt: "2026-10-21T10:00:00Z" },
        { login: "someone", body: line(1), updatedAt: "2026-10-22T10:00:00Z" },
      ]),
    ).toBe(2);
    expect(
      effortFromComments([{ login: "someone", body: line(1), updatedAt: "2026-10-22T10:00:00Z" }]),
    ).toBeUndefined();
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

describe("changedLines / sameLines", () => {
  it("is the same when only hunk positions moved, as a merge of main does", () => {
    const before = diffOf(
      "docs/test-perspectives/README.md",
      "@@ -582,0 +583 @@",
      "+| [TPL-3286] |",
    );
    const after = diffOf(
      "docs/test-perspectives/README.md",
      "@@ -583,0 +584 @@",
      "+| [TPL-3286] |",
    );
    expect(sameLines(changedLines(before), changedLines(after))).toBe(true);
  });

  it("differs when the resolution rewrote one of the PR's lines", () => {
    const before = diffOf("a.md", "@@ -1,0 +2 @@", "+one");
    const after = diffOf("a.md", "@@ -1,0 +2 @@", "+one, merged");
    expect(sameLines(changedLines(before), changedLines(after))).toBe(false);
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
    expect(sameLines(changedLines(before), changedLines(after))).toBe(false);
    expect(
      sameLines(changedLines(before, ["pnpm-lock.yaml"]), changedLines(after, ["pnpm-lock.yaml"])),
    ).toBe(true);
  });

  it("keeps the same text in two files apart", () => {
    expect(
      sameLines(
        changedLines(diffOf("a.md", "@@ -1,0 +2 @@", "+same")),
        changedLines(diffOf("b.md", "@@ -1,0 +2 @@", "+same")),
      ),
    ).toBe(false);
  });

  it("reads a removed `-- x` or an added `++ x` as content, not as a file header", () => {
    // Inside a hunk, git prints them as `--- x` and `+++ x`.
    const sql = diffOf("db/schema.sql", "@@ -3 +3 @@", "--- old comment", "+++ new");
    expect(changedLines(sql)).toEqual(["db/schema.sql\t+++ new", "db/schema.sql\t--- old comment"]);
    expect(lineInDiff([sql, diffOf("b.md", "@@ -1,0 +2 @@", "+x")].join("\n"), "b.md", 2)).toBe(
      "inside",
    );
  });

  it("names a deleted file by its old path", () => {
    const deleted = [
      "diff --git a/gone.md b/gone.md",
      "--- a/gone.md",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-bye",
    ].join("\n");
    expect(changedLines(deleted)).toEqual(["gone.md\t-bye"]);
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
