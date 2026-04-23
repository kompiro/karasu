import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { load as parseYaml } from "js-yaml";

const VALID_STATUSES = ["proposed", "accepted", "deprecated", "superseded", "not_adopted"] as const;
type Status = (typeof VALID_STATUSES)[number];

// Controlled vocabulary for `topic`. Matches the section headings in
// docs/adr/README.md so the two stay in sync. New topics require updating
// both this list and the README.
const VALID_TOPICS = [
  "core-concepts",
  "parser",
  "resolver",
  "renderer",
  "edges",
  "styling",
  "navigation",
  "app-ui",
  "project",
  "chat-ai",
  "cli",
  "vscode",
  "testing",
  "build",
  "adr-tooling",
] as const;
type Topic = (typeof VALID_TOPICS)[number];

const RELATIONSHIP_FIELDS = [
  "supersedes",
  "depends_on",
  "related_to",
  "conflicts_with",
  "refines",
] as const;
type RelationshipField = (typeof RELATIONSHIP_FIELDS)[number];

export interface Frontmatter {
  id: string;
  title: string;
  status: Status;
  date: string;
  topic: Topic;
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

export interface ParsedAdr {
  file: string;
  id: string;
  fm: Frontmatter;
  bodyHeading: string | null;
  body: string;
}

interface ValidationResult {
  errors: string[];
  warnings: string[];
  parsed: ParsedAdr[];
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
  const topicRaw = fm.topic;
  if (typeof topicRaw !== "string" || !VALID_TOPICS.includes(topicRaw as Topic)) {
    errors.push(
      `${file}: "topic" must be one of ${VALID_TOPICS.join(" | ")}, got ${JSON.stringify(topicRaw)}`,
    );
  }

  if (!id || !title || !dateStr || typeof statusRaw !== "string" || typeof topicRaw !== "string")
    return null;

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

  let scope: Frontmatter["scope"] | undefined;
  if (fm.scope !== undefined && fm.scope !== null) {
    if (typeof fm.scope !== "object" || Array.isArray(fm.scope)) {
      errors.push(`${file}: "scope" must be a mapping`);
    } else {
      const s = fm.scope as Record<string, unknown>;
      const pkgs = s.packages;
      const doms = s.domains;
      const pkgsOk =
        pkgs === undefined || (Array.isArray(pkgs) && pkgs.every((x) => typeof x === "string"));
      const domsOk =
        doms === undefined || (Array.isArray(doms) && doms.every((x) => typeof x === "string"));
      if (!pkgsOk) errors.push(`${file}: "scope.packages" must be an array of strings`);
      if (!domsOk) errors.push(`${file}: "scope.domains" must be an array of strings`);
      scope = {
        packages: pkgsOk && Array.isArray(pkgs) ? (pkgs as string[]) : undefined,
        domains: domsOk && Array.isArray(doms) ? (doms as string[]) : undefined,
      };
    }
  }

  return {
    id,
    title,
    status: statusRaw as Status,
    date: dateStr,
    topic: topicRaw as Topic,
    authors: stringArray("authors"),
    supersedes: stringArray("supersedes"),
    superseded_by: typeof superseded_by === "string" ? superseded_by : null,
    depends_on: stringArray("depends_on"),
    related_to: stringArray("related_to"),
    conflicts_with: stringArray("conflicts_with"),
    refines: stringArray("refines"),
    scope,
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
): ParsedAdr | null {
  const { raw, body } = extractFrontmatter(content);
  if (raw === null) {
    errors.push(`${filePath}: missing YAML frontmatter (see docs/adr/TEMPLATE.md)`);
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

  return { file: filePath, id: fm.id, fm, bodyHeading, body };
}

const ADR_ID_REF_RE = /ADR-\d{8}-\d{2}/g;

function declaredRelations(fm: Frontmatter): Set<string> {
  const out = new Set<string>();
  for (const field of RELATIONSHIP_FIELDS) {
    for (const id of (fm[field] ?? []) as string[]) out.add(id);
  }
  if (fm.superseded_by) out.add(fm.superseded_by);
  return out;
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

    // Bidirectional supersede consistency. We only check from the superseded side
    // (the ADR whose superseded_by is set) to avoid emitting the same broken-edge
    // error from both files. The new ADR's `supersedes` list is validated transitively:
    // if it omits the old ID, the old ADR's superseded_by check catches it.
    if (p.fm.superseded_by) {
      const target = byId.get(p.fm.superseded_by);
      if (target && !(target.fm.supersedes ?? []).includes(p.id)) {
        errors.push(
          `${p.file}: superseded_by "${p.fm.superseded_by}" but that ADR does not list "${p.id}" in its supersedes`,
        );
      }
    }

    // Also catch the reverse: a `supersedes` entry whose target is not marked as superseded
    // (either status differs or points somewhere else). This covers the case where the old
    // ADR simply has no superseded_by at all.
    for (const supersededId of p.fm.supersedes ?? []) {
      const target = byId.get(supersededId);
      if (!target) continue;
      if (target.fm.superseded_by !== p.id) {
        errors.push(
          `${p.file}: supersedes "${supersededId}" but that ADR's superseded_by is ${JSON.stringify(target.fm.superseded_by)} (expected "${p.id}")`,
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
          errors.push(
            `${p.file}: status=accepted depends_on "${depId}" which has status=${dep.fm.status}`,
          );
        }
      }
    }
  }

  for (const p of parsed) {
    const declared = declaredRelations(p.fm);
    const mentioned = new Set<string>();
    for (const ref of p.body.match(ADR_ID_REF_RE) ?? []) {
      if (ref === p.id) continue;
      if (!byId.has(ref)) continue;
      mentioned.add(ref);
    }
    for (const ref of mentioned) {
      if (!declared.has(ref)) {
        warnings.push(
          `${p.file}: body mentions "${ref}" but it is not listed in any relationship field (depends_on / related_to / supersedes / refines / conflicts_with / superseded_by)`,
        );
      }
    }
    for (const dep of p.fm.depends_on ?? []) {
      if (!byId.has(dep)) continue;
      if (!mentioned.has(dep)) {
        warnings.push(`${p.file}: depends_on "${dep}" is declared but never mentioned in the body`);
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
  // Tri-color DFS. WHITE=unvisited, GRAY=on current path (back-edge to GRAY means cycle),
  // BLACK=fully explored. BLACK nodes are skipped by the explicit WHITE/GRAY checks below.
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
  const parsed: ParsedAdr[] = [];

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => f !== "README.md" && f !== "TEMPLATE.md")
    .sort();

  for (const f of files) {
    const full = join(dir, f);
    const content = readFileSync(full, "utf8");
    const result = validateFile(full, content, errors, warnings);
    if (result) parsed.push(result);
  }

  crossValidate(parsed, errors, warnings);
  return { errors, warnings, parsed };
}
