import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * An AT record must not name a place that only one session or one PR had.
 *
 * A record is re-read long after the PR that wrote it (TPL-2254). A preview
 * deployment's host dies with the PR, and a worktree path never existed for
 * anyone else. A dev-server command in a record ages too: a dozen records still
 * said `npm run dev` long after the repo moved to pnpm. A manual step says what
 * to open and what to expect; where to run it is the PR's Preview URL or a local
 * checkout. `design-refs.ts` holds the same rule for `docs/design/`.
 *
 * Not read: a machine's absolute path (`/workspaces/...`), and `wrangler pages dev`
 * and a bare `vite preview`, which records discuss as a subject (what the e2e server
 * does not serve) rather than run as a step.
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

/** One flag and, when another word of the command follows, its value. */
const FLAG = String.raw`(?:\s+--?[\w=@/.][\w=@/.-]*(?:\s+(?!(?:run|exec|dev|preview|start|vite)(?![\w-])|-)[@\w./-]+)?)`;
/** A package manager with any flags, then a script that starts a server. */
const SERVER_SCRIPT = new RegExp(
  String.raw`\b(?:pnpm|npm|yarn)${FLAG}*\s+(?:run${FLAG}*\s+)?(?:dev|preview|start)(?![\w-])`,
  "g",
);
/** The tool under those scripts, called directly or through a package manager. */
const SERVER_TOOL = new RegExp(
  String.raw`\b(?:(?:npx|(?:pnpm|npm|yarn)${FLAG}*(?:\s+exec)?)\s+vite(?![\w-])(?!\s+(?:build|optimize)\b)|vite\s+dev\b|astro\s+(?:dev|preview)\b)|\blocalhost:5173\b`,
  "g",
);

const PATTERNS: readonly (readonly [RecordAddressKind, RegExp])[] = [
  // The production host has no subdomain, and a `<branch>` placeholder is fine.
  ["preview-host", /\b[a-z0-9][a-z0-9-]*\.karasu(?:-docs)?\.pages\.dev\b/g],
  // A name after the `/` is what makes it a session's path: `.claude/worktrees/`
  // and `.claude/worktrees/<branch>` only say where worktrees go.
  ["session-path", /(?<![\w-])(?:\.claude\/worktrees|\.worktrees)\/[\w.-][^\s`"')]*/g],
  ["dev-server-command", SERVER_SCRIPT],
  ["dev-server-command", SERVER_TOOL],
];

/** Findings for one record. Exported so the rules can be tested on plain text. */
export function findRecordAddresses(file: string, source: string): RecordAddressFinding[] {
  return source.split("\n").flatMap((text, i) => {
    // A markdown link spells the same address twice: one reference, one finding.
    const seen = new Set<string>();
    return PATTERNS.flatMap(([kind, pattern]) =>
      [...text.matchAll(pattern)].flatMap((match) => {
        if (seen.has(match[0])) return [];
        seen.add(match[0]);
        return [{ file, line: i + 1, kind, text: match[0] }];
      }),
    );
  });
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
