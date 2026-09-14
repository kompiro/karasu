import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BINARY_EXTENSIONS,
  check,
  describeFinding,
  extensionOf,
  HOW_TO_FIX,
  parseLsFiles,
  readableEntries,
  scanRepository,
  type ScannedFile,
} from "./no-nul-bytes.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const SCRIPT = "scripts/lint/no-nul-bytes.ts";

// Built with fromCharCode so this test file stays plain text: a literal NUL
// here would make the guard's own test invisible to grep.
const NUL = String.fromCharCode(0);
const TAB = "\t";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const file = (path: string, text: string): ScannedFile => ({ path, bytes: encode(text) });

/** One NUL-carrying file per denied extension, so the deny-list is backed. */
const BACKING = BINARY_EXTENSIONS.map((ext) => file(`assets/sample${ext}`, `head${NUL}tail`));

describe("check", () => {
  it("reports a raw NUL in a text file with its line, offset and count", () => {
    const source = `const a = 1;\nconst sep = "${NUL}";\nconst b = "${NUL}${NUL}";\n`;
    const findings = check([...BACKING, file("packages/core/src/keys.ts", source)]);

    expect(findings).toEqual([
      {
        kind: "nul-byte-in-text-file",
        subject: "packages/core/src/keys.ts",
        line: 2,
        offset: source.indexOf(NUL),
        count: 3,
      },
    ]);
  });

  it("passes the escaped spelling, which is plain ASCII on disk", () => {
    // #2216 fixed its three files by exactly this substitution.
    const escaped = 'const sep = "\\0";\nconst alt = "\\u0000";\n';
    const bytes = encode(escaped);
    expect(bytes.indexOf(0)).toBe(-1);
    expect(bytes.indexOf(0x5c)).not.toBe(-1); // the backslash is really there

    expect(check([...BACKING, { path: "packages/core/src/keys.ts", bytes }])).toEqual([]);
  });

  it("does not report a NUL in a file whose extension is denied", () => {
    expect(check(BACKING)).toEqual([]);
  });

  it("matches a denied extension case-insensitively", () => {
    const upper = BACKING.map((f) => ({ ...f, path: f.path.toUpperCase() }));
    expect(check(upper)).toEqual([]);
  });

  it("reports a file with no extension, which an allow-list could not have named", () => {
    const findings = check([...BACKING, file("Dockerfile", `FROM node${NUL}\n`)]);
    expect(findings.map((f) => f.subject)).toEqual(["Dockerfile"]);
  });

  it("reports a Markdown file too: code search reads docs as well as sources", () => {
    const findings = check([...BACKING, file("docs/guide/intro.md", `# Intro\n\n${NUL}\n`)]);
    expect(findings).toMatchObject([{ subject: "docs/guide/intro.md", line: 3 }]);
  });

  it("reports a denied extension that no NUL-carrying file backs", () => {
    // The deny-list is a claim, not a switch: an extension on it must be
    // earning its place, or it only widens what goes unchecked.
    const withoutOtf = BACKING.filter((f) => !f.path.endsWith(".otf"));
    expect(check(withoutOtf)).toEqual([
      { kind: "stale-binary-extension", subject: ".otf", line: 0, offset: -1, count: 0 },
    ]);
  });

  it("does not count a NUL-free file with a denied extension as backing", () => {
    const cleanPng = file("assets/blank.png", "not really a png");
    const withoutPng = BACKING.filter((f) => !f.path.endsWith(".png"));
    expect(check([...withoutPng, cleanPng]).map((f) => f.subject)).toEqual([".png"]);
  });
});

describe("extensionOf", () => {
  it("returns the last extension, lower-cased, with its dot", () => {
    expect(extensionOf("packages/app/public/fonts/NotoEmoji.TTF")).toBe(".ttf");
    expect(extensionOf("examples/en/theme.krs.style")).toBe(".style");
  });

  it("returns an empty string for a file without one, including a dotfile", () => {
    expect(extensionOf("Dockerfile")).toBe("");
    expect(extensionOf("packages/vscode/.vscodeignore")).toBe("");
    expect(extensionOf("some.dir/LICENSE")).toBe("");
  });
});

describe("parseLsFiles and readableEntries", () => {
  // Synthetic `git ls-files -s -z` output. The real checkout has no tracked
  // symlink, so a test that read it could not exercise the exclusion at all.
  const record = (mode: string, path: string, stage = "0") =>
    `${mode} ce013625030ba8dba906f756967f9e9ca394464a ${stage}${TAB}${path}${NUL}`;

  it("reads mode and path from each NUL-terminated record", () => {
    const stdout = record("100644", "README.md") + record("100755", "scripts/run.sh");
    expect(parseLsFiles(stdout)).toEqual([
      { mode: "100644", path: "README.md" },
      { mode: "100755", path: "scripts/run.sh" },
    ]);
  });

  it("keeps a tab inside a path, splitting the record at the first tab only", () => {
    // `-z` disables quoting, so the tab arrives as a literal byte.
    const stdout = record("100644", `has${TAB}tab.txt`);
    expect(parseLsFiles(stdout)).toEqual([{ mode: "100644", path: `has${TAB}tab.txt` }]);
  });

  it("does not read the trailing terminator as an empty path", () => {
    expect(parseLsFiles(record("100644", "a.ts"))).toHaveLength(1);
    expect(parseLsFiles("")).toEqual([]);
  });

  it("drops a symlink, whose content would be read from the link's target", () => {
    const stdout = record("100644", "a.ts") + record("120000", "link-to-outside");
    expect(readableEntries(parseLsFiles(stdout))).toEqual([{ mode: "100644", path: "a.ts" }]);
  });

  it("reads an unmerged path once, not once per conflict stage", () => {
    const stdout =
      record("100644", "c.ts", "1") + record("100644", "c.ts", "2") + record("100644", "c.ts", "3");
    expect(readableEntries(parseLsFiles(stdout))).toEqual([{ mode: "100644", path: "c.ts" }]);
  });
});

describe("the failure message carries everything an author needs", () => {
  it("shows the escaped spelling to write instead", () => {
    expect(HOW_TO_FIX).toContain("\\0");
    expect(HOW_TO_FIX).toContain("\\u0000");
  });

  it("says where a binary extension goes and that it must stay backed", () => {
    expect(HOW_TO_FIX).toContain("BINARY_EXTENSIONS");
    expect(HOW_TO_FIX).toContain(SCRIPT);
    expect(HOW_TO_FIX).toMatch(/backed/);
  });

  it("names the file and line of a finding", () => {
    const [finding] = check([...BACKING, file("docs/a.md", `x\n${NUL}`)]);
    expect(describeFinding(finding)).toMatch(/^docs\/a\.md:2: /);
  });
});

describe("the real repository", () => {
  it("has no finding", () => {
    const { findings } = scanRepository(REPO_ROOT);
    expect(findings.map(describeFinding)).toEqual([]);
  });

  it("actually reads the tree, so an empty scan cannot pass as a clean one", () => {
    expect(scanRepository(REPO_ROOT).scanned).toBeGreaterThan(1000);
  });
});

describe("wiring: the scan reaches every PR (TPL-2446)", () => {
  const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");

  it("is a package script", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["lint:no-nul-bytes"]).toBe(`tsx ${SCRIPT}`);
  });

  it("runs on pre-push with no glob, since any file can acquire the byte", () => {
    const lefthook = read("lefthook.yml");
    const job = /^ {4}no-nul-bytes:\n((?: {6}.*\n| *\n)*)/m.exec(lefthook);
    expect(job, "lefthook.yml has no `no-nul-bytes` pre-push job").not.toBeNull();
    expect(job?.[1]).toContain("run: pnpm run lint:no-nul-bytes");
    expect(job?.[1]).not.toMatch(/^\s*glob:/m);
  });

  it("runs in ci.yml, the Check for code changes", () => {
    expect(read(".github/workflows/ci.yml")).toMatch(/^\s*run: pnpm run lint:no-nul-bytes\s*$/m);
  });

  it("runs in ci-skip.yml, the Check for docs-only PRs", () => {
    expect(ciSkipCommand()).not.toBeUndefined();
  });

  it("keeps ci-skip.yml free of dependency installs, the cost ADR-953 rejected", () => {
    // Comments are skipped: the stub's own comment says why it needs no
    // `pnpm install`, and a mention is not an install step (TPL-2185).
    const steps = read(".github/workflows/ci-skip.yml")
      .split("\n")
      .filter((line) => !/^\s*#/.test(line))
      .join("\n");
    expect(steps).not.toMatch(/pnpm install|pnpm\/action-setup|npm (ci|install)/);
  });
});

/** The exact command ci-skip.yml runs, split into argv; undefined when missing. */
function ciSkipCommand(): string[] | undefined {
  const stub = readFileSync(join(REPO_ROOT, ".github/workflows/ci-skip.yml"), "utf8");
  const run = /^\s*run: (node\s.*no-nul-bytes\.ts)\s*$/m.exec(stub);
  return run?.[1].split(/\s+/);
}

describe("both entry paths give the same answer", () => {
  // ci-skip.yml runs the script with plain `node` (no install), everything else
  // with `tsx`. Plain node only strips erasable TypeScript, so a construct it
  // cannot run would break the docs-only side alone, and silently: the stub
  // would fail on a docs PR long after the change that caused it.
  const run = (command: string, args: string[]) =>
    spawnSync(command, args, { cwd: REPO_ROOT, encoding: "utf8" });

  it("runs under plain node exactly as ci-skip.yml invokes it", () => {
    const argv = ciSkipCommand();
    expect(argv).toBeDefined();
    const [, ...args] = argv ?? [];
    const viaNode = run(process.execPath, args);
    const viaTsx = run(join(REPO_ROOT, "node_modules/.bin/tsx"), [SCRIPT]);

    expect(viaNode.stderr).toBe("");
    expect(viaNode.status).toBe(0);
    expect(viaTsx.status).toBe(0);
    expect(viaNode.stdout).toBe(viaTsx.stdout);
    expect(viaNode.stdout).toMatch(/^no-nul-bytes: ok /);
  });
});
