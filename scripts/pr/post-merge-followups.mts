/* eslint-disable no-console -- CLI entry point; it reports what it checked and wrote */
/**
 * Carries a PR's `## Post-merge follow-ups` onto the Issue it came from (#2957).
 *
 *   node scripts/pr/post-merge-followups.mts check  (--event <path> | --body-file <path>) [--repo <owner/name>]
 *   node scripts/pr/post-merge-followups.mts append --event <path> [--dry-run]
 *
 * Some things a PR changes can only be observed after it merges: the next
 * release, the next CodeRabbit round, a backfill run once the code is on
 * `main`. Left in the review checklist they are still unchecked at merge time
 * and then sit in the body of a merged PR nobody reads. Instead they go under
 * `## Post-merge follow-ups`, the PR links its Issue with `Refs #N` so the Issue
 * stays open, and on merge this script appends the items to that Issue's body.
 * The maintainer checks them off there and closes the Issue when they are done.
 *
 * - `check` fails when the section has items but the PR has nowhere to put
 *   them: no `Refs #N` in `## Purpose`, a `Refs #N` that is not an open Issue
 *   (looked up through the API), or a closing keyword that would close the
 *   Issue on merge.
 * - `append` writes the items into each Issue named by `Refs #N` in
 *   `## Purpose`. A marker comment per PR makes a re-run a no-op.
 *
 * Runs on Node's type stripping (no install needed in the workflow), so it uses
 * erasable TypeScript only and imports nothing but node builtins.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const FOLLOWUPS_HEADING = "Post-merge follow-ups";
const PURPOSE_HEADING = "Purpose";

export type FollowupItem = { checked: boolean; text: string };

/**
 * GitHub's closing keywords, followed by any of the three reference forms it
 * honours: `#12`, `owner/repo#12` and the Issue URL.
 * https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue
 */
const CLOSING_KEYWORD =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+(#\d+|[\w.-]+\/[\w.-]+#\d+|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+)\b/gi;
const REFS_KEYWORD = /\brefs?\b:?\s+#(\d+)\b/gi;

/**
 * Drops what GitHub does not read as prose: HTML comments (the template's
 * guidance, which quotes `Closes #12`), fenced code and inline code.
 */
export function stripNonProse(markdown: string): string {
  return stripComments(markdown)
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "")
    .replace(/`[^`\n]*`/g, "");
}

/** Drops HTML comments only, so an item keeps its inline code. */
function stripComments(markdown: string): string {
  return markdown.replace(/<!--[\s\S]*?-->/g, "");
}

/** The text under `## <heading>` up to the next `## ` heading, or null. */
export function extractSection(body: string, heading: string): string | null {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase(),
  );
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/**
 * The checklist items under `## Post-merge follow-ups`. An empty box (the
 * template placeholder) is not an item, and neither is a plain line such as
 * `N/A`.
 */
export function parseFollowups(body: string): FollowupItem[] {
  const section = extractSection(body, FOLLOWUPS_HEADING);
  if (section === null) return [];
  const items: FollowupItem[] = [];
  for (const line of stripComments(section).split("\n")) {
    const match = /^\s*[-*]\s+\[([ xX])\]\s+(\S.*)$/.exec(line);
    if (!match) continue;
    items.push({ checked: match[1] !== " ", text: match[2].trim() });
  }
  return items;
}

function issueNumbers(text: string, pattern: RegExp): number[] {
  const found = new Set<number>();
  for (const match of stripNonProse(text).matchAll(pattern)) found.add(Number(match[1]));
  return [...found];
}

/** References the whole body would close on merge, as GitHub reads it. */
export function closingReferences(body: string): string[] {
  const found = new Set<string>();
  for (const match of stripNonProse(body).matchAll(CLOSING_KEYWORD)) found.add(match[1]);
  return [...found];
}

/** Issues `## Purpose` links with `Refs #N`: where the follow-ups go. */
export function referencedIssues(body: string): number[] {
  const purpose = extractSection(body, PURPOSE_HEADING);
  return issueNumbers(purpose ?? "", REFS_KEYWORD);
}

/** Why the body cannot carry its follow-ups; empty when it can. */
export function checkBody(body: string): string[] {
  const items = parseFollowups(body);
  if (items.length === 0) return [];
  const errors: string[] = [];
  if (referencedIssues(body).length === 0) {
    errors.push(
      `"## ${FOLLOWUPS_HEADING}" has ${items.length} item(s) but "## ${PURPOSE_HEADING}" links no Issue with "Refs #N". ` +
        "The items are appended to that Issue on merge; open one if the change has none.",
    );
  }
  const closing = closingReferences(body);
  if (closing.length > 0) {
    errors.push(
      `"## ${FOLLOWUPS_HEADING}" has items, but the body closes ${closing.join(", ")} on merge. ` +
        'Use "Refs #N" instead so the Issue stays open until the follow-ups are done.',
    );
  }
  return errors;
}

/** What the API says about a `Refs #N`: null when the number does not exist. */
export type IssueState = { state: string; isPullRequest: boolean } | null;

/** Why the referenced Issues cannot take the follow-ups; empty when they can. */
export function checkIssueStates(states: ReadonlyMap<number, IssueState>): string[] {
  const errors: string[] = [];
  for (const [issue, state] of states) {
    if (state === null) errors.push(`"Refs #${issue}" names no Issue in this repository.`);
    else if (state.isPullRequest)
      errors.push(`"Refs #${issue}" is a pull request; the follow-ups need an Issue.`);
    else if (state.state !== "open")
      errors.push(`"Refs #${issue}" is ${state.state}; reopen it or link an open Issue.`);
  }
  return errors;
}

const marker = (pr: number): string => `<!-- post-merge-followups #${pr} -->`;

/**
 * The Issue body with the PR's follow-ups appended, or null when this PR's
 * block is already there (a re-run) or there is nothing to append.
 */
export function appendFollowups(
  issueBody: string,
  pr: number,
  items: FollowupItem[],
): string | null {
  if (items.length === 0 || issueBody.includes(marker(pr))) return null;
  const block = [
    `## ${FOLLOWUPS_HEADING} from #${pr}`,
    "",
    marker(pr),
    ...items.map((item) => `- [${item.checked ? "x" : " "}] ${item.text}`),
  ].join("\n");
  const trimmed = issueBody.replace(/\s+$/, "");
  return trimmed === "" ? `${block}\n` : `${trimmed}\n\n${block}\n`;
}

// ---- CLI -------------------------------------------------------------------

type PullRequestEvent = { pull_request: { number: number; body: string | null } };

function readArgs(argv: string[]): { command: string; flags: Map<string, string | true> } {
  const [command = "", ...rest] = argv;
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) continue;
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(arg.slice(2), next);
      i++;
    } else {
      flags.set(arg.slice(2), true);
    }
  }
  return { command, flags };
}

function readPullRequest(flags: Map<string, string | true>): {
  number: number | null;
  body: string;
} {
  const event = flags.get("event");
  if (typeof event === "string") {
    const payload = JSON.parse(readFileSync(event, "utf8")) as PullRequestEvent;
    return { number: payload.pull_request.number, body: payload.pull_request.body ?? "" };
  }
  const bodyFile = flags.get("body-file");
  if (typeof bodyFile === "string") return { number: null, body: readFileSync(bodyFile, "utf8") };
  throw new Error("Pass --event <path> or --body-file <path>.");
}

function gh(args: string[], input?: string): string {
  return execFileSync("gh", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
}

function lookUpIssue(repo: string, issue: number): IssueState {
  let raw: string;
  try {
    raw = gh(["api", `repos/${repo}/issues/${issue}`]);
  } catch (error) {
    // Only a missing number is an answer; an auth or network failure is not.
    const stderr = String((error as { stderr?: unknown }).stderr ?? "");
    if (stderr.includes("HTTP 404")) return null;
    throw error;
  }
  const data = JSON.parse(raw) as { state: string; pull_request?: unknown };
  return { state: data.state, isPullRequest: data.pull_request !== undefined };
}

function resolveRepo(flags: Map<string, string | true>): string {
  const flag = flags.get("repo");
  if (typeof flag === "string") return flag;
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  return gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).trim();
}

function runCheck(body: string, flags: Map<string, string | true>): number {
  const errors = checkBody(body);
  if (parseFollowups(body).length > 0) {
    const repo = resolveRepo(flags);
    const states = new Map<number, IssueState>();
    for (const issue of referencedIssues(body)) states.set(issue, lookUpIssue(repo, issue));
    errors.push(...checkIssueStates(states));
  }
  for (const error of errors) console.log(`::error::${error}`);
  if (errors.length === 0)
    console.log(`${parseFollowups(body).length} post-merge follow-up(s); nothing to fix.`);
  return errors.length === 0 ? 0 : 1;
}

function runAppend(pr: number, body: string, dryRun: boolean): number {
  const items = parseFollowups(body);
  if (items.length === 0) {
    console.log(`#${pr} has no post-merge follow-ups.`);
    return 0;
  }
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("GITHUB_REPOSITORY is not set.");
  const issues = referencedIssues(body);
  if (issues.length === 0) {
    console.log(
      `::error::#${pr} has post-merge follow-ups but links no Issue with "Refs #N"; nothing was recorded.`,
    );
    return 1;
  }
  for (const issue of issues) {
    const current = JSON.parse(gh(["api", `repos/${repo}/issues/${issue}`])) as {
      body: string | null;
      pull_request?: unknown;
    };
    if (current.pull_request !== undefined) {
      console.log(`::warning::#${issue} is a pull request, not an Issue; skipped.`);
      continue;
    }
    const next = appendFollowups(current.body ?? "", pr, items);
    if (next === null) {
      console.log(`#${issue} already carries the follow-ups from #${pr}.`);
      continue;
    }
    if (dryRun) {
      console.log(`--- #${issue} (dry run) ---\n${next}`);
      continue;
    }
    gh(
      ["api", "-X", "PATCH", `repos/${repo}/issues/${issue}`, "--input", "-"],
      JSON.stringify({ body: next }),
    );
    console.log(`Appended ${items.length} follow-up(s) from #${pr} to #${issue}.`);
  }
  return 0;
}

function main(argv: string[]): number {
  const { command, flags } = readArgs(argv);
  const pr = readPullRequest(flags);
  if (command === "check") return runCheck(pr.body, flags);
  if (command === "append") {
    if (pr.number === null) throw new Error("append needs --event <path>.");
    return runAppend(pr.number, pr.body, flags.get("dry-run") === true);
  }
  throw new Error(`Unknown command "${command}". Use check or append.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
