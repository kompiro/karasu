import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AdrPaths,
  classifyGeneratedDiff,
  generatedGlobs,
  isGenerated,
  parseNameStatus,
  readAdrPaths,
  sameOutputs,
} from "./generated.ts";

const CONFIG: AdrPaths = {
  adrDir: "docs/adr",
  outputs: ["effective.md", "graph.md", "graph/"],
};

const files = (...entries: [string, string][]) =>
  entries.map(([status, path]) => ({ status, path }));

describe("readAdrPaths", () => {
  it("reads the repo's adr.config.json", () => {
    const text = readFileSync(resolve(__dirname, "../../adr.config.json"), "utf-8");
    expect(readAdrPaths(text)).toEqual(CONFIG);
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

describe("generatedGlobs", () => {
  it("joins each output to adrDir and turns a directory into its subtree", () => {
    expect(generatedGlobs(CONFIG)).toEqual([
      "docs/adr/effective.md",
      "docs/adr/graph.md",
      "docs/adr/graph/**",
    ]);
  });

  it("normalizes a trailing slash on adrDir and a dot segment", () => {
    expect(generatedGlobs({ adrDir: "docs/adr/", outputs: ["./index.md", "by-topic//"] })).toEqual([
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
  });
});

describe("sameOutputs", () => {
  it("ignores order and compares the joined paths", () => {
    expect(
      sameOutputs(CONFIG, { adrDir: "docs/adr/", outputs: ["graph/", "graph.md", "effective.md"] }),
    ).toBe(true);
    expect(sameOutputs(CONFIG, { ...CONFIG, outputs: ["effective.md", "graph.md"] })).toBe(false);
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
  const classify = (list: ReturnType<typeof files>, head: AdrPaths = CONFIG) =>
    classifyGeneratedDiff({ base: CONFIG, head, files: list });

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

  describe("when the outputs move", () => {
    const moved: AdrPaths = {
      adrDir: "docs/adr",
      outputs: ["effective.md", "graph.md", "topics/"],
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
      expect(v.reasons[0]).toMatch(/paths\.outputs differs/);
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
