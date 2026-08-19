/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Guards docs/roadmap.md against the drift its own watch-ledger convention
// invites (Issue #2245).
//
// The roadmap tracks not-yet-issued work in ledger tables — "子 Issue は
// 起こさず本表で追跡し、promotion trigger を満たしたらその時点で Issue を
// 起こして着手する". Nothing re-reads a row once its trigger has fired, so a
// row keeps describing a state the tracker has already left behind. Two rows
// were stale when this guard was written: `database [cache]` (trigger fired,
// #2172 raised, ledger untouched) and interop (described as an untouched
// strategic theme while #1832 had been closed not_planned).
//
// Three high-precision rules. The first two are about a *self-contradiction
// inside one cell* rather than about roadmap content in general — this check
// has no opinion on what the roadmap should say, only on statements its own
// links refute:
//
//   1. a cell that calls work not-yet-started must not link a CLOSED issue
//   2. a cell that calls work not-yet-issued must not link an issue at all
//   3. a row in a table declared open-only must not *name* a CLOSED issue
//
// Granularity is the table cell (or the whole line outside a table), not the
// line, because a roadmap row routinely says "着地済み" about one thing while
// linking an open issue about another — cell scope is what keeps rule 1 from
// firing on those.
//
// Rule 3 is opt-in per table via an explicit `<!-- roadmap-issue-state:
// open-only -->` marker. It catches the drift the ledger convention produces
// at the other end: a tracking table whose preamble promises 「未決の項目のみ」
// keeps a row after that row's issue closes (#2511 survived its own landing
// this way). The marker is what makes this checkable without inferring which
// issue a row is about — the section states the invariant in prose, and the
// marker restates it for the parser. Scope is the **tracker column** (the
// first cell), so a later cell may still cite a closed issue as lineage, in
// keeping with rules 1 and 2. A marker with no table under it is itself an
// error, since a marker that silently stops guarding is worse than none.
//
// Deliberately NOT checked: the inverse ("open issue described as shipped")
// and the [cache] shape of drift (trigger fired, issue raised elsewhere, row
// never updated). Both need to know which issue a row is *about*, which no
// parser can infer; catching them would need a back-ref convention on every
// ledger row, and that machinery costs more than the drift it prevents.

export interface Problem {
  kind: "error" | "warning";
  message: string;
}

export type IssueState = "open" | "closed";

export interface IssueRef {
  number: number;
  /** 1-indexed line in the source file */
  lineNo: number;
  /** the table cell (or full line) the link sits in — the scope rules apply to */
  scope: string;
}

const ROADMAP_PATH = "docs/roadmap.md";
const REPO = "kompiro/karasu";

/** phrases asserting the work has not started — refuted by a closed issue */
const NOT_STARTED = /未着手|評価待ち|評価可能|検討中|これから着手|着手予定|進行中|実行中/;

/** phrases asserting no Issue exists yet — refuted by any issue link */
const NOT_ISSUED = /未起票|未 ?Issue ?化|子 Issue は起こさず/;

const ISSUE_LINK = new RegExp(`github\\.com/${REPO.replace("/", "\\/")}/issues/(\\d+)`, "g");

/** opts the next table into rule 3 — every issue it links must still be open */
const OPEN_ONLY_MARKER = "<!-- roadmap-issue-state: open-only -->";

/**
 * Split a line into the scopes the rules apply to: one per table cell for a
 * table row, otherwise the line itself.
 */
export function scopesOf(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [line];
  return trimmed
    .split("|")
    .slice(1, -1)
    .filter((cell) => cell.trim().length > 0);
}

export function collectIssueRefs(content: string): IssueRef[] {
  const refs: IssueRef[] = [];
  content.split("\n").forEach((line, index) => {
    for (const scope of scopesOf(line)) {
      for (const match of scope.matchAll(ISSUE_LINK)) {
        refs.push({ number: Number(match[1]), lineNo: index + 1, scope: scope.trim() });
      }
    }
  });
  return refs;
}

export interface OpenOnlyTable {
  /** 1-indexed line of the marker comment */
  markerLine: number;
  /** the table's lines (header and separator included), in file order */
  rows: { lineNo: number; line: string }[];
}

/**
 * Locate every table opted into rule 3.
 *
 * The marker applies to the next markdown table — the contiguous run of lines
 * starting with `|`, separated from the marker by blank lines only — so a
 * marker that drifts away from its table matches nothing rather than silently
 * claiming a different one. `check` reports that empty case, because a marker
 * that quietly stops guarding is worse than no marker at all.
 */
export function findOpenOnlyTables(content: string): OpenOnlyTable[] {
  const lines = content.split("\n");
  const tables: OpenOnlyTable[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(OPEN_ONLY_MARKER)) continue;

    let row = i + 1;
    while (row < lines.length && lines[row].trim().length === 0) row++;

    const rows: OpenOnlyTable["rows"] = [];
    for (; row < lines.length && lines[row].trim().startsWith("|"); row++) {
      rows.push({ lineNo: row + 1, line: lines[row] });
    }
    tables.push({ markerLine: i + 1, rows });
  }

  return tables;
}

/**
 * Collect the issue refs a marked table names as its own tracked items.
 *
 * Scope is the **tracker column** (the first cell), not the whole row: a later
 * cell routinely cites a closed issue as lineage — "前段は #2172 で着地" — and
 * that citation is legitimate provenance, the same way rules 1 and 2 leave a
 * closed link alone unless the cell around it claims the work has not started.
 * What the marker asserts is narrower: the item this row *is about* is still
 * undecided.
 */
export function collectOpenOnlyRefs(content: string): IssueRef[] {
  const refs: IssueRef[] = [];

  for (const table of findOpenOnlyTables(content)) {
    for (const { lineNo, line } of table.rows) {
      // Positional, so an empty tracker cell cannot promote the next column
      // into the tracker slot the way scopesOf's emptiness filter would.
      const tracker = line.trim().split("|").slice(1, -1)[0];
      if (tracker === undefined) continue;

      for (const match of tracker.matchAll(ISSUE_LINK)) {
        refs.push({ number: Number(match[1]), lineNo, scope: line.trim() });
      }
    }
  }

  return refs;
}

function excerpt(scope: string): string {
  const flat = scope.replace(/\s+/g, " ").trim();
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
}

export function check(content: string, states: ReadonlyMap<number, IssueState>): Problem[] {
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const flagged = new Set<string>();

  for (const ref of collectIssueRefs(content)) {
    const state = states.get(ref.number);

    if (NOT_ISSUED.test(ref.scope)) {
      const key = `not-issued:${ref.lineNo}:${ref.number}`;
      if (!seen.has(key)) {
        seen.add(key);
        flagged.add(`${ref.lineNo}:${ref.number}`);
        problems.push({
          kind: "error",
          message: `${ROADMAP_PATH}:${ref.lineNo} — claims the work is not issued yet but links #${ref.number}. Drop the claim or drop the link: "${excerpt(ref.scope)}"`,
        });
      }
      continue;
    }

    if (state === "closed" && NOT_STARTED.test(ref.scope)) {
      flagged.add(`${ref.lineNo}:${ref.number}`);
      problems.push({
        kind: "error",
        message: `${ROADMAP_PATH}:${ref.lineNo} — describes #${ref.number} as not started, but it is closed. Record its disposition instead: "${excerpt(ref.scope)}"`,
      });
    }
  }

  for (const table of findOpenOnlyTables(content)) {
    if (table.rows.length > 0) continue;
    problems.push({
      kind: "error",
      message: `${ROADMAP_PATH}:${table.markerLine} — an open-only marker with no table under it guards nothing. Put it directly above its table (blank lines only in between), or drop it.`,
    });
  }

  const reported = new Set<number>();
  for (const ref of collectOpenOnlyRefs(content)) {
    // One message per row: a row already indicted by rule 1 or 2 does not need
    // a second, and a row naming several closed issues does not need several.
    if (flagged.has(`${ref.lineNo}:${ref.number}`) || reported.has(ref.lineNo)) continue;
    if (states.get(ref.number) !== "closed") continue;

    reported.add(ref.lineNo);
    problems.push({
      kind: "error",
      message: `${ROADMAP_PATH}:${ref.lineNo} — the table tracks undecided items only, but it names #${ref.number}, which is closed. Drop the row; its record is the closed issue and the ADR it landed in: "${excerpt(ref.scope)}"`,
    });
  }

  return problems;
}

export function formatProblems(problems: Problem[]): string {
  const errors = problems.filter((p) => p.kind === "error");
  const warnings = problems.filter((p) => p.kind === "warning");
  const lines: string[] = [];
  if (errors.length > 0) {
    lines.push(`roadmap-issue-state: ${errors.length} error(s):`);
    for (const e of errors) lines.push(`  ✗ ${e.message}`);
  }
  if (warnings.length > 0) {
    lines.push(`roadmap-issue-state: ${warnings.length} warning(s):`);
    for (const w of warnings) lines.push(`  ⚠ ${w.message}`);
  }
  return lines.join("\n");
}

async function fetchStates(numbers: number[]): Promise<Map<number, IssueState>> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const [owner, name] = REPO.split("/");
  const aliases = numbers
    .map((n) => `i${n}: issueOrPullRequest(number: ${n}) { ... on Issue { number state } }`)
    .join("\n");
  const query = `{ repository(owner: "${owner}", name: "${name}") { ${aliases} } }`;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} ${response.statusText}`);

  const payload = (await response.json()) as {
    data?: { repository?: Record<string, { number: number; state: string } | null> };
    errors?: { message: string }[];
  };
  if (!payload.data?.repository) {
    throw new Error(payload.errors?.map((e) => e.message).join("; ") ?? "empty GraphQL response");
  }

  const states = new Map<number, IssueState>();
  for (const node of Object.values(payload.data.repository)) {
    if (!node) continue;
    states.set(node.number, node.state === "CLOSED" ? "closed" : "open");
  }
  return states;
}

async function main(): Promise<void> {
  const content = readFileSync(resolve(process.cwd(), ROADMAP_PATH), "utf8");
  // Union of both collectors: they parse independently, so a number only one
  // of them can see would otherwise get an undefined state and pass silently.
  const numbers = [
    ...new Set(
      [...collectIssueRefs(content), ...collectOpenOnlyRefs(content)].map((r) => r.number),
    ),
  ].sort((a, b) => a - b);

  let states: Map<number, IssueState>;
  try {
    states = await fetchStates(numbers);
  } catch (error) {
    // Degrade to a no-op rather than reddening a required check on a network
    // blip: this guard is worth having only if it never cries wolf.
    console.warn(
      `roadmap-issue-state: skipped — could not read issue state (${error instanceof Error ? error.message : String(error)})`,
    );
    return;
  }

  const problems = check(content, states);
  if (problems.length > 0) {
    console.error(formatProblems(problems));
  }
  if (problems.some((p) => p.kind === "error")) {
    process.exit(1);
  }
  console.log(`roadmap-issue-state: ok (${numbers.length} issue link(s) checked)`);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /roadmap-issue-state\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  // Not top-level `await`: tsx transforms this file to CJS, where it is a syntax error.
  main().catch((error: unknown) => {
    console.error(`roadmap-issue-state: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
