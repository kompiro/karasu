import { describe, expect, it } from "vitest";
import {
  addsTest,
  checkTestChanges,
  closedIssueNumbers,
  codeLineStarts,
  isTestSupport,
  maskPathsAndComments,
  reasonLine,
  removedInputs,
  titleType,
} from "./test-changes.ts";
import type { ChangedFile } from "./tier.ts";

const T = "packages/core/src/a.test.ts";

/** One file changed from `before` to `after`, with the `-U0` hunks a line diff gives. */
function edit(path: string, before: string[], after: string[]): ChangedFile {
  // Common prefix and suffix; the rest is one hunk, as -U0 prints a single change.
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (
    s < before.length - p &&
    s < after.length - p &&
    before[before.length - 1 - s] === after[after.length - 1 - s]
  ) {
    s++;
  }
  const removed = before.slice(p, before.length - s);
  const added = after.slice(p, after.length - s);
  return {
    path,
    status: "modified",
    // As git prints them: a side with no lines names the line before the change.
    hunks: [
      {
        oldStart: removed.length > 0 ? p + 1 : p,
        removed,
        newStart: added.length > 0 ? p + 1 : p,
        added,
      },
    ],
    before: before.join("\n"),
    after: after.join("\n"),
  };
}

const check = (title: string, files: ChangedFile[], body = "", closesBug = false) =>
  checkTestChanges({ title, body, closesBug, files });

const SUITE = [
  'import { describe, expect, it } from "vitest";',
  'import { render } from "./renderer/svg-renderer.ts";',
  "",
  'describe("render", () => {',
  '  it("draws a node", () => {',
  "    expect(render(model)).toContain(",
  '      "<rect",',
  "    );",
  "  });",
  "});",
];

describe("titleType", () => {
  it.each([
    ["fix(core): x", "fix"],
    ["fix!: x", "fix"],
    ["Refactor(core)!: x", "refactor"],
    ["feat: x", "feat"],
    ["Fix the thing", null],
  ])("%s → %s", (title, type) => {
    expect(titleType(title)).toBe(type);
  });
});

describe("reasonLine", () => {
  it("reads the reason after the label", () => {
    expect(reasonLine("intro\nNo test: lint-only change\n", "No test")).toBe("lint-only change");
    expect(reasonLine("- Test change: the API is gone", "Test change")).toBe("the API is gone");
  });

  it("ignores the template's comments, fenced examples and placeholders", () => {
    expect(reasonLine("<!--\nNo test: <reason>\nNo test: example\n-->", "No test")).toBeNull();
    expect(reasonLine("```\nNo test: example\n```", "No test")).toBeNull();
    expect(reasonLine("No test: <reason>", "No test")).toBeNull();
    expect(reasonLine("No test:", "No test")).toBeNull();
    expect(reasonLine("| 1 | No test: in a table |", "No test")).toBeNull();
  });

  it("trims trailing spaces, in linear time", () => {
    expect(reasonLine("No test: x   ", "No test")).toBe("x");
    const started = performance.now();
    reasonLine(`No test: x${" ".repeat(60_000)}y`, "No test");
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe("closedIssueNumbers", () => {
  it("reads every closing keyword, for this repository only", () => {
    expect(
      closedIssueNumbers(
        "Closes #12\nfixes: kompiro/karasu#13\nResolved #14\nRefs #15\nCloses other/repo#16",
        "kompiro/karasu",
      ),
    ).toEqual([12, 13, 14]);
  });

  it("does not read the template's comments", () => {
    expect(closedIssueNumbers("<!-- Closes #1 -->", "kompiro/karasu")).toEqual([]);
  });
});

describe("addsTest", () => {
  const add = (path: string, after?: string): ChangedFile => ({
    path,
    status: "added",
    hunks: [],
    after,
  });

  it("counts a new test file, example, renderer fixture or AT fence", () => {
    expect(addsTest([add("packages/core/src/b.test.ts", SUITE.join("\n"))])).toBe(true);
    expect(addsTest([add("examples/ja/new/index.krs")])).toBe(true);
    expect(addsTest([add("packages/core/src/renderer/fixtures/edge.krs")])).toBe(true);
    expect(addsTest([edit("docs/acceptance/x.md", ["# x"], ["# x", "```krs", "a", "```"])])).toBe(
      true,
    );
    expect(addsTest([add("packages/core/src/b.ts")])).toBe(false);
  });

  it("counts a test case added to an existing file", () => {
    const after = [...SUITE.slice(0, 9), '  it.each([1])("x %s", () => {});', "});"];
    expect(addsTest([edit(T, SUITE, after)])).toBe(true);
  });

  it("counts a row added to an existing .each table", () => {
    const before = ["it.each([", '  ["a", 1],', "])('%s', () => {});"];
    const after = ["it.each([", '  ["a", 1],', '  ["b", 2],', "])('%s', () => {});"];
    expect(addsTest([edit(T, before, after)])).toBe(true);
  });

  it("does not count a new test file whose cases are all skipped", () => {
    const skipped = SUITE.map((l) => l.replace('it("draws', 'it.skip("draws')).join("\n");
    expect(addsTest([add("packages/core/src/b.test.ts", skipped)])).toBe(false);
  });

  it("counts a row added to a named table", () => {
    const before = ["const CASES = [", "  [1, 2],", "];", "it.each(CASES)('%s', () => {});"];
    const after = [
      "const CASES = [",
      "  [1, 2],",
      "  [3, 4],",
      "];",
      "it.each(CASES)('%s', () => {});",
    ];
    expect(addsTest([edit(T, before, after)])).toBe(true);
  });

  it("does not count a renamed case or one added inside a comment", () => {
    const renamed = SUITE.map((l) => l.replace('"draws a node"', '"draws a node card"'));
    expect(addsTest([edit(T, SUITE, renamed)])).toBe(false);
    const commented = [...SUITE, "/*", 'it("later", () => {});', "*/"];
    expect(addsTest([edit(T, SUITE, commented)])).toBe(false);
  });

  it("does not count a skipped case, a comment or a line outside a table", () => {
    const at = (line: string) => edit(T, SUITE, [...SUITE, line]);
    expect(addsTest([at('it.skip("x", () => {});')])).toBe(false);
    expect(addsTest([at("// TODO: test the edge case")])).toBe(false);
    expect(addsTest([at("const x = 1;")])).toBe(false);
  });
});

describe("codeLineStarts", () => {
  it("reads a division after ++ or --, and a JSX closing tag, as code", () => {
    expect(codeLineStarts(["const n = i++ / 2; /* off", "it();", "*/"].join("\n"))).toEqual([
      true,
      false,
      false,
    ]);
    expect(codeLineStarts(["render(<p>a</p>); /*", "it();", "*/"].join("\n"))).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("reads a regex literal as code, whatever quotes or slashes it holds", () => {
    expect(codeLineStarts(["const q = /\\/\\//; /*", "a();", "*/", "b();"].join("\n"))).toEqual([
      true,
      false,
      false,
      true,
    ]);
    expect(codeLineStarts(['const q = /"/; /*', "a();", "*/"].join("\n"))).toEqual([
      true,
      false,
      false,
    ]);
    expect(codeLineStarts(["const r = a / b; /*", "x", "*/"].join("\n"))).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("tells code from block comments and template literals", () => {
    const text = [
      "a();",
      "/* x",
      "y */ b();",
      "const s = `",
      "${f({ a: 1 })} z",
      "`;",
      "c(); // `",
      'd("/*");',
      "e();",
    ].join("\n");
    expect(codeLineStarts(text)).toEqual([true, true, false, true, false, false, true, true, true]);
  });
});

describe("maskPathsAndComments", () => {
  it("masks module paths and comment text", () => {
    expect(maskPathsAndComments('vi.mock("../renderer/a")')).toBe(
      maskPathsAndComments('vi.mock("../renderer/b/a")'),
    );
    expect(maskPathsAndComments('read("svg-renderer.ts")')).toBe(
      maskPathsAndComments('read("node-card.ts")'),
    );
    expect(maskPathsAndComments("  // in svg-renderer.ts")).toBe(
      maskPathsAndComments("  // in node-card.ts"),
    );
    expect(maskPathsAndComments("x(); // old")).toBe(maskPathsAndComments("x(); // new"));
  });

  it("keeps code, other strings and block-comment markers apart", () => {
    expect(maskPathsAndComments("expect(a).toBe(1)")).not.toBe(
      maskPathsAndComments("expect(a).toBe(2)"),
    );
    expect(maskPathsAndComments('expect(a).toBe("x")')).not.toBe(
      maskPathsAndComments('expect(a).toBe("y")'),
    );
    expect(maskPathsAndComments("// note")).not.toBe(maskPathsAndComments("/* note"));
    // Code after a block comment closes, and a line that continues an expression with `*`.
    expect(maskPathsAndComments("/* a */ b();")).not.toBe(maskPathsAndComments("/* a */ c();"));
    expect(maskPathsAndComments("  * 2;")).not.toBe(maskPathsAndComments("  * 3;"));
    // A repo path is a test's input, not a module reference.
    expect(maskPathsAndComments('pathTier("packages/nest/a.ts")')).not.toBe(
      maskPathsAndComments('pathTier("scripts/review/a.ts")'),
    );
    expect(maskPathsAndComments(" * note")).not.toBe(maskPathsAndComments(" * note */"));
  });
});

describe("checkTestChanges", () => {
  describe("fix test", () => {
    const code: ChangedFile = edit("packages/core/src/a.ts", ["a"], ["b"]);

    it("asks a fix for a test case", () => {
      expect(check("fix(core): x", [code]).errors).toHaveLength(1);
      expect(
        check("fix(core): x", [
          code,
          { path: "x.test.ts", status: "added", hunks: [], after: SUITE.join("\n") },
        ]),
      ).toMatchObject({ errors: [], waivers: [] });
    });

    it("asks a PR that closes a bug Issue, whatever its title type", () => {
      expect(check("feat: x", [code], "", true).errors).toHaveLength(1);
      expect(check("feat: x", [code], "", false).errors).toEqual([]);
    });

    it("passes on a No test line and lists it", () => {
      expect(check("fix: x", [code], "No test: CI config only")).toEqual({
        errors: [],
        waivers: [{ label: "No test", reason: "CI config only" }],
      });
    });
  });

  describe("refactor", () => {
    it("allows import moves, multi-line imports and blank lines among them", () => {
      const after = [
        "import {",
        "  describe,",
        "  expect,",
        "  it,",
        '} from "vitest";',
        "",
        'import { render } from "./renderer/node-card.ts";',
        ...SUITE.slice(2),
      ];
      expect(check("refactor(core): x", [edit(T, SUITE, after)]).errors).toEqual([]);
    });

    it("allows a module path or comment swap paired line by line", () => {
      const before = [...SUITE, "// see svg-renderer.ts", 'vi.mock("./renderer/svg-renderer.ts");'];
      const after = [...SUITE, "// see node-card.ts", 'vi.mock("./renderer/node-card.ts");'];
      expect(check("refactor: x", [edit(T, before, after)]).errors).toEqual([]);
    });

    it.each([
      ["a rewritten matcher", '      "<rect",', '      "<g",'],
      ["a wrapped matcher line", "    );", "    ).not;"],
    ])("fails %s", (_, from, to) => {
      const after = SUITE.map((l) => (l === from ? to : l));
      expect(check("refactor: x", [edit(T, SUITE, after)]).errors).toHaveLength(1);
    });

    it("fails an added or removed line, an opened block comment, a deleted file", () => {
      expect(check("refactor: x", [edit(T, SUITE, [...SUITE, "// note"])]).errors).toHaveLength(1);
      expect(check("refactor: x", [edit(T, SUITE, SUITE.slice(0, -1))]).errors).toHaveLength(1);
      const opened = SUITE.map((l) => (l === "" ? "/*" : l));
      expect(check("refactor: x", [edit(T, SUITE, opened)]).errors).toHaveLength(1);
      expect(check("refactor: x", [{ path: T, status: "deleted", hunks: [] }]).errors).toHaveLength(
        1,
      );
    });

    it("does not read a .krs import inside a fixture string as an import", () => {
      const before = [
        "const krs = `",
        'import "./shared.krs"',
        "system a {}",
        "`;",
        ...SUITE.slice(3),
      ];
      const after = before.filter((l) => l !== 'import "./shared.krs"');
      expect(check("refactor: x", [edit(T, before, after)]).errors).toHaveLength(1);
      expect(check("feat: x", [edit(T, before, after)]).errors).toHaveLength(1);
    });

    it("fails code added after a comment closes, and a changed `*` continuation", () => {
      const before = [...SUITE.slice(0, 3), "/**", " * Checks f. */", ...SUITE.slice(3)];
      const after = before.map((l) =>
        l === " * Checks f. */" ? ' * Checks f. */ it.skip("f2", () => {});' : l,
      );
      expect(check("refactor: x", [edit(T, before, after)]).errors).toHaveLength(1);
      const sum = ["const total = a", "  * 2;", ...SUITE.slice(3)];
      const changed = sum.map((l) => (l === "  * 2;" ? "  * 3;" : l));
      expect(check("refactor: x", [edit(T, sum, changed)]).errors).toHaveLength(1);
    });

    it("fails code riding on an import line", () => {
      const after = SUITE.map((l) =>
        l.startsWith("import { render }")
          ? 'import { render } from "./renderer/node-card.ts"; beforeEach((c) => c.skip());'
          : l,
      );
      expect(check("refactor: x", [edit(T, SUITE, after)]).errors).toHaveLength(1);
    });

    it("fails one test API binding moved to another module", () => {
      const after = [
        'import { describe, it } from "vitest";',
        'import { expect } from "./noop-expect.ts";',
        ...SUITE.slice(1),
      ];
      expect(check("refactor: x", [edit(T, SUITE, after)]).errors).toHaveLength(1);
      expect(check("feat: x", [edit(T, SUITE, after)]).errors).toHaveLength(1);
      const spec = ['import { expect, test } from "../fixtures/opfs.js";', 'test("a", () => {});'];
      const repointed = [spec[0].replace("opfs.js", "noop.js"), spec[1]];
      expect(check("feat: x", [edit(T, spec, repointed)]).errors).toHaveLength(1);
    });

    it("fails a test API taken from somewhere other than the runner", () => {
      const after = SUITE.map((l) => l.replace('from "vitest"', 'from "./noop-vitest.ts"'));
      expect(check("refactor: x", [edit(T, SUITE, after)]).errors).toHaveLength(1);
      expect(check("feat: x", [edit(T, SUITE, after)]).errors).toHaveLength(1);
    });

    it("is not waived by a Test change line", () => {
      const after = SUITE.slice(0, -1);
      expect(
        check("refactor: x", [edit(T, SUITE, after)], "Test change: dropping a case").errors,
      ).toHaveLength(1);
    });
  });

  describe("other PRs", () => {
    it("lets a PR add cases and move imports without a reason", () => {
      const after = [...SUITE.slice(0, 9), '  it("y", () => {});', "});"];
      expect(check("feat: x", [edit(T, SUITE, after)]).errors).toEqual([]);
    });

    it.each([
      ['  it("system only: tabs disabled", () => {});'],
      ["  const page = paginate({ skip: 10, take: 5 });"],
      ["  expect(result.only).toBe(true);"],
      ['  it("calls x.skip() on old input", () => {});'],
    ])("does not read data or titles as a skip: %s", (line) => {
      const after = [...SUITE.slice(0, 9), line, "});"];
      expect(check("feat: x", [edit(T, SUITE, after)]).errors).toEqual([]);
    });

    it("lets a PR remove a blank line outside a template literal, or spread a variable named skip", () => {
      expect(
        check("feat: x", [
          edit(
            T,
            SUITE,
            SUITE.filter((l, i) => i !== 2),
          ),
        ]).errors,
      ).toEqual([]);
      const spread = [...SUITE, "expect(Math.max(...skip.points)).toBeGreaterThan(0);"];
      expect(check("feat: x", [edit(T, SUITE, spread)]).errors).toEqual([]);
    });

    it("asks for a reason when a blank line inside a template literal is removed", () => {
      const before = [...SUITE, "const expected = `a", "", "b`;"];
      const after = [...SUITE, "const expected = `a", "b`;"];
      expect(check("feat: x", [edit(T, before, after)]).errors).toHaveLength(1);
    });

    it.each([
      ["a removed line", SUITE.slice(0, 6).concat(SUITE.slice(7))],
      ["a skip", SUITE.map((l) => l.replace('it("draws', 'it.skip("draws'))],
      ["an only", [...SUITE, 'describe.only("y", () => {});']],
      ["a skipIf", [...SUITE, 'it.skipIf(!process.env.CI)("y", () => {});']],
      ["an early return", [...SUITE.slice(0, 5), "    return;", ...SUITE.slice(5)]],
      ["a commented return", [...SUITE.slice(0, 5), "    return; // tmp", ...SUITE.slice(5)]],
      ["a guarded return", [...SUITE.slice(0, 5), "    if (true) return;", ...SUITE.slice(5)]],
      ["a return of undefined", [...SUITE.slice(0, 5), "    return undefined;", ...SUITE.slice(5)]],
      ["a skip option", [...SUITE.slice(0, 4), "  { skip: true },", ...SUITE.slice(4)]],
      ["a quoted skip option", [...SUITE.slice(0, 4), '  { "skip": true },', ...SUITE.slice(4)]],
      [
        "a context skip",
        [...SUITE.slice(0, 3), 'beforeEach((ctx) => ctx["skip"]());', ...SUITE.slice(3)],
      ],
      ["a Playwright fail", [...SUITE.slice(0, 5), "    test.fail();", ...SUITE.slice(5)]],
      [
        "a return with a comment",
        [...SUITE.slice(0, 5), "    return /* tmp */;", ...SUITE.slice(5)],
      ],
    ])("asks for a Test change line on %s", (_, after) => {
      expect(check("feat: x", [edit(T, SUITE, after)]).errors).toHaveLength(1);
      expect(
        check("feat: x", [edit(T, SUITE, after)], "Test change: the expectation moved"),
      ).toEqual({
        errors: [],
        waivers: [{ label: "Test change", reason: "the expectation moved" }],
      });
    });

    it.each([
      ["a block comment", "/*", "*/"],
      ["a template literal", "const off = `", "`;"],
    ])("asks for a Test change line when %s wraps untouched tests", (_, open, close) => {
      const after = [...SUITE.slice(0, 3), open, ...SUITE.slice(3), close];
      const file = edit(T, SUITE, after);
      // Two insertions, as -U0 prints them.
      file.hunks = [
        { oldStart: 3, removed: [], newStart: 4, added: [open] },
        { oldStart: SUITE.length, removed: [], newStart: after.length, added: [close] },
      ];
      expect(check("feat: x", [file]).errors).toHaveLength(1);
      expect(check("refactor: x", [file]).errors).toHaveLength(1);
    });

    it("asks for a reason when a side of the file is unknown", () => {
      const file: ChangedFile = {
        path: T,
        status: "modified",
        hunks: [{ oldStart: 10, removed: [], newStart: 11, added: ['it("y", () => {});'] }],
      };
      expect(check("feat: x", [file]).errors).toHaveLength(1);
    });

    it("maps untouched lines across a removal and an insertion", () => {
      // A blank line removed above, then a comment opened around the case below.
      const after = [
        ...SUITE.slice(0, 2),
        ...SUITE.slice(3, 4),
        "/*",
        ...SUITE.slice(4, 9),
        "*/",
        "});",
      ];
      const file = edit(T, SUITE, after);
      file.hunks = [
        { oldStart: 3, removed: [""], newStart: 2, added: [] },
        { oldStart: 4, removed: [], newStart: 4, added: ["/*"] },
        { oldStart: 9, removed: [], newStart: 10, added: ["*/"] },
      ];
      expect(check("feat: x", [file]).errors).toHaveLength(1);
      // The same removal alone hides nothing.
      const blankOnly = edit(
        T,
        SUITE,
        SUITE.filter((_, i) => i !== 2),
      );
      expect(check("feat: x", [blankOnly]).errors).toEqual([]);
    });

    it("asks for a reason on a deleted test file", () => {
      expect(check("chore: x", [{ path: T, status: "deleted", hunks: [] }]).errors).toHaveLength(1);
    });
  });

  describe("helpers, runner configs and inputs (#3548)", () => {
    const H = "packages/e2e/fixtures/editor.ts";
    const HELPER = [
      'import { type Page, expect } from "@playwright/test";',
      "",
      "export async function typeIn(page: Page, text: string) {",
      "  await page.keyboard.type(text);",
      '  await expect(page.locator(".view-lines")).toContainText(text);',
      "}",
    ];
    const C = "packages/core/vitest.config.ts";
    const CONFIG = [
      'import { defineConfig } from "vitest/config";',
      "",
      "export default defineConfig({",
      "  test: {",
      '    include: ["src/**/*.test.ts"],',
      "  },",
      "});",
    ];
    const gone = (path: string, before = "graph {}"): ChangedFile => ({
      path,
      status: "deleted",
      hunks: [],
      before,
      after: null,
    });
    const added = (path: string, after = "graph {}"): ChangedFile => ({
      path,
      status: "added",
      hunks: [],
      before: null,
      after,
    });

    it("reads a module that takes the test API as a helper", () => {
      expect(isTestSupport(edit(H, HELPER, HELPER))).toBe(true);
      const typesOnly = ['import type { Page } from "@playwright/test";', ...HELPER.slice(1, 4)];
      expect(isTestSupport(edit("packages/e2e/fixtures/chat.ts", typesOnly, typesOnly))).toBe(
        false,
      );
      expect(isTestSupport(added(H, HELPER.join("\n")))).toBe(false);
      expect(isTestSupport(edit(C, CONFIG, CONFIG))).toBe(false);
    });

    it("asks for a reason when an assertion leaves a helper, and fails a refactor", () => {
      const file = edit(H, HELPER, HELPER.slice(0, 4).concat(HELPER.slice(5)));
      expect(check("test(e2e): x", [file]).errors).toHaveLength(1);
      expect(check("test(e2e): x", [file], "Test change: the wait moved").errors).toEqual([]);
      expect(check("refactor(e2e): x", [file]).errors).toHaveLength(1);
    });

    it("lets a PR add to a helper or move its imports", () => {
      const more = [...HELPER, "export const ready = true;"];
      expect(check("test(e2e): x", [edit(H, HELPER, more)]).errors).toEqual([]);
      const moved = ['import { expect, type Page } from "@playwright/test";', ...HELPER.slice(1)];
      expect(check("refactor(e2e): x", [edit(H, HELPER, moved)]).errors).toEqual([]);
    });

    it.each([
      ["an exclude", [...CONFIG.slice(0, 5), '    exclude: ["src/slow/**"],', ...CONFIG.slice(5)]],
      ["a narrowed include", CONFIG.map((l) => l.replace("src/**", "src/parser/**"))],
      ["a commented-out include", CONFIG.map((l) => l.replace("    include", "    // include"))],
      [
        "a comment opened around the include",
        [...CONFIG.slice(0, 4), "/*", ...CONFIG.slice(4, 5), "*/", ...CONFIG.slice(5)],
      ],
    ])("asks for a reason when a runner config gets %s", (_, after) => {
      const file = edit(C, CONFIG, after);
      expect(check("chore: x", [file]).errors).toHaveLength(1);
      expect(check("chore: x", [file], "Test change: slow tests run nightly").errors).toEqual([]);
      // A refactor asks for the same line rather than failing: an alias change keeps the run.
      expect(check("refactor: x", [file]).errors).toHaveLength(1);
      expect(check("refactor: x", [file], "Test change: alias only").errors).toEqual([]);
    });

    it("asks for a reason on any change to which specs run, even one that widens it", () => {
      // Whether a regex or glob narrows the run is not read from the text.
      const before = [...CONFIG, "const SERVE_SPECS = /at-0032-/;"];
      const after = [...CONFIG, "const SERVE_SPECS = /at-(0032|3258)-/;"];
      expect(check("fix: x", [edit(C, before, after)], "No test: config").errors).toHaveLength(1);
    });

    it("lets a runner config change its comments and blank lines, or be added", () => {
      const before = [...CONFIG.slice(0, 4), "    // the unit tests", ...CONFIG.slice(4)];
      const after = [...CONFIG.slice(0, 4), "    // unit tests only", "", ...CONFIG.slice(4)];
      expect(check("refactor: x", [edit(C, before, after)]).errors).toEqual([]);
      const noted = [
        ...CONFIG.slice(0, 2),
        "// Measured in #1.",
        "/* and kept */",
        ...CONFIG.slice(2),
      ];
      expect(check("ci: x", [edit(C, CONFIG, noted)]).errors).toEqual([]);
      expect(check("chore: x", [added(C, CONFIG.join("\n"))]).errors).toEqual([]);
      expect(check("chore: x", [gone(C, CONFIG.join("\n"))]).errors).toHaveLength(1);
    });

    it("reads a deleted example or fixture as a removed input, and a move as none", () => {
      const ex = "examples/ja/shop/index.krs";
      const fx = "packages/core/src/renderer/fixtures/edge.krs";
      expect(removedInputs([gone(ex)])).toEqual([ex]);
      expect(removedInputs([gone(fx)])).toEqual([fx]);
      expect(removedInputs([gone(ex), added("examples/ja/store/index.krs")])).toEqual([]);
      expect(
        removedInputs([gone(ex), added("examples/ja/store/index.krs", "graph { a }")]),
      ).toEqual([ex]);
      // Moved out of the inputs, it is no longer read.
      expect(removedInputs([gone(fx), added("docs/edge.krs")])).toEqual([fx]);
      expect(removedInputs([gone("packages/e2e/fixtures/serve-project/index.krs")])).toEqual([]);
    });

    it("reads an acceptance-test record left with fewer krs fences as a removed input", () => {
      const AT = "docs/acceptance/0001-x.md";
      const before = ["# x", "```krs", "a", "```", "", "```krs", "b", "```"];
      expect(removedInputs([edit(AT, before, before.slice(0, 5))])).toEqual([AT]);
      const swapped = [...before.slice(4), ...before.slice(0, 4)];
      expect(removedInputs([edit(AT, before, swapped)])).toEqual([]);
      expect(removedInputs([gone(AT, before.join("\n"))])).toEqual([AT]);
      expect(removedInputs([gone(AT, "# x\nno fences")])).toEqual([]);
    });

    it("asks a reason for a removed input, and fails a refactor that removes one", () => {
      const files = [gone("examples/ja/shop/index.krs")];
      expect(check("docs: x", files).errors).toHaveLength(1);
      expect(check("docs: x", files, "Test change: the example moved to a guide").errors).toEqual(
        [],
      );
      expect(check("refactor: x", files).errors).toHaveLength(1);
    });
  });
});
