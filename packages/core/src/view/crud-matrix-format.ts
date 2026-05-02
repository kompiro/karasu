import {
  type CrudMatrix,
  type CrudTally,
  CRUD_VERB_ORDER,
  cellKey,
  formatCell,
} from "./crud-matrix-extract.js";

export interface CrudMatrixFormatOptions {
  showTotals?: boolean;
}

const DEFAULT_FORMAT_OPTS: Required<CrudMatrixFormatOptions> = { showTotals: true };

function tallyHeader(): string[] {
  return CRUD_VERB_ORDER.map((v) => `Σ${v.charAt(0).toUpperCase()}`);
}

function tallyRow(t: CrudTally): string[] {
  return [String(t.create), String(t.read), String(t.update), String(t.delete)];
}

function emptyTallyRow(): string[] {
  return ["", "", "", ""];
}

function unknownVerbsFootnote(matrix: CrudMatrix): string[] {
  const set = new Set<string>();
  for (const cell of matrix.cells.values()) {
    for (const v of cell.unknownVerbs) set.add(v);
  }
  if (set.size === 0) return [];
  return [`unrecognized verbs (?): ${Array.from(set).sort().join(", ")}`];
}

function omittedFootnote(matrix: CrudMatrix): string[] {
  const lines: string[] = [];
  if (matrix.omitted.rows > 0) lines.push(`omitted ${matrix.omitted.rows} empty row(s)`);
  if (matrix.omitted.columns > 0) lines.push(`omitted ${matrix.omitted.columns} empty column(s)`);
  return lines;
}

export function formatMatrixAsMarkdown(
  matrix: CrudMatrix,
  options: CrudMatrixFormatOptions = {},
): string {
  const opts = { ...DEFAULT_FORMAT_OPTS, ...options };
  if (matrix.rows.length === 0 && matrix.columns.length === 0) {
    return "_(empty matrix)_\n";
  }

  const headerCells = ["usecase \\ resource", ...matrix.columns.map((c) => labelWithFlags(c))];
  if (opts.showTotals) headerCells.push(...tallyHeader());
  const headerSep = headerCells.map(() => "---");

  const lines: string[] = [];
  lines.push(`| ${headerCells.join(" | ")} |`);
  lines.push(`| ${headerSep.join(" | ")} |`);

  for (const row of matrix.rows) {
    const cells: string[] = [row.label];
    for (const col of matrix.columns) {
      const cell = matrix.cells.get(cellKey(row.usecaseId, col.resourceId));
      cells.push(formatCell(cell));
    }
    if (opts.showTotals) {
      const t = matrix.rowTotals.get(row.usecaseId);
      cells.push(...(t ? tallyRow(t) : emptyTallyRow()));
    }
    lines.push(`| ${cells.join(" | ")} |`);
  }

  if (opts.showTotals && matrix.columns.length > 0) {
    for (const verb of CRUD_VERB_ORDER) {
      const cells: string[] = [`Σ${verb.charAt(0).toUpperCase()}`];
      for (const col of matrix.columns) {
        const t = matrix.columnTotals.get(col.resourceId);
        cells.push(t ? String(t[verb]) : "");
      }
      cells.push(...emptyTallyRow());
      lines.push(`| ${cells.join(" | ")} |`);
    }
  }

  const footnotes = [...omittedFootnote(matrix), ...unknownVerbsFootnote(matrix)];
  if (footnotes.length > 0) {
    lines.push("");
    for (const f of footnotes) lines.push(`> ${f}`);
  }

  return lines.join("\n") + "\n";
}

export function formatMatrixAsCsv(
  matrix: CrudMatrix,
  options: CrudMatrixFormatOptions = {},
): string {
  const opts = { ...DEFAULT_FORMAT_OPTS, ...options };
  const lines: string[] = [];
  const header = ["usecase", "service", ...matrix.columns.map((c) => labelWithFlags(c))];
  if (opts.showTotals) header.push(...tallyHeader());
  if (matrix.cells.size > 0) header.push("unknown_verbs");
  lines.push(header.map(csvEscape).join(","));

  for (const row of matrix.rows) {
    const cells: string[] = [row.label, row.serviceLabel ?? ""];
    const unknownInRow = new Set<string>();
    for (const col of matrix.columns) {
      const cell = matrix.cells.get(cellKey(row.usecaseId, col.resourceId));
      cells.push(formatCell(cell));
      if (cell) for (const v of cell.unknownVerbs) unknownInRow.add(v);
    }
    if (opts.showTotals) {
      const t = matrix.rowTotals.get(row.usecaseId);
      cells.push(...(t ? tallyRow(t) : emptyTallyRow()));
    }
    if (matrix.cells.size > 0) cells.push(Array.from(unknownInRow).sort().join("|"));
    lines.push(cells.map(csvEscape).join(","));
  }

  if (opts.showTotals && matrix.columns.length > 0) {
    for (const verb of CRUD_VERB_ORDER) {
      const cells: string[] = [`Σ${verb.charAt(0).toUpperCase()}`, ""];
      for (const col of matrix.columns) {
        const t = matrix.columnTotals.get(col.resourceId);
        cells.push(t ? String(t[verb]) : "");
      }
      cells.push(...emptyTallyRow());
      if (matrix.cells.size > 0) cells.push("");
      lines.push(cells.map(csvEscape).join(","));
    }
  }

  return lines.join("\n") + "\n";
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function labelWithFlags(col: { label: string; external: boolean }): string {
  return col.external ? `${col.label} [external]` : col.label;
}
