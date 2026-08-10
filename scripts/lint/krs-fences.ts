/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Parser } from "../../packages/core/src/parser/parser.ts";

/**
 * Parse guard for the `.krs` snippets embedded in the documentation corpus.
 *
 * A snippet in prose is not executed by anything: it can drift out of the
 * grammar and stay green forever. AT-0006 AC-1.2 asked the reader to type
 * `resource DB "DB" [table]` — a form the parser has never accepted — and the
 * checklist item sat there un-runnable until Issue #2047 tried to automate it.
 * That issue put this guard over `docs/acceptance/**`; Issue #2415 found the
 * same drift in `docs/spec/tags-annotations.md`, which taught an inline-label
 * form (`service Payment "Payment Service"`) the parser rejects, and widened
 * the guard to the spec / guide / concepts docs.
 *
 * ## Fence convention
 *
 * Only fences whose info string *starts* with `krs` are parsed (so
 * ```krs.style / ```bash / other langs are ignored). The token after it
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
 *
 * ## Why untagged fences are a finding
 *
 * Both snippets that Issue #2415 opened over sat in **bare ``` fences**, so
 * checking only ```krs-tagged blocks would have left them exactly as invisible
 * as before. A bare fence that declares a node with a concrete id is a `.krs`
 * example that forgot to say so, and is reported as `krs-fence-untagged`.
 * Pseudo-grammar productions (`user <id> [<human|ai>] {`) name a placeholder
 * rather than an id and stay bare — they are not `.krs` and never parsed.
 */

export type KrsFenceFindingKind =
  /** ```krs that no longer parses — the drift this guard exists for. */
  | "krs-fence-parse-error"
  /** ```krs invalid that now parses clean — the example stopped illustrating. */
  | "krs-fence-unexpectedly-valid"
  /** ```krs <something-else> — unknown marker, so the claim is unreadable. */
  | "krs-fence-unknown-marker"
  /** A bare ``` fence holding `.krs` — it makes no claim, so nothing checks it. */
  | "krs-fence-untagged";

export interface KrsFenceFinding {
  kind: KrsFenceFindingKind;
  file: string;
  /** 1-based line of the opening fence. */
  line: number;
  detail: string;
}

interface Fence {
  /** Info string after the opening backticks, e.g. `krs`, `krs fragment`, `` for bare. */
  info: string;
  /** 1-based line of the opening fence. */
  line: number;
  body: string;
}

const KNOWN_MARKERS = new Set(["fragment", "invalid"]);

/**
 * Documentation roots scanned by default. Every `.md` below them is read
 * recursively; `docs/concepts.md` and its `.ja` twin are named as files
 * because their directory (`docs/`) holds unrelated documents.
 */
export const DEFAULT_DOC_ROOTS = [
  "docs/acceptance",
  "docs/spec",
  "docs/guide",
  "docs/concepts.md",
  "docs/concepts.ja.md",
];

/**
 * Node kinds that open a declaration in `.krs`. Used only to recognize a bare
 * fence as krs — the parser, not this list, decides whether it is valid.
 */
const DECLARATION_KEYWORDS = [
  "system",
  "service",
  "client",
  "user",
  "database",
  "queue",
  "storage",
  "domain",
  "usecase",
  "entity",
  "deploy",
  "organization",
  "team",
  "member",
  "facet",
  "boundary",
  "oci",
  "store",
  "job",
];

/**
 * A declaration line naming a *concrete* id (`service ECommerce {`) or a
 * quoted one (`deploy "production" {`). The trailing group keeps
 * pseudo-grammar out: `user <id> [<human|ai>]` has no concrete id, and prose
 * that happens to open with a keyword ("domain dependencies (§1)") does not
 * continue with `{`, `[`, `"`, `@` or end of line.
 */
const KRS_DECLARATION_RE = new RegExp(
  String.raw`^(${DECLARATION_KEYWORDS.join("|")})\s+([A-Za-z_][A-Za-z0-9_]*|"[^"]*")(\s*[{["@]|\s*$)`,
);

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
    const opening = /^```(.*)$/.exec(line);
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

/** True when a bare fence's body declares a node with a concrete id. */
function looksLikeKrs(body: string): boolean {
  return body.split("\n").some((line) => KRS_DECLARATION_RE.test(line));
}

/** Check one document. Exported for the unit tests. */
export function analyzeKrsFencesIn(file: string, content: string): KrsFenceFinding[] {
  const findings: KrsFenceFinding[] = [];

  for (const fence of extractFences(content)) {
    const [lang, ...rest] = fence.info.split(/\s+/);

    if (fence.info === "") {
      if (looksLikeKrs(fence.body)) {
        findings.push({
          kind: "krs-fence-untagged",
          file,
          line: fence.line,
          detail: "a bare fence holding `.krs` — tag it ```krs (or ```krs fragment / invalid)",
        });
      }
      continue;
    }
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

/** Repo-relative paths of every `.md` under `root` (a directory or a file). */
function markdownFilesUnder(repoRoot: string, root: string): string[] {
  const abs = join(repoRoot, root);
  if (!existsSync(abs)) return [];
  if (!statSync(abs).isDirectory()) return root.endsWith(".md") ? [root] : [];

  const files: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const rel = `${root}/${entry.name}`;
    if (entry.isDirectory()) files.push(...markdownFilesUnder(repoRoot, rel));
    else if (entry.name.endsWith(".md")) files.push(rel);
  }
  return files;
}

/** Check every markdown document under `roots`. */
export function analyzeKrsFences(repoRoot: string, roots = DEFAULT_DOC_ROOTS): KrsFenceFinding[] {
  const findings: KrsFenceFinding[] = [];
  for (const root of roots) {
    for (const file of markdownFilesUnder(repoRoot, root)) {
      findings.push(...analyzeKrsFencesIn(file, readFileSync(join(repoRoot, file), "utf8")));
    }
  }
  return findings;
}

export function describeKrsFenceFinding(f: KrsFenceFinding): string {
  switch (f.kind) {
    case "krs-fence-parse-error":
      return `${f.file}:${f.line} — \`\`\`krs block does not parse: ${f.detail}`;
    case "krs-fence-unexpectedly-valid":
    case "krs-fence-unknown-marker":
    case "krs-fence-untagged":
      return `${f.file}:${f.line} — ${f.detail}`;
  }
}

function main(): void {
  const findings = analyzeKrsFences(process.cwd());

  if (findings.length === 0) {
    console.log(`krs-fences: ok (${DEFAULT_DOC_ROOTS.join(", ")})`);
    return;
  }

  console.error("krs-fences: embedded `.krs` snippets have drifted from the grammar:");
  for (const f of findings) console.error(`✗ ${describeKrsFenceFinding(f)}`);
  console.error(
    "\nDeclare what each snippet claims to be: ```krs (a complete, currently-valid model), " +
      "```krs fragment (an excerpt, not parsed), ```krs invalid (a bad-input demo, must still fail).",
  );
  process.exit(1);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /krs-fences\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
