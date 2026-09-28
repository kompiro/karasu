import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  check,
  CLI_INDEX,
  codeText,
  referencedCommands,
  referencedFlags,
  registeredCommands,
  SKILLS_DIR,
} from "./skill-cli-refs.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

describe("registeredCommands", () => {
  it("reads the command names off the real CLI index", () => {
    const src = readFileSync(resolve(REPO_ROOT, CLI_INDEX), "utf8");
    const cmds = registeredCommands(src);
    // Spot-check the ones the affected skill references.
    for (const c of ["render", "translate", "coverage", "subtree", "fmt"]) {
      expect(cmds).toContain(c);
    }
    expect(cmds).toContain("lint-style"); // hyphenated names survive the regex
    expect(cmds.size).toBeGreaterThan(10);
  });

  it("takes the command name before the arg placeholder", () => {
    const cmds = registeredCommands('.command("serve [dir]")\n.command("remove <node-id> <file>")');
    expect([...cmds].sort()).toEqual(["remove", "serve"]);
  });
});

describe("codeText excludes prose", () => {
  it("keeps inline spans and drops surrounding prose", () => {
    const md = "a karasu architecture model with `karasu render x.krs` inline.";
    expect(codeText(md)).toContain("karasu render x.krs");
    expect(codeText(md)).not.toContain("architecture");
  });

  it("keeps fenced code blocks", () => {
    const md = "text\n```console\n$ karasu translate --from wrangler w.toml\n```\nmore text";
    expect(codeText(md)).toContain("karasu translate");
    expect(codeText(md)).not.toContain("more text");
  });
});

describe("referencedCommands", () => {
  it("collects only code-context invocations, not prose mentions", () => {
    const md = [
      "Reverse-engineer into a karasu model (prose — must be ignored).",
      "Validate with `karasu render <f>` and slice with `karasu subtree D f`.",
      "```",
      "karasu coverage index.krs --format json",
      "```",
    ].join("\n");
    expect([...referencedCommands(md)].sort()).toEqual(["coverage", "render", "subtree"]);
  });

  it("does not read two adjacent code spans as one invocation", () => {
    // `codeText` joins code contexts with a newline so they cannot run
    // together; the invocation regex used `\s`, which matched that very
    // separator, turning a line ending in the span `karasu` plus a line
    // starting with the span `reference/` into `karasu reference`. This
    // markdown contains no `karasu <cmd>` invocation at all.
    const markdown = [
      "- The target repository path, and the karasu CLI (`karasu`) available.",
      "- `reference/` beside this file holds the grammar.",
    ].join("\n");
    expect([...referencedCommands(markdown)]).toEqual([]);
  });
});

describe("referencedFlags", () => {
  it("pairs each long flag with the command on its invocation line", () => {
    const md = [
      "`karasu render a.krs --output a.svg --theme=light`",
      "```",
      "karasu coverage index.krs --format json | jq . --raw-output",
      "```",
    ].join("\n");
    expect(referencedFlags(md)).toEqual([
      { command: "render", flag: "--output" },
      { command: "render", flag: "--theme" },
      { command: "coverage", flag: "--format" },
    ]);
  });
});

describe("the real skills are in sync with the CLI registry", () => {
  it("references no unknown command", () => {
    expect(check(REPO_ROOT)).toEqual([]);
  });
});

describe("check (synthetic fixture)", () => {
  const root = mkdtempSync(join(tmpdir(), "skill-cli-refs-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  function writeFixture(skillBody: string, cliIndex = '.command("render <file>")') {
    const skillDir = join(root, SKILLS_DIR, "demo");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), skillBody);
    const cliDir = join(root, CLI_INDEX, "..");
    mkdirSync(cliDir, { recursive: true });
    writeFileSync(join(root, CLI_INDEX), cliIndex);
  }

  it("flags a reference to an unregistered command", () => {
    writeFixture("Validate with `karasu lint-style frag.krs` before returning.");
    expect(check(root)).toEqual([{ file: ".claude/skills/demo/SKILL.md", command: "lint-style" }]);
  });

  it("passes when every referenced command is registered", () => {
    writeFixture("Validate with `karasu render frag.krs -o /dev/null`.");
    expect(check(root)).toEqual([]);
  });

  const table = [
    {
      kind: "command" as const,
      name: "draw",
      replacement: "render",
      since: "0.7.0",
      removal: "1.0.0",
    },
    {
      kind: "flag" as const,
      command: "render",
      name: "--out",
      replacement: "--output",
      since: "0.7.0",
      removal: "1.0.0",
      removed: true,
    },
  ];

  it("flags a deprecated command with its replacement (in-repo skills use current names)", () => {
    writeFixture("Render with `karasu draw frag.krs`.");
    expect(check(root, table)).toEqual([
      { file: ".claude/skills/demo/SKILL.md", command: "draw", replacement: "render" },
    ]);
  });

  it("flags a deprecated or removed flag of a registered command", () => {
    writeFixture(
      "Render with `karasu render frag.krs --out a.svg`, not `karasu diff a b --out x`.",
      '.command("render <file>")\n.command("diff <before> <after>")',
    );
    expect(check(root, table)).toEqual([
      {
        file: ".claude/skills/demo/SKILL.md",
        command: "render",
        flag: "--out",
        replacement: "--output",
      },
    ]);
  });

  it("ignores a prose mention of a non-command word", () => {
    // "karasu architecture" and "karasu model" are prose, not invocations.
    writeFixture("Turn this repo into a karasu architecture model with `karasu render f`.");
    expect(check(root)).toEqual([]);
  });
});
