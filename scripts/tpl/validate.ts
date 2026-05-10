import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { load as parseYaml } from "js-yaml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Status = "active" | "deprecated";

export interface DiscoveredFromEntry {
  issue?: string;
  root_cause_adr?: string;
  root_cause_file?: string;
}

export interface Frontmatter {
  id: string;
  title: string;
  status: Status;
  date: string;
  applicable_to: string[];
  known_consumers?: string[];
  discovered_from: DiscoveredFromEntry[];
  related_to?: string[];
  topic: string;
  scope: {
    packages: string[];
  };
}

export interface ParsedTpl {
  file: string;
  fm: Frontmatter;
  body: string;
}

export type Finding =
  | { kind: "yaml-parse-error"; file: string; message: string }
  | { kind: "missing-frontmatter"; file: string }
  | { kind: "filename-id-mismatch"; file: string; idInFm: string; idInFile: string }
  | { kind: "id-format-invalid"; file: string; id: string }
  | { kind: "missing-required-field"; file: string; field: string }
  | { kind: "status-invalid"; file: string; value: string }
  | { kind: "topic-invalid"; file: string; topic: string; valid: string[] }
  | { kind: "applicable-to-empty"; file: string }
  | { kind: "discovered-from-empty"; file: string }
  | { kind: "discovered-from-unknown-key"; file: string; key: string }
  | { kind: "related-to-dangling"; file: string; ref: string }
  | { kind: "scope-package-missing"; file: string; pkg: string }
  | { kind: "deprecated-no-rationale"; file: string }
  | { kind: "readme-missing-row"; tplId: string }
  | { kind: "readme-row-points-to-missing-file"; tplId: string; href: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILENAME_RE = /^TPL-(\d{8})-(\d{2})-[a-z0-9-]+\.md$/;
const ID_RE = /^TPL-\d{8}-\d{2}$/;
const VALID_STATUSES: readonly Status[] = ["active", "deprecated"];
const KNOWN_DISCOVERED_FROM_KEYS = new Set(["issue", "root_cause_adr", "root_cause_file"]);
const REQUIRED_FIELDS = [
  "id",
  "title",
  "status",
  "date",
  "applicable_to",
  "discovered_from",
  "topic",
  "scope",
] as const;

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

interface ParseResult {
  fm: unknown | null;
  body: string;
  error: string | null;
}

export function parseFrontmatter(content: string): ParseResult {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) return { fm: null, body: content, error: null };
  const [, yamlText, body] = match;
  try {
    return { fm: parseYaml(yamlText), body, error: null };
  } catch (err) {
    return { fm: null, body, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Single-file validation
// ---------------------------------------------------------------------------

interface FileValidationContext {
  validTopics: readonly string[];
  validPackages: readonly string[];
}

export function validateFile(
  filePath: string,
  content: string,
  ctx: FileValidationContext,
): { findings: Finding[]; parsed: ParsedTpl | null } {
  const file = basename(filePath);
  const findings: Finding[] = [];
  const parsed = parseFrontmatter(content);

  if (parsed.error) {
    findings.push({ kind: "yaml-parse-error", file, message: parsed.error });
    return { findings, parsed: null };
  }
  if (!parsed.fm || typeof parsed.fm !== "object") {
    findings.push({ kind: "missing-frontmatter", file });
    return { findings, parsed: null };
  }

  const fm = parsed.fm as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (fm[field] === undefined || fm[field] === null) {
      findings.push({ kind: "missing-required-field", file, field });
    }
  }
  // If id is missing we cannot do downstream checks meaningfully.
  if (typeof fm.id !== "string") {
    return { findings, parsed: null };
  }

  const id = fm.id;
  if (!ID_RE.test(id)) {
    findings.push({ kind: "id-format-invalid", file, id });
  }

  const fnameMatch = FILENAME_RE.exec(file);
  if (fnameMatch) {
    const idFromFile = `TPL-${fnameMatch[1]}-${fnameMatch[2]}`;
    if (idFromFile !== id) {
      findings.push({ kind: "filename-id-mismatch", file, idInFm: id, idInFile: idFromFile });
    }
  }

  if (typeof fm.status === "string" && !VALID_STATUSES.includes(fm.status as Status)) {
    findings.push({ kind: "status-invalid", file, value: fm.status });
  }

  if (typeof fm.topic === "string" && !ctx.validTopics.includes(fm.topic)) {
    findings.push({
      kind: "topic-invalid",
      file,
      topic: fm.topic,
      valid: [...ctx.validTopics],
    });
  }

  if (Array.isArray(fm.applicable_to) && fm.applicable_to.length === 0) {
    findings.push({ kind: "applicable-to-empty", file });
  }

  if (Array.isArray(fm.discovered_from)) {
    if (fm.discovered_from.length === 0) {
      findings.push({ kind: "discovered-from-empty", file });
    }
    for (const entry of fm.discovered_from) {
      if (entry && typeof entry === "object") {
        for (const key of Object.keys(entry as object)) {
          if (!KNOWN_DISCOVERED_FROM_KEYS.has(key)) {
            findings.push({ kind: "discovered-from-unknown-key", file, key });
          }
        }
      }
    }
  }

  if (Array.isArray(fm.scope) === false && fm.scope && typeof fm.scope === "object") {
    const scopePackages = (fm.scope as { packages?: unknown }).packages;
    if (Array.isArray(scopePackages)) {
      for (const pkg of scopePackages) {
        if (typeof pkg === "string" && !ctx.validPackages.includes(pkg)) {
          findings.push({ kind: "scope-package-missing", file, pkg });
        }
      }
    }
  }

  if (fm.status === "deprecated") {
    const lower = parsed.body.toLowerCase();
    // Heuristic: deprecated rationale should explicitly mention deprecation.
    if (!lower.includes("deprecated")) {
      findings.push({ kind: "deprecated-no-rationale", file });
    }
  }

  const tpl: ParsedTpl = {
    file,
    fm: fm as unknown as Frontmatter,
    body: parsed.body,
  };
  return { findings, parsed: tpl };
}

// ---------------------------------------------------------------------------
// Cross-file checks
// ---------------------------------------------------------------------------

export function validateRelatedTo(parsed: readonly ParsedTpl[]): Finding[] {
  const ids = new Set(parsed.map((p) => p.fm.id));
  const findings: Finding[] = [];
  for (const p of parsed) {
    const refs = p.fm.related_to;
    if (!Array.isArray(refs)) continue;
    for (const ref of refs) {
      if (typeof ref !== "string") continue;
      if (!ids.has(ref)) {
        findings.push({ kind: "related-to-dangling", file: p.file, ref });
      }
    }
  }
  return findings;
}

interface ReadmeIndexCheckResult {
  findings: Finding[];
  rowIds: Set<string>;
}

const README_LINK_RE = /\[(TPL-\d{8}-\d{2})\]\(([^)]+)\)/g;

export function validateReadmeIndex(
  readmeContent: string,
  parsed: readonly ParsedTpl[],
  tplDir: string,
): ReadmeIndexCheckResult {
  const findings: Finding[] = [];
  const rowIds = new Set<string>();
  for (const m of readmeContent.matchAll(README_LINK_RE)) {
    const [, id, href] = m;
    rowIds.add(id);
    const target = resolve(tplDir, href);
    if (!existsSync(target)) {
      findings.push({ kind: "readme-row-points-to-missing-file", tplId: id, href });
    }
  }
  for (const p of parsed) {
    if (!rowIds.has(p.fm.id)) {
      findings.push({ kind: "readme-missing-row", tplId: p.fm.id });
    }
  }
  return { findings, rowIds };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

interface ValidateOptions {
  tplDir: string;
  validTopics: readonly string[];
  validPackages: readonly string[];
  readmePath?: string;
}

interface ValidateResult {
  findings: Finding[];
  parsed: ParsedTpl[];
}

export function validateAll(opts: ValidateOptions): ValidateResult {
  const findings: Finding[] = [];
  const parsed: ParsedTpl[] = [];

  const files = readdirSync(opts.tplDir)
    .filter((f) => f.startsWith("TPL-") && f.endsWith(".md"))
    .sort();

  for (const f of files) {
    const full = join(opts.tplDir, f);
    const content = readFileSync(full, "utf8");
    const result = validateFile(full, content, {
      validTopics: opts.validTopics,
      validPackages: opts.validPackages,
    });
    findings.push(...result.findings);
    if (result.parsed) parsed.push(result.parsed);
  }

  findings.push(...validateRelatedTo(parsed));

  if (opts.readmePath && existsSync(opts.readmePath)) {
    const readme = readFileSync(opts.readmePath, "utf8");
    const indexResult = validateReadmeIndex(readme, parsed, opts.tplDir);
    findings.push(...indexResult.findings);
  }

  return { findings, parsed };
}

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

export function formatFinding(f: Finding): string {
  switch (f.kind) {
    case "yaml-parse-error":
      return `${f.file}: YAML parse error — ${f.message}`;
    case "missing-frontmatter":
      return `${f.file}: missing frontmatter`;
    case "filename-id-mismatch":
      return `${f.file}: id ${f.idInFm} does not match filename-derived ${f.idInFile}`;
    case "id-format-invalid":
      return `${f.file}: id "${f.id}" does not match TPL-YYYYMMDD-NN`;
    case "missing-required-field":
      return `${f.file}: missing required field "${f.field}"`;
    case "status-invalid":
      return `${f.file}: status "${f.value}" must be active|deprecated`;
    case "topic-invalid":
      return `${f.file}: topic "${f.topic}" not in controlled vocabulary (${f.valid.join(", ")})`;
    case "applicable-to-empty":
      return `${f.file}: applicable_to must be non-empty`;
    case "discovered-from-empty":
      return `${f.file}: discovered_from must be non-empty`;
    case "discovered-from-unknown-key":
      return `${f.file}: discovered_from has unknown key "${f.key}"`;
    case "related-to-dangling":
      return `${f.file}: related_to references unknown TPL "${f.ref}"`;
    case "scope-package-missing":
      return `${f.file}: scope.packages references missing package "${f.pkg}"`;
    case "deprecated-no-rationale":
      return `${f.file}: status=deprecated but body has no deprecation rationale`;
    case "readme-missing-row":
      return `README index: missing row for ${f.tplId}`;
    case "readme-row-points-to-missing-file":
      return `README index: row for ${f.tplId} points to missing file "${f.href}"`;
  }
}
