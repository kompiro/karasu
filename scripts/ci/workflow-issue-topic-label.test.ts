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
// (its `--label` / `-l` flags) and an `issues.create(...)` call inside
// `actions/github-script` (its `labels:` array). An Issue filed any other way
// (a `gh api` POST, a script the workflow runs) is not seen: none exists
// today, and one added later has to be read here too.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOW_DIR = join(REPO_ROOT, ".github/workflows");

const TOPICS: readonly string[] = JSON.parse(
  readFileSync(join(REPO_ROOT, "adr.config.json"), "utf8"),
).topics;

type IssueSite = { readonly where: string; readonly labels: readonly string[] };

/** The `--label` / `-l` values of each `gh issue create`, following `\` continuations. */
function ghIssueCreateSites(file: string, lines: readonly string[]): IssueSite[] {
  const sites: IssueSite[] = [];
  lines.forEach((line, i) => {
    if (/^\s*#/.test(line) || !/\bgh issue create\b/.test(line)) return;
    let command = line;
    for (let j = i; lines[j].trimEnd().endsWith("\\") && j + 1 < lines.length; j++) {
      command += `\n${lines[j + 1]}`;
    }
    // `--label a,b` adds both, so a value is split on commas.
    const labels = [
      ...command.matchAll(/(?:--label[=\s]|-l\s)\s*(?:"([^"]*)"|'([^']*)'|([^\s)\\]+))/g),
    ]
      .flatMap((m) => (m[1] ?? m[2] ?? m[3]).split(","))
      .map((label) => label.trim());
    sites.push({ where: `${file}:${i + 1}`, labels });
  });
  return sites;
}

/**
 * The text between the parenthesis at `open` and the one that closes it.
 * Parentheses inside a string literal (`"..."`, `'...'`, `` `...` ``) are not
 * counted, so a `(` in a title cannot carry the call on into the next one.
 */
function callArguments(text: string, open: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote !== null) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

/**
 * The string literals in the `labels:` array of each `issues.create(...)`. A
 * call with no `labels:` or more than one (a nested object's) yields no
 * labels, so it fails rather than borrowing a label it may not own.
 */
function issuesCreateSites(file: string, text: string): IssueSite[] {
  // `\b` rather than a leading `.`, so a destructured `issues.create(` counts.
  return [...text.matchAll(/\bissues\.create\s*\(/g)].flatMap((m) => {
    const lineStart = text.lastIndexOf("\n", m.index) + 1;
    if (/^\s*(?:#|\/\/)/.test(text.slice(lineStart, m.index))) return [];
    const args = callArguments(text, m.index + m[0].length - 1);
    const arrays = [...args.matchAll(/labels:\s*\[([^\]]*)\]/g)];
    const labels =
      arrays.length === 1
        ? [...arrays[0][1].matchAll(/"([^"]*)"|'([^']*)'/g)].map((l) => l[1] ?? l[2])
        : [];
    const line = text.slice(0, m.index).split("\n").length;
    return [{ where: `${file}:${line}`, labels }];
  });
}

const sites = readdirSync(WORKFLOW_DIR)
  .filter((file) => /\.ya?ml$/.test(file))
  .flatMap((file) => {
    const text = readFileSync(join(WORKFLOW_DIR, file), "utf8");
    return [...ghIssueCreateSites(file, text.split("\n")), ...issuesCreateSites(file, text)];
  });

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
