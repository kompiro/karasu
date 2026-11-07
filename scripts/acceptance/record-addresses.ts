import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: an AT record must not name a place that only one session or one PR had.
 *
 * A record is re-read long after the PR that wrote it (TPL-2254). A preview
 * deployment's host dies with the PR, and a worktree path never existed for
 * anyone else. A dev-server command in a record ages too: a dozen records still
 * said `npm run dev` long after the repo moved to pnpm. A manual step says what
 * to open and what to expect; where to run it is the PR's Preview URL or a local
 * checkout. `design-refs.ts` holds the same rule for `docs/design/`.
 */

export type RecordAddressKind = "preview-host" | "session-path" | "dev-server-command";

export interface RecordAddressFinding {
  file: string;
  /** 1-based line of the reference. */
  line: number;
  kind: RecordAddressKind;
  /** The text as written. */
  text: string;
}

const PATTERNS: readonly (readonly [RecordAddressKind, RegExp])[] = [
  // The production host has no subdomain, and a `<branch>` placeholder is fine.
  ["preview-host", /\b[a-z0-9][a-z0-9-]*\.karasu(?:-docs)?\.pages\.dev\b/g],
  // The trailing `/` lets a sentence or a test name mention the directory itself.
  ["session-path", /(?:^|[\s`"'(])(?:\.claude\/worktrees|\.worktrees)\/[^\s`"')]*/g],
  ["dev-server-command", /\bnpm run dev\b|\bpnpm(?: --filter \S+)?(?: run)? dev\b/g],
];

/** Findings for one record. Exported so the rules can be tested on plain text. */
export function findRecordAddresses(file: string, source: string): RecordAddressFinding[] {
  return source.split("\n").flatMap((text, i) =>
    PATTERNS.flatMap(([kind, pattern]) =>
      [...text.matchAll(pattern)].map((match) => ({
        file,
        line: i + 1,
        kind,
        text: match[0].trim().replace(/^[`"'(]/, ""),
      })),
    ),
  );
}

export function analyzeRecordAddresses(repoRoot: string): RecordAddressFinding[] {
  const atDir = join(repoRoot, "docs/acceptance");
  if (!existsSync(atDir)) return [];
  return readdirSync(atDir)
    .sort()
    .filter((entry) => entry.endsWith(".md") && entry !== "TEMPLATE.md")
    .flatMap((entry) =>
      findRecordAddresses(`docs/acceptance/${entry}`, readFileSync(join(atDir, entry), "utf8")),
    );
}

const ADVICE: Record<RecordAddressKind, string> = {
  "preview-host": "put the preview URL in the PR body, not in the record",
  "session-path": "this path existed in one session; say what to open instead",
  "dev-server-command": "write what to open and what to expect, not how to start the server",
};

export function describeRecordAddressFinding(f: RecordAddressFinding): string {
  return `${f.file}:${f.line} → ${f.text} (${ADVICE[f.kind]})`;
}
