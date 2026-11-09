import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// A reader for the block-style YAML the workflows and `lefthook.yml` are
// written in, so the guards that compare them read keys rather than grep for
// spellings. The repo root declares no YAML library and these guards must not
// add one, so this parses the subset in use: block mappings and sequences,
// `[a, b]` flow sequences, quoted and plain scalars, comments, and `|` / `>`
// block scalars. Anything else (anchors, flow mappings) comes back as the raw
// text of its line, which makes a lookup that depends on it fail loudly
// instead of passing on a misread. The parser's own cases live in
// `workflow-yaml.test.ts`.

export type Yaml = string | Yaml[] | { [key: string]: Yaml } | null;
type Line = { indent: number; text: string };

export const ROOT = resolve(import.meta.dirname, "../..");
export const WORKFLOW_DIR = resolve(ROOT, ".github/workflows");

/** Drops an inline comment: a `#` after whitespace, outside a quoted scalar. */
function stripComment(value: string): string {
  let quote: string | null = null;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (quote) {
      if (quote === '"' && char === "\\") i += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "#" && (i === 0 || /\s/.test(value[i - 1]!))) return value.slice(0, i).trim();
  }
  return value.trim();
}

function scalar(raw: string): Yaml {
  const value = stripComment(raw);
  if (value === "" || value === "~" || value === "null") return null;
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
    return value.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length > 1) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const body = value.slice(1, -1).trim();
    return body === "" ? [] : body.split(",").map((item) => scalar(item));
  }
  return value;
}

const KEY = /^("[^"]*"|'[^']*'|[^\s"'#\-[{][^:#]*?|-[^\s:#][^:#]*?)\s*:(?:\s+(.*)|)$/;

export function parseYaml(text: string): Yaml {
  const lines: (Line | null)[] = text.split("\n").map((line) => {
    const body = line.trimStart();
    return { indent: line.length - body.length, text: body.trimEnd() };
  });
  let at = 0;

  const isContent = (line: Line | null) =>
    line !== null && line.text !== "" && !line.text.startsWith("#");
  const skip = () => {
    while (at < lines.length && !isContent(lines[at]!)) at += 1;
  };

  function blockScalar(indent: number, folded: boolean, keep: string): string {
    const body: string[] = [];
    let base: number | null = null;
    while (at < lines.length) {
      const line = lines[at]!;
      if (line.text !== "") {
        if (line.indent <= indent) break;
        base ??= line.indent;
      }
      body.push(
        line.text === "" ? "" : " ".repeat(line.indent - (base ?? line.indent)) + line.text,
      );
      at += 1;
    }
    while (body.length > 0 && body.at(-1) === "") body.pop();
    const joined = folded ? body.join(" ") : body.join("\n");
    return keep.includes("-") ? joined : `${joined}\n`;
  }

  /** The value after `key:` on a line at `indent`, which may open a nested block. */
  function value(rest: string | undefined, indent: number): Yaml {
    const block = /^([|>])([-+0-9]*)\s*(?:#.*)?$/.exec(rest ?? "");
    if (block) return blockScalar(indent, block[1] === ">", block[2]!);
    if (rest !== undefined && stripComment(rest) !== "") return scalar(rest);
    skip();
    const next = lines[at];
    if (!next) return null;
    if (next.indent > indent) return node(next.indent);
    // GitHub Actions allows `key:` followed by `- item` at the key's indent.
    if (next.indent === indent && next.text.startsWith("- ")) return sequence(indent);
    return null;
  }

  function sequence(indent: number): Yaml[] {
    const out: Yaml[] = [];
    for (skip(); at < lines.length; skip()) {
      const line = lines[at]!;
      if (line.indent !== indent || !(line.text === "-" || line.text.startsWith("- "))) break;
      const item = line.text.slice(1).trimStart();
      if (KEY.test(item)) {
        // `- key: value` opens a mapping whose keys align with `key`.
        lines[at] = { indent: indent + (line.text.length - item.length), text: item };
        out.push(mapping(lines[at]!.indent));
      } else {
        at += 1;
        out.push(value(item === "" ? undefined : item, indent));
      }
    }
    return out;
  }

  function mapping(indent: number): { [key: string]: Yaml } {
    const out: { [key: string]: Yaml } = {};
    for (skip(); at < lines.length; skip()) {
      const line = lines[at]!;
      if (line.indent !== indent) break;
      const match = KEY.exec(line.text);
      if (!match) break;
      at += 1;
      out[scalar(match[1]!) as string] = value(match[2], indent);
    }
    return out;
  }

  function node(indent: number): Yaml {
    const line = lines[at]!;
    if (line.text === "-" || line.text.startsWith("- ")) return sequence(indent);
    if (KEY.test(line.text)) return mapping(indent);
    at += 1;
    return scalar(line.text);
  }

  skip();
  return at < lines.length ? node(lines[at]!.indent) : null;
}

export const asMap = (value: Yaml | undefined): { [key: string]: Yaml } =>
  value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
export const asList = (value: Yaml | undefined): Yaml[] => (Array.isArray(value) ? value : []);
export const asStrings = (value: Yaml | undefined): string[] =>
  asList(value).filter((item): item is string => typeof item === "string");

export const workflowFiles = (): string[] =>
  readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
export const readWorkflow = (name: string): { [key: string]: Yaml } =>
  asMap(parseYaml(readFileSync(resolve(WORKFLOW_DIR, name), "utf-8")));

/** The `on:` triggers, normalising the `on: push` and `on: [push, pull_request]` forms. */
export function triggers(workflow: { [key: string]: Yaml }): { [event: string]: Yaml } {
  const on = workflow.on;
  if (typeof on === "string") return { [on]: null };
  if (Array.isArray(on)) return Object.fromEntries(asStrings(on).map((event) => [event, null]));
  return asMap(on);
}

export interface PathFilter {
  readonly paths?: readonly string[];
  readonly pathsIgnore?: readonly string[];
}

/** The `pull_request` path filter, or `undefined` when the workflow does not run on PRs. */
export function pullRequestFilter(workflow: { [key: string]: Yaml }): PathFilter | undefined {
  const on = triggers(workflow);
  if (!("pull_request" in on)) return undefined;
  const event = asMap(on.pull_request);
  return {
    ...("paths" in event ? { paths: asStrings(event.paths) } : {}),
    ...("paths-ignore" in event ? { pathsIgnore: asStrings(event["paths-ignore"]) } : {}),
  };
}

/**
 * A GitHub path-filter / lefthook glob as a RegExp: `*` stops at `/`, `**`
 * crosses it, `{a,b}` alternates, and a leading dot is matched like any other
 * character (GitHub's filter matches `.claude/**` against `**`; node's
 * `matchesGlob` does not, which is why this is not that).
 */
export function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i]!;
    if (char === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      out += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (char === "*") out += "[^/]*";
    else if (char === "?") out += "[^/]";
    else if (char === "{") out += "(?:";
    else if (char === "}") out += ")";
    else if (char === ",") out += "|";
    else out += char.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

export const matchesAny = (file: string, globs: readonly string[]): boolean =>
  globs.some((glob) => globToRegExp(glob).test(file));

/** Whether a PR that changes only `file` starts a workflow with this filter. */
export const startsOn = (filter: PathFilter, file: string): boolean =>
  (filter.paths === undefined || matchesAny(file, filter.paths)) &&
  (filter.pathsIgnore === undefined || !matchesAny(file, filter.pathsIgnore));

export interface Job {
  readonly id: string;
  readonly name: string;
  /** Each `run:` of the job, one shell command per entry (continuations joined). */
  readonly commands: readonly string[];
}

export function jobs(workflow: { [key: string]: Yaml }): Job[] {
  return Object.entries(asMap(workflow.jobs)).map(([id, body]) => {
    const job = asMap(body);
    const runs = asList(job.steps)
      .map((step) => asMap(step).run)
      .filter((run): run is string => typeof run === "string");
    return {
      id,
      name: typeof job.name === "string" ? job.name : id,
      commands: runs.flatMap(shellCommands),
    };
  });
}

/** One entry per command line of a `run:` script, with `\` continuations joined. */
export const shellCommands = (script: string): string[] =>
  script
    .replace(/\\\n\s*/g, " ")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => line !== "" && !line.startsWith("#"));

let tracked: string[] | undefined;
/** Every tracked file, the corpus the trigger comparisons run over. */
export const trackedFiles = (): string[] =>
  (tracked ??= execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf-8" })
    .split("\0")
    .filter((file) => file !== ""));
