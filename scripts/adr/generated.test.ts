import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type GeneratedPaths,
  type GeneratorRoot,
  TPL_DIR,
  classifyGeneratedDiff,
  generatedGlobs,
  isGenerated,
  parseNameStatus,
  readAdrPaths,
  readGeneratedPaths,
  readTplPaths,
  rootGlobs,
  sameOutputs,
  strayPaths,
} from "./generated.ts";

const ADR: GeneratorRoot = {
  dir: "docs/adr",
  outputs: ["effective.md", "graph.md", "graph/"],
};
const TPL: GeneratorRoot = { dir: TPL_DIR, outputs: ["index.md"] };
const CONFIG: GeneratedPaths = { adr: ADR, tpl: TPL };
/** A commit from before `tpl.config.json` named an `indexFile`. */
const NO_TPL_INDEX: GeneratedPaths = { adr: ADR, tpl: { dir: TPL_DIR, outputs: [] } };

const files = (...entries: [string, string][]) =>
  entries.map(([status, path]) => ({ status, path }));

describe("readAdrPaths", () => {
  it("reads the repo's adr.config.json", () => {
    const text = readFileSync(resolve(__dirname, "../../adr.config.json"), "utf-8");
    expect(readAdrPaths(text)).toEqual(ADR);
  });

  it("refuses a config without outputs or with a non-path output", () => {
    expect(() => readAdrPaths(JSON.stringify({ paths: { adrDir: "docs/adr" } }))).toThrow(
      /paths.outputs/,
    );
    expect(() =>
      readAdrPaths(JSON.stringify({ paths: { adrDir: "docs/adr", outputs: { graph: 1 } } })),
    ).toThrow(/not a path/);
    expect(() => readAdrPaths(JSON.stringify({ paths: { outputs: {} } }))).toThrow(/adrDir/);
  });
});

describe("readTplPaths", () => {
  it("reads the repo's tpl.config.json", () => {
    const text = readFileSync(resolve(__dirname, "../../tpl.config.json"), "utf-8");
    expect(readTplPaths(text)).toEqual(TPL);
  });

  it("has no outputs without the file or without indexFile", () => {
    expect(readTplPaths(null)).toEqual({ dir: TPL_DIR, outputs: [] });
    expect(readTplPaths(JSON.stringify({ idFormat: "issue-number" }))).toEqual({
      dir: TPL_DIR,
      outputs: [],
    });
  });

  it("refuses an indexFile that is not a path", () => {
    expect(() => readTplPaths(JSON.stringify({ indexFile: "" }))).toThrow(/indexFile/);
    expect(() => readTplPaths(JSON.stringify({ indexFile: 1 }))).toThrow(/indexFile/);
  });

  it("refuses an indexFile outside the TPL directory or with glob characters", () => {
    for (const indexFile of [
      "../CLAUDE.md",
      "a/../../x.md",
      "/abs.md",
      "dir/",
      "*.md",
      "a\\b.md",
    ]) {
      expect(() => readTplPaths(JSON.stringify({ indexFile })), indexFile).toThrow(
        /plain file under/,
      );
    }
    expect(readTplPaths(JSON.stringify({ indexFile: "./index.md" })).outputs).toEqual([
      "./index.md",
    ]);
  });
});

describe("readGeneratedPaths", () => {
  it("refuses a commit without adr.config.json", () => {
    expect(() => readGeneratedPaths({ adr: null, tpl: null })).toThrow(/adr\.config\.json/);
  });
});

describe("generatedGlobs", () => {
  it("joins each output to its root and turns a directory into its subtree", () => {
    expect(generatedGlobs(CONFIG)).toEqual([
      "docs/adr/effective.md",
      "docs/adr/graph.md",
      "docs/adr/graph/**",
      "docs/test-perspectives/index.md",
    ]);
  });

  it("leaves the TPL index out when tpl.config.json names none", () => {
    expect(generatedGlobs(NO_TPL_INDEX)).not.toContain("docs/test-perspectives/index.md");
  });

  it("normalizes a trailing slash on the root and a dot segment", () => {
    expect(rootGlobs({ dir: "docs/adr/", outputs: ["./index.md", "by-topic//"] })).toEqual([
      "docs/adr/by-topic/**",
      "docs/adr/index.md",
    ]);
  });

  it("covers nested files under a directory output but not a sibling with the same prefix", () => {
    const globs = generatedGlobs(CONFIG);
    expect(isGenerated("docs/adr/graph/parser.md", globs)).toBe(true);
    expect(isGenerated("docs/adr/graph/a/b.md", globs)).toBe(true);
    expect(isGenerated("docs/adr/graph-notes.md", globs)).toBe(false);
    expect(isGenerated("docs/adr/3416-x.md", globs)).toBe(false);
    expect(isGenerated("docs/test-perspectives/TPL-3289-x.md", globs)).toBe(false);
    expect(isGenerated("docs/test-perspectives/README.md", globs)).toBe(false);
  });
});

describe("sameOutputs", () => {
  it("ignores order and compares the joined paths", () => {
    expect(
      sameOutputs(CONFIG, {
        ...CONFIG,
        adr: { dir: "docs/adr/", outputs: ["graph/", "graph.md", "effective.md"] },
      }),
    ).toBe(true);
    expect(
      sameOutputs(CONFIG, { ...CONFIG, adr: { ...ADR, outputs: ["effective.md", "graph.md"] } }),
    ).toBe(false);
  });

  it("differs when only the TPL index differs", () => {
    expect(sameOutputs(CONFIG, NO_TPL_INDEX)).toBe(false);
  });
});

describe("strayPaths", () => {
  it("lets through every generator's outputs, a directory output's files included", () => {
    expect(
      strayPaths(
        [
          "docs/adr/effective.md",
          "docs/adr/graph/parser.md",
          "docs/test-perspectives/index.md",
          "docs/test-perspectives/TPL-3289-x.md",
          "docs/adr/graph-notes.md",
        ],
        CONFIG,
      ),
    ).toEqual(["docs/test-perspectives/TPL-3289-x.md", "docs/adr/graph-notes.md"]);
  });

  it("normalizes a dot segment in an output", () => {
    const dotted = { ...CONFIG, tpl: { dir: TPL_DIR, outputs: ["./index.md"] } };
    expect(strayPaths(["docs/test-perspectives/index.md"], dotted)).toEqual([]);
  });

  it("treats the TPL index as stray when tpl.config.json names none", () => {
    expect(strayPaths(["docs/test-perspectives/index.md"], NO_TPL_INDEX)).toEqual([
      "docs/test-perspectives/index.md",
    ]);
  });
});

describe("parseNameStatus", () => {
  it("reads NUL-separated entries, paths with tabs and newlines included", () => {
    expect(parseNameStatus("M\0docs/adr/effective.md\0A\0a\tb\nc.md\0")).toEqual([
      { status: "M", path: "docs/adr/effective.md" },
      { status: "A", path: "a\tb\nc.md" },
    ]);
    expect(parseNameStatus("")).toEqual([]);
  });

  it("refuses a rename, which would hide the source path", () => {
    expect(() => parseNameStatus("R100\0docs/adr/1-a.md\0docs/adr/graph/1-a.md\0")).toThrow(
      /--no-renames/,
    );
  });
});

describe("classifyGeneratedDiff", () => {
  const classify = (
    list: ReturnType<typeof files>,
    head: GeneratedPaths = CONFIG,
    base: GeneratedPaths = CONFIG,
  ) => classifyGeneratedDiff({ base, head, files: list });

  it("an ADR PR that leaves the generated files alone is regular", () => {
    expect(classify(files(["A", "docs/adr/3416-x.md"], ["D", "docs/design/x.md"])).kind).toBe(
      "regular",
    );
  });

  it("a PR that changes only generated files is a regeneration", () => {
    const v = classify(
      files(
        ["M", "docs/adr/effective.md"],
        ["A", "docs/adr/graph/new-topic.md"],
        ["D", "docs/adr/graph/old-topic.md"],
      ),
    );
    expect(v.kind).toBe("regeneration");
    expect(v.reasons).toEqual([]);
  });

  it("generated files together with an ADR is mixed", () => {
    const v = classify(files(["A", "docs/adr/3416-x.md"], ["M", "docs/adr/effective.md"]));
    expect(v.kind).toBe("mixed");
    expect(v.reasons[0]).toMatch(/docs\/adr\/effective\.md/);
  });

  it("deleting a generated file in an otherwise regular PR is mixed", () => {
    expect(classify(files(["A", "docs/adr/3416-x.md"], ["D", "docs/adr/graph.md"])).kind).toBe(
      "mixed",
    );
  });

  it("an empty diff is regular: nothing generated is written", () => {
    expect(classify([]).kind).toBe("regular");
  });

  describe("the TPL index", () => {
    it("a PR that adds a TPL and leaves the index alone is regular", () => {
      expect(classify(files(["A", "docs/test-perspectives/TPL-3289-x.md"])).kind).toBe("regular");
    });

    it("a PR that changes only the TPL index, or it and the ADR outputs, is a regeneration", () => {
      expect(classify(files(["A", "docs/test-perspectives/index.md"])).kind).toBe("regeneration");
      expect(
        classify(files(["M", "docs/adr/effective.md"], ["M", "docs/test-perspectives/index.md"]))
          .kind,
      ).toBe("regeneration");
    });

    it("the TPL index together with a TPL is mixed", () => {
      const v = classify(
        files(
          ["A", "docs/test-perspectives/TPL-3289-x.md"],
          ["M", "docs/test-perspectives/index.md"],
        ),
      );
      expect(v.kind).toBe("mixed");
      expect(v.reasons[0]).toMatch(/docs\/test-perspectives\/index\.md/);
    });

    it("naming the index in tpl.config.json and writing it in the same PR is mixed", () => {
      const v = classify(
        files(["M", "tpl.config.json"], ["A", "docs/test-perspectives/index.md"]),
        CONFIG,
        NO_TPL_INDEX,
      );
      expect(v.kind).toBe("mixed");
    });

    it("naming the index without writing it is regular", () => {
      expect(classify(files(["M", "tpl.config.json"]), CONFIG, NO_TPL_INDEX).kind).toBe("regular");
    });

    it("an index-only diff while only the head names the index is not a regeneration", () => {
      const v = classify(files(["A", "docs/test-perspectives/index.md"]), CONFIG, NO_TPL_INDEX);
      expect(v.kind).toBe("mixed");
      expect(v.reasons[0]).toMatch(/tpl\.config\.json indexFile/);
    });
  });

  describe("when the outputs move", () => {
    const moved: GeneratedPaths = {
      ...CONFIG,
      adr: { dir: "docs/adr", outputs: ["effective.md", "graph.md", "topics/"] },
    };

    it("changing the config and deleting the old output is regular", () => {
      expect(
        classify(files(["M", "adr.config.json"], ["D", "docs/adr/graph/parser.md"]), moved).kind,
      ).toBe("regular");
    });

    it("writing the new output in the same PR is mixed", () => {
      expect(
        classify(files(["M", "adr.config.json"], ["A", "docs/adr/topics/parser.md"]), moved).kind,
      ).toBe("mixed");
    });

    it("a generated-only diff across different outputs is not a regeneration", () => {
      const v = classify(files(["A", "docs/adr/topics/parser.md"]), moved);
      expect(v.kind).toBe("mixed");
      expect(v.reasons[0]).toMatch(/paths\.outputs or tpl\.config\.json indexFile\) differ/);
    });

    it("an output that only the head names is still generated", () => {
      // The base does not own docs/adr/topics/, but writing it alongside an ADR is still mixed.
      expect(
        classify(files(["A", "docs/adr/3416-x.md"], ["A", "docs/adr/topics/parser.md"]), moved)
          .kind,
      ).toBe("mixed");
    });
  });
});
