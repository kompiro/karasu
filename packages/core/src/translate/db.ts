import type { Translator, TranslatorContext } from "./translator.js";
import { toPascalCase } from "./identifier.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toTableId(tableName: string): string {
  return `${toPascalCase(tableName)}Table`;
}

/**
 * Conceptual entity id for a table. Kept as the PascalCase table name (no
 * pluralization/singularization) so the SQL-table origin stays traceable
 * (ADR-644 case D). Distinct from `toTableId` (`Orders` vs
 * `OrdersTable`), so an entity and its physical table never collide.
 */
function toEntityId(tableName: string): string {
  return toPascalCase(tableName);
}

function deriveDbName(inputName: string | undefined): string {
  return toPascalCase(inputName ?? "Database");
}

function stripIdentQuotes(s: string): string {
  return s.replace(/^["'`]|["'`]$/g, "");
}

// ─── SQL parsing ──────────────────────────────────────────────────────────────

interface ForeignKey {
  column: string;
  refTable: string;
  /**
   * "explicit" = declared via `REFERENCES` / `FOREIGN KEY`.
   * "soft"     = inferred by column-name convention (`<stem>_id`, `<stem>_code`).
   */
  kind: "explicit" | "soft";
}

interface Table {
  name: string;
  columns: string[];
  primaryKey: string[];
  foreignKeys: ForeignKey[];
}

function splitTopLevelCommas(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim().length > 0) parts.push(buf);
  return parts;
}

function extractParenBody(sql: string, openIdx: number): { body: string; end: number } | null {
  if (sql[openIdx] !== "(") return null;
  let depth = 0;
  for (let i = openIdx; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return { body: sql.slice(openIdx + 1, i), end: i };
    }
  }
  return null;
}

function parseColumnList(s: string): string[] {
  return s
    .split(",")
    .map((c) => stripIdentQuotes(c.trim()))
    .filter((c) => c.length > 0);
}

function parseTable(name: string, body: string): Table {
  const columns: string[] = [];
  const primaryKey: string[] = [];
  const foreignKeys: ForeignKey[] = [];

  const parts = splitTopLevelCommas(body);
  for (const raw of parts) {
    const part = raw.trim();
    if (part.length === 0) continue;
    const upper = part.toUpperCase();

    const pkMatch = part.match(/^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]*)\)/i);
    if (pkMatch) {
      for (const col of parseColumnList(pkMatch[1])) primaryKey.push(col);
      continue;
    }

    const fkMatch = part.match(
      /^(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+(?:["'`]?\w+["'`]?\.)?["'`]?(\w+)["'`]?/i,
    );
    if (fkMatch) {
      const cols = parseColumnList(fkMatch[1]);
      const refTable = stripIdentQuotes(fkMatch[2]);
      for (const col of cols) foreignKeys.push({ column: col, refTable, kind: "explicit" });
      continue;
    }

    if (
      upper.startsWith("UNIQUE") ||
      upper.startsWith("CHECK") ||
      upper.startsWith("INDEX") ||
      upper.startsWith("KEY ") ||
      upper.startsWith("KEY(") ||
      upper.startsWith("CONSTRAINT")
    ) {
      continue;
    }

    const colMatch = part.match(/^["'`]?(\w+)["'`]?\s+/);
    if (!colMatch) continue;
    const colName = colMatch[1];
    columns.push(colName);

    if (/\bPRIMARY\s+KEY\b/i.test(part)) {
      primaryKey.push(colName);
    }

    const inlineRef = part.match(/\bREFERENCES\s+(?:["'`]?\w+["'`]?\.)?["'`]?(\w+)["'`]?/i);
    if (inlineRef) {
      foreignKeys.push({
        column: colName,
        refTable: stripIdentQuotes(inlineRef[1]),
        kind: "explicit",
      });
    }
  }

  return { name, columns, primaryKey, foreignKeys };
}

/**
 * Match a column name that looks like a reference-by-convention to another
 * table, e.g. `order_id`, `contract_code`. Returns the candidate stems to
 * test against known table names (with simple `s`/`es` plural fallback).
 */
const SOFT_FK_SUFFIXES = ["id", "code"];

function softFkCandidates(columnName: string): string[] {
  const lower = columnName.toLowerCase();
  for (const suffix of SOFT_FK_SUFFIXES) {
    const needle = `_${suffix}`;
    if (!lower.endsWith(needle)) continue;
    const stem = lower.slice(0, -needle.length);
    if (stem.length === 0) continue;
    return [stem, `${stem}s`, `${stem}es`];
  }
  return [];
}

/**
 * Add convention-based foreign keys to each table when no explicit
 * `REFERENCES` / `FOREIGN KEY` declaration exists for the column. A column
 * named `<stem>_id` or `<stem>_code` that matches an existing table name is
 * treated as a soft FK. This lets schemas that enforce referential integrity
 * at the application layer (MySQL/MyISAM legacy, analytics tables, etc.) still
 * benefit from aggregate grouping.
 */
function augmentWithSoftForeignKeys(tables: Table[]): void {
  const known = new Set(tables.map((t) => t.name.toLowerCase()));
  for (const t of tables) {
    const explicit = new Set(t.foreignKeys.map((fk) => fk.column));
    for (const col of t.columns) {
      if (explicit.has(col)) continue;
      for (const cand of softFkCandidates(col)) {
        if (!known.has(cand) || cand === t.name.toLowerCase()) continue;
        t.foreignKeys.push({ column: col, refTable: cand, kind: "soft" });
        break;
      }
    }
  }
}

function parseTables(sql: string): Table[] {
  const tables: Table[] = [];
  const headerPattern =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["'`]?\w+["'`]?\.)?["'`]?(\w+)["'`]?\s*(?=\()/gi;
  let match: RegExpExecArray | null;
  while ((match = headerPattern.exec(sql)) !== null) {
    const name = match[1];
    const openIdx = sql.indexOf("(", match.index);
    if (openIdx === -1) continue;
    const extracted = extractParenBody(sql, openIdx);
    if (!extracted) continue;
    tables.push(parseTable(name, extracted.body));
    headerPattern.lastIndex = extracted.end + 1;
  }
  return tables;
}

// ─── Aggregate grouping ───────────────────────────────────────────────────────

const CHILD_SUFFIXES = ["items", "lines", "details", "detail", "history", "entries", "rows"];

function nameSuggestsParent(tableName: string, knownTables: Set<string>): string | null {
  const lower = tableName.toLowerCase();
  for (const suffix of CHILD_SUFFIXES) {
    const needle = `_${suffix}`;
    if (!lower.endsWith(needle)) continue;
    const stem = lower.slice(0, -needle.length);
    if (stem.length === 0) continue;
    const candidates = [stem, `${stem}s`, `${stem}es`];
    for (const cand of candidates) {
      if (knownTables.has(cand)) return cand;
    }
  }
  return null;
}

interface GroupDecision {
  parentOf: Map<string, string>;
  reasonOf: Map<string, string>;
}

/**
 * Decide which tables fold into a parent.
 *
 * Heuristics (conservative — requires an FK link, not naming alone):
 * 1. Composite PK with at least one FK column to a parent table. Junction
 *    tables (all PK columns are FKs) are excluded.
 * 2. Name ending in `_items`/`_lines`/`_details`/`_history`/etc. AND an FK
 *    pointing to a table whose name matches the stem.
 */
function inferAggregates(tables: Table[]): GroupDecision {
  const known = new Set(tables.map((t) => t.name.toLowerCase()));
  const parentOf = new Map<string, string>();
  const reasonOf = new Map<string, string>();

  for (const t of tables) {
    if (t.primaryKey.length >= 2) {
      const pkFks = t.foreignKeys.filter((fk) => t.primaryKey.includes(fk.column));
      const isJunction = pkFks.length === t.primaryKey.length;
      if (pkFks.length > 0 && !isJunction) {
        const pick = pkFks[0];
        const parentName = pick.refTable;
        const parentLower = parentName.toLowerCase();
        if (known.has(parentLower) && parentLower !== t.name.toLowerCase()) {
          parentOf.set(t.name, parentName);
          const kind = pick.kind === "soft" ? "inferred FK column" : "FK";
          reasonOf.set(t.name, `composite PK with ${kind} to ${parentName}`);
          continue;
        }
      }
    }

    const parentByName = nameSuggestsParent(t.name, known);
    if (parentByName) {
      const fk = t.foreignKeys.find((f) => f.refTable.toLowerCase() === parentByName);
      if (fk) {
        parentOf.set(t.name, parentByName);
        const kind = fk.kind === "soft" ? "inferred FK column" : "FK";
        reasonOf.set(t.name, `name suffix + ${kind} to ${parentByName}`);
      }
    }
  }

  // Flatten transitive parents (child of a child → root).
  for (const child of Array.from(parentOf.keys())) {
    let root = parentOf.get(child) as string;
    const seen = new Set<string>([child]);
    while (parentOf.has(root) && !seen.has(root)) {
      seen.add(root);
      root = parentOf.get(root) as string;
    }
    parentOf.set(child, root);
  }

  return { parentOf, reasonOf };
}

// ─── Emission ─────────────────────────────────────────────────────────────────

function emitFlatTable(t: Table): string {
  return `  table ${toTableId(t.name)} { label "${t.name}" }`;
}

function emitAggregateTable(root: Table, children: { table: Table; reason: string }[]): string[] {
  if (children.length === 0) return [emitFlatTable(root)];
  const lines: string[] = [];
  lines.push(`  table ${toTableId(root.name)} {`);
  lines.push(`    label "${root.name}"`);
  lines.push(`    description """`);
  lines.push(`      Tables:`);
  lines.push(`      - ${root.name} (root)`);
  for (const c of children) {
    lines.push(`      - ${c.table.name} — ${c.reason}`);
  }
  lines.push(`      """`);
  lines.push(`  }`);
  return lines;
}

// ─── Entity scaffold emission ──────────────────────────────────────────────────

interface EntityRelation {
  /** Target aggregate-root entity id. */
  to: string;
  /**
   * True once any *explicit* FK contributes to this relation. Explicit wins:
   * a relation derived purely from Soft FKs stays `[inferred]`, but a single
   * declared `REFERENCES` promotes it to a confirmed (untagged) relation.
   */
  hasExplicit: boolean;
}

/**
 * Emit a provisional per-database `domain` block scaffolding conceptual
 * entities and their relations from the aggregate roots. Each root table
 * becomes an `entity` with a physical `table <DbName>.<TableId>` mapping;
 * cross-aggregate FK links (a child's FKs roll up to its root) become
 * relations declared on the reference-holding entity. Soft-FK-only relations
 * carry the auto-assigned `[inferred]` tag.
 *
 * Relations are always intra-domain (every entity lives in the one provisional
 * domain), so bare ids are correct. Naming, domain assignment, semantic labels,
 * and `[inferred]` curation are left to the reader (flagged by the TODO).
 */
function emitEntityDomain(
  dbName: string,
  tables: Table[],
  parentOf: Map<string, string>,
): string[] {
  const rootTables = tables.filter((t) => !parentOf.has(t.name));
  if (rootTables.length === 0) return [];

  // Resolve any table name to its aggregate root (a root maps to itself).
  const rootByLower = new Map<string, string>();
  for (const t of tables) {
    rootByLower.set(t.name.toLowerCase(), parentOf.get(t.name) ?? t.name);
  }

  // Gather relations as fromRoot (table name) → (target entity id → relation).
  const relationsByRoot = new Map<string, Map<string, EntityRelation>>();
  for (const t of tables) {
    const fromRoot = rootByLower.get(t.name.toLowerCase());
    if (fromRoot === undefined) continue;
    for (const fk of t.foreignKeys) {
      const toRoot = rootByLower.get(fk.refTable.toLowerCase());
      if (toRoot === undefined) continue; // FK to a table outside this schema
      if (toRoot === fromRoot) continue; // internal to the aggregate (child → root, self-FK)
      const toEntity = toEntityId(toRoot);
      let byTarget = relationsByRoot.get(fromRoot);
      if (!byTarget) {
        byTarget = new Map<string, EntityRelation>();
        relationsByRoot.set(fromRoot, byTarget);
      }
      const existing = byTarget.get(toEntity);
      if (existing) {
        existing.hasExplicit ||= fk.kind === "explicit";
      } else {
        byTarget.set(toEntity, { to: toEntity, hasExplicit: fk.kind === "explicit" });
      }
    }
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(`domain ${dbName} {`);
  lines.push("  // TODO: provisional per-database domain from `translate --from db`.");
  lines.push("  // Rename/split this domain, move entities to their real domains, and give");
  lines.push("  // relations semantic labels. Delete `[inferred]` once a relation is confirmed.");
  for (const t of rootTables) {
    const entityId = toEntityId(t.name);
    lines.push(`  entity ${entityId} {`);
    lines.push(`    table ${dbName}.${toTableId(t.name)}`);
    const relations = Array.from(relationsByRoot.get(t.name)?.values() ?? []).sort((a, b) =>
      a.to.localeCompare(b.to),
    );
    for (const rel of relations) {
      const tag = rel.hasExplicit ? "" : " [inferred]";
      lines.push(`    ${entityId} -> ${rel.to}${tag}`);
    }
    lines.push(`  }`);
  }
  lines.push("}");
  return lines;
}

// ─── Bindings emission ───────────────────────────────────────────────────────

/**
 * SQL DML verbs we emit per table when bindings are requested. The db
 * translator does not parse DML — these represent the *maximum* CRUD surface
 * a schema-defined table exposes, so the resulting matrix shows full coverage.
 */
const SQL_VERBS = ["select", "insert", "update", "delete"] as const;
const SQL_VERB_TO_CRUD: Record<string, string> = {
  select: "read",
  insert: "create",
  // update / delete are recognized CRUD verbs — bare form is sufficient.
};

function decorateSqlVerb(verb: string): string {
  const crud = SQL_VERB_TO_CRUD[verb];
  return crud === undefined ? verb : `${verb}:${crud}`;
}

function buildSqlOperationsLine(decorated: boolean): string {
  return SQL_VERBS.map((v) => (decorated ? decorateSqlVerb(v) : v)).join(", ");
}

function emitServiceBindings(dbName: string, rootTables: Table[], decorated: boolean): string[] {
  if (rootTables.length === 0) return [];
  const lines: string[] = [];
  lines.push("");
  lines.push(`service ${dbName}Service {`);
  const opsLine = buildSqlOperationsLine(decorated);
  for (const t of rootTables) {
    const usecaseId = `Manage${toPascalCase(t.name)}`;
    const tableId = toTableId(t.name);
    lines.push(`  usecase ${usecaseId} {`);
    lines.push(`    resource ${dbName}.${tableId} {`);
    lines.push(`      operations ${opsLine}`);
    lines.push(`    }`);
    lines.push(`  }`);
  }
  lines.push("}");
  return lines;
}

// ─── Translator ───────────────────────────────────────────────────────────────

export class DbTranslator implements Translator {
  async translate(input: string, context: TranslatorContext): Promise<string> {
    const dbName = context.database ?? deriveDbName(context.inputName);
    const tables = parseTables(input);
    const granularity = context.granularity ?? "aggregate";
    const emitCrudDecoration = context.emitCrudDecoration ?? false;
    const emitBindings = emitCrudDecoration || (context.emitBindings ?? false);

    const bodyLines: string[] = [];
    const rootTables: Table[] = [];
    // Populated in the aggregate branch; drives the conceptual entity scaffold.
    let aggregateParentOf: Map<string, string> | undefined;

    if (granularity === "table" || tables.length === 0) {
      for (const t of tables) {
        bodyLines.push(emitFlatTable(t));
        rootTables.push(t);
      }
    } else {
      augmentWithSoftForeignKeys(tables);
      const { parentOf, reasonOf } = inferAggregates(tables);
      aggregateParentOf = parentOf;
      const byName = new Map(tables.map((t) => [t.name, t]));
      const childrenOf = new Map<string, { table: Table; reason: string }[]>();
      for (const [child, parent] of parentOf) {
        const childTable = byName.get(child);
        if (!childTable) continue;
        const list = childrenOf.get(parent) ?? [];
        list.push({ table: childTable, reason: reasonOf.get(child) ?? "" });
        childrenOf.set(parent, list);
      }
      for (const t of tables) {
        if (parentOf.has(t.name)) continue;
        const children = childrenOf.get(t.name) ?? [];
        for (const line of emitAggregateTable(t, children)) bodyLines.push(line);
        rootTables.push(t);
      }
    }

    // Bindings only make sense in aggregate granularity — `table` granularity
    // means "give me the schema as flat tables", and decoration would multiply
    // verbose noise. Skip silently here; the CLI layer warns up-front.
    const bindingsLines =
      emitBindings && granularity !== "table"
        ? emitServiceBindings(dbName, rootTables, emitCrudDecoration)
        : [];

    // In aggregate granularity, scaffold conceptual entities + relations into a
    // provisional per-database domain, giving a bottom-up starting point.
    const entityLines =
      aggregateParentOf !== undefined ? emitEntityDomain(dbName, tables, aggregateParentOf) : [];

    const lines: string[] = [
      `database ${dbName} {`,
      ...bodyLines,
      "}",
      ...entityLines,
      ...bindingsLines,
      "",
    ];
    return lines.join("\n");
  }
}
