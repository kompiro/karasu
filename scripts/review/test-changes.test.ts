import { describe, expect, it } from "vitest";
import {
  addsTest,
  checkTestChanges,
  closedIssueNumbers,
  maskPathsAndComments,
  reasonLine,
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
    hunks: [{ oldStart: p + 1, removed, newStart: p + 1, added }],
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
  const add = (path: string): ChangedFile => ({ path, status: "added", hunks: [] });

  it("counts a new test file, example, renderer fixture or AT fence", () => {
    expect(addsTest([add("packages/core/src/b.test.ts")])).toBe(true);
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

  it("does not count a skipped case, a comment or a line outside a table", () => {
    const at = (line: string) => edit(T, SUITE, [...SUITE, line]);
    expect(addsTest([at('it.skip("x", () => {});')])).toBe(false);
    expect(addsTest([at("// TODO: test the edge case")])).toBe(false);
    expect(addsTest([at("const x = 1;")])).toBe(false);
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
    expect(maskPathsAndComments(" * note")).not.toBe(maskPathsAndComments(" * note */"));
  });
});

describe("checkTestChanges", () => {
  describe("fix test", () => {
    const code: ChangedFile = edit("packages/core/src/a.ts", ["a"], ["b"]);

    it("asks a fix for a test case", () => {
      expect(check("fix(core): x", [code]).errors).toHaveLength(1);
      expect(
        check("fix(core): x", [code, { path: "x.test.ts", status: "added", hunks: [] }]),
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
      ["a removed line", SUITE.slice(0, 6).concat(SUITE.slice(7))],
      ["a skip", SUITE.map((l) => l.replace('it("draws', 'it.skip("draws'))],
      ["an only", [...SUITE, 'describe.only("y", () => {});']],
      ["a skipIf", [...SUITE, 'it.skipIf(!process.env.CI)("y", () => {});']],
      ["an early return", [...SUITE.slice(0, 5), "    return;", ...SUITE.slice(5)]],
    ])("asks for a Test change line on %s", (_, after) => {
      expect(check("feat: x", [edit(T, SUITE, after)]).errors).toHaveLength(1);
      expect(
        check("feat: x", [edit(T, SUITE, after)], "Test change: the expectation moved"),
      ).toEqual({
        errors: [],
        waivers: [{ label: "Test change", reason: "the expectation moved" }],
      });
    });

    it("asks for a reason on a deleted test file", () => {
      expect(check("chore: x", [{ path: T, status: "deleted", hunks: [] }]).errors).toHaveLength(1);
    });
  });
});
