import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  check,
  describeFinding,
  EXEMPT_FILES,
  HOW_TO_FIX,
  inScope,
  type ScannedFile,
} from "./design-doc-refs.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const SCRIPT = "scripts/lint/design-doc-refs.ts";

const file = (path: string, text: string): ScannedFile => ({ path, text });

/** One citation per exempt file, so no exemption reads as stale. */
const BACKING = Object.keys(EXEMPT_FILES).map((path) => file(path, `"docs/design/x.md"`));

describe("check", () => {
  it("reports a Design Doc cited from code with its line and the cited path", () => {
    const source = "const a = 1;\n// See docs/design/layer-toggles.md.\n";
    expect(check([...BACKING, file("packages/core/src/a.ts", source)])).toEqual([
      {
        kind: "design-doc-ref",
        path: "packages/core/src/a.ts",
        line: 2,
        ref: "docs/design/layer-toggles.md",
      },
    ]);
  });

  it("reports every Design Doc on a line, and a linked one once", () => {
    const line = "See [docs/design/a.md](../../docs/design/a.md) and `docs/design/b.md`.";
    const refs = check([...BACKING, file(".claude/rules/x.md", line)]).map((f) => f.ref);
    expect(refs).toEqual(["docs/design/a.md", "docs/design/b.md"]);
  });

  it("covers config, workflows and rules, not only code", () => {
    const paths = [
      ".github/workflows/x.yml",
      ".coderabbit.yaml",
      ".claude/rules/x.md",
      "README.md",
    ];
    const findings = check([...BACKING, ...paths.map((p) => file(p, "docs/design/a.md"))]);
    expect(findings.map((f) => f.path)).toEqual(paths);
  });

  it("leaves docs/ to the promotion, which swaps links there and stays Low", () => {
    const docs = ["docs/adr/12-x.md", "docs/test-perspectives/TPL-1.md", "docs/design/a.md"];
    expect(check([...BACKING, ...docs.map((p) => file(p, "see docs/design/a.md"))])).toEqual([]);
    expect(inScope("docs/adr/12-x.md")).toBe(false);
    expect(inScope("docsite/a.md")).toBe(true);
  });

  it("allows the template, which is never promoted", () => {
    expect(check([...BACKING, file(".coderabbit.yaml", "docs/design/TEMPLATE.md")])).toEqual([]);
  });

  it("does not report an exempt file's citations", () => {
    const tierTest = file("scripts/review/tier.test.ts", '"docs/design/x.md", "docs/design/y.md"');
    const rest = BACKING.filter((f) => f.path !== tierTest.path);
    expect(check([...rest, tierTest])).toEqual([]);
  });

  it("reports an exemption whose file no longer cites a Design Doc", () => {
    const rest = BACKING.filter((f) => f.path !== "scripts/adr/generated.test.ts");
    expect(check([...rest, file("scripts/adr/generated.test.ts", "no citation")])).toEqual([
      { kind: "stale-exemption", path: "scripts/adr/generated.test.ts" },
    ]);
    expect(check(rest)).toEqual([
      { kind: "stale-exemption", path: "scripts/adr/generated.test.ts" },
    ]);
  });

  it("gives every exemption a reason", () => {
    const blank = Object.entries(EXEMPT_FILES).filter(([, reason]) => reason.trim() === "");
    expect(blank).toEqual([]);
  });
});

describe("describeFinding", () => {
  it("names the file, the line and what to cite instead", () => {
    const [finding] = check([...BACKING, file("packages/a.ts", "\n// docs/design/a.md")]);
    expect(describeFinding(finding)).toBe(
      "packages/a.ts:2 cites docs/design/a.md; cite the Issue (#N) or the ADR instead",
    );
    expect(HOW_TO_FIX).toContain("ADR-3471");
  });
});

describe("wiring", () => {
  const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");

  it("is a package script", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["lint:design-doc-refs"]).toBe(`tsx ${SCRIPT}`);
  });

  it("runs on pre-push with no glob, since any file can gain a citation", () => {
    const job = /^ {4}design-doc-refs:\n((?: {6}.*\n| *\n)*)/m.exec(read("lefthook.yml"));
    expect(job, "lefthook.yml has no `design-doc-refs` pre-push job").not.toBeNull();
    expect(job?.[1]).toContain("run: pnpm run lint:design-doc-refs");
    expect(job?.[1]).not.toMatch(/^\s*glob:/m);
  });

  it("runs in ci.yml, the Check for code changes", () => {
    expect(read(".github/workflows/ci.yml")).toMatch(/^\s*run: pnpm run lint:design-doc-refs\s*$/m);
  });

  it("runs in ci-skip.yml, the Check for docs-only PRs", () => {
    expect(ciSkipCommand()).toBeDefined();
  });
});

/** The exact command ci-skip.yml runs, split into argv; undefined when missing. */
function ciSkipCommand(): string[] | undefined {
  const stub = readFileSync(join(REPO_ROOT, ".github/workflows/ci-skip.yml"), "utf8");
  const run = /^\s*run: (node\s.*design-doc-refs\.ts)\s*$/m.exec(stub);
  return run?.[1].split(/\s+/);
}

describe("the repository", () => {
  // ci-skip.yml runs the script with plain `node`, everything else with `tsx`.
  // Plain node only strips erasable TypeScript, so a construct it cannot run
  // would break the docs-only side alone.
  const run = (command: string, args: string[]) =>
    spawnSync(command, args, { cwd: REPO_ROOT, encoding: "utf8" });

  it("passes under plain node exactly as ci-skip.yml invokes it, and under tsx", () => {
    const [, ...args] = ciSkipCommand() ?? [];
    const viaNode = run(process.execPath, args);
    const viaTsx = run(join(REPO_ROOT, "node_modules/.bin/tsx"), [SCRIPT]);

    expect(viaNode.stderr).toBe("");
    expect(viaNode.status).toBe(0);
    expect(viaTsx.status).toBe(0);
    expect(viaNode.stdout).toBe(viaTsx.stdout);
    expect(viaNode.stdout).toMatch(/^design-doc-refs: ok /);
  });
});
