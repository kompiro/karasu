import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { exampleEntries, VIEWS, type Candidate } from "./candidates.ts";
import { compareSides } from "./compare.ts";
import { coreSide, loadCore, type CoreModule, type Side } from "./render-side.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

let core: CoreModule;
let head: Side;

beforeAll(async () => {
  core = await loadCore(REPO_ROOT);
  head = coreSide(core, REPO_ROOT);
});

const fence = (source: string): Candidate => ({ kind: "fence", name: "fence", source });

describe("coreSide", () => {
  // The whole design rests on "equal SVG text means an unchanged picture".
  // If rendering ever stops being deterministic, every PR would shoot every
  // example; this fails first instead.
  it("renders every example entry identically twice", async () => {
    const candidates: Candidate[] = exampleEntries(REPO_ROOT).map((relPath) => ({
      kind: "example",
      name: relPath,
      relPath,
    }));
    expect(candidates.length).toBeGreaterThan(0);
    const result = await compareSides(candidates, VIEWS, head, coreSide(core, REPO_ROOT));
    expect(result.changed.map((p) => `${p.candidate.name}/${p.view}`)).toEqual([]);
    expect(result.headFailures).toEqual([]);
  });

  it("marks deploy and org views without a deploy or organization block as empty", async () => {
    const candidate = fence("system S {\n  service A\n}");
    const system = await head.render(candidate, "system");
    expect(system).toMatchObject({ ok: true, empty: false });
    expect(await head.render(candidate, "deploy")).toMatchObject({ ok: true, empty: true });
    expect(await head.render(candidate, "org")).toMatchObject({ ok: true, empty: true });
  });

  it("fails, rather than drawing, a model with error diagnostics", async () => {
    const rendered = await head.render(fence("system {"), "system");
    expect(rendered.ok).toBe(false);
    expect(rendered.ok ? "" : rendered.reason).toMatch(/^error diagnostics: /);
  });

  it("fails an example the side's checkout does not have", async () => {
    const missing: Candidate = { kind: "example", name: "x", relPath: "examples/none/index.krs" };
    expect(await head.render(missing, "system")).toEqual({
      ok: false,
      reason: "the file does not exist there",
    });
  });

  it("reports a core that throws as a failure", async () => {
    const throwing = coreSide(
      {
        compile: () => {
          throw new Error("compile is not a function\nstack");
        },
        compileProject: async () => {
          throw new Error("unused");
        },
      },
      REPO_ROOT,
    );
    expect(await throwing.render(fence("system S {}"), "system")).toEqual({
      ok: false,
      reason: "threw: compile is not a function",
    });
  });
});
