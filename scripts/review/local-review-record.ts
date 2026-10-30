/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
// The local review record in a PR body (Issue #3286, docs/process/review.md "ローカルレビューの記録").
//
// Below High, a PR gets no CodeRabbit rounds, so what the local reviews found and
// what was done about each finding is written into the PR body, and the
// `Review tier` check verifies it. The check verifies form and freshness only:
// that the record covers the PR's current change, that every finding has a
// disposition, and that every "fixed" commit is part of what gets merged. It
// cannot tell whether a review really ran; the record is self-reported.
//
// The body, not a comment, holds the record: on a public repository anyone can
// comment, while only the author and maintainers can edit the body, and editing
// it re-runs the check on the head commit (`pull_request` `edited`).
//
// Writing and reading live in this one file so the format exists once.
//
// Dependency-free, like tier.ts: the workflow runs it with plain `node`.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

export type Severity = "critical" | "major" | "minor" | "trivial";

export interface Finding {
  reviewer: string;
  /** As the reviewer gave it; {@link severityOf} reads it. */
  sev: string;
  where: string;
  finding: string;
  disposition: string;
}

export interface LocalReviewRecord {
  base: string;
  head: string;
  /** The `Reviewers:` line. */
  reviewers: string;
  /** Reason from `Waived: <reason>`; the record then needs no reviews. */
  waived?: string;
  findings: Finding[];
  /** The `Verification:` line, if any. */
  verification?: string;
}

/** Why a body holds no usable record. */
export type ParseResult = { record: LocalReviewRecord } | { error: string };

const OPEN = /<!--\s*local-review:v1\s+base=([0-9a-f]{40})\s+head=([0-9a-f]{40})\s*-->/g;
const CLOSE = "<!-- /local-review -->";

/**
 * The reviewer's severity, normalized. Anything outside the four names counts as
 * Major (TPL-3286: an input no rule names falls to the stricter side), so a
 * missing or misspelled severity cannot make a finding look declinable on Low.
 */
export function severityOf(sev: string): Severity {
  const s = sev.trim().toLowerCase();
  return s === "critical" || s === "major" || s === "minor" || s === "trivial" ? s : "major";
}

const isHeavy = (sev: string): boolean => {
  const s = severityOf(sev);
  return s === "critical" || s === "major";
};

/**
 * CodeRabbit's own rows. On Design they record its one advisory review, which may
 * arrive after the check ran, so the check leaves them out there; on Low and
 * Medium no PR review runs, so such a row is checked like any other.
 */
const isCodeRabbitRow = (f: Finding): boolean => /^coderabbit$/i.test(f.reviewer.trim());

/** Splits a markdown table row on pipes that are not escaped. */
function cells(row: string): string[] {
  const inner = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

export function parseRecord(body: string): ParseResult {
  const opens = [...body.matchAll(OPEN)];
  if (opens.length === 0) {
    return { error: "the PR body has no local review record (<!-- local-review:v1 ... -->)" };
  }
  if (opens.length > 1) return { error: "the PR body has more than one local review record" };
  const open = opens[0];
  const start = (open.index ?? 0) + open[0].length;
  const end = body.indexOf(CLOSE, start);
  if (end < 0) return { error: `the local review record is not closed with ${CLOSE}` };
  const block = body.slice(start, end);

  const reviewers = /^Reviewers:[ \t]*(.*)$/m.exec(block)?.[1].trim() ?? "";
  const waived = /^Waived:[ \t]*(.*)$/m.exec(block)?.[1].trim();
  const verification = /^Verification:[ \t]*(.*)$/m.exec(block)?.[1].trim();

  const findings: Finding[] = [];
  const rows = block.split("\n").filter((l) => l.trim().startsWith("|"));
  for (const [i, row] of rows.entries()) {
    const c = cells(row);
    // The header row and the separator row.
    if (i === 0 && /^#$/.test(c[0] ?? "")) continue;
    if (c.every((x) => /^:?-+:?$/.test(x))) continue;
    if (c.length !== 6) {
      return { error: `a local review record row does not have 6 columns: ${row.trim()}` };
    }
    findings.push({
      reviewer: c[1],
      sev: c[2],
      where: c[3],
      finding: c[4],
      disposition: c[5],
    });
  }

  return {
    record: {
      base: open[1],
      head: open[2],
      reviewers,
      waived,
      findings,
      verification,
    },
  };
}

/** The git questions the check asks, answered from the checkout it runs in. */
export interface GitFacts {
  /** The PR's head commit. */
  headSha: string;
  /** Where `rev` left the PR's base branch. */
  mergeBase(rev: string): string;
  /** A full sha for `rev`, or null when it does not name a commit here. */
  resolve(rev: string): string | null;
  isAncestor(a: string, b: string): boolean;
  /** Every first-parent commit in `from..to` is a merge of the base branch. */
  onlyBaseMerges(from: string, to: string): boolean;
  /** `a` and `b` change the same thing against the base (`tier.ts` `diffFingerprint`). */
  sameChange(a: string, b: string): boolean;
}

const FIXED = /^fixed in ([0-9a-f]{7,40})$/;
const DECLINED = /^declined:\s*\S/;
const ISSUE = /^(?:→|->)\s*#\d+$/;
const CLI_RAN = /coderabbit CLI(?! skipped)/i;
const CLI_SKIPPED = /coderabbit CLI skipped:\s*(\S.*)?$/i;

/**
 * The errors that fail the check for a record on a PR of `tier` (Low, Design or
 * Medium; High does not read records). Empty when the record passes.
 */
export function verifyRecord(
  parsed: ParseResult,
  tier: "low" | "design" | "medium",
  git: GitFacts,
): string[] {
  if ("error" in parsed) {
    return [
      `${parsed.error}. A ${tier} PR needs one (docs/process/review.md "ローカルレビューの記録"; ` +
        `write it with node scripts/review/local-review-record.ts render).`,
    ];
  }
  const r = parsed.record;
  const errors: string[] = [];

  // Freshness: the record must describe the change that gets merged.
  const head = git.resolve(r.head);
  if (head === null) {
    errors.push(`the record's head ${r.head.slice(0, 7)} is not a commit of this PR`);
  } else if (head === git.headSha) {
    if (r.base !== git.mergeBase(git.headSha)) {
      errors.push(
        `the record's base ${r.base.slice(0, 7)} is not where the PR leaves its base branch ` +
          `(${git.mergeBase(git.headSha).slice(0, 7)}): the record reviewed a different diff`,
      );
    }
  } else if (
    !git.isAncestor(head, git.headSha) ||
    !git.onlyBaseMerges(head, git.headSha) ||
    !git.sameChange(head, git.headSha) ||
    r.base !== git.mergeBase(head)
  ) {
    errors.push(
      `the record's head ${r.head.slice(0, 7)} is not the PR head ${git.headSha.slice(0, 7)}, ` +
        `and what came after it is not only a merge of the base branch that left the change as it ` +
        `was. Review the new commits and update the record.`,
    );
  }

  if (r.waived !== undefined) {
    if (r.waived === "") errors.push("`Waived:` needs a reason");
    if (tier === "low") {
      errors.push(`a waived record does not pass on Low; raise the label to "risk: medium"`);
    }
    return errors;
  }

  const skipped = CLI_SKIPPED.exec(r.reviewers);
  if (skipped) {
    if (skipped[1] === undefined) errors.push("`coderabbit CLI skipped:` needs a reason");
    if (tier === "low") {
      errors.push(
        `a skipped CodeRabbit CLI run does not pass on Low; raise the label to "risk: medium"`,
      );
    }
  } else if (!CLI_RAN.test(r.reviewers)) {
    errors.push(
      "the `Reviewers:` line names no CodeRabbit CLI run (write `coderabbit CLI skipped: <reason>` if it could not run)",
    );
  }

  for (const [i, f] of r.findings.entries()) {
    if (tier === "design" && isCodeRabbitRow(f)) continue;
    const n = i + 1;
    const d = f.disposition.trim();
    const fixed = FIXED.exec(d);
    if (fixed) {
      const sha = git.resolve(fixed[1]);
      if (sha === null || head === null || !git.isAncestor(sha, head)) {
        errors.push(`finding ${n}: ${fixed[1]} is not a commit in the record's head`);
      } else if (git.isAncestor(sha, r.base)) {
        errors.push(
          `finding ${n}: ${fixed[1]} is already on the base branch, not a fix in this PR`,
        );
      }
    } else if (DECLINED.test(d)) {
      if (tier === "low" && isHeavy(f.sev)) {
        errors.push(
          `finding ${n}: a ${severityOf(f.sev)} finding is declined, which Low does not pass; ` +
            `raise the label to "risk: medium" so a human reads it`,
        );
      }
    } else if (!ISSUE.test(d)) {
      errors.push(
        `finding ${n} has no disposition (fixed in <sha> / declined: <reason> / → #<issue>): ${d || "(empty)"}`,
      );
    }
  }
  return errors;
}

const escapeCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** The record block, ready to put in a PR body. */
export function renderRecord(r: LocalReviewRecord): string {
  const lines = [
    `<!-- local-review:v1 base=${r.base} head=${r.head} -->`,
    "",
    "## Local review",
    "",
    `Reviewers: ${r.reviewers}`,
  ];
  if (r.waived !== undefined) lines.push(`Waived: ${r.waived}`);
  lines.push("");
  if (r.findings.length === 0) {
    lines.push("No findings.");
  } else {
    lines.push("| # | Reviewer | Sev | Where | Finding | Disposition |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const [i, f] of r.findings.entries()) {
      lines.push(
        `| ${i + 1} | ${[f.reviewer, f.sev, f.where, f.finding, f.disposition].map(escapeCell).join(" | ")} |`,
      );
    }
  }
  if (r.verification !== undefined) lines.push("", `Verification: ${r.verification}`);
  lines.push(CLOSE);
  return lines.join("\n");
}

/** `body` with its record replaced by `block`, or `block` appended when it has none. */
export function upsertRecord(body: string, block: string): string {
  const open = new RegExp(OPEN.source).exec(body);
  if (open) {
    const end = body.indexOf(CLOSE, open.index);
    if (end >= 0) return body.slice(0, open.index) + block + body.slice(end + CLOSE.length);
  }
  return `${body.replace(/\s*$/, "")}\n\n${block}\n`;
}

// ---------------------------------------------------------------------------
// CLI

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const git = (...args: string[]): string => execFileSync("git", args, { encoding: "utf-8" }).trim();

const USAGE = `usage:
  local-review-record.ts render --findings <file.json> [--base <ref>] [--head <rev>]
      [--reviewers <text>] [--cli-skipped <reason>] [--waived <reason>]
      [--verification <text>] [--into <pr-body-file>]

<file.json> is an array of {reviewer, sev, where, finding, disposition}.
Without --into the block is printed; with it, the file's record is replaced
(or the block appended) in place, ready for gh pr edit --body-file.`;

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  if (cmd !== "render") {
    console.error(USAGE);
    return 2;
  }
  const findingsFile = flag(rest, "--findings");
  if (findingsFile === undefined) {
    console.error(USAGE);
    return 2;
  }
  const head = git("rev-parse", flag(rest, "--head") ?? "HEAD");
  const base = git("merge-base", flag(rest, "--base") ?? "origin/main", head);
  const cliSkipped = flag(rest, "--cli-skipped");
  const reviewers =
    flag(rest, "--reviewers") ??
    `/engineering:code-review (fresh subagent), ${
      cliSkipped === undefined ? "coderabbit CLI --deep" : `coderabbit CLI skipped: ${cliSkipped}`
    }`;
  const block = renderRecord({
    base,
    head,
    reviewers,
    waived: flag(rest, "--waived"),
    findings: JSON.parse(readFileSync(findingsFile, "utf-8")) as Finding[],
    verification: flag(rest, "--verification"),
  });
  const into = flag(rest, "--into");
  if (into === undefined) console.log(block);
  else writeFileSync(into, upsertRecord(readFileSync(into, "utf-8"), block));
  return 0;
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2));
}
