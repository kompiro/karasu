/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Guards the `karasu <cmd>` command names hardcoded in .claude/skills/** against
// the CLI's actual command registry in packages/cli/src/index.ts (Issue #2093).
//
// Skills prescribe CLI commands as prose; the CLI evolves; CI sees nothing. Two
// drift incidents shipped within one week — both found by a human reading the
// skill, neither by tooling:
//   - #2084: `karasu lint-style` prescribed as the `.krs` validation gate.
//   - #2090: "translate has no adapter" for Workers, one day after `--from
//     wrangler` shipped (#1948).
//
// This is the AGENT-facing twin of the user-facing `app-shortcut-docs-sync`
// guard / TPL-20260623-01. It closes the ENUMERABLE half of the drift only, and
// deliberately so — read the two limits below before trusting it.
//
// WHAT THIS CATCHES: a skill referencing a `karasu <cmd>` that is not a
// registered command (a renamed or removed command). That is a real class — the
// CLI has renamed commands before — but note it scores 0/2 against the two
// incidents above, because:
//
//   - #2084's `lint-style` IS a registered command; it was the wrong command
//     for the file type. A name check cannot see a semantic mismatch. Only
//     executing the skill's documented pipeline against a fixture and asserting
//     the gate fails on a broken input would catch it — a real e2e harness, out
//     of scope for one skill.
//   - #2090 asserted the ABSENCE of a capability. There is no command reference
//     to validate; the claim lives in prose. The lefthook glob for this guard
//     includes packages/core/src/translate/** so the check re-runs — and prints
//     the advisory in `main()` — when the adapter surface changes, firing on
//     exactly the PR (#1948) that made the skill stale. That is a prompt for
//     human judgement, not an assertion; it cannot be "correct", only timely.
//
// Do not over-trust a green result here: it means no dangling command names, not
// that the skills' CLI claims are accurate.

export const SKILLS_DIR = ".claude/skills";
export const CLI_INDEX = "packages/cli/src/index.ts";

/** `.command("serve [dir]")` / `.command("render <file>")` → the command name. */
const COMMAND_RE = /\.command\(\s*["'`]([a-z][a-z-]*)/g;

/** A `karasu <cmd>` invocation; `cmd` is the first bare word after `karasu`. */
const INVOCATION_RE = /\bkarasu\s+([a-z][a-z-]+)/g;

/** Inline code span: `…` (single backtick, no embedded backtick). */
const INLINE_CODE_RE = /`([^`\n]+)`/g;

/**
 * Every command name registered on the commander program. Read by regex — not
 * by importing the module — so the guard stays decoupled from a built/resolvable
 * workspace graph, exactly as `app-shortcut-docs-sync` reads `keybinding`
 * literals rather than importing the app. `packages/cli/src/index.ts` does
 * `export { program }`, so `program.commands` is an alternative source if this
 * ever needs to follow dynamically-registered commands.
 */
export function registeredCommands(cliIndexSource: string): Set<string> {
  const names = new Set<string>();
  for (const m of cliIndexSource.matchAll(COMMAND_RE)) {
    names.add(m[1]);
  }
  return names;
}

/**
 * The text of every code context in a Markdown document — inline `spans` and
 * ```fenced``` blocks — concatenated. Command invocations live in code;
 * ordinary prose ("a karasu architecture model", "turn this repo into a karasu
 * model") does not, so restricting the scan to code is what drops those false
 * positives. Reading fenced blocks too keeps a future skill's ```console```
 * example (as in PR #2091) in scope.
 */
export function codeText(markdown: string): string {
  const parts: string[] = [];
  const lines = markdown.split("\n");
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue; // the fence marker line itself carries no command text
    }
    if (inFence) {
      parts.push(line);
      continue;
    }
    for (const m of line.matchAll(INLINE_CODE_RE)) {
      parts.push(m[1]);
    }
  }
  return parts.join("\n");
}

/** Every distinct command referenced as `karasu <cmd>` in a document's code. */
export function referencedCommands(markdown: string): Set<string> {
  const refs = new Set<string>();
  for (const m of codeText(markdown).matchAll(INVOCATION_RE)) {
    refs.add(m[1]);
  }
  return refs;
}

/** Recursively collect every Markdown file under `dir`. */
function markdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...markdownFiles(full));
    } else if (entry.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

export interface Problem {
  file: string;
  command: string;
}

/**
 * Every `karasu <cmd>` reference in a skill Markdown file whose `<cmd>` is not a
 * registered CLI command, sorted by file then command for stable output.
 */
export function check(repoRoot: string): Problem[] {
  const cliIndexAbs = resolve(repoRoot, CLI_INDEX);
  const registered = existsSync(cliIndexAbs)
    ? registeredCommands(readFileSync(cliIndexAbs, "utf8"))
    : new Set<string>();

  const problems: Problem[] = [];
  for (const file of markdownFiles(resolve(repoRoot, SKILLS_DIR))) {
    const rel = relative(repoRoot, file);
    const markdown = readFileSync(file, "utf8");
    for (const command of [...referencedCommands(markdown)].sort()) {
      if (!registered.has(command)) {
        problems.push({ file: rel, command });
      }
    }
  }
  return problems.sort(
    (a, b) => a.file.localeCompare(b.file) || a.command.localeCompare(b.command),
  );
}

/**
 * The residual advisory (Issue #2093 "Part B"). Printed whenever the guard runs,
 * because a passing name check does not prove the skills' CLI claims are
 * accurate — and the two most damaging drift classes (wrong-command-for-the-job,
 * stale capability-absence claims) are invisible to any name check. The lefthook
 * glob fires this on CLI-surface changes (index.ts, translate/**) precisely so
 * this shows at the moment a skill's claims may have gone stale.
 */
const ADVISORY =
  "note: name check only — it cannot see a wrong-command-for-the-job (#2084) " +
  "or a stale capability claim (#2090). If the CLI's command or adapter surface " +
  "changed, re-read .claude/skills/** for claims about what the CLI can/can't do.";

function main(): void {
  const problems = check(process.cwd());
  console.error(ADVISORY);
  if (problems.length > 0) {
    console.error(`\nskill-cli-refs: ${problems.length} unknown command reference(s):`);
    for (const p of problems) {
      console.error(`✗ ${p.file}: \`karasu ${p.command}\` is not a registered command`);
    }
    console.error(
      "\nA skill references a `karasu <cmd>` that no longer exists. Fix the skill " +
        "to use a current command (see `packages/cli/src/index.ts`), or correct the typo.",
    );
    process.exit(1);
  }
  console.log(
    "skill-cli-refs: ok (every `karasu <cmd>` in .claude/skills/** is a registered command)",
  );
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /skill-cli-refs\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
