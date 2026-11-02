import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the rule in `docs/process.md` § "Issue トピックラベル": every open
// Issue carries exactly one `topic:` label from `adr.config.json`, and a
// workflow that files an Issue gives it that label when it files it (#3390).
// A workflow that leaves the label off breaks that state on every run, and
// nothing else notices until someone runs the audit command by hand.
//
// Both ways the workflows file an Issue are read: a `gh issue create` command
// (its `--label` / `-l` arguments) and an `issues.create(...)` call inside
// `actions/github-script` (the top-level `labels` property of its argument).
// Both are tokenized rather than pattern-matched, so label-like text inside a
// title or body is never read as a label, and a form the scan cannot settle
// (a variable argument, a spread, a shorthand `labels`) yields no labels and
// fails. An Issue filed any other way (a `gh api` POST, a script the workflow
// runs) is not seen: none exists today, and one added later has to be read
// here too.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOW_DIR = join(REPO_ROOT, ".github/workflows");

const TOPICS: readonly string[] = JSON.parse(
  readFileSync(join(REPO_ROOT, "adr.config.json"), "utf8"),
).topics;

type IssueSite = { readonly where: string; readonly labels: readonly string[] };

/** Whether the match at `index` sits on a line commented out with `#` or `//`. */
function commentedOut(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  return /^\s*(?:#|\/\/)/.test(text.slice(lineStart, index));
}

const lineOf = (text: string, index: number): number => text.slice(0, index).split("\n").length;

/**
 * The words of the shell command starting at `start`, quoted the way the shell
 * quotes them: `'...'` and `"..."` stay inside one word, and `\` escapes the
 * next character (so `\` + newline joins two lines). The command ends at an
 * unquoted newline, `;`, `|`, `&` or `)`, or at a `#` that starts a word (a
 * comment runs to the newline, which ends the command).
 */
function shellWords(text: string, start: number): string[] {
  const words: string[] = [];
  let word: string | null = null;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote !== null) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"') word += text[++i] ?? "";
      else word += c;
    } else if (c === "\\") {
      if (text[i + 1] !== "\n") word = (word ?? "") + (text[i + 1] ?? "");
      i++;
    } else if (c === "#" && word === null) {
      return words;
    } else if (c === "'" || c === '"') {
      quote = c;
      word ??= "";
    } else if (/\s/.test(c) || ";|&)".includes(c)) {
      if (word !== null) words.push(word);
      word = null;
      if (c === "\n" || ";|&)".includes(c)) return words;
    } else word = (word ?? "") + c;
  }
  if (word !== null) words.push(word);
  return words;
}

/** `gh issue create` flags that take no value; every other flag consumes the next word. */
const GH_BOOLEAN_FLAGS = new Set(["-e", "--editor", "-w", "--web"]);

/** The labels a `gh issue create` argument list adds: `--label x`, `-l x`, `--label=x`, `x,y`. */
function ghLabels(args: readonly string[]): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--label=")) values.push(arg.slice("--label=".length));
    else if (arg === "--label" || arg === "-l") values.push(args[++i] ?? "");
    else if (arg.startsWith("-") && !arg.includes("=") && !GH_BOOLEAN_FLAGS.has(arg)) i++;
  }
  return values.flatMap((value) => value.split(",")).map((label) => label.trim());
}

function ghIssueCreateSites(file: string, text: string): IssueSite[] {
  // `new` is gh's alias for `create`.
  return [...text.matchAll(/\bgh issue (?:create|new)\b/g)].flatMap((m) => {
    if (commentedOut(text, m.index)) return [];
    const labels = ghLabels(shellWords(text, m.index).slice(3));
    return [{ where: `${file}:${lineOf(text, m.index)}`, labels }];
  });
}

/**
 * Walks the JavaScript from `open` (an opening bracket) to the bracket that
 * closes it, calling `visit` with each character outside a string literal or
 * a `//` / `/* *\/` comment, and its depth (1 directly inside `open`). Returns
 * the closing bracket's index.
 */
function walkBrackets(
  text: string,
  open: number,
  visit: (i: number, depth: number) => void,
): number {
  const endOf = (index: number) => (index === -1 ? text.length : index);
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote !== null) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (text.startsWith("//", i)) i = endOf(text.indexOf("\n", i)) - 1;
    else if (text.startsWith("/*", i)) i = endOf(text.indexOf("*/", i + 2)) + 1;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c) && --depth === 0) return i;
    else if (i > open) visit(i, depth);
  }
  return text.length;
}

/**
 * The string literals of the top-level `labels` array in the object passed to
 * the call whose `(` is at `open`, or `[]` when the scan cannot settle them:
 * the argument is not an object literal, it has a spread, or it has no
 * `labels: [...]` (or more than one) at its own top level.
 */
function callLabels(text: string, open: number): string[] {
  const object = open + 1 + (text.slice(open + 1).length - text.slice(open + 1).trimStart().length);
  if (text[object] !== "{") return [];
  const keys: number[] = [];
  let spread = false;
  walkBrackets(text, object, (i, depth) => {
    if (depth !== 1) return;
    if (text.startsWith("...", i)) spread = true;
    if (/^labels\s*:/.test(text.slice(i)) && !/[\w$.]/.test(text[i - 1])) keys.push(i);
  });
  if (spread || keys.length !== 1) return [];
  const array = text.indexOf("[", keys[0]);
  if (!/^labels\s*:\s*$/.test(text.slice(keys[0], array))) return [];
  const end = walkBrackets(text, array, () => {});
  const elements = text.slice(array, end).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
  return [...elements.matchAll(/"([^"\\]*)"|'([^'\\]*)'/g)].map((l) => l[1] ?? l[2]);
}

function issuesCreateSites(file: string, text: string): IssueSite[] {
  // `\b` rather than a leading `.`, so a destructured `issues.create(` counts.
  return [...text.matchAll(/\bissues\.create\s*\(/g)].flatMap((m) => {
    if (commentedOut(text, m.index)) return [];
    const labels = callLabels(text, m.index + m[0].length - 1);
    return [{ where: `${file}:${lineOf(text, m.index)}`, labels }];
  });
}

const scan = (file: string, text: string): IssueSite[] => [
  ...ghIssueCreateSites(file, text),
  ...issuesCreateSites(file, text),
];

const sites = readdirSync(WORKFLOW_DIR)
  .filter((file) => /\.ya?ml$/.test(file))
  .flatMap((file) => scan(file, readFileSync(join(WORKFLOW_DIR, file), "utf8")));

describe("workflows that file an Issue give it a topic: label", () => {
  it("finds the Issue-filing workflows (the scan itself still works)", () => {
    const files = new Set(sites.map((site) => site.where.split(":")[0]));
    expect([...files].sort()).toEqual(
      expect.arrayContaining(["e2e-nightly.yml", "release-prepare.yml", "tpl-review.yml"]),
    );
  });

  it.each(sites.map((site) => [site.where, site] as const))(
    "%s labels its Issue with exactly one topic from adr.config.json",
    (_where, site) => {
      const topics = site.labels.filter((label) => label.startsWith("topic: "));
      expect(topics).toHaveLength(1);
      expect(TOPICS).toContain(topics[0].slice("topic: ".length));
    },
  );
});

describe("the scan reads labels, not label-like text", () => {
  const labelsOf = (text: string) => scan("t.yml", text).map((site) => site.labels);

  it("reads every gh flag form, across `\\` continuations", () => {
    const run = [
      `gh issue create --title "T (x)" \\`,
      `  --label "a" -l 'b' --label=c,d \\`,
      `  --body-file /tmp/b.md`,
      `echo "--label topic: after the command"`,
    ].join("\n");
    expect(labelsOf(run)).toEqual([["a", "b", "c", "d"]]);
  });

  it("does not read --label inside a quoted --body as a label", () => {
    expect(labelsOf(`gh issue create --body "Run with --label 'topic: build'" --title T`)).toEqual([
      [],
    ]);
  });

  it("does not read a flag's value as a flag", () => {
    expect(labelsOf(`gh issue create --title --label -l topic:x`)).toEqual([["topic:x"]]);
  });

  it("reads only the call's own top-level labels array", () => {
    const script = `await github.rest.issues.create({ title: "x (", labels: [label, "topic: testing"] });`;
    expect(labelsOf(script)).toEqual([["topic: testing"]]);
  });

  it("does not read labels: inside a string or a nested object", () => {
    expect(labelsOf('issues.create({ body: `labels: ["topic: testing"]` });')).toEqual([[]]);
    expect(labelsOf(`issues.create({ meta: { labels: ["topic: testing"] } });`)).toEqual([[]]);
  });

  it("yields no labels for a form it cannot settle", () => {
    expect(labelsOf(`issues.create(params);`)).toEqual([[]]);
    expect(labelsOf(`issues.create({ ...base, labels: ["topic: build"] });`)).toEqual([[]]);
    expect(labelsOf(`issues.create({ labels });`)).toEqual([[]]);
  });

  it("does not read a label the shell or JavaScript comments out", () => {
    expect(labelsOf(`gh issue create --title T # --label "topic: build"`)).toEqual([[]]);
    expect(labelsOf(`gh issue new --title T \\\n  # --label "topic: build"`)).toEqual([[]]);
    expect(
      labelsOf(`issues.create({\n  title: "x",\n  // labels: ["topic: testing"],\n});`),
    ).toEqual([[]]);
    expect(labelsOf(`issues.create({ /* labels: ["topic: testing"] */ title: "x" });`)).toEqual([
      [],
    ]);
    expect(labelsOf(`issues.create({ // don't\n  body: "labels: ['topic: x']" });`)).toEqual([[]]);
  });

  it("does not read a commented-out element of the labels array", () => {
    expect(labelsOf(`issues.create({ labels: ["bug", // "topic: testing"\n] });`)).toEqual([
      ["bug"],
    ]);
  });

  it("skips commented-out lines", () => {
    expect(labelsOf(`# gh issue create --title T\n// issues.create({})`)).toEqual([]);
  });
});
