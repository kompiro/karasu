import { quoteString, emitDescription } from "../formatter/quote-string.js";
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

function isQuote(ch: string): boolean {
  return ch === "'" || ch === '"' || ch === "`";
}

/**
 * The index just past the quoted text (`'…'`, `"…"`, `` `…` ``) that opens at
 * `sql[i]`, or `sql.length` when it is never closed. A doubled quote inside
 * the text closes and reopens it: same result.
 */
function quotedEnd(sql: string, i: number): number {
  const close = sql.indexOf(sql[i], i + 1);
  return close === -1 ? sql.length : close + 1;
}

function splitTopLevelCommas(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (isQuote(ch)) {
      const end = quotedEnd(body, i);
      buf += body.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
    i++;
  }
  if (buf.trim().length > 0) parts.push(buf);
  return parts;
}

/** The text between `sql[openIdx]` and its matching `)`; parentheses in quoted text do not count. */
function extractParenBody(sql: string, openIdx: number): { body: string; end: number } | null {
  if (sql[openIdx] !== "(") return null;
  let depth = 0;
  for (let i = openIdx; i < sql.length; i++) {
    const ch = sql[i];
    if (isQuote(ch)) {
      i = quotedEnd(sql, i) - 1;
      continue;
    }
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

const QUOTE = "[\"'`]";
/** A table name as these statements write it: optionally schema-qualified and quoted. */
const TABLE_NAME = String.raw`(?:${QUOTE}?\w+${QUOTE}?\.)?${QUOTE}?\w+${QUOTE}?`;
/** The same, capturing the bare name. */
const TABLE_NAME_CAPTURE = String.raw`(?:${QUOTE}?\w+${QUOTE}?\.)?${QUOTE}?(\w+)${QUOTE}?`;

/** A possibly schema-qualified, quoted table name as a bare name. */
function bareName(ref: string): string {
  return stripIdentQuotes(ref.trim().split(".").pop() ?? "");
}

/**
 * `sql` with its `-- …` and `/* … *\/` comments replaced by spaces, so the
 * statement scanner skips them and every offset stays where it was. Quoted
 * text (`'…'`, `"…"`, `` `…` ``) is kept as it is, comment markers included.
 */
function blankComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (isQuote(ch)) {
      const end = quotedEnd(sql, i);
      out += sql.slice(i, end);
      i = end;
    } else if (ch === "-" && sql[i + 1] === "-") {
      const newline = sql.indexOf("\n", i);
      const end = newline === -1 ? sql.length : newline;
      out += " ".repeat(end - i);
      i = end;
    } else if (ch === "/" && sql[i + 1] === "*") {
      const close = sql.indexOf("*/", i + 2);
      const end = close === -1 ? sql.length : close + 2;
      out += sql.slice(i, end).replace(/[^\n]/g, " ");
      i = end;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/**
 * The tables a SQL script leaves behind, replayed statement by statement
 * (#3182). An ORM's SQL migration history (drizzle, Prisma) is the usual
 * input, not a schema dump, so reading only `CREATE TABLE` resurrects dropped
 * tables and the temporaries of a table rebuild
 * (`CREATE __new_x` → `DROP x` → `ALTER TABLE __new_x RENAME TO x`).
 *
 * - `CREATE TABLE` adds a table, or replaces one of the same name (a recreate);
 *   `IF NOT EXISTS` keeps the existing one.
 * - `DROP TABLE` (`IF EXISTS`, one or more names) removes it.
 * - `ALTER TABLE … RENAME TO` and MySQL's `RENAME TABLE a TO b[, c TO d]`
 *   rename it, and every foreign key that pointed at the old name follows it,
 *   as SQLite / PostgreSQL / MySQL do.
 *
 * Names are matched case-insensitively, as unquoted SQL identifiers are. The
 * survivors keep the order they were created in (a rename keeps its place).
 * Other statements (`ALTER TABLE … ADD COLUMN`, …) are not replayed: a table's
 * columns come from its last `CREATE TABLE`. Comments and quoted text are
 * skipped, so a statement inside them changes nothing.
 */
function parseTables(input: string): Table[] {
  const sql = blankComments(input);
  const tables = new Map<string, Table>();
  const keyOf = (name: string) => name.toLowerCase();
  const rename = (from: string, to: string) => {
    const table = tables.get(keyOf(from));
    if (!table) return;
    // A rename keeps the table where it was; only a recreate moves it.
    // A case-only rename (`orders` → `"Orders"`) shares its key: keep it.
    if (keyOf(to) !== keyOf(from)) tables.delete(keyOf(to));
    const renamed = new Map<string, Table>();
    for (const [key, t] of tables) renamed.set(key === keyOf(from) ? keyOf(to) : key, t);
    tables.clear();
    for (const [key, t] of renamed) tables.set(key, t);
    table.name = to;
    for (const t of tables.values()) {
      for (const fk of t.foreignKeys) {
        if (keyOf(fk.refTable) === keyOf(from)) fk.refTable = to;
      }
    }
  };
  const statementPattern = new RegExp(
    [
      // Quoted text is consumed whole, so DDL inside a string literal
      // (`DEFAULT 'DROP TABLE a'`) is not replayed. No capture group.
      String.raw`'(?:''|[^'])*'|"(?:""|[^"])*"|\x60(?:\x60\x60|[^\x60])*\x60`,
      // 1: CREATE, 2: IF NOT EXISTS, 3: name
      String.raw`(CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?${TABLE_NAME_CAPTURE}\s*(?=\())`,
      // 4: DROP, 5: the comma-separated names
      String.raw`(DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?((?:${TABLE_NAME}\s*,\s*)*${TABLE_NAME}))`,
      // 6: RENAME, 7: from, 8: to
      String.raw`(ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${TABLE_NAME_CAPTURE}\s+RENAME\s+TO\s+${TABLE_NAME_CAPTURE})`,
      // 9: MySQL RENAME TABLE, 10: the comma-separated `a TO b` pairs
      String.raw`(RENAME\s+TABLE\s+((?:${TABLE_NAME}\s+TO\s+${TABLE_NAME}\s*,\s*)*${TABLE_NAME}\s+TO\s+${TABLE_NAME}))`,
    ].join("|"),
    "gi",
  );
  let match: RegExpExecArray | null;
  while ((match = statementPattern.exec(sql)) !== null) {
    if (match[1] !== undefined) {
      const name = match[3];
      const openIdx = sql.indexOf("(", match.index + match[1].length - 1);
      if (openIdx === -1) continue;
      const extracted = extractParenBody(sql, openIdx);
      if (!extracted) continue;
      statementPattern.lastIndex = extracted.end + 1;
      const ifNotExists = match[2] !== undefined;
      if (ifNotExists && tables.has(keyOf(name))) continue;
      // Delete first so a recreate takes the position of its new CREATE.
      tables.delete(keyOf(name));
      tables.set(keyOf(name), parseTable(name, extracted.body));
    } else if (match[4] !== undefined) {
      for (const ref of match[5].split(",")) tables.delete(keyOf(bareName(ref)));
    } else if (match[6] !== undefined) {
      rename(match[7], match[8]);
    } else if (match[9] !== undefined) {
      // MySQL applies the pairs left to right, so `a TO tmp, b TO a, tmp TO b` swaps.
      for (const pair of match[10].split(",")) {
        const [from, to] = pair.trim().split(/\s+TO\s+/i);
        rename(bareName(from), bareName(to));
      }
    }
  }
  return [...tables.values()];
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
  // Both matches below are case-insensitive, so the name they hand back is a
  // spelling from the *reference* (an FK's `REFERENCES orders`, or the
  // lowercased candidate `nameSuggestsParent` looks up) rather than the
  // declared `CREATE TABLE Orders`. Every consumer keys the aggregate by its
  // declared name, so store the declared spelling here: an uncanonicalised
  // parent leaves the child's rolled-up relations filed under a root nobody
  // looks up, and they are dropped from both the table edges and the entity
  // scaffold with no diagnostic (#2725 review).
  const declaredByLower = new Map(tables.map((t) => [t.name.toLowerCase(), t.name]));
  const declared = (name: string): string => declaredByLower.get(name.toLowerCase()) ?? name;
  const parentOf = new Map<string, string>();
  const reasonOf = new Map<string, string>();

  for (const t of tables) {
    if (t.primaryKey.length >= 2) {
      const pkFks = t.foreignKeys.filter((fk) => t.primaryKey.includes(fk.column));
      const isJunction = pkFks.length === t.primaryKey.length;
      if (pkFks.length > 0 && !isJunction) {
        const pick = pkFks[0];
        const parentName = declared(pick.refTable);
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
        const parentName = declared(parentByName);
        parentOf.set(t.name, parentName);
        const kind = fk.kind === "soft" ? "inferred FK column" : "FK";
        reasonOf.set(t.name, `name suffix + ${kind} to ${parentName}`);
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

/**
 * A `table -> table` edge recorded inside the emitted `database` block (#2722,
 * slice B of #2585). The store canvas draws these as the **recorded** side of
 * its ER view, so a schema dump with declared foreign keys — and no `entity`
 * layer at all — gets a useful store canvas straight out of `translate`.
 *
 * Provenance is stamped the way the entity scaffold already stamps it
 * (TPL-1944): a relation with at least one declared FK is untagged
 * (confirmed), a relation made only of Soft FKs carries `[inferred]`. There is
 * deliberately no marker separating a translated edge from a hand-written one —
 * untagged means *someone confirmed it*, not *a tool wrote it*, and deleting
 * the single `[inferred]` tag is the promotion.
 */
interface TableEdge {
  /** Target `table` id. */
  to: string;
  hasExplicit: boolean;
}

function emitTableEdges(fromId: string, edges: readonly TableEdge[] | undefined): string[] {
  if (!edges || edges.length === 0) return [];
  return edges.map((e) => `    ${fromId} -> ${e.to}${e.hasExplicit ? "" : " [inferred]"}`);
}

function emitFlatTable(t: Table, edges?: readonly TableEdge[]): string[] {
  const id = toTableId(t.name);
  const edgeLines = emitTableEdges(id, edges);
  if (edgeLines.length === 0) return [`  table ${id} { label ${quoteString(t.name)} }`];
  return [`  table ${id} {`, `    label ${quoteString(t.name)}`, ...edgeLines, `  }`];
}

function emitAggregateTable(
  root: Table,
  children: { table: Table; reason: string }[],
  edges?: readonly TableEdge[],
): string[] {
  if (children.length === 0) return emitFlatTable(root, edges);
  const lines: string[] = [];
  lines.push(`  table ${toTableId(root.name)} {`);
  lines.push(`    label ${quoteString(root.name)}`);
  // Table names come from the schema and are not guaranteed to be safe inside a
  // raw `"""` block; let emitDescription pick a representable form (#2087).
  const descriptionBody = [
    "Tables:",
    `- ${root.name} (root)`,
    ...children.map((c) => `- ${c.table.name} — ${c.reason}`),
  ].join("\n");
  lines.push(...emitDescription(descriptionBody, "    ").split("\n"));
  lines.push(...emitTableEdges(toTableId(root.name), edges));
  lines.push(`  }`);
  return lines;
}

/**
 * Relations between aggregate roots, keyed `from root table name` → `to root
 * table name`, with a child's FKs rolled up to its root and deduplicated by
 * target (ADR-644 / ADR-1870 decision 7). A FK whose target folds into the
 * same root (child → root, self-FK) is internal to the aggregate and dropped,
 * so no self-edge is ever emitted. `hasExplicit` is the union over every FK
 * contributing to the pair: one declared `REFERENCES` confirms the relation.
 *
 * Shared by the entity scaffold and the recorded table edges so both read one
 * relation set — the table edge is the physical spelling of the same fact the
 * entity relation asserts, and the two must not disagree.
 */
function collectRootRelations(
  tables: Table[],
  parentOf: Map<string, string>,
): Map<string, Map<string, TableEdge>> {
  const rootByLower = new Map<string, string>();
  for (const t of tables) {
    rootByLower.set(t.name.toLowerCase(), parentOf.get(t.name) ?? t.name);
  }
  const relationsByRoot = new Map<string, Map<string, TableEdge>>();
  for (const t of tables) {
    const fromRoot = rootByLower.get(t.name.toLowerCase());
    if (fromRoot === undefined) continue;
    for (const fk of t.foreignKeys) {
      const toRoot = rootByLower.get(fk.refTable.toLowerCase());
      if (toRoot === undefined) continue; // FK to a table outside this schema
      if (toRoot === fromRoot) continue; // internal to the aggregate (child → root, self-FK)
      let byTarget = relationsByRoot.get(fromRoot);
      if (!byTarget) {
        byTarget = new Map<string, TableEdge>();
        relationsByRoot.set(fromRoot, byTarget);
      }
      const existing = byTarget.get(toRoot);
      if (existing) {
        existing.hasExplicit ||= fk.kind === "explicit";
      } else {
        byTarget.set(toRoot, { to: toRoot, hasExplicit: fk.kind === "explicit" });
      }
    }
  }
  return relationsByRoot;
}

/** The recorded `table -> table` edges of one root, sorted by target for a stable emission. */
function tableEdgesOf(
  relationsByRoot: Map<string, Map<string, TableEdge>>,
  rootName: string,
): TableEdge[] {
  return Array.from(relationsByRoot.get(rootName)?.values() ?? [])
    .map((rel) => ({ to: toTableId(rel.to), hasExplicit: rel.hasExplicit }))
    .sort((a, b) => a.to.localeCompare(b.to));
}

// ─── Entity scaffold emission ──────────────────────────────────────────────────

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

  // Root → root relations (a child's FKs rolled up, deduped by target); the
  // same set the recorded table edges are emitted from.
  const relationsByRoot = collectRootRelations(tables, parentOf);

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
    const relations = Array.from(relationsByRoot.get(t.name)?.values() ?? [])
      .map((rel) => ({ to: toEntityId(rel.to), hasExplicit: rel.hasExplicit }))
      .sort((a, b) => a.to.localeCompare(b.to));
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
  // A usecase directly under a service is rejected (`node-not-in-context`, an
  // error from `.krs language v2.0`, #2924), so the bindings go in one
  // provisional domain, the same scaffold `translate --from openapi` emits.
  lines.push(`  domain ${dbName}Data {`);
  lines.push("    // TODO: provisional domain from `translate --from db --emit-bindings`.");
  lines.push("    // Rename it, or split the usecases into the domains they belong to.");
  const opsLine = buildSqlOperationsLine(decorated);
  for (const t of rootTables) {
    const usecaseId = `Manage${toPascalCase(t.name)}`;
    const tableId = toTableId(t.name);
    lines.push(`    usecase ${usecaseId} {`);
    lines.push(`      resource ${dbName}.${tableId} {`);
    lines.push(`        operations ${opsLine}`);
    lines.push(`      }`);
    lines.push(`    }`);
  }
  lines.push("  }");
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
      // Flat tables still record their foreign keys as `table -> table` edges
      // (#2722): the ER view of a store is what this granularity is for, and a
      // Soft FK is as much a relation here as in the aggregate branch.
      augmentWithSoftForeignKeys(tables);
      const relationsByRoot = collectRootRelations(tables, new Map());
      for (const t of tables) {
        bodyLines.push(...emitFlatTable(t, tableEdgesOf(relationsByRoot, t.name)));
        rootTables.push(t);
      }
    } else {
      augmentWithSoftForeignKeys(tables);
      const { parentOf, reasonOf } = inferAggregates(tables);
      aggregateParentOf = parentOf;
      const relationsByRoot = collectRootRelations(tables, parentOf);
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
        bodyLines.push(...emitAggregateTable(t, children, tableEdgesOf(relationsByRoot, t.name)));
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
