/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { collectChords } from "./app-shortcut-docs-sync.ts";

// Guards the app's command registry against the Playwright suite (Issue #3042,
// decision 7 of #3039, TPL-3039). Every user-invokable action in packages/app
// is a `Command` registered through `useCommand({ id, keybinding? })`. The
// e2e suite grew only where an acceptance test asked for a spec, so commands
// shipped with no browser test at all; this check makes a new command fail
// until some spec drives it.
//
// The check: for every command registered under packages/app/src/** (tests
// excluded), at least one `packages/e2e/tests/**/*.spec.ts` contains
//   - the command id (`project.switch`), or
//   - its keybinding in the Playwright form a spec presses
//     (`mod+shift+p` -> `"ControlOrMeta+Shift+P"`), or
//   - the `pressChord(page, "Shift+P")` form of that keybinding
//     (packages/e2e/fixtures/keyboard.ts adds the `ControlOrMeta+`).
// The docs display form (`Ctrl/Cmd+Shift+P`) is not accepted: specs press
// chords and assert aria state, so that form never appears in one.
//
// Commands are read from each `useCommand({...})` call's top-level `id` and
// `keybinding`, not from a flat `id="…"` grep, which would also match HTML
// ids (`id="settings-language"`) and nested objects inside `run`. A value that
// is not a string literal is resolved when it is a `const` in the same file or
// a prop of the enclosing component (then every `<Component id="…" …>` site
// is a command); anything else fails the check, so a registration this script
// cannot read is never silently skipped. As a second net, every chord that
// app-shortcut-docs-sync.ts finds must belong to a command found here.

export const APP_SRC_DIR = "packages/app/src";
export const E2E_TESTS_DIR = "packages/e2e/tests";

/**
 * Command ids that intentionally have no e2e spec yet. Each entry carries the
 * reason; delete the entry in the PR that adds the spec (the check fails on an
 * entry whose command is covered or no longer registered).
 */
export const EXEMPT: ReadonlyMap<string, string> = new Map([
  [
    "view.openReference",
    "opens the Reference pop-out window (AT-1461); no e2e yet, listed as still missing after #3039 S1",
  ],
]);

export interface AppCommand {
  id: string;
  keybinding?: string;
  /** Repo-relative file of the `useCommand` call (or of the JSX site that supplies the id). */
  file: string;
}

const SOURCE_EXT_RE = /\.(tsx?|jsx?)$/;
const TEST_FILE_RE = /\.(test|spec)\.[jt]sx?$/;
const SPEC_FILE_RE = /\.spec\.ts$/;
// Every call, whatever the argument; the hook's own declaration is skipped.
const USE_COMMAND_RE = /(?<!function\s+)\buseCommand\(\s*/g;
const IDENT_RE = /^[A-Za-z_$][\w$]*$/;

function walk(dir: string, accept: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, accept));
    else if (accept(entry)) out.push(full);
  }
  return out;
}

/**
 * Index just past the `}` matching the `{` at `open`. Skips string and
 * template literals so a brace inside a title does not count.
 */
function matchBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(src, i);
      continue;
    }
    if (ch === "/" && (src[i + 1] === "/" || src[i + 1] === "*")) {
      i = skipComment(src, i);
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error(`unbalanced braces from offset ${open}`);
}

/** Index of the last character of the line or block comment starting at `start`. */
function skipComment(src: string, start: number): number {
  if (src[start + 1] === "/") {
    const nl = src.indexOf("\n", start);
    return nl === -1 ? src.length : nl - 1;
  }
  const end = src.indexOf("*/", start + 2);
  return end === -1 ? src.length : end + 1;
}

/** `src` with its comments removed; string literals are left intact. */
export function stripComments(src: string): string {
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const end = skipString(src, i);
      out += src.slice(i, end + 1);
      i = end;
    } else if (ch === "/" && (src[i + 1] === "/" || src[i + 1] === "*")) {
      i = skipComment(src, i);
      out += " ";
    } else {
      out += ch;
    }
  }
  return out;
}

function skipString(src: string, start: number): number {
  const quote = src[start];
  for (let i = start + 1; i < src.length; i++) {
    if (src[i] === "\\") i++;
    else if (src[i] === quote) return i;
  }
  return src.length;
}

/** Top-level `key: value` / shorthand `key` properties of an object literal body. */
export function topLevelProps(body: string): Map<string, string> {
  const props = new Map<string, string>();
  let depth = 0;
  let start = 0;
  const segments: string[] = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(body, i);
    } else if (ch === "{" || ch === "(" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
    } else if (ch === "," && depth === 0) {
      segments.push(body.slice(start, i));
      start = i + 1;
    }
  }
  segments.push(body.slice(start));
  for (const raw of segments) {
    const seg = raw.trim();
    if (!seg) continue;
    const kv = /^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]*)$/.exec(seg);
    if (kv) props.set(kv[1], kv[2].trim());
    else if (IDENT_RE.test(seg)) props.set(seg, seg);
  }
  return props;
}

function stringLiteral(expr: string): string | null {
  const m = /^(["'])((?:\\.|(?!\1).)*)\1$/.exec(expr);
  return m ? m[2] : null;
}

/** `const NAME = "…"` in the same file. */
function constString(src: string, name: string): string | null {
  const m = new RegExp(
    `\\bconst\\s+${escapeRe(name)}\\s*(?::[^=]+)?=\\s*(["'])((?:\\\\.|(?!\\1).)*)\\1`,
  ).exec(src);
  return m ? m[2] : null;
}

/**
 * The component whose destructured props include `name` and whose body holds
 * `offset`: the nearest preceding `function Comp({ …name… }` declaration.
 */
function enclosingComponentWithProp(src: string, offset: number, name: string): string | null {
  const re = /function\s+([A-Z][\w$]*)\s*\(\s*\{([^}]*)\}/g;
  let found: string | null = null;
  for (const m of src.matchAll(re)) {
    if (m.index === undefined || m.index > offset) break;
    const params = m[2].split(",").map((p) => p.trim().split(/[\s:=]/)[0]);
    found = params.includes(name) ? m[1] : null;
  }
  return found;
}

/**
 * Index of the `>` that closes the JSX opening tag starting at `start`. A `>`
 * inside an expression container (`onShow={() => …}`) or a string does not
 * close the tag.
 */
function jsxTagEnd(src: string, start: number): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") i = skipString(src, i);
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return i;
  }
  return src.length;
}

/** Attributes of every `<Comp …>` JSX element across the given files. */
function jsxSites(
  files: { rel: string; src: string }[],
  component: string,
): { rel: string; attrs: Map<string, string> }[] {
  const sites: { rel: string; attrs: Map<string, string> }[] = [];
  const open = new RegExp(`<${component}\\b`, "g");
  for (const { rel, src } of files) {
    for (const m of src.matchAll(open)) {
      const start = (m.index ?? 0) + m[0].length;
      const end = jsxTagEnd(src, start);
      const attrs = new Map<string, string>();
      for (const a of src.slice(start, end).matchAll(/([A-Za-z_$][\w$]*)=(["'])([^"']*)\2/g)) {
        attrs.set(a[1], a[3]);
      }
      sites.push({ rel, attrs });
    }
  }
  return sites;
}

/**
 * Top-level properties of the object a `useCommand(` call at `argStart`
 * receives: an inline object literal, or an identifier bound by
 * `const NAME = {` in the same file. Any other argument fails the check, so
 * no registration is skipped silently.
 */
function commandProps(src: string, rel: string, argStart: number): Map<string, string> {
  let open = argStart;
  if (src[argStart] !== "{") {
    const ident = /^[A-Za-z_$][\w$]*/.exec(src.slice(argStart))?.[0];
    const decl =
      ident === undefined
        ? null
        : new RegExp(`\\bconst\\s+${escapeRe(ident)}\\s*(?::[^=]+)?=\\s*\\{`).exec(src);
    if (decl === null) {
      throw new Error(
        `${rel}: useCommand argument is neither an object literal nor a same-file \`const\` object`,
      );
    }
    open = decl.index + decl[0].length - 1;
  }
  return topLevelProps(stripComments(src.slice(open + 1, matchBrace(src, open) - 1)));
}

type Resolved = { kind: "literal"; value: string } | { kind: "prop"; prop: string };

function resolveValue(src: string, expr: string): Resolved | null {
  const lit = stringLiteral(expr);
  if (lit !== null) return { kind: "literal", value: lit };
  if (!IDENT_RE.test(expr)) return null;
  const c = constString(src, expr);
  if (c !== null) return { kind: "literal", value: c };
  return { kind: "prop", prop: expr };
}

/**
 * Every command registered through `useCommand` under `appSrcDir`. Throws on
 * a registration whose `id` or `keybinding` cannot be resolved to literals.
 */
export function collectCommands(repoRoot: string, appSrcDir = APP_SRC_DIR): AppCommand[] {
  const files = walk(
    resolve(repoRoot, appSrcDir),
    (n) => SOURCE_EXT_RE.test(n) && !TEST_FILE_RE.test(n),
  )
    .sort()
    .map((abs) => ({ rel: relative(repoRoot, abs), src: readFileSync(abs, "utf8") }));

  const commands: AppCommand[] = [];
  for (const { rel, src } of files) {
    for (const m of src.matchAll(USE_COMMAND_RE)) {
      const props = commandProps(src, rel, (m.index ?? 0) + m[0].length);
      const idExpr = props.get("id");
      if (idExpr === undefined) throw new Error(`${rel}: useCommand call without an \`id\``);
      const id = resolveValue(src, idExpr);
      const kbExpr = props.get("keybinding");
      const kb = kbExpr === undefined ? undefined : resolveValue(src, kbExpr);
      if (id === null || kb === null) {
        throw new Error(
          `${rel}: cannot resolve useCommand ${id === null ? `id \`${idExpr}\`` : `keybinding \`${kbExpr}\``} ` +
            "to a string literal (use a literal, a same-file const, or a component prop)",
        );
      }

      if (id.kind === "literal" && kb?.kind !== "prop") {
        commands.push({ id: id.value, keybinding: kb?.value, file: rel });
        continue;
      }

      // The id (or keybinding) is a prop: the commands are the JSX sites.
      const propNames = [id, kb].flatMap((r) => (r?.kind === "prop" ? [r.prop] : []));
      const component = enclosingComponentWithProp(src, m.index ?? 0, propNames[0]);
      if (component === null) {
        throw new Error(
          `${rel}: useCommand value \`${propNames[0]}\` is neither a string literal, a same-file const, ` +
            "nor a destructured prop of the enclosing component",
        );
      }
      const sites = jsxSites(files, component);
      if (sites.length === 0)
        throw new Error(`${rel}: no <${component}> element supplies its command id`);
      for (const site of sites) {
        const siteId = id.kind === "literal" ? id.value : site.attrs.get(id.prop);
        const siteKb =
          kb === undefined ? undefined : kb.kind === "literal" ? kb.value : site.attrs.get(kb.prop);
        if (siteId === undefined || (kb !== undefined && siteKb === undefined)) {
          throw new Error(
            `${site.rel}: <${component}> lacks a string-literal ${siteId === undefined ? "id" : "keybinding"}`,
          );
        }
        commands.push({ id: siteId, keybinding: siteKb, file: site.rel });
      }
    }
  }
  return commands;
}

/** `mod+shift+p` -> `ControlOrMeta+Shift+P`, the form a spec passes to `keyboard.press`. */
export function chordToPlaywright(chord: string): string {
  return chord
    .split("+")
    .map((part) => {
      switch (part) {
        case "mod":
          return "ControlOrMeta";
        case "shift":
          return "Shift";
        case "alt":
          return "Alt";
        case "ctrl":
          return "Control";
        default:
          return part.length === 1 ? part.toUpperCase() : part;
      }
    })
    .join("+");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Patterns that count as a spec pressing `chord`. Case-insensitive on the key. */
export function chordPatterns(chord: string): RegExp[] {
  const pw = chordToPlaywright(chord);
  const patterns = [new RegExp(`["'\`]${escapeRe(pw)}["'\`]`, "i")];
  if (pw.startsWith("ControlOrMeta+")) {
    const rest = pw.slice("ControlOrMeta+".length);
    patterns.push(
      new RegExp(`pressChord\\(\\s*[\\w.]+\\s*,\\s*["'\`]${escapeRe(rest)}["'\`]`, "i"),
    );
  }
  return patterns;
}

export function isCovered(command: AppCommand, specText: string): boolean {
  // Bounded so `view.showOrg` is not covered by a spec naming `view.showOrgTree`.
  if (new RegExp(`(?<![\\w.$])${escapeRe(command.id)}(?![\\w.$])`).test(specText)) return true;
  return (
    command.keybinding !== undefined &&
    chordPatterns(command.keybinding).some((re) => re.test(specText))
  );
}

export interface Problem {
  id: string;
  message: string;
}

export function check(repoRoot: string, exempt: ReadonlyMap<string, string> = EXEMPT): Problem[] {
  const commands = collectCommands(repoRoot);
  const testsDir = resolve(repoRoot, E2E_TESTS_DIR);
  const specText = existsSync(testsDir)
    ? walk(testsDir, (n) => SPEC_FILE_RE.test(n))
        .map((f) => readFileSync(f, "utf8"))
        .join("\n")
    : "";

  const problems: Problem[] = [];
  const ids = new Set(commands.map((c) => c.id));
  const bound = new Set(commands.flatMap((c) => (c.keybinding ? [c.keybinding] : [])));

  for (const chord of [...collectChords(resolve(repoRoot, APP_SRC_DIR))].sort()) {
    if (!bound.has(chord)) {
      problems.push({
        id: chord,
        message: `keybinding "${chord}" is declared in ${APP_SRC_DIR} but belongs to no useCommand registration this script can read`,
      });
    }
  }

  const seen = new Set<string>();
  for (const command of commands) {
    if (seen.has(command.id)) continue;
    seen.add(command.id);
    const covered = isCovered(command, specText);
    if (exempt.has(command.id)) {
      if (covered) {
        problems.push({
          id: command.id,
          message: `${command.id} is exempt but a spec now covers it; remove it from EXEMPT`,
        });
      }
      continue;
    }
    if (!covered) {
      const forms = command.keybinding ? ` or "${chordToPlaywright(command.keybinding)}"` : "";
      problems.push({
        id: command.id,
        message: `${command.id} (${command.file}) appears in no ${E2E_TESTS_DIR} spec: expected "${command.id}"${forms}`,
      });
    }
  }

  for (const id of exempt.keys()) {
    if (!ids.has(id)) {
      problems.push({ id, message: `EXEMPT entry "${id}" is not a registered command; remove it` });
    }
  }
  return problems;
}

function main(): void {
  let problems: Problem[];
  try {
    problems = check(process.cwd());
  } catch (error) {
    console.error(`e2e-command-coverage: ${(error as Error).message}`);
    process.exit(1);
  }
  if (problems.length > 0) {
    console.error(`e2e-command-coverage: ${problems.length} problem(s):`);
    for (const p of problems) console.error(`✗ ${p.message}`);
    console.error(
      "\nDrive the command from a Playwright spec in packages/e2e/tests (press its chord with " +
        "pressChord from fixtures/keyboard.ts, or name its id), or add it to EXEMPT in " +
        "scripts/lint/e2e-command-coverage.ts with a reason.",
    );
    process.exit(1);
  }
  console.log("e2e-command-coverage: ok (every app command is driven by an e2e spec)");
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /e2e-command-coverage\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
