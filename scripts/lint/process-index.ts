/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path/posix";

// Holds docs/process.md to being a small core with an index (Issue #3337).
//
// CLAUDE.md has every session read docs/process.md in full, so the file is
// paid for on every turn. Material needed only when a task starts lives in
// docs/process/<topic>.md, and the core reaches it through the index under
// "### 規約の所在": one row per topic, naming the observable moment to read it
// in the "発火条件" column. A topic file that no row names is never read, and a
// row without a trigger tells no one when to read it, so both fail here.
//
// The size budget turns growth into a decision. process.md only ever grows by
// appending (ADR-2351); over the budget, the next addition has to move a
// section out to a topic file instead.
//
// Relative links are checked in the core and in every topic file because
// moving a section one directory deeper breaks every link it carries unless
// each gains a `../`, and nothing else looks at links in docs/process*.
//
// WHERE IT RUNS: lefthook pre-push, and `reference-docs-check.yml`, which
// fires on docs/process.md and docs/process/**. `ci.yml` ignores `docs/**`, so
// it would skip exactly the PR that edits only these files.

export const PROCESS_MD = "docs/process.md";
export const TOPIC_DIR = "docs/process";
/** The most docs/process.md may weigh, in bytes. */
export const SIZE_BUDGET = 16_384;
export const INDEX_HEADING = "### 規約の所在";
export const SOURCE_COLUMN = "正本";
export const TRIGGER_COLUMN = "発火条件";

export interface Input {
  /** docs/process.md as text. */
  processMd: string;
  /** Every docs/process/*.md, keyed by repository-relative path. */
  topics: ReadonlyMap<string, string>;
  /** Whether a repository-relative path exists. */
  exists: (path: string) => boolean;
}

export interface IndexRow {
  /** 1-based line in docs/process.md. */
  line: number;
  source: string;
  trigger: string;
}

/** Splits a Markdown table row into trimmed cells, without the outer pipes. */
function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * The rows of the first table under the index heading, or an error naming
 * what is missing. The section ends at the next heading of level 1 to 3.
 */
export function parseIndex(processMd: string): { rows: IndexRow[] } | { error: string } {
  const lines = processMd.split("\n");
  const start = lines.findIndex((line) => line.trim() === INDEX_HEADING);
  if (start === -1) return { error: `no "${INDEX_HEADING}" heading` };

  let header = -1;
  for (let i = start + 1; i < lines.length && !/^#{1,3} /.test(lines[i]); i++) {
    if (lines[i].trim().startsWith("|")) {
      header = i;
      break;
    }
  }
  if (header === -1) return { error: `no table under "${INDEX_HEADING}"` };

  const columns = cells(lines[header]);
  const sourceAt = columns.indexOf(SOURCE_COLUMN);
  const triggerAt = columns.indexOf(TRIGGER_COLUMN);
  if (sourceAt === -1 || triggerAt === -1) {
    return {
      error: `the index table needs the columns "${SOURCE_COLUMN}" and "${TRIGGER_COLUMN}" (found: ${columns.join(", ")})`,
    };
  }

  const rows: IndexRow[] = [];
  // header + 1 is the |---| separator.
  for (let i = header + 2; i < lines.length && lines[i].trim().startsWith("|"); i++) {
    const row = cells(lines[i]);
    rows.push({ line: i + 1, source: row[sourceAt] ?? "", trigger: row[triggerAt] ?? "" });
  }
  return { rows };
}

/** Relative Markdown link targets outside fenced code, with the anchor dropped. */
export function relativeLinks(markdown: string): { line: number; target: string }[] {
  const links: { line: number; target: string }[] = [];
  let fenced = false;
  markdown.split("\n").forEach((text, i) => {
    if (/^\s*```/.test(text)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (target === "" || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      links.push({ line: i + 1, target });
    }
  });
  return links;
}

/**
 * Repository-relative paths an index cell points at: Markdown links resolve
 * from docs/, backticked paths from the repository root.
 */
export function cellTargets(cell: string): string[] {
  const targets = relativeLinks(cell).map(({ target }) =>
    normalize(join(dirname(PROCESS_MD), target)),
  );
  for (const match of cell.matchAll(/`([^`\s]+\.md)`/g)) targets.push(normalize(match[1]));
  return targets;
}

const EMPTY_TRIGGER = new Set(["", "-", "—"]);

export function check(input: Input): string[] {
  const problems: string[] = [];

  const size = Buffer.byteLength(input.processMd, "utf8");
  if (size > SIZE_BUDGET) {
    problems.push(
      `${PROCESS_MD} is ${size} bytes, over the ${SIZE_BUDGET}-byte budget. Move a section that is ` +
        `needed only when a task starts to ${TOPIC_DIR}/<topic>.md and add an index row for it.`,
    );
  }

  const index = parseIndex(input.processMd);
  if ("error" in index) {
    problems.push(`${PROCESS_MD}: ${index.error}`);
  } else {
    const indexed = new Set<string>();
    for (const row of index.rows) {
      const targets = cellTargets(row.source);
      if (targets.length === 0) {
        problems.push(`${PROCESS_MD}:${row.line}: index row names no file in "${SOURCE_COLUMN}"`);
      }
      for (const target of targets) {
        indexed.add(target);
        if (!input.exists(target)) {
          problems.push(
            `${PROCESS_MD}:${row.line}: index row points at ${target}, which does not exist`,
          );
        }
      }
      if (EMPTY_TRIGGER.has(row.trigger)) {
        problems.push(
          `${PROCESS_MD}:${row.line}: index row has no "${TRIGGER_COLUMN}". Write the observable ` +
            `moment to read ${targets.join(", ") || "it"} (a step, a command, a path being edited).`,
        );
      }
    }
    for (const topic of [...input.topics.keys()].sort()) {
      if (!indexed.has(topic)) {
        problems.push(
          `${topic} is not in the index under "${INDEX_HEADING}" in ${PROCESS_MD}. ` +
            `Add a row naming it and when to read it, or nobody will.`,
        );
      }
    }
  }

  const documents = new Map([[PROCESS_MD, input.processMd], ...input.topics]);
  for (const [path, text] of documents) {
    for (const { line, target } of relativeLinks(text)) {
      const resolved = normalize(join(dirname(path), target));
      if (!input.exists(resolved)) {
        problems.push(
          `${path}:${line}: link to ${target} resolves to ${resolved}, which does not exist`,
        );
      }
    }
  }

  return problems;
}

/** Reads the core and its topic files from the repository at `root`. */
export function readInput(root: string): Input {
  const topicDir = join(root, TOPIC_DIR);
  const topics = new Map<string, string>();
  if (existsSync(topicDir)) {
    for (const name of readdirSync(topicDir).sort()) {
      if (name.endsWith(".md")) {
        topics.set(`${TOPIC_DIR}/${name}`, readFileSync(join(topicDir, name), "utf8"));
      }
    }
  }
  return {
    processMd: readFileSync(join(root, PROCESS_MD), "utf8"),
    topics,
    exists: (path) => existsSync(join(root, path)),
  };
}

function main(): void {
  const input = readInput(process.cwd());
  const problems = check(input);
  if (problems.length > 0) {
    console.error(`process-index: ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`✗ ${problem}`);
    process.exit(1);
  }
  const size = Buffer.byteLength(input.processMd, "utf8");
  console.log(
    `process-index: ok (${input.topics.size} topic file(s) indexed, ${PROCESS_MD} ${size}/${SIZE_BUDGET} bytes)`,
  );
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /process-index\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
