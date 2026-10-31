import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import { findCyclicDependencies } from "./cyclic-dependencies.js";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";
import { compile, compileProject } from "../compile/compile.js";
import { compileDeployDiff, compileSystemDiff } from "../compile/compile-diff.js";
import { diffSystemViewSlices } from "../diff/view-diff.js";
import { extractView } from "../view/view-extract.js";

// `KrsEdge.cyclic` is derived while a model is built (#2791): by the Parser on
// a single file and by the ImportResolver on the merged model. These pin the
// two construction paths and the one surface that opts out (diff).

const MUTUAL = `
system S {
  service A {}
  service B {}
  A -> B
  B -> A
}
`;

describe("findCyclicDependencies (#2791)", () => {
  it("reports the cycle without writing to the model", () => {
    const file = Parser.parse(MUTUAL).value;
    for (const edge of file.systems[0].edges) delete edge.cyclic;
    const { cyclicEdges, warnings } = findCyclicDependencies(file);
    expect(cyclicEdges.size).toBe(2);
    expect(warnings.filter((w) => w.kind === "cyclic-dependency")).toHaveLength(1);
    expect(file.systems[0].edges.map((e) => e.cyclic)).toEqual([undefined, undefined]);
  });
});

describe("a cycle split across files is marked on the merged model (#2791, TPL-2221)", () => {
  async function project(): Promise<InMemoryFileSystemProvider> {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/p/index.krs",
      `import "./back.krs"
system S {
  service A {}
  service B {}
  A -> B
}
`,
    );
    await fs.writeFile(
      "/p/back.krs",
      `system S {
  B -> A
}
`,
    );
    return fs;
  }

  it("marks both edges and reports the cycle once", async () => {
    const fs = await project();
    const result = await compileProject("/p/index.krs", fs, { diagramType: "system" });
    expect(result.warnings.filter((w) => w.kind === "cyclic-dependency")).toHaveLength(1);
    expect(result.svg).toContain('class="krs-edge--cyclic"');
  });

  it("neither file is cyclic on its own", () => {
    for (const src of [
      `system S {\n  service A {}\n  service B {}\n  A -> B\n}\n`,
      `system S {\n  B -> A\n}\n`,
    ]) {
      const file = Parser.parse(src).value;
      expect(file.systems[0].edges.every((e) => e.cyclic === undefined)).toBe(true);
    }
  });

  it("the same model in one file reports the cycle once too", () => {
    const result = compile(MUTUAL, { diagramType: "system" });
    expect(result.warnings.filter((w) => w.kind === "cyclic-dependency")).toHaveLength(1);
  });
});

describe("diff does not draw cycles (#2791)", () => {
  it("the diffed slice carries no cyclic flag, so routing and the class see a plain edge", () => {
    const before = extractView(Parser.parse(MUTUAL).value.systems, ["S"]);
    const after = extractView(Parser.parse(MUTUAL).value.systems, ["S"]);
    // The inputs are cyclic: parse marked them.
    expect(after.childEdges.every((e) => e.cyclic === true)).toBe(true);
    const diffed = diffSystemViewSlices(before, after);
    expect(diffed.slice.childEdges.every((e) => e.cyclic === undefined)).toBe(true);
  });

  it("the diff SVG has neither the cyclic class nor the cyclic stroke", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/before/index.krs", MUTUAL);
    await fs.writeFile(
      "/after/index.krs",
      `${MUTUAL.trimEnd().slice(0, -1)}  service C {}\n  A -> C\n}\n`,
    );
    const result = await compileSystemDiff({
      beforeEntryPath: "/before/index.krs",
      afterEntryPath: "/after/index.krs",
      fs,
      viewPath: ["S"],
    });
    expect(result.svg).not.toContain("krs-edge--cyclic");
    // Builtin `edge[cyclic]`: #EF4444 at width 2.5. The diff's own removed
    // stroke is the lowercase `#ef4444` in its inline stylesheet.
    expect(result.svg).not.toContain("#EF4444");
    expect(result.svg).not.toContain('stroke-width="2.5"');
  });

  it("the deploy diff draws the unit-to-unit edges of a cycle plainly too", async () => {
    // Deploy edges take the style of the service edge they stand for, looked
    // up by from / to / kind, so the opt-out must reach this resolution too.
    const deployed = `${MUTUAL}
deploy Production {
  oci a {
    realizes A
  }
  oci b {
    realizes B
  }
}
`;
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/before/index.krs", deployed);
    await fs.writeFile("/after/index.krs", deployed);
    const result = await compileDeployDiff({
      beforeEntryPath: "/before/index.krs",
      afterEntryPath: "/after/index.krs",
      fs,
    });
    // Both unit-to-unit edges are drawn (`<line>` on the deploy canvas).
    expect(result.svg.match(/marker-end=/g)).toHaveLength(2);
    expect(result.svg).not.toContain("#EF4444");
    expect(result.svg).not.toContain('stroke-width="2.5"');
  });
});
