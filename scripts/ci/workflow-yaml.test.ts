import { describe, expect, it } from "vitest";
import {
  globToRegExp,
  jobs,
  parseYaml,
  pullRequestFilter,
  startsOn,
  triggers,
} from "./workflow-yaml";

// The guards built on `workflow-yaml.ts` trust it to read the shapes the
// workflows and `lefthook.yml` use. A misread there passes those guards
// vacuously (an empty `paths:` list mirrors another empty list), so each shape
// they depend on is pinned here.

describe("parseYaml", () => {
  it("reads nested mappings, block and flow sequences, quotes and comments", () => {
    const yaml = parseYaml(
      [
        "on:",
        "  pull_request:",
        "    branches: [main]",
        "    # a comment line inside the block",
        "    paths-ignore:",
        '      - "docs/**" # trailing comment',
        "      - '**/*.md'",
        "      - .claude/**",
        "jobs:",
        "  check:",
        '    name: "Check #1"',
      ].join("\n"),
    );
    expect(yaml).toEqual({
      on: {
        pull_request: { branches: ["main"], "paths-ignore": ["docs/**", "**/*.md", ".claude/**"] },
      },
      jobs: { check: { name: "Check #1" } },
    });
  });

  it("reads a sequence of mappings and keeps block scalars whole", () => {
    const yaml = parseYaml(
      [
        "steps:",
        "  - uses: actions/checkout@v7",
        "  - name: Scan",
        "    run: |",
        "      gitleaks detect \\",
        "        --redact",
        "",
        "      echo done",
        "  - run: pnpm lint",
      ].join("\n"),
    );
    expect(yaml).toEqual({
      steps: [
        { uses: "actions/checkout@v7" },
        { name: "Scan", run: "gitleaks detect \\\n  --redact\n\necho done\n" },
        { run: "pnpm lint" },
      ],
    });
  });

  it("accepts a sequence at its key's indentation", () => {
    expect(parseYaml("paths:\n- a\n- b\nnext: 1")).toEqual({ paths: ["a", "b"], next: "1" });
  });
});

describe("workflow helpers", () => {
  it("normalises the on: forms and reads the PR filter", () => {
    expect(triggers({ on: "push" })).toEqual({ push: null });
    expect(triggers({ on: ["push", "pull_request"] })).toEqual({ push: null, pull_request: null });
    expect(pullRequestFilter({ on: ["pull_request"] })).toEqual({});
    expect(pullRequestFilter({ on: { push: null } })).toBeUndefined();
  });

  it("splits run scripts into commands and joins continuations", () => {
    const workflow = parseYaml(
      [
        "jobs:",
        "  a:",
        "    if: github.event_name == 'push'",
        "    steps:",
        "      - run: |",
        "          one \\",
        "            --flag",
        "          two",
        "      - if: always()",
        "        run: three",
      ].join("\n"),
    ) as Record<string, never>;
    expect(jobs(workflow)).toEqual([
      {
        id: "a",
        name: "a",
        if: "github.event_name == 'push'",
        steps: [{ commands: ["one --flag", "two"] }, { if: "always()", commands: ["three"] }],
        commands: ["one --flag", "two", "three"],
      },
    ]);
  });

  it("matches globs the way GitHub's path filter does", () => {
    expect(globToRegExp("**/*.md").test("README.md")).toBe(true);
    expect(globToRegExp("**/*.md").test("a/b/README.md")).toBe(true);
    expect(globToRegExp("docs/**").test("docs/a/b.md")).toBe(true);
    expect(globToRegExp(".claude/**").test(".claude/rules/x.md")).toBe(true);
    expect(globToRegExp("docs/adr/*.md").test("docs/adr/graph/x.md")).toBe(false);
    expect(globToRegExp("packages/**/*.{ts,tsx}").test("packages/app/src/a.tsx")).toBe(true);
    expect(startsOn({ pathsIgnore: ["docs/**"] }, "docs/a.md")).toBe(false);
    expect(startsOn({ paths: ["docs/**"] }, "docs/a.md")).toBe(true);
    expect(startsOn({}, "anything")).toBe(true);
  });
});
