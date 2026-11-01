import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as builtinExamples from "../../packages/core/src/builtins/examples.ts";
import {
  REGISTERED_EXAMPLES,
  readRegisteredExamples,
  regenerate,
  renderModule,
  type RegisteredExample,
} from "./gen-builtin-examples.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

describe("built-in examples codegen (#3345)", () => {
  it("the committed module matches a fresh render of examples/", () => {
    // Same call the lefthook hook makes, so the test and the hook cannot
    // disagree about what "stale" means.
    expect(
      regenerate({ root: repoRoot, check: true }).stale,
      "run `pnpm gen:examples` and commit the result",
    ).toEqual([]);
  });

  it("examples.ts re-exports every registered constant and nothing else", () => {
    expect(Object.keys(builtinExamples).sort()).toEqual(
      REGISTERED_EXAMPLES.map((e) => e.constant).sort(),
    );
  });

  it("keeps the ec-platform stages in tutorial order, entries renamed to index.krs", () => {
    const [ja] = readRegisteredExamples(
      repoRoot,
      REGISTERED_EXAMPLES.filter((e) => e.constant === "EC_PLATFORM_PROJECTS"),
    );
    expect(ja!.projects.map((p) => p.name)).toEqual([
      "01-system",
      "02-users",
      "02.5-clients",
      "03-domains",
      "04-annotations",
      "05-multifile",
      "06-deploy",
      "07-cross-system",
    ]);
    for (const p of ja!.projects) expect(p.files[0]!.path).toBe("index.krs");
  });
});

describe("built-in examples reader", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function write(files: Record<string, string>): void {
    root = mkdtempSync(join(tmpdir(), "karasu-gen-examples-"));
    for (const [path, content] of Object.entries(files)) {
      const abs = join(root, "examples", path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
  }

  const flat: RegisteredExample = { constant: "X", dir: "en/x", layout: "flat", doc: "X." };
  const staged: RegisteredExample = { constant: "S", dir: "en/s", layout: "staged", doc: "S." };

  it("bundles a new file dropped into a flat directory without touching the registry", () => {
    write({
      "en/x/index.krs": "system A {}\n",
      "en/x/b.krs": "system B {}\n",
      "en/x/a.krs.style": "service {}\n",
      "en/x/README.md": "not bundled\n",
    });
    const [x] = readRegisteredExamples(root, [flat]);
    expect(x!.projects).toEqual([
      {
        name: "x",
        files: [
          { path: "index.krs", content: "system A {}\n" },
          { path: "a.krs.style", content: "service {}\n" },
          { path: "b.krs", content: "system B {}\n" },
        ],
      },
    ]);
  });

  it("fails on a subdirectory inside a flat directory", () => {
    write({ "en/x/index.krs": "", "en/x/nested/a.krs": "" });
    expect(() => readRegisteredExamples(root, [flat])).toThrow(/registered as flat/);
  });

  it("fails when a multi-file stage has no entry file", () => {
    write({ "en/s/01-a.krs": "", "en/s/02-b/one.krs": "" });
    expect(() => readRegisteredExamples(root, [staged])).toThrow(/found none/);
  });

  it("fails when a multi-file stage has both system.krs and main.krs", () => {
    write({ "en/s/01-a/system.krs": "", "en/s/01-a/main.krs": "" });
    expect(() => readRegisteredExamples(root, [staged])).toThrow(/system\.krs and main\.krs/);
  });

  it("writes content verbatim through the template literal escapes", () => {
    const content = "a `tick` and ${x} and \\ backslash\n";
    write({ "en/x/index.krs": content });
    const text = renderModule(readRegisteredExamples(root, [flat]));
    const literal = text.slice(
      text.indexOf("content: `") + "content: ".length,
      text.lastIndexOf("`,") + 1,
    );
    // Evaluate the emitted literal to prove it round-trips.
    expect(new Function(`return ${literal};`)()).toBe(content);
  });
});
