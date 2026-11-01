/* eslint-disable no-console -- CI entry point; the summary is the job */
// The decision of the `Render equivalence` check (Issue #3509, #3505 slice B):
//
// | PR title type | comparison              | check   |
// | ------------- | ----------------------- | ------- |
// | `refactor`    | nothing differs         | success |
// | `refactor`    | something differs       | failure |
// | `refactor`    | could not compare       | failure |
// | anything else | any                     | success |
//
// A PR that is not a refactor may change the rendering; the
// `rendering-change` label (#3510) reads `verdict.json` to tell the
// maintainer. A comparison that did not finish counts as a difference there
// too, so it is never read as "nothing changed".
//
// Runs with plain `node` and imports only node builtins (type-only imports are
// erased), so it decides even when installing either checkout failed.
//
//   node scripts/render-equivalence/verdict.ts --result <result.json> --out <verdict.json>
//     [--summary <file>]     # PR_TITLE in the environment

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import type { ComparisonResult, Difference } from "./compare.ts";

/** How many view keys `verdict.json` and the summary list; the count is always exact. */
export const LISTED = 200;

export interface Verdict {
  version: 1;
  status: "equal" | "different" | "incomparable";
  /** Whether the title declares a refactor, which is what makes a difference fail the check. */
  refactor: boolean;
  /** Differing outputs; 0 when incomparable. */
  differences: number;
  /** The first `LISTED` differing keys. */
  keys: string[];
  conclusion: "success" | "failure";
}

/**
 * The Conventional Commits type of a PR title, lower-cased: `refactor` for
 * `refactor(core)!: ...` and for `Refactor: ...` (nothing lints the case).
 */
export function titleType(title: string): string | null {
  return /^([a-z]+)(\([^)]*\))?!?:/i.exec(title.trim())?.[1].toLowerCase() ?? null;
}

function isDifference(value: unknown): value is Difference {
  if (value === null || typeof value !== "object") return false;
  const { key, reason } = value as Record<string, unknown>;
  return typeof key === "string" && typeof reason === "string";
}

/** The result `run.ts` wrote, or null when it is missing or not of that shape. */
export function readResult(text: string | null): ComparisonResult | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  if (result.version !== 1) return null;
  if (typeof result.compared !== "number" || result.compared <= 0) return null;
  if (!Array.isArray(result.differences) || !result.differences.every(isDifference)) return null;
  return value as ComparisonResult;
}

export function decide(title: string, result: ComparisonResult | null): Verdict {
  const refactor = titleType(title) === "refactor";
  const status =
    result === null ? "incomparable" : result.differences.length > 0 ? "different" : "equal";
  const differences = result?.differences ?? [];
  return {
    version: 1,
    status,
    refactor,
    differences: differences.length,
    keys: differences.slice(0, LISTED).map((d) => d.key),
    conclusion: refactor && status !== "equal" ? "failure" : "success",
  };
}

/** Keeps a key or reason from splitting its table row or opening a code span. */
function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("`", "'");
}

export function summarize(verdict: Verdict, result: ComparisonResult | null): string {
  const lines = ["## Render equivalence", ""];
  const kind = verdict.refactor ? "a `refactor` PR" : "not a `refactor` PR";
  if (verdict.status === "incomparable") {
    lines.push(
      `The comparison did not finish (see the failed step above). This is ${kind}, so the check ` +
        (verdict.refactor ? "fails: equivalence was not shown." : "passes."),
    );
  } else if (verdict.status === "equal" && result !== null) {
    lines.push(
      `No difference in ${result.compared} outputs between the merge base ` +
        `(\`${result.baseSha.slice(0, 7)}\`) and HEAD (\`${result.headSha.slice(0, 7)}\`).`,
    );
  } else if (result !== null) {
    lines.push(
      `${result.differences.length} of ${result.compared} outputs differ between the merge base ` +
        `(\`${result.baseSha.slice(0, 7)}\`) and HEAD (\`${result.headSha.slice(0, 7)}\`). ` +
        `This is ${kind}, so the check ${verdict.refactor ? "fails" : "passes"}.`,
      "",
      "| Output | What differs |",
      "| --- | --- |",
      ...result.differences.slice(0, LISTED).map((d) => `| ${cell(d.key)} | ${cell(d.reason)} |`),
    );
    if (result.differences.length > LISTED) {
      lines.push(
        "",
        `${result.differences.length - LISTED} more are in the artifact's result.json.`,
      );
    }
    lines.push("", "Run `pnpm render:equivalence` locally to reproduce.");
  }
  return `${lines.join("\n")}\n`;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      result: { type: "string" },
      out: { type: "string" },
      summary: { type: "string" },
    },
  });
  if (!values.result || !values.out) {
    throw new Error("verdict: --result and --out are required");
  }
  const result = readResult(existsSync(values.result) ? readFileSync(values.result, "utf8") : null);
  const verdict = decide(process.env.PR_TITLE ?? "", result);
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, `${JSON.stringify(verdict, null, 2)}\n`);
  const summary = summarize(verdict, result);
  if (values.summary) appendFileSync(values.summary, summary);
  console.log(summary);
  if (verdict.conclusion === "failure") process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
