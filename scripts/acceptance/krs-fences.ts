import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Parser } from "../../packages/core/src/parser/parser.ts";

/**
 * Parse guard for the `.krs` snippets embedded in `docs/acceptance/*.md`.
 *
 * An AT step is prose: it can drift out of the grammar and stay green forever,
 * because nothing executes it. AT-0006 AC-1.2 asked the reader to type
 * `resource DB "DB" [table]` — a form the parser has never accepted — and the
 * checklist item sat there un-runnable until Issue #2047 tried to automate it.
 * `docs/spec/syntax.md` already has this guard (`packages/core/src/spec-syntax.test.ts`);
 * this is the same idea for the AT corpus, run inside `at:check-coverage`.
 *
 * ## Fence convention
 *
 * Only fences whose info string *starts* with `krs` are considered (so
 * ```krs.style / ```bash / bare ``` blocks are ignored). The token after it
 * declares what the snippet claims to be:
 *
 * | Fence            | Claim                                    | Guard              |
 * |------------------|------------------------------------------|--------------------|
 * | ```krs           | a complete, currently-valid model        | must parse clean   |
 * | ```krs fragment  | an excerpt — not a whole file            | not parsed         |
 * | ```krs invalid   | deliberately bad input (demos a diagnostic) | must still error |
 *
 * `invalid` is checked from the other side on purpose: a snippet that
 * illustrates `top-level-declaration` stops being an illustration the day the
 * grammar starts accepting it, and that silent flip is worth catching too.
 *
 * `fragment` is the escape hatch, and it is deliberately a *marker* rather
 * than a default: skipping is fine, skipping invisibly is what got us here.
 */

export type KrsFenceFindingKind =
  /** ```krs that no longer parses — the drift this guard exists for. */
  | "krs-fence-parse-error"
  /** ```krs invalid that now parses clean — the example stopped illustrating. */
  | "krs-fence-unexpectedly-valid"
  /** ```krs <something-else> — unknown marker, so the claim is unreadable. */
  | "krs-fence-unknown-marker";

export interface KrsFenceFinding {
  kind: KrsFenceFindingKind;
  file: string;
  /** 1-based line of the opening fence. */
  line: number;
  detail: string;
}

interface Fence {
  /** Info string after the opening backticks, e.g. `krs`, `krs fragment`. */
  info: string;
  /** 1-based line of the opening fence. */
  line: number;
  body: string;
}

const KNOWN_MARKERS = new Set(["fragment", "invalid"]);

/** Every fenced block in the markdown, with its info string and 1-based open line. */
function extractFences(markdown: string): Fence[] {
  const lines = markdown.split("\n");
  const fences: Fence[] = [];
  let open: { info: string; line: number; body: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (open) {
      if (/^```\s*$/.test(line)) {
        fences.push({ info: open.info, line: open.line, body: open.body.join("\n") });
        open = null;
      } else {
        open.body.push(line);
      }
      continue;
    }
    const opening = /^```(\S.*)$/.exec(line);
    if (opening) open = { info: opening[1].trim(), line: i + 1, body: [] };
  }
  return fences;
}

/** Error-severity diagnostic codes, deduplicated in first-seen order. */
function parseErrorCodes(krs: string): string[] {
  const result = Parser.parse(krs);
  const codes = result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  return [...new Set(codes)];
}

/** Check one AT document. Exported for the unit tests. */
export function analyzeKrsFencesIn(file: string, content: string): KrsFenceFinding[] {
  const findings: KrsFenceFinding[] = [];

  for (const fence of extractFences(content)) {
    const [lang, ...rest] = fence.info.split(/\s+/);
    if (lang !== "krs") continue; // ```krs.style, ```bash, ```json, …
    const marker = rest.join(" ");

    if (marker !== "" && !KNOWN_MARKERS.has(marker)) {
      findings.push({
        kind: "krs-fence-unknown-marker",
        file,
        line: fence.line,
        detail: `\`\`\`krs ${marker} — expected one of: ${[...KNOWN_MARKERS].join(", ")}`,
      });
      continue;
    }
    if (marker === "fragment") continue;

    const codes = parseErrorCodes(fence.body);
    if (marker === "invalid") {
      if (codes.length === 0) {
        findings.push({
          kind: "krs-fence-unexpectedly-valid",
          file,
          line: fence.line,
          detail: "marked `invalid` but the parser accepts it — drop the marker or fix the example",
        });
      }
      continue;
    }
    if (codes.length > 0) {
      findings.push({
        kind: "krs-fence-parse-error",
        file,
        line: fence.line,
        detail: codes.join(", "),
      });
    }
  }

  return findings;
}

/** Check every `docs/acceptance/*.md` under `repoRoot`. */
export function analyzeKrsFences(repoRoot: string, atDir = "docs/acceptance"): KrsFenceFinding[] {
  const dir = join(repoRoot, atDir);
  if (!existsSync(dir)) return [];

  const findings: KrsFenceFinding[] = [];
  for (const filename of readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()) {
    const rel = `${atDir}/${filename}`;
    findings.push(...analyzeKrsFencesIn(rel, readFileSync(join(dir, filename), "utf8")));
  }
  return findings;
}

export function describeKrsFenceFinding(f: KrsFenceFinding): string {
  switch (f.kind) {
    case "krs-fence-parse-error":
      return `${f.file}:${f.line} — \`\`\`krs block does not parse: ${f.detail}`;
    case "krs-fence-unexpectedly-valid":
      return `${f.file}:${f.line} — ${f.detail}`;
    case "krs-fence-unknown-marker":
      return `${f.file}:${f.line} — ${f.detail}`;
  }
}
