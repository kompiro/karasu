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
// (its `--label` flags) and an `issues.create({ ... })` call inside
// `actions/github-script` (its `labels:` array).

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOW_DIR = join(REPO_ROOT, ".github/workflows");

const TOPICS: readonly string[] = JSON.parse(
  readFileSync(join(REPO_ROOT, "adr.config.json"), "utf8"),
).topics;

type IssueSite = { readonly where: string; readonly labels: readonly string[] };

/** The `--label` values of each `gh issue create`, following `\` continuations. */
function ghIssueCreateSites(file: string, lines: readonly string[]): IssueSite[] {
  const sites: IssueSite[] = [];
  lines.forEach((line, i) => {
    if (!/\bgh issue create\b/.test(line)) return;
    let command = line;
    for (let j = i; lines[j].trimEnd().endsWith("\\") && j + 1 < lines.length; j++) {
      command += `\n${lines[j + 1]}`;
    }
    const labels = [...command.matchAll(/--label\s+(?:"([^"]*)"|'([^']*)'|(\S+))/g)].map(
      (m) => m[1] ?? m[2] ?? m[3],
    );
    sites.push({ where: `${file}:${i + 1}`, labels });
  });
  return sites;
}

/** The string literals in the `labels:` array of each `issues.create({ ... })`. */
function issuesCreateSites(file: string, lines: readonly string[]): IssueSite[] {
  const sites: IssueSite[] = [];
  lines.forEach((line, i) => {
    if (!/\.issues\.create\(\{/.test(line)) return;
    const end = lines.findIndex((l, j) => j > i && /^\s*\}\);/.test(l));
    const call = lines.slice(i, end === -1 ? undefined : end + 1).join("\n");
    const array = call.match(/labels:\s*\[([^\]]*)\]/)?.[1] ?? "";
    const labels = [...array.matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]);
    sites.push({ where: `${file}:${i + 1}`, labels });
  });
  return sites;
}

const sites = readdirSync(WORKFLOW_DIR)
  .filter((file) => file.endsWith(".yml"))
  .flatMap((file) => {
    const lines = readFileSync(join(WORKFLOW_DIR, file), "utf8").split("\n");
    return [...ghIssueCreateSites(file, lines), ...issuesCreateSites(file, lines)];
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
