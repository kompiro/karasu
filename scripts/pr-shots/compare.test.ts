import { describe, expect, it } from "vitest";
import type { Candidate, View } from "./candidates.ts";
import {
  compareSides,
  NO_CHANGE_MARKER,
  pairStem,
  renderBody,
  SECTION_HEADING,
  type Shot,
} from "./compare.ts";
import type { Rendered, Side } from "./render-side.ts";

const example = (name: string): Candidate => ({ kind: "example", name, relPath: name });
const fence = (name: string): Candidate => ({ kind: "fence", name, source: "" });

const svg = (text: string, empty = false): Rendered => ({ ok: true, svg: text, empty });
const fail = (reason: string): Rendered => ({ ok: false, reason });

/** A side answering from a table keyed `<name>/<view>`; anything unlisted is an unchanged svg. */
function side(table: Record<string, Rendered>): Side {
  return {
    render: async (candidate, view) =>
      table[`${candidate.name}/${view}`] ?? svg(`same ${candidate.name} ${view}`),
  };
}

const SYSTEM: readonly View[] = ["system"];
const SHAS = { baseSha: "1111111aaaa", headSha: "2222222bbbb" };

describe("compareSides", () => {
  it("finds nothing when both sides draw the same SVG", async () => {
    const result = await compareSides([example("a"), fence("f")], SYSTEM, side({}), side({}));
    expect(result.changed).toEqual([]);
    expect(result.counts).toEqual({ files: 0, fences: 1, examples: 1 });
  });

  it("collects the pairs whose SVG differs, in candidate then view order", async () => {
    const result = await compareSides(
      [example("a"), example("b")],
      ["system", "deploy"],
      side({}),
      side({ "b/system": svg("new b"), "a/deploy": svg("new a") }),
    );
    expect(result.changed.map((p) => `${p.candidate.name}/${p.view}`)).toEqual([
      "a/deploy",
      "b/system",
    ]);
  });

  it("keeps a pair the base cannot render, as after-only", async () => {
    const result = await compareSides(
      [fence("f")],
      SYSTEM,
      side({ "f/system": fail("error diagnostics: unknown-keyword") }),
      side({ "f/system": svg("new syntax") }),
    );
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].before).toEqual(fail("error diagnostics: unknown-keyword"));
  });

  it("ignores a view with nothing to draw on either side", async () => {
    const result = await compareSides(
      [example("a"), example("b")],
      ["deploy"],
      side({ "a/deploy": svg("placeholder v1", true), "b/deploy": fail("missing") }),
      side({ "a/deploy": svg("placeholder v2", true), "b/deploy": svg("empty", true) }),
    );
    expect(result.changed).toEqual([]);
  });

  it("reports a pair that rendered at the base but fails at HEAD", async () => {
    const result = await compareSides(
      [example("a"), example("b")],
      SYSTEM,
      side({ "b/system": fail("broken at base too") }),
      side({ "a/system": fail("threw: boom"), "b/system": fail("still broken") }),
    );
    expect(result.changed).toEqual([]);
    expect(result.headFailures).toEqual([
      { candidate: example("a"), view: "system", reason: "threw: boom" },
    ]);
  });
});

describe("renderBody", () => {
  it("states that nothing changed, with what was checked", async () => {
    const result = await compareSides([example("a"), fence("f")], SYSTEM, side({}), side({}));
    const body = renderBody(result, [], SHAS);
    expect(body).toBe(
      `${SECTION_HEADING}\n\n${NO_CHANGE_MARKER} (1 acceptance-test fence, 1 example file)\n`,
    );
  });

  it("shows the shot pairs and lists the rest by name", async () => {
    const changedEverywhere = Object.fromEntries(
      ["a", "b", "c"].map((n) => [`${n}/system`, svg(`new ${n}`)]),
    );
    const result = await compareSides(
      ["a", "b", "c"].map(example),
      SYSTEM,
      side({ "b/system": fail("not there") }),
      side(changedEverywhere),
    );
    const shots: Shot[] = result.changed.slice(0, 2).map((pair) => ({
      pair,
      before: pair.before.ok ? `./reports/${pairStem(pair)}.before.png` : undefined,
      after: `./reports/${pairStem(pair)}.after.png`,
    }));
    const body = renderBody(result, shots, SHAS);

    expect(body).toContain("at the merge base (`1111111`) and on this branch (`2222222`)");
    expect(body).toContain("![before: a — system view](./reports/a.system.before.png)");
    expect(body).toContain("![after: a — system view](./reports/a.system.after.png)");
    expect(body).toContain("| _Could not be rendered at the base: not there_ |");
    expect(body).toContain("Also changed (not shown):\n\n- c — system view");
    expect(body).not.toContain("c.system.after.png");
    expect(body).not.toContain(NO_CHANGE_MARKER);
  });
});

describe("renderBody with failures at HEAD", () => {
  it("does not claim no change when pairs that drew at the base fail on the branch", async () => {
    const result = await compareSides(
      [example("a")],
      SYSTEM,
      side({}),
      side({ "a/system": fail("threw: boom") }),
    );
    const body = renderBody(result, [], SHAS);
    expect(body).not.toContain(NO_CHANGE_MARKER);
    expect(body).toContain("1 pair that rendered at the merge base failed on this branch");
    expect(body).toContain("- a — system view: threw: boom");
  });

  it("keeps a reason with a pipe inside its table cell", async () => {
    const result = await compareSides(
      [fence("f")],
      SYSTEM,
      side({ "f/system": fail("threw: a | b") }),
      side({ "f/system": svg("new") }),
    );
    const shots: Shot[] = [{ pair: result.changed[0], after: "./a.png" }];
    expect(renderBody(result, shots, SHAS)).toContain("base: threw: a \\| b_ |");
  });
});

describe("pairStem", () => {
  it("makes a file-name-safe stem from the candidate and the view", () => {
    expect(pairStem({ candidate: fence("docs/acceptance/x y.md#L3"), view: "org" })).toBe(
      "docs-acceptance-x-y.md-L3.org",
    );
  });
});
