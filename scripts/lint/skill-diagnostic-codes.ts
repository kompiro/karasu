/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DIAGNOSTIC_IDS } from "../../packages/core/src/types/diagnostic-ids.ts";

// Fails when a published skill judges by a diagnostic code that does not exist,
// or names a diagnostic by its KRS ID (Issue #3654, TPL-3654).
//
// A skill decides what to do next from `karasu check --format json`, matching
// each diagnostic's `code`. It writes every code it judges by as
// `code:<kebab>` in backticks, so this guard can find them in tables and prose
// alike and check each against the codes core emits. A renamed code would
// otherwise leave a stop condition that never fires: the match comes back
// empty and reads as "no such diagnostic", which is how the skill passed broken
// models in #3640.
//
// The KRS ID is the code's alias for people reading the CLI's lines. A skill
// that judges by it keeps a second key that can drift from the first, so the
// ID is not written in a skill at all (`KRS` and three digits).
//
// `reverse-architecture` judges its Phase 4 stop condition by codes, so it must
// name at least one; an empty set would mean the convention was dropped, not
// that nothing is checked.
//
// What it cannot see: a new stop condition that matches a message's text
// instead of a code. That is held by review (the skill's reached state).
//
// Only SKILL.md is read. The bundled reference/ files are copies of the spec,
// which names IDs on purpose.
//
// WHERE IT RUNS: lefthook pre-push; reference-docs-check.yml (a PR that edits
// only a SKILL.md skips ci.yml); and the vitest mirror under ci.yml, which
// catches a code renamed in core alone.

export const SKILLS_DIR = "packages/skills/skills";

/** Skills whose stop conditions must be written as codes. */
export const SKILLS_REQUIRING_CODES = ["reverse-architecture"];

export interface Problem {
  file: string;
  kind: "unknown-code" | "names-id" | "no-codes";
  value?: string;
}

/** Every `code:<kebab>` a skill writes. */
export function referencedCodes(markdown: string): string[] {
  return [...markdown.matchAll(/`code:([a-z][a-z0-9-]*)`/g)].map((m) => m[1]);
}

/** Every KRS ID a skill writes. */
export function referencedIds(markdown: string): string[] {
  return [...markdown.matchAll(/\bKRS[0-9]{3}\b/g)].map((m) => m[0]);
}

export function checkSkill(
  file: string,
  markdown: string,
  known: ReadonlySet<string>,
  requireCodes: boolean,
): Problem[] {
  const problems: Problem[] = [];
  const codes = referencedCodes(markdown);
  for (const code of new Set(codes)) {
    if (!known.has(code)) problems.push({ file, kind: "unknown-code", value: code });
  }
  for (const id of new Set(referencedIds(markdown))) {
    problems.push({ file, kind: "names-id", value: id });
  }
  if (requireCodes && codes.length === 0) problems.push({ file, kind: "no-codes" });
  return problems;
}

export function check(root: string): Problem[] {
  const known = new Set(Object.keys(DIAGNOSTIC_IDS));
  const dir = join(root, SKILLS_DIR);
  const problems: Problem[] = [];
  for (const skill of readdirSync(dir, { withFileTypes: true })) {
    if (!skill.isDirectory()) continue;
    const file = join(SKILLS_DIR, skill.name, "SKILL.md");
    if (!existsSync(join(root, file))) continue;
    const markdown = readFileSync(join(root, file), "utf8");
    problems.push(
      ...checkSkill(file, markdown, known, SKILLS_REQUIRING_CODES.includes(skill.name)),
    );
  }
  for (const name of SKILLS_REQUIRING_CODES) {
    if (!existsSync(join(dir, name, "SKILL.md"))) {
      problems.push({ file: join(SKILLS_DIR, name, "SKILL.md"), kind: "no-codes" });
    }
  }
  return problems;
}

function main(): void {
  const problems = check(process.cwd());
  if (problems.length > 0) {
    console.error(`skill-diagnostic-codes: ${problems.length} problem(s):`);
    for (const p of problems) {
      const what =
        p.kind === "unknown-code"
          ? `\`code:${p.value}\` is not a code core emits (DiagnosticParamsByCode / WarningKind)`
          : p.kind === "names-id"
            ? `names the ID ${p.value}; judge by the JSON \`code\` and write it as \`code:<kebab>\``
            : "judges by no `code:<kebab>`; its stop conditions must name the codes they match";
      console.error(`✗ ${p.file}: ${what}`);
    }
    process.exit(1);
  }
  console.log("skill-diagnostic-codes: ok (every `code:<kebab>` in the skills is a current code)");
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /skill-diagnostic-codes\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
