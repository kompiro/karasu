import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the write scope of the agentic workflows (`.github/workflows/*.md`,
// compiled by `gh aw compile` into the sibling `.lock.yml`).
//
// What keeps an agent from merging a dependency PR is not the sentence in its
// prompt telling it not to: it is the set of safe outputs declared in the
// frontmatter, because that is the only thing the compiled workflow can
// actually perform. A prompt is advice; the declaration is the fence. Adding
// `merge-pull-request` or `push-to-pull-request-branch` to a workflow that
// still *says* "you do not change the repository" would read as safe in review
// and be anything but (TPL-2658).
//
// The second half is drift. The prompt body is pulled from the Markdown at
// runtime (`{{#runtime-import}}`), so body edits need no recompile, but the
// frontmatter is baked into the lock file: a frontmatter edit that was never
// compiled leaves the repository describing one fence and running another.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOW_DIR = join(REPO_ROOT, ".github/workflows");

/**
 * Safe outputs the agentic workflows may declare: they add prose next to the
 * work (a comment, an issue) and report what the agent could not do. Everything
 * else in gh-aw's catalogue moves the repository or the review state on its own
 * (merging, pushing, closing, dispatching), and this repository keeps those with
 * the maintainer: ADR-903 for why the runs stay out of bot context, and
 * `.claude/rules/dependabot.md` for the verdict vocabulary being a human's.
 */
const ALLOWED_SAFE_OUTPUTS = [
  "add-comment",
  "create-issue",
  "missing-tool",
  "missing-data",
  "noop",
];

/**
 * The one permission allowed to be `write`. It authorizes inference requests
 * against the account's Copilot subscription through `GITHUB_TOKEN` and grants
 * nothing over the repository; without it the copilot engine cannot run at all,
 * and the alternative is carrying a personal access token in a secret. Every
 * other permission has to be `read`.
 */
const INFERENCE_PERMISSION = "copilot-requests";

type Entry = { readonly key: string; readonly value: string };

type Workflow = {
  readonly name: string;
  readonly safeOutputs: readonly string[];
  readonly permissions: readonly Entry[];
  readonly compiledTools: readonly string[];
};

/** The text between the opening and closing `---` of the Markdown frontmatter. */
function frontmatter(text: string): string {
  const lines = text.split("\n");
  if (lines[0] !== "---") return "";
  const end = lines.indexOf("---", 1);
  return end === -1 ? "" : lines.slice(1, end).join("\n");
}

/**
 * Entries nested one level under `section:` in the frontmatter. A line scan is
 * enough and keeps this guard dependency-free, matching its siblings
 * (`workflow-runner-policy.test.ts`). Commented-out keys do not count: gh-aw's
 * own template ships the whole safe-output catalogue commented out.
 */
function nestedEntries(front: string, section: string): Entry[] {
  const entries: Entry[] = [];
  let inSection = false;
  for (const line of front.split("\n")) {
    if (line === `${section}:`) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (/^\S/.test(line)) break;
    const match = /^ {2}([a-z][a-z0-9-]*):(.*)$/.exec(line);
    if (match) entries.push({ key: match[1], value: match[2].trim() });
  }
  return entries;
}

/**
 * The safe-output tools gh-aw baked into the lock file, taken from the line it
 * writes into the agent prompt: `Tools: add_comment(max:10), create_issue, ...`.
 */
function compiledTools(lock: string): string[] {
  const match = /Tools: ([^\\"]+)/.exec(lock);
  if (match === null) return [];
  return match[1].split(",").map((tool) => tool.trim().replace(/\(.*\)$/, ""));
}

const agenticSources = readdirSync(WORKFLOW_DIR)
  .filter((name) => name.endsWith(".md"))
  .sort();

const workflows: Workflow[] = agenticSources.map((name) => {
  const front = frontmatter(readFileSync(join(WORKFLOW_DIR, name), "utf8"));
  const lockPath = join(WORKFLOW_DIR, name.replace(/\.md$/, ".lock.yml"));
  return {
    name,
    safeOutputs: nestedEntries(front, "safe-outputs").map((entry) => entry.key),
    permissions: nestedEntries(front, "permissions"),
    compiledTools: existsSync(lockPath) ? compiledTools(readFileSync(lockPath, "utf8")) : [],
  };
});

describe("agentic workflow write scope", () => {
  it("finds the workflows it is meant to guard", () => {
    // Parser sanity: a reformat, or a rename of the frontmatter keys, would
    // otherwise make every assertion below pass over an empty set.
    expect(agenticSources.length).toBeGreaterThan(0);
    for (const workflow of workflows) {
      expect(workflow.safeOutputs.length, `${workflow.name} declares safe outputs`).toBeGreaterThan(
        0,
      );
      expect(workflow.permissions.length, `${workflow.name} declares permissions`).toBeGreaterThan(
        0,
      );
    }
  });

  it("declares only safe outputs that leave the decision with a human", () => {
    const unexpected = workflows.flatMap((workflow) =>
      workflow.safeOutputs
        .filter((output) => !ALLOWED_SAFE_OUTPUTS.includes(output))
        .map((output) => `${workflow.name} → ${output}`),
    );
    // Widening this list is a policy change, not a config tweak: say in the PR
    // which human decision the agent is taking over, and why that is right.
    expect(unexpected).toEqual([]);
  });

  it("asks for read permissions only, apart from paying for its own inference", () => {
    const writable = workflows.flatMap((workflow) =>
      workflow.permissions
        .filter(
          (permission) => permission.value !== "read" && permission.key !== INFERENCE_PERMISSION,
        )
        .map((permission) => `${workflow.name} → ${permission.key}: ${permission.value}`),
    );
    expect(writable).toEqual([]);
  });

  it("compiles every declared safe output into its lock file", () => {
    // The prompt body is imported at runtime, but the frontmatter is baked in.
    // A frontmatter edit that skipped `gh aw compile` shows up here.
    const missing = workflows.flatMap((workflow) =>
      workflow.safeOutputs
        .map((output) => output.replaceAll("-", "_"))
        .filter((tool) => !workflow.compiledTools.includes(tool))
        .map((tool) => `${workflow.name} → ${tool}`),
    );
    expect(missing).toEqual([]);
  });
});
