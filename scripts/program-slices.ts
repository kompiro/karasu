/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { execFileSync } from "node:child_process";

// Reports how far each multi-slice program has actually got, and checks that the
// parent Issue explains what each slice delivers (Issue #2237).
//
// The two questions a reader has are deliberately answered by different layers:
//   - "which slices have landed"  -> GitHub sub-issue state. Never hand-written.
//   - "what can I do now / what is still missing" -> a `## Slice status` table in
//     the parent Issue body, one row per sub-issue.
//
// This script joins them: it prints the progress from sub-issue state, and fails
// when a parent has sub-issues but its body does not account for all of them.
//
//   pnpm program:slices          # every open parent that has sub-issues
//   pnpm program:slices 2161     # one parent
//
// Requires an authenticated `gh` (the script shells out; no new dependency).

const REPO = "kompiro/karasu";
const SLICE_HEADING = "## Slice status";

interface SubIssue {
  number: number;
  state: "open" | "closed";
  title: string;
}

interface Parent {
  number: number;
  title: string;
  body: string;
  subs: SubIssue[];
}

export interface Problem {
  parent: number;
  message: string;
}

function gh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 });
}

/**
 * Issue numbers referenced by the `## Slice status` section, in order. Returns
 * null when the section is absent entirely (a different problem from an
 * incomplete one, so the caller can word it differently).
 */
export function sliceTableRefs(body: string): number[] | null {
  const start = body.indexOf(SLICE_HEADING);
  if (start === -1) return null;
  const rest = body.slice(start + SLICE_HEADING.length);
  // The section runs until the next same-or-higher-level heading.
  const end = rest.search(/^##?\s+\S/m);
  const section = end === -1 ? rest : rest.slice(0, end);
  return [...section.matchAll(/#(\d+)\b/g)].map((m) => Number(m[1]));
}

export function checkParent(parent: Parent): Problem[] {
  const problems: Problem[] = [];
  const refs = sliceTableRefs(parent.body);
  if (refs === null) {
    problems.push({
      parent: parent.number,
      message: `body has no "${SLICE_HEADING}" section — readers cannot tell what each slice delivers`,
    });
    return problems;
  }
  const listed = new Set(refs);
  for (const sub of parent.subs) {
    if (!listed.has(sub.number)) {
      problems.push({
        parent: parent.number,
        message: `sub-issue #${sub.number} is missing from the ${SLICE_HEADING} table`,
      });
    }
  }
  return problems;
}

function subIssuesOf(issue: number): SubIssue[] {
  try {
    const raw = gh(["api", `repos/${REPO}/issues/${issue}/sub_issues`, "--paginate"]);
    return (JSON.parse(raw) as SubIssue[]).map((s) => ({
      number: s.number,
      state: s.state,
      title: s.title,
    }));
  } catch {
    return []; // no sub-issues, or the endpoint is unavailable for this issue
  }
}

function openIssueNumbers(): number[] {
  const raw = gh([
    "issue",
    "list",
    "--repo",
    REPO,
    "--state",
    "open",
    "--limit",
    "200",
    "--json",
    "number",
  ]);
  return (JSON.parse(raw) as { number: number }[]).map((i) => i.number);
}

function loadParent(issue: number): Parent | null {
  const subs = subIssuesOf(issue);
  if (subs.length === 0) return null;
  const raw = gh(["issue", "view", String(issue), "--repo", REPO, "--json", "number,title,body"]);
  const meta = JSON.parse(raw) as { number: number; title: string; body: string };
  return { number: meta.number, title: meta.title, body: meta.body ?? "", subs };
}

function main(): void {
  const argv = process.argv.slice(2);
  const targets = argv.length > 0 ? argv.map(Number) : openIssueNumbers();
  if (targets.some(Number.isNaN)) {
    console.error("Usage: pnpm program:slices [<issue-number> ...]");
    process.exit(2);
  }

  const parents = targets.map(loadParent).filter((p): p is Parent => p !== null);
  if (parents.length === 0) {
    console.log("No parent issues with sub-issues found.");
    return;
  }

  const problems: Problem[] = [];
  for (const parent of parents.sort((a, b) => a.number - b.number)) {
    const done = parent.subs.filter((s) => s.state === "closed").length;
    console.log(`\n#${parent.number} ${parent.title}`);
    console.log(`  ${done}/${parent.subs.length} slices`);
    for (const sub of parent.subs) {
      console.log(`  ${sub.state === "closed" ? "✅" : "⬜"} #${sub.number} ${sub.title}`);
    }
    const found = checkParent(parent);
    for (const p of found) console.log(`  ⚠ ${p.message}`);
    problems.push(...found);
  }

  if (problems.length > 0) {
    console.error(
      `\n${problems.length} problem(s): a parent with sub-issues must carry a "${SLICE_HEADING}" table covering every slice.`,
    );
    process.exit(1);
  }
  console.log("\nAll parents account for every slice.");
}

if (process.argv[1]?.endsWith("program-slices.ts")) main();
