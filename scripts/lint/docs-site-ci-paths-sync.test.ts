import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  check,
  globMatches,
  parsePublishedFiles,
  parseWorkflowPaths,
} from "./docs-site-ci-paths-sync.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const read = (p: string): string => readFileSync(join(REPO_ROOT, p), "utf8");

describe("globMatches", () => {
  it("matches an exact path", () => {
    expect(globMatches("docs/glossary.md", "docs/glossary.md")).toBe(true);
    expect(globMatches("docs/glossary.md", "docs/concepts.md")).toBe(false);
  });

  it("matches a `**` prefix across directory boundaries", () => {
    expect(globMatches("docs/guide/**", "docs/guide/README.md")).toBe(true);
    expect(globMatches("docs/guide/**", "docs/guide/nested/x.md")).toBe(true);
    expect(globMatches("docs/guide/**", "docs/spec/syntax.md")).toBe(false);
  });

  it("does not let a single `*` cross a directory boundary", () => {
    expect(globMatches("docs/*.md", "docs/glossary.md")).toBe(true);
    expect(globMatches("docs/*.md", "docs/spec/syntax.md")).toBe(false);
  });
});

describe("parsePublishedFiles", () => {
  it("reads the string literals out of the array", () => {
    const source = `export const PUBLISHED_EN_FILES: readonly string[] = [\n  "a.md",\n  "b/c.md",\n];`;
    expect(parsePublishedFiles(source)).toEqual(["a.md", "b/c.md"]);
  });

  it("returns nothing when the constant is gone, so check() can report it", () => {
    expect(parsePublishedFiles("export const OTHER = [];")).toEqual([]);
  });
});

describe("parseWorkflowPaths", () => {
  it("unions the entries across the pull_request and push blocks", () => {
    const source = [
      "on:",
      "  pull_request:",
      "    paths:",
      '      - "docs/a/**"',
      '      - "docs/b.md"',
      "  push:",
      "    paths:",
      '      - "docs/a/**"',
      '      - "docs/c.md"',
      "jobs:",
    ].join("\n");
    expect(parseWorkflowPaths(source, "paths")).toEqual(["docs/a/**", "docs/b.md", "docs/c.md"]);
  });

  it("does not confuse paths-ignore with paths", () => {
    const source = ["  pull_request:", "    paths-ignore:", '      - "docs/x.md"'].join("\n");
    expect(parseWorkflowPaths(source, "paths")).toEqual([]);
    expect(parseWorkflowPaths(source, "paths-ignore")).toEqual(["docs/x.md"]);
  });
});

describe("check", () => {
  it("passes when every published doc is covered and the two lists mirror", () => {
    const paths = ["docs/guide/**", "docs/concepts.md"];
    expect(check(["guide/README.md", "concepts.md"], paths, paths)).toEqual([]);
  });

  it("flags a published doc no glob matches — the drift this exists to catch", () => {
    const paths = ["docs/guide/**"];
    const problems = check(["guide/README.md", "glossary.md"], paths, paths);
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("docs/glossary.md is published");
  });

  it("flags a paths entry missing from the skip workflow", () => {
    const problems = check(["concepts.md"], ["docs/concepts.md"], []);
    expect(problems.some((p) => p.message.includes("not in"))).toBe(true);
  });

  it("reports an unreadable published list instead of silently passing", () => {
    const problems = check([], ["docs/**"], ["docs/**"]);
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("PUBLISHED_EN_FILES");
  });
});

describe("the committed workflows", () => {
  const published = parsePublishedFiles(read("packages/docs-site/scripts/lib/site-map.ts"));
  const checkPaths = parseWorkflowPaths(
    read(".github/workflows/reference-docs-check.yml"),
    "paths",
  );
  const skipPaths = parseWorkflowPaths(
    read(".github/workflows/reference-docs-check-skip.yml"),
    "paths-ignore",
  );

  it("cover every published doc and mirror each other", () => {
    expect(check(published, checkPaths, skipPaths)).toEqual([]);
  });

  it("read a non-empty published set, so the guard is not passing vacuously", () => {
    expect(published.length).toBeGreaterThan(10);
  });

  it("run the docs-site guards that used to fire only on the deploy to main", () => {
    const workflow = read(".github/workflows/reference-docs-check.yml");
    expect(workflow).toContain("docs-site run check-links");
    expect(workflow).toContain("docs-site run test");
  });
});
