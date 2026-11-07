import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// An E2E suite that a PR does not start cannot catch that PR (TPL-1725). Each
// suite's `paths` is written by hand, so it can miss what the suite builds:
// `packages/i18n` was missing from `e2e.yml` until #3484, with nothing to say
// so. This derives what the suite needs from the workspace graph and compares.

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf-8");

const PACKAGES = readdirSync(resolve(ROOT, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
const manifest = (dir: string) => JSON.parse(read(`packages/${dir}/package.json`)) as Manifest;
const DIR_OF = new Map(PACKAGES.map((dir) => [manifest(dir).name, dir]));

/** `roots` and every workspace package they reach, as directory names. */
function workspaceClosure(roots: readonly string[]): string[] {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const dir = queue.pop()!;
    if (seen.has(dir)) continue;
    seen.add(dir);
    const { dependencies = {}, devDependencies = {} } = manifest(dir);
    for (const [name, range] of Object.entries({ ...dependencies, ...devDependencies })) {
      const target = DIR_OF.get(name);
      if (target && range.startsWith("workspace:")) queue.push(target);
    }
  }
  return [...seen].sort();
}

/** The entries of each `<key>:` list in a workflow, in file order. */
function lists(yaml: string, key: "paths" | "paths-ignore"): string[][] {
  const out: string[][] = [];
  const lines = yaml.split("\n");
  for (const [i, line] of lines.entries()) {
    if (line.trim() !== `${key}:`) continue;
    const entries: string[] = [];
    for (const next of lines.slice(i + 1)) {
      // A list can carry comments explaining an entry (`at-check-coverage.yml`).
      if (/^\s*#/.test(next)) continue;
      const m = /^\s+-\s+"?([^"]+?)"?\s*$/.exec(next);
      if (!m) break;
      entries.push(m[1]);
    }
    out.push(entries);
  }
  return out;
}

const workflow = (name: string) => read(`.github/workflows/${name}`);

/**
 * The path-filtered E2E suites and the packages each one builds. The nightly
 * has no `paths`, and a `-skip` stub runs nothing. The first test below fails
 * when a new suite is not listed here.
 */
const SUITES: Record<string, (yaml: string) => string[]> = {
  "e2e.yml": (yaml) => [
    "e2e",
    "app",
    // `E2E_SERVE=1` adds the `serve` project, which builds and starts the CLI
    // and stages the app's serve build (`packages/e2e/scripts/start-serve.ts`).
    ...(/^\s*E2E_SERVE: "1"$/m.test(yaml) ? ["cli"] : []),
  ],
  "vscode-e2e.yml": () => ["vscode-e2e", "vscode"],
};

describe("E2E suite paths (TPL-1725, TPL-1480)", () => {
  it("names every path-filtered E2E workflow", () => {
    const filtered = readdirSync(resolve(ROOT, ".github/workflows"))
      .filter((name) => /e2e.*\.yml$/.test(name) && lists(workflow(name), "paths").length > 0)
      .sort();
    expect(filtered).toEqual(Object.keys(SUITES).sort());
  });

  describe.each(Object.keys(SUITES))("%s", (name) => {
    it("starts on a change to anything the suite builds", () => {
      const yaml = workflow(name);
      const [paths = []] = lists(yaml, "paths");
      const needed = workspaceClosure(SUITES[name]!(yaml)).map((dir) => `packages/${dir}/**`);
      expect(needed.filter((entry) => !paths.includes(entry))).toEqual([]);
      expect(paths).toEqual(
        expect.arrayContaining(["pnpm-lock.yaml", "package.json", `.github/workflows/${name}`]),
      );
    });
  });

  it("starts the app suite on a change to the example files specs load from disk", () => {
    const [paths = []] = lists(workflow("e2e.yml"), "paths");
    expect(paths).toContain("examples/**");
  });

  it("is mirrored by e2e-skip.yml, which reports the same Required check", () => {
    const [paths = []] = lists(workflow("e2e.yml"), "paths");
    const [ignored = []] = lists(workflow("e2e-skip.yml"), "paths-ignore");
    expect([...ignored].sort()).toEqual([...paths].sort());
  });

  it("walks the workspace graph through dependencies and devDependencies", () => {
    // The CLI bundles core and i18n as devDependencies, so a closure over
    // `dependencies` alone would silently miss both.
    expect(workspaceClosure(["cli"])).toEqual(["cli", "core", "i18n", "skills"]);
  });
});

describe("the AT coverage guard's trigger (TPL-1680)", () => {
  const SPECS = "packages/e2e/tests/**";

  it("runs in the Required Check job on a change to a spec, not only to an AT doc", () => {
    const yaml = workflow("at-check-coverage.yml");
    const triggers = lists(yaml, "paths");
    expect(triggers.length).toBeGreaterThan(0);
    for (const paths of triggers) {
      expect(paths).toEqual(expect.arrayContaining(["docs/acceptance/**", SPECS]));
    }
    expect(yaml).toMatch(/^\s+name: Check$/m);
    expect(yaml).toMatch(/^\s+run: pnpm at:check-coverage --strict$/m);
  });

  it("runs from the pre-push hook on a change to a spec", () => {
    const hook = read("lefthook.yml");
    const command = hook.indexOf("scripts/acceptance/check-coverage.ts --strict");
    expect(command).toBeGreaterThan(0);
    const glob = hook.slice(0, command).split("glob:").at(-1)!.split("\n")[0]!;
    expect(glob).toContain(SPECS);
  });
});
