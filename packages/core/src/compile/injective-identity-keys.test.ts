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

/**
 * #3111: the joins #2819 left alone, each reached by a model. Quoted ids that
 * carry `->` (or a dot) made two elements answer to one view-extract key.
 */
describe("separator-joined keys left after #2819 (#3111)", () => {
  /** `from | to | label` of each drawn edge. */
  function drawnEdges(svg: string): string[] {
    return [...svg.matchAll(/<g data-edge-from="([^"]*)" data-edge-to="([^"]*)"([^>]*)>/g)]
      .map(([, from, to, rest]) => {
        const label = /data-edge-label="([^"]*)"/.exec(rest)?.[1] ?? "-";
        return `${from} | ${to} | ${label}`;
      })
      .sort();
  }

  const NODES = `
  service "b->c" {
    domain e1 {}
  }
  service c {
    domain e2 {}
  }
`;

  it("keeps two implicit edges apart when their endpoints join to one string", () => {
    const { svg } = compile(`system S {${NODES}
  service a {
    domain d1 {
      d1 -> e1 "one"
    }
  }
  service "a->b" {
    domain d2 {
      d2 -> e2 "two"
    }
  }
}
`);
    // Both grouped under `a->b->c#sync`: one edge drawn, `"a->b"`→`c` gone.
    expect(drawnEdges(svg)).toEqual(["a | b-&gt;c | one", "a-&gt;b | c | two"]);
  });

  it("does not let an explicit edge suppress a different implicit one", () => {
    const { svg } = compile(`system S {${NODES}
  service a {}
  service "a->b" {
    domain d2 {
      d2 -> e2 "two"
    }
  }
  a -> "b->c"
}
`);
    // The authored `a -> "b->c"` read as "a->b"→c already being authored.
    expect(drawnEdges(svg)).toEqual(["a | b-&gt;c | -", "a-&gt;b | c | two"]);
  });

  describe("keeps an aggregated edge's domain rows when an endpoint carries `->`", () => {
    const SERVICES = `
  service "b->c" {
    domain e1 {}
    domain e3 {}
  }
  service a {
    domain d1 {
      d1 -> e1 "one"
      d1 -> e3 "three"
    }
  }
`;
    /** The domain rows (`from->to`) the `a` → `b->c` edge carries for its detail panel. */
    function domainRows(svg: string): string[] {
      // The rows sit on the label group nested inside the edge's own `<g>`.
      const attr =
        /<g data-edge-from="a" data-edge-to="b-&gt;c"[^>]*>[^]*?data-domain-edges="([^"]*)"/.exec(
          svg,
        )?.[1];
      if (attr === undefined) return [];
      const rows = JSON.parse(attr.replaceAll("&quot;", '"').replaceAll("&gt;", ">")) as {
        fromDomainId: string;
        toDomainId: string;
      }[];
      return rows.map((r) => `${r.fromDomainId}->${r.toDomainId}`).sort();
    }

    // The layout looked the details up by a `${from}->${to}#${kind}` it built
    // itself, which missed the injective key the extraction wrote them under.
    it("on a single-system canvas", () => {
      const { svg } = compile(`system S {${SERVICES}}\n`);
      expect(domainRows(svg)).toEqual(["d1->e1", "d1->e3"]);
    });

    it("in a system frame of the root view", () => {
      const { svg } = compile(`system S {${SERVICES}}\nsystem T {\n  service t {}\n}\n`);
      expect(domainRows(svg)).toEqual(["d1->e1", "d1->e3"]);
    });
  });

  it("draws a caller ghost only on the container its reference resolves to", () => {
    const src = (target: string) => `
system S {
  service "a.b" {}
  service a {
    domain b {}
  }
  service ab {}
}
system X {
  service x {}
  x -> ${target}
}
`;
    // `S.a.b` splits to the domain `b` in service `a`; its dotted join equalled
    // the container `["S", "a.b"]`, so the caller was drawn on that drill-down.
    expect(compile(src("S.a.b"), { viewPath: ["S", "a.b"] }).svg).not.toContain(
      'data-edge-from="X.x"',
    );
    // Control: a reference that does resolve to the container still draws it.
    expect(compile(src("S.ab"), { viewPath: ["S", "ab"] }).svg).toContain('data-edge-from="X.x"');
  });

  it("keeps two same-id nodes whose paths join to one string as separate candidates", () => {
    const { diagnostics } = compile(`
system Shop {
  service "x.y" {
    domain z {}
  }
}
system "Shop.x" {
  service y {
    domain z {}
  }
}
service z {}
`);
    // Three logical `z`, so the two non-winners each draw a warning. The
    // dotted join folded `Shop."x.y".z` and `"Shop.x".y.z` into one candidate.
    expect(diagnostics.filter((d) => d.code === "node-id-multiple-locations")).toHaveLength(2);
  });
});
