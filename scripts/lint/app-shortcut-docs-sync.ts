/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Guards the keyboard-shortcut table in docs/tools/app.md (and its .ja twin)
// against the command registry in packages/app (Issue #1715). Every keyboard
// shortcut is a `Command` with a `keybinding` chord (see
// packages/app/src/keyboard/command-types.ts). Those chords are the single
// source of truth; the docs table is hand-written prose that silently drifts —
// it already shipped missing `mod+shift+p` (the command palette).
//
// The check: for every `keybinding` chord declared under
// packages/app/src/** (excluding tests and the exempt list below), the chord's
// canonical display form (`mod+shift+p` -> `Ctrl/Cmd+Shift+P`) must appear
// verbatim in BOTH locale docs. The display form is what a reader searches for,
// so substring presence anywhere in the file is the contract — the chord may
// live in the shortcuts table or, for the view switches, in the "Diagram
// views" table.
//
// This is the enumerable half of the broader "app/CLI surface -> docs/tools"
// reflection rule (see TPL-20260623-01); the non-enumerable half (toolbar
// buttons, views, CLI flags) is a review-time checklist, not this script.

export const APP_SRC_DIR = "packages/app/src";
export const DOC_FILES = ["docs/tools/app.md", "docs/tools/app.ja.md"] as const;

/**
 * Chords intentionally NOT surfaced in the user-facing docs. Each entry must
 * carry a reason so the omission is a conscious decision, not an oversight —
 * adding a chord here is the documented escape hatch when a shortcut is not
 * meant for the usage page.
 */
export const DOC_EXEMPT: ReadonlyMap<string, string> = new Map([
  ["mod+shift+1", "edit-tab switch (Show Editor) — internal pane nav, not a usage-page shortcut"],
  ["mod+shift+2", "edit-tab switch (Show Chat) — internal pane nav, not a usage-page shortcut"],
]);

const KEYBINDING_RE = /keybinding[:=]\s*"([^"]+)"/g;
const SOURCE_EXT_RE = /\.(tsx?|jsx?)$/;
const TEST_FILE_RE = /\.(test|spec)\.[jt]sx?$/;

/** Recursively collect every source file under `dir` (skipping tests). */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (SOURCE_EXT_RE.test(entry) && !TEST_FILE_RE.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Every distinct `keybinding` chord declared in the app source tree. */
export function collectChords(appSrcDir: string): Set<string> {
  const chords = new Set<string>();
  for (const file of sourceFiles(appSrcDir)) {
    const content = readFileSync(file, "utf8");
    for (const m of content.matchAll(KEYBINDING_RE)) {
      chords.add(m[1]);
    }
  }
  return chords;
}

/**
 * Canonical display form of a chord, matching the notation used in the docs:
 * `mod` -> `Ctrl/Cmd`, other modifiers Title-cased, the final key upper-cased.
 * `mod+shift+e` -> `Ctrl/Cmd+Shift+E`; `mod+1` -> `Ctrl/Cmd+1`.
 */
export function chordToDisplay(chord: string): string {
  return chord
    .split("+")
    .map((part) => {
      switch (part) {
        case "mod":
          return "Ctrl/Cmd";
        case "shift":
          return "Shift";
        case "alt":
          return "Alt";
        case "ctrl":
          return "Ctrl";
        default:
          // Single letters are upper-cased; digits and the rest pass through.
          return part.length === 1 ? part.toUpperCase() : part;
      }
    })
    .join("+");
}

export interface Problem {
  chord: string;
  display: string;
  missingIn: string[];
}

export function check(repoRoot: string): Problem[] {
  const appSrc = resolve(repoRoot, APP_SRC_DIR);
  const docContents = DOC_FILES.map((rel) => {
    const abs = resolve(repoRoot, rel);
    return { rel, content: existsSync(abs) ? readFileSync(abs, "utf8") : null };
  });

  const problems: Problem[] = [];
  for (const chord of [...collectChords(appSrc)].sort()) {
    if (DOC_EXEMPT.has(chord)) continue;
    const display = chordToDisplay(chord);
    const missingIn = docContents
      .filter(({ content }) => content === null || !content.includes(display))
      .map(({ rel }) => rel);
    if (missingIn.length > 0) problems.push({ chord, display, missingIn });
  }
  return problems;
}

function main(): void {
  const problems = check(process.cwd());
  if (problems.length > 0) {
    console.error(`app-shortcut-docs-sync: ${problems.length} undocumented shortcut(s):`);
    for (const p of problems) {
      console.error(`✗ ${p.chord} (expected "${p.display}") missing in: ${p.missingIn.join(", ")}`);
    }
    console.error(
      "\nDocument the shortcut in docs/tools/app.md and docs/tools/app.ja.md, " +
        "or add it to DOC_EXEMPT in scripts/lint/app-shortcut-docs-sync.ts with a reason.",
    );
    process.exit(1);
  }
  console.log("app-shortcut-docs-sync: ok (all app keybindings documented)");
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /app-shortcut-docs-sync\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
