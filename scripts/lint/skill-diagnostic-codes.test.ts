import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { check, checkSkill, referencedCodes } from "./skill-diagnostic-codes.ts";

const known = new Set(["unresolved-edge-endpoint", "cyclic-dependency"]);

describe("checkSkill", () => {
  it("accepts codes in tables and prose", () => {
    const md = [
      "| `code:unresolved-edge-endpoint` | warning |",
      "Stop when `code:cyclic-dependency` is reported.",
    ].join("\n");
    expect(checkSkill("SKILL.md", md, known, true)).toEqual([]);
  });

  it("fails a code core does not emit", () => {
    expect(checkSkill("SKILL.md", "`code:unresolved-edge`", known, false)).toEqual([
      { file: "SKILL.md", kind: "unknown-code", value: "unresolved-edge" },
    ]);
  });

  it("fails a KRS ID anywhere in the skill", () => {
    expect(checkSkill("SKILL.md", "grep for Warning[KRS041]", known, false)).toEqual([
      { file: "SKILL.md", kind: "names-id", value: "KRS041" },
    ]);
  });

  it("does not take a placeholder for an ID", () => {
    expect(checkSkill("SKILL.md", "`Warning[KRS…]: ...`", known, false)).toEqual([]);
  });

  it("fails a skill that must judge by codes but names none", () => {
    expect(checkSkill("SKILL.md", "Read the warnings.", known, true)).toEqual([
      { file: "SKILL.md", kind: "no-codes" },
    ]);
  });

  it("ignores a bare backticked code without the prefix", () => {
    expect(referencedCodes("the `edge-source-mismatch` code")).toEqual([]);
  });
});

describe("the published skills", () => {
  // The mirror ci.yml runs: a code renamed in core alone changes no SKILL.md,
  // so only this run sees it.
  it("judge only by codes core emits, and name no ID", () => {
    expect(check(resolve(import.meta.dirname, "../.."))).toEqual([]);
  });
});
