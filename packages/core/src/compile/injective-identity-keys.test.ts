import { describe, it, expect } from "vitest";
import { compile, compileProject } from "./compile.js";
import { compileDeployDiff, compileOrgDiff, compileSystemDiff } from "./compile-diff.js";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";

/**
 * #2819: node paths and edge endpoints were flattened into one string with a
 * plain separator and then used as identity, so two different elements could
 * answer to one key. These cases go through the whole compile so that a writer
 * and a reader drifting apart (TPL-1352) fails here, not just a helper's unit
 * test.
 */

async function project(files: Record<string, string>): Promise<InMemoryFileSystemProvider> {
  const fs = new InMemoryFileSystemProvider();
  for (const [path, src] of Object.entries(files)) await fs.writeFile(path, src);
  return fs;
}

/** `data-diff-state` of each drawn edge, by its `from` / `to` attributes. */
function edgeStates(svg: string): string[] {
  return [
    ...svg.matchAll(
      /<g data-edge-from="([^"]*)" data-edge-to="([^"]*)"[^>]*?data-diff-state="([^"]*)"/g,
    ),
  ]
    .map(([, from, to, state]) => `${from} | ${to} | ${state}`)
    .sort();
}

describe("a node whose id carries a dot keeps its frame (#2819)", () => {
  it("is framed on its system's canvas", async () => {
    const fs = await project({
      "/p/index.krs": `
system Shop {
  service "a.b" {}
  service c {}
}
organization O {
  team T { owns "a.b" }
  team U { owns c }
}
`,
    });
    const result = await compileProject("/p/index.krs", fs, {
      viewPath: ["Shop"],
      groupBy: "team",
    });
    // Before the fix the canvas projection cut the key `Shop.a.b` at its last
    // dot, read `a.b` as an entry one level down, and dropped team T's frame.
    expect(result.svg).toContain('data-container-id="__group_T__"');
    expect(result.svg).toContain('data-container-id="__group_U__"');
  });

  it("is framed on the root canvas when it is declared outside any system", async () => {
    const fs = await project({
      "/p/index.krs": `
system Shop { service Api {} }
service "x.y" {}
service z {}
organization O {
  team T { owns "x.y" }
  team U { owns z }
}
`,
    });
    const result = await compileProject("/p/index.krs", fs, { groupBy: "team" });
    expect(result.svg).toContain('data-container-id="__group_T__"');
    expect(result.svg).toContain('data-container-id="__group_U__"');
  });
});

describe("owns buttons name the node the author wrote (#2819)", () => {
  const SRC = `
system Shop { service Api {} }
service "Shop.Api" {}
organization Acme {
  team Core {
    owns Shop.Api
    owns "Shop.Api"
  }
}
`;

  it("renders one button per reference, each with its own id", () => {
    const { svg } = compile(SRC, { diagramType: "org" });
    expect(svg).toContain('data-owned-service-button="Shop.Api"');
    expect(svg).toContain('data-owned-service-button="&quot;Shop.Api&quot;"');
    expect(svg).toContain("→ &quot;Shop.Api&quot;");
  });

  it("diffs the two references separately", async () => {
    const fs = await project({
      "/p/before.krs": SRC.replace('    owns "Shop.Api"\n', ""),
      "/p/after.krs": SRC,
    });
    const { svg } = await compileOrgDiff({
      beforeEntryPath: "/p/before.krs",
      afterEntryPath: "/p/after.krs",
      fs,
    });
    expect(svg).toMatch(/data-owned-service-button="Shop\.Api"[^>]*data-diff-state="unchanged"/);
    expect(svg).toMatch(
      /data-owned-service-button="&quot;Shop\.Api&quot;"[^>]*data-diff-state="added"/,
    );
  });
});

describe("an edge whose endpoint carries `->` keeps its own diff state (#2819)", () => {
  // `a -> "b->c"` and `"a->b" -> c` both joined to `a->b->c`: the diff saw one
  // unchanged edge and the removal vanished from the drawing.
  const NODES = `
  service a {}
  service "b->c" {}
  service "a->b" {}
  service c {}
`;
  const BEFORE = `system S {${NODES}  a -> "b->c"\n}\n`;
  const AFTER = `system S {${NODES}  "a->b" -> c\n}\n`;

  it("in the system view", async () => {
    const fs = await project({ "/p/before.krs": BEFORE, "/p/after.krs": AFTER });
    const { svg } = await compileSystemDiff({
      beforeEntryPath: "/p/before.krs",
      afterEntryPath: "/p/after.krs",
      fs,
      viewPath: ["S"],
    });
    expect(edgeStates(svg)).toEqual(["a | b-&gt;c | removed", "a-&gt;b | c | added"]);
  });

  it("in the deploy view", async () => {
    const DEPLOY = `
deploy P {
  oci "x" { realizes a }
  oci "y" { realizes "b->c" }
  oci "z" { realizes "a->b" }
  oci "w" { realizes c }
}
`;
    const fs = await project({
      "/p/before.krs": BEFORE + DEPLOY,
      "/p/after.krs": AFTER + DEPLOY,
    });
    const { svg } = await compileDeployDiff({
      beforeEntryPath: "/p/before.krs",
      afterEntryPath: "/p/after.krs",
      fs,
    });
    expect(edgeStates(svg)).toEqual(["a | b-&gt;c | removed", "a-&gt;b | c | added"]);
  });
});
