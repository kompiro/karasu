import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  check,
  CLI_INDEX,
  codeText,
  referencedCommands,
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

  it("ignores a prose mention of a non-command word", () => {
    // "karasu architecture" and "karasu model" are prose, not invocations.
    writeFixture("Turn this repo into a karasu architecture model with `karasu render f`.");
    expect(check(root)).toEqual([]);
  });
});
