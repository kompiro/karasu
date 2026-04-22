import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { load as parseYaml } from "js-yaml";

const VALID_STATUSES = ["proposed", "accepted", "deprecated", "superseded", "not_adopted"] as const;
type Status = (typeof VALID_STATUSES)[number];

const RELATIONSHIP_FIELDS = [
  "supersedes",
  "depends_on",
  "related_to",
  "conflicts_with",
  "refines",
] as const;
type RelationshipField = (typeof RELATIONSHIP_FIELDS)[number];

interface Frontmatter {
  id: string;
  title: string;
  status: Status;
  date: string;
  authors?: string[];
  supersedes?: string[];
  superseded_by?: string | null;
  depends_on?: string[];
  related_to?: string[];
  conflicts_with?: string[];
  refines?: string[];
  scope?: { packages?: string[]; domains?: string[] };
  assumptions?: string[];
}

interface ParsedAdr {
  file: string;
  id: string;
  fm: Frontmatter;
  bodyHeading: string | null;
}

interface ValidationResult {
  errors: string[];
  warnings: string[];
  parsed: ParsedAdr[];
  skipped: string[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const ID_FROM_FILENAME_RE = /^(\d{8})-(\d{2})-/;

function extractFrontmatter(content: string): {
  raw: string | null;
  body: string;
} {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { raw: null, body: content };
  return { raw: match[1], body: content.slice(match[0].length) };
}

function idFromFilename(file: string): string | null {
  const name = basename(file);
  const m = name.match(ID_FROM_FILENAME_RE);
  if (!m) return null;
  return `ADR-${m[1]}-${m[2]}`;
}

function parseFrontmatter(raw: string, file: string, errors: string[]): Frontmatter | null {
  let data: unknown;
  try {
    data = parseYaml(raw);
  } catch (e) {
    errors.push(`${file}: YAML parse error: ${(e as Error).message}`);
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    errors.push(`${file}: frontmatter must be a YAML mapping`);
    return null;
  }
  const fm = data as Record<string, unknown>;

  const requireString = (field: string): string | null => {
    const v = fm[field];
    if (typeof v !== "string" || v.length === 0) {
      errors.push(`${file}: "${field}" is required and must be a non-empty string`);
      return null;
    }
    return v;
  };

  const id = requireString("id");
  const title = requireString("title");
  const date = fm.date;
  let dateStr: string | null = null;
  if (date instanceof Date) {
    dateStr = date.toISOString().slice(0, 10);
  } else if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    dateStr = date;
  } else {
    errors.push(`${file}: "date" is required and must be ISO 8601 (YYYY-MM-DD)`);
  }
  const statusRaw = fm.status;
  if (typeof statusRaw !== "string" || !VALID_STATUSES.includes(statusRaw as Status)) {
    errors.push(
      `${file}: "status" must be one of ${VALID_STATUSES.join(" | ")}, got ${JSON.stringify(statusRaw)}`,
    );
  }

  if (!id || !title || !dateStr || typeof statusRaw !== "string") return null;

  const stringArray = (field: string): string[] => {
    const v = fm[field];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      errors.push(`${file}: "${field}" must be an array of strings`);
      return [];
    }
    return v as string[];
  };

  const superseded_by = fm.superseded_by;
  if (superseded_by !== undefined && superseded_by !== null && typeof superseded_by !== "string") {
    errors.push(`${file}: "superseded_by" must be a string or null`);
  }

  return {
    id,
    title,
    status: statusRaw as Status,
    date: dateStr,
    authors: stringArray("authors"),
    supersedes: stringArray("supersedes"),
    superseded_by: typeof superseded_by === "string" ? superseded_by : null,
    depends_on: stringArray("depends_on"),
    related_to: stringArray("related_to"),
    conflicts_with: stringArray("conflicts_with"),
    refines: stringArray("refines"),
    assumptions: stringArray("assumptions"),
  };
}

function extractBodyHeading(body: string): string | null {
  const m = body.match(/^\s*#\s+(.+?)\s*$/m);
  return m ? m[1] : null;
}

function titleFromHeading(heading: string, id: string): string {
  const prefix = `${id}:`;
  return heading.startsWith(prefix) ? heading.slice(prefix.length).trim() : heading.trim();
}

function validateFile(
  filePath: string,
  content: string,
  errors: string[],
  warnings: string[],
  skipped: string[],
): ParsedAdr | null {
  const { raw, body } = extractFrontmatter(content);
  if (raw === null) {
    skipped.push(filePath);
    return null;
  }
  const fm = parseFrontmatter(raw, filePath, errors);
  if (!fm) return null;

  const expectedId = idFromFilename(filePath);
  if (expectedId && fm.id !== expectedId) {
    errors.push(`${filePath}: "id" (${fm.id}) does not match filename-derived id (${expectedId})`);
  }

  if (fm.status === "superseded") {
    if (!fm.superseded_by) {
      errors.push(`${filePath}: status=superseded requires "superseded_by"`);
    }
  } else if (fm.superseded_by) {
    errors.push(
      `${filePath}: "superseded_by" is only allowed when status=superseded (got status=${fm.status})`,
    );
  }

  const bodyHeading = extractBodyHeading(body);
  if (bodyHeading) {
    const bodyTitle = titleFromHeading(bodyHeading, fm.id);
    if (bodyTitle !== fm.title) {
      warnings.push(
        `${filePath}: frontmatter title "${fm.title}" does not match body H1 "${bodyTitle}"`,
      );
    }
  } else {
    warnings.push(`${filePath}: body has no H1 heading`);
  }

  return { file: filePath, id: fm.id, fm, bodyHeading };
}

function crossValidate(parsed: ParsedAdr[], errors: string[], warnings: string[]): void {
  const byId = new Map<string, ParsedAdr>();
  for (const p of parsed) {
    if (byId.has(p.id)) {
      errors.push(`Duplicate ADR id: ${p.id} (${byId.get(p.id)!.file} and ${p.file})`);
    }
    byId.set(p.id, p);
  }

  const relationFields: RelationshipField[] = [
    "supersedes",
    "depends_on",
    "related_to",
    "conflicts_with",
    "refines",
  ];

  for (const p of parsed) {
    for (const field of relationFields) {
      const ids = (p.fm[field] ?? []) as string[];
      for (const ref of ids) {
        if (!byId.has(ref)) {
          warnings.push(
            `${p.file}: ${field} references "${ref}" which is not migrated yet or does not exist`,
          );
        }
      }
    }

    if (p.fm.superseded_by && !byId.has(p.fm.superseded_by)) {
      warnings.push(
        `${p.file}: superseded_by references "${p.fm.superseded_by}" which is not migrated yet or does not exist`,
      );
    }

    for (const supersededId of p.fm.supersedes ?? []) {
      const target = byId.get(supersededId);
      if (!target) continue;
      if (target.fm.superseded_by !== p.id) {
        errors.push(
          `${p.file}: supersedes "${supersededId}" but that ADR's superseded_by is ${JSON.stringify(target.fm.superseded_by)} (expected "${p.id}")`,
        );
      }
    }

    if (p.fm.superseded_by) {
      const target = byId.get(p.fm.superseded_by);
      if (target && !(target.fm.supersedes ?? []).includes(p.id)) {
        errors.push(
          `${p.file}: superseded_by "${p.fm.superseded_by}" but that ADR does not list "${p.id}" in its supersedes`,
        );
      }
    }

    if (p.fm.status === "accepted") {
      for (const depId of p.fm.depends_on ?? []) {
        const dep = byId.get(depId);
        if (!dep) continue;
        if (
          dep.fm.status === "superseded" ||
          dep.fm.status === "deprecated" ||
          dep.fm.status === "not_adopted"
        ) {
          warnings.push(
            `${p.file}: status=accepted depends_on "${depId}" which has status=${dep.fm.status}`,
          );
        }
      }
    }
  }

  detectCycle(
    parsed,
    (p) => (p.fm.depends_on ?? []).filter((id) => byId.has(id)),
    "depends_on",
    byId,
    errors,
  );
  detectCycle(
    parsed,
    (p) => (p.fm.refines ?? []).filter((id) => byId.has(id)),
    "refines",
    byId,
    errors,
  );
}

function detectCycle(
  parsed: ParsedAdr[],
  edges: (p: ParsedAdr) => string[],
  label: string,
  byId: Map<string, ParsedAdr>,
  errors: string[],
): void {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];

  const visit = (id: string): boolean => {
    color.set(id, GRAY);
    stack.push(id);
    const node = byId.get(id);
    if (node) {
      for (const next of edges(node)) {
        const c = color.get(next) ?? WHITE;
        if (c === GRAY) {
          const cycleStart = stack.indexOf(next);
          const cycle = [...stack.slice(cycleStart), next].join(" -> ");
          errors.push(`${label} cycle detected: ${cycle}`);
          return true;
        }
        if (c === WHITE && visit(next)) return true;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return false;
  };

  for (const p of parsed) {
    if ((color.get(p.id) ?? WHITE) === WHITE) {
      if (visit(p.id)) return;
    }
  }
}

export function validateDirectory(dir: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const skipped: string[] = [];
  const parsed: ParsedAdr[] = [];

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => f !== "README.md" && f !== "TEMPLATE.md")
    .sort();

  for (const f of files) {
    const full = join(dir, f);
    const content = readFileSync(full, "utf8");
    const result = validateFile(full, content, errors, warnings, skipped);
    if (result) parsed.push(result);
  }

  crossValidate(parsed, errors, warnings);
  return { errors, warnings, parsed, skipped };
}
