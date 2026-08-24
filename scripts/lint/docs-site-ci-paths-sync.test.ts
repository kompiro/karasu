import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHECK_WORKFLOW,
  check,
  expandLocaleSiblings,
  globMatches,
  parsePublishedFiles,
  parseWorkflowPaths,
  PREVIEW_WORKFLOW,
  SKIP_WORKFLOW,
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

describe("expandLocaleSiblings", () => {
  it("adds the `.ja.md` sibling only when it exists on disk", () => {
    const onDisk = new Set(["concepts.ja.md"]);
    expect(expandLocaleSiblings(["concepts.md", "glossary.md"], (p) => onDisk.has(p))).toEqual([
      "concepts.md",
      "glossary.md",
      "concepts.ja.md",
    ]);
  });

  it("does not re-derive a sibling from a `.ja.md` entry", () => {
    expect(expandLocaleSiblings(["concepts.ja.md"], () => true)).toEqual(["concepts.ja.md"]);
  });
});

describe("check", () => {
  const guard = (paths: string[]) => [{ file: CHECK_WORKFLOW, paths }];

  it("passes when every published doc is covered and the two lists mirror", () => {
    const paths = ["docs/guide/**", "docs/concepts.md"];
    expect(check(["guide/README.md", "concepts.md"], guard(paths), paths)).toEqual([]);
  });

  it("flags a published doc no glob matches — the drift this exists to catch", () => {
    const paths = ["docs/guide/**"];
    const problems = check(["guide/README.md", "glossary.md"], guard(paths), paths);
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("docs/glossary.md is published");
  });

  it("names the workflow that misses a doc, so two triggers cannot hide each other", () => {
    const paths = ["docs/guide/**", "docs/glossary.md"];
    const problems = check(
      ["glossary.md"],
      [
        { file: CHECK_WORKFLOW, paths },
        { file: PREVIEW_WORKFLOW, paths: ["docs/guide/**"] },
      ],
      paths,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain(PREVIEW_WORKFLOW);
  });

  it("flags a paths entry missing from the skip workflow", () => {
    const problems = check(["concepts.md"], guard(["docs/concepts.md"]), []);
    expect(problems.some((p) => p.message.includes("not in"))).toBe(true);
  });

  it("mirrors the skip list against the guard workflow only, not the preview one", () => {
    const problems = check(
      ["concepts.md"],
      [
        { file: CHECK_WORKFLOW, paths: ["docs/concepts.md"] },
        // The preview workflow has no Required status and no paired stub, so its
        // extra entry must not be demanded of `paths-ignore:`.
        { file: PREVIEW_WORKFLOW, paths: ["docs/concepts.md", "packages/docs-site/**"] },
      ],
      ["docs/concepts.md"],
    );
    expect(problems).toEqual([]);
  });

  it("reports an unreadable published list instead of silently passing", () => {
    const problems = check([], guard(["docs/**"]), ["docs/**"]);
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("PUBLISHED_EN_FILES");
  });
});

describe("the committed workflows", () => {
  const published = expandLocaleSiblings(
    parsePublishedFiles(read("packages/docs-site/scripts/lib/site-map.ts")),
    (docsRelative) => existsSync(join(REPO_ROOT, "docs", docsRelative)),
  );
  const workflows = [CHECK_WORKFLOW, PREVIEW_WORKFLOW].map((file) => ({
    file,
    paths: parseWorkflowPaths(read(file), "paths"),
  }));
  const skipPaths = parseWorkflowPaths(read(SKIP_WORKFLOW), "paths-ignore");

  it("cover every published doc and mirror each other", () => {
    expect(check(published, workflows, skipPaths)).toEqual([]);
  });

  it("read a non-empty published set, so the guard is not passing vacuously", () => {
    expect(published.length).toBeGreaterThan(10);
  });

  it("include the ja siblings, which a ja-only edit is the only way to change", () => {
    expect(published).toContain("concepts.ja.md");
    expect(published).toContain("glossary.ja.md");
  });

  it("run the docs-site guards that used to fire only on the deploy to main", () => {
    const workflow = read(CHECK_WORKFLOW);
    expect(workflow).toContain("docs-site run check-links");
    expect(workflow).toContain("docs-site run test");
  });
});

// The preview deploys a *different* Cloudflare Pages project from a *staged*
// copy of the build (Issue #2260). Three things make that correct, and each of
// them is a one-line edit away from silently breaking the deployment.
describe("the docs preview deployment", () => {
  const workflow = read(PREVIEW_WORKFLOW);

  it("runs wrangler from packages/docs-site, away from the root functions/ catch-all", () => {
    // `functions/[[path]].ts` runs before static assets, so a deploy made from
    // the repo root would bundle it and it would intercept every request to the
    // docs preview. The root `wrangler.toml` also names the app's project.
    expect(workflow).toContain("workingDirectory: packages/docs-site");
    expect(existsSync(join(REPO_ROOT, "packages/docs-site/functions"))).toBe(false);
  });

  it("names the package manager, which moving off the repo root stops inferring", () => {
    // wrangler-action picks one by looking for a lockfile in the working
    // directory. There is none beside `packages/docs-site/package.json`, so it
    // falls back to npm — which cannot install into a package.json carrying
    // `workspace:*`. The two settings only work as a pair.
    expect(workflow).toContain("packageManager: pnpm");
  });

  it("skips rather than fails where the deployment secrets are unreachable", () => {
    // A fork PR and a bot PR both get no secrets. Without these terms every
    // outside docs contribution gets a red check for a deploy it could not make.
    expect(workflow).toContain("github.event.pull_request.user.type != 'Bot'");
    expect(workflow).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
    // Both jobs, not just the deploy: cleanup calls the same credentialed API.
    expect(workflow.match(/head\.repo\.full_name == github\.repository/g)).toHaveLength(2);
  });

  it("stages the build into the directory wrangler is configured to upload", () => {
    const config = read("packages/docs-site/wrangler.toml");
    expect(config).toContain('name = "karasu-docs"');
    const outputDir = /pages_build_output_dir\s*=\s*"([^"]+)"/.exec(config)?.[1];
    expect(outputDir).toBeDefined();
    // The site is served one level down so its `/karasu/` base path resolves,
    // which is what makes the preview route identically to production.
    expect(workflow).toContain(`packages/docs-site/${outputDir}/karasu/`);
  });

  it("redirects the bare root only, so a missing base path still 404s", () => {
    // A `/*` splat would rescue a link that wrongly lacks the `/karasu/` prefix
    // — the exact routing bug the preview exists to catch. The destination is
    // asserted too: a `_redirects` written outside the uploaded tree is inert,
    // and the bare deployment URL would 404 with nothing to say so.
    const written = /printf '([^']+)' > (\S+)/.exec(workflow);
    expect(written?.[1]).toBe("/  /karasu/  302\\n");
    const outputDir = /pages_build_output_dir\s*=\s*"([^"]+)"/.exec(
      read("packages/docs-site/wrangler.toml"),
    )?.[1];
    expect(written?.[2]).toBe(`packages/docs-site/${outputDir}/_redirects`);
  });

  it("cleans up its own project, not the app's", () => {
    expect(workflow).toContain("project: karasu-docs");
  });

  it("triggers on the examples the gallery pages are rendered from", () => {
    // `sync.ts` renders every GALLERY_PAGES entry's `.krs` into a published
    // page, so an examples edit changes the site as much as a docs edit does.
    // The paths guard cannot see this: it derives its expectation from
    // PUBLISHED_EN_FILES, which does not name the gallery.
    const paths = parseWorkflowPaths(workflow, "paths");
    expect(paths.some((glob) => globMatches(glob, "examples/en/ec-platform/index.krs"))).toBe(true);
  });

  it("does not fire for a change outside what the site publishes", () => {
    const paths = parseWorkflowPaths(workflow, "paths");
    for (const unrelated of ["packages/core/src/index.ts", "docs/adr/953-x.md", "README.md"]) {
      expect(paths.some((glob) => globMatches(glob, unrelated))).toBe(false);
    }
  });
});
