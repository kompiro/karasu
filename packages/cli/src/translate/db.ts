import { basename, extname } from "node:path";
import type { Translator, TranslatorContext } from "./translator.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPascalCase(str: string): string {
  return str
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch: string) => ch.toUpperCase())
    .replace(/^(.)/, (ch: string) => ch.toUpperCase());
}

function toTableId(tableName: string): string {
  return `${toPascalCase(tableName)}Table`;
}

function deriveDbName(inputPath: string): string {
  const name = basename(inputPath, extname(inputPath));
  return toPascalCase(name);
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

// ─── Translator ───────────────────────────────────────────────────────────────

export class DbTranslator implements Translator {
  async translate(input: string, context: TranslatorContext): Promise<string> {
    const dbName = context.database ?? deriveDbName(context.inputPath);
    const tables = parseTables(input);
    const granularity = context.granularity ?? "aggregate";

    const bodyLines: string[] = [];

    if (granularity === "table" || tables.length === 0) {
      for (const t of tables) bodyLines.push(emitFlatTable(t));
    } else {
      augmentWithSoftForeignKeys(tables);
      const { parentOf, reasonOf } = inferAggregates(tables);
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
      }
    }

    const lines: string[] = [`database ${dbName} {`, ...bodyLines, "}", ""];
    return lines.join("\n");
  }
}
