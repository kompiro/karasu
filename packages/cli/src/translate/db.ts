import { basename, extname } from "node:path";
import type { Translator, TranslatorContext } from "./translator.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert snake_case or any identifier to PascalCase. */
function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch: string) => ch.toUpperCase())
    .replace(/^(.)/, (ch: string) => ch.toUpperCase());
}

/** Derive a table node id from a SQL table name. e.g. "order_items" → "OrderItemTable" */
function toTableId(tableName: string): string {
  return `${toPascalCase(tableName)}Table`;
}

/** Derive a database name from the input file path. e.g. "order_db.sql" → "OrderDb" */
function deriveDbName(inputPath: string): string {
  const name = basename(inputPath, extname(inputPath));
  return toPascalCase(name);
}

/**
 * Extract CREATE TABLE names from SQL DDL.
 * Handles:
 *   CREATE TABLE tablename (...)
 *   CREATE TABLE IF NOT EXISTS tablename (...)
 *   CREATE TABLE "tablename" (...)
 *   CREATE TABLE `tablename` (...)
 */
function extractTableNames(sql: string): string[] {
  const tableNames: string[] = [];
  // Match CREATE TABLE [IF NOT EXISTS] <name>
  const pattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql)) !== null) {
    tableNames.push(match[1]);
  }
  return tableNames;
}

// ─── Translator ───────────────────────────────────────────────────────────────

export class DbTranslator implements Translator {
  async translate(input: string, context: TranslatorContext): Promise<string> {
    const dbName = context.database ?? deriveDbName(context.inputPath);
    const tableNames = extractTableNames(input);

    const lines: string[] = [`database ${dbName} {`];

    for (const tableName of tableNames) {
      const tableId = toTableId(tableName);
      lines.push(`  table ${tableId} { label "${tableName}" }`);
    }

    lines.push("}");
    lines.push("");

    return lines.join("\n");
  }
}
