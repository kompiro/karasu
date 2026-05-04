import {
  type CrudMatrix,
  type CrudMatrixCell,
  CRUD_VERB_ORDER,
  cellKey,
  formatCell,
} from "../view/crud-matrix-extract.js";
import { escapeXml } from "../renderer/svg-builder.js";

export interface MatrixSvgOptions {
  showTotals?: boolean;
  /** Pixel height per row. Default 28. */
  cellHeight?: number;
}

const DEFAULTS: Required<MatrixSvgOptions> = {
  showTotals: true,
  cellHeight: 28,
};

const PADDING = 12;
const CELL_PADDING_X = 16;
const MIN_DATA_COL_WIDTH = 64;
const MIN_LABEL_COL_WIDTH = 160;
const MIN_TOTAL_COL_WIDTH = 56;
const FONT_SIZE = 13;
const HEADER_FONT_SIZE = 13;
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const WRITE_FILL = "#FEF3C7";
const UNDECLARED_FILL = "#F3F4F6";
const BORDER = "#D1D5DB";
const HEADER_FILL = "#F9FAFB";
const TOTAL_FILL = "#EFF6FF";

/**
 * Estimate the rendered pixel width of `s` at `fontSize` px. Treats CJK and
 * other wide-glyph characters as full-width (≈ fontSize px) and ASCII as
 * half-width (≈ fontSize * 0.6). Good enough to size table columns so labels
 * fit horizontally without measuring in a real DOM.
 */
function estimateTextWidth(s: string, fontSize: number): number {
  let width = 0;
  for (const ch of s) {
    width += isWideChar(ch) ? fontSize : fontSize * 0.6;
  }
  return Math.ceil(width);
}

function isWideChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  // CJK Unified Ideographs, Hiragana, Katakana, Hangul, full-width forms,
  // and assorted CJK punctuation. Sufficient coverage for karasu users.
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3ffff)
  );
}

function cellFill(cell: CrudMatrixCell | undefined): string | undefined {
  if (!cell) return undefined;
  if (!cell.declared && cell.recognized.size === 0 && !cell.hasUnknown) return UNDECLARED_FILL;
  if (cell.isWrite) return WRITE_FILL;
  return undefined;
}

function columnHeader(col: { label: string; external: boolean }): string {
  return col.external ? `${col.label} [external]` : col.label;
}

export function renderMatrixAsSvg(matrix: CrudMatrix, options: MatrixSvgOptions = {}): string {
  const opts: Required<MatrixSvgOptions> = { ...DEFAULTS, ...options };
  const { cellHeight, showTotals } = opts;

  // Auto-size the leading usecase-label column to fit the longest label
  // (corner header included).
  const cornerLabel = "usecase \\ resource";
  const labelWidth = Math.max(
    MIN_LABEL_COL_WIDTH,
    estimateTextWidth(cornerLabel, HEADER_FONT_SIZE) + CELL_PADDING_X,
    ...matrix.rows.map((r) => estimateTextWidth(r.label, FONT_SIZE) + CELL_PADDING_X),
    ...CRUD_VERB_ORDER.map(
      (v) => estimateTextWidth(`Σ${v.charAt(0).toUpperCase()}`, HEADER_FONT_SIZE) + CELL_PADDING_X,
    ),
  );

  // Auto-size each resource column to fit its (possibly long, possibly CJK)
  // header. Cell contents are short (≤ ~5 chars), so the header always
  // dominates.
  const dataColWidths = matrix.columns.map((col) =>
    Math.max(
      MIN_DATA_COL_WIDTH,
      estimateTextWidth(columnHeader(col), HEADER_FONT_SIZE) + CELL_PADDING_X,
    ),
  );
  const totalColWidths = showTotals
    ? CRUD_VERB_ORDER.map((v) =>
        Math.max(
          MIN_TOTAL_COL_WIDTH,
          estimateTextWidth(`Σ${v.charAt(0).toUpperCase()}`, HEADER_FONT_SIZE) + CELL_PADDING_X,
        ),
      )
    : [];

  // Cumulative x positions for each column edge (start position).
  const dataColXs: number[] = [];
  let cursor = labelWidth;
  for (const w of dataColWidths) {
    dataColXs.push(cursor);
    cursor += w;
  }
  const totalColXs: number[] = [];
  for (const w of totalColWidths) {
    totalColXs.push(cursor);
    cursor += w;
  }
  const gridWidth = cursor;
  const headerHeight = cellHeight; // horizontal header — no rotation, single row

  const totalRowCount = showTotals ? CRUD_VERB_ORDER.length : 0;
  const gridHeight = headerHeight + matrix.rows.length * cellHeight + totalRowCount * cellHeight;

  const width = gridWidth + PADDING * 2;
  const height = gridHeight + PADDING * 2;

  const x0 = PADDING;
  const y0 = PADDING;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${FONT}">`,
  );
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF" />`);

  // Header row background
  parts.push(rect(x0, y0, gridWidth, headerHeight, HEADER_FILL));
  // Corner cell
  parts.push(text(cornerLabel, x0 + 8, y0 + headerHeight / 2 + 4, { weight: "bold" }));

  // Resource column headers (horizontal, centered)
  matrix.columns.forEach((col, i) => {
    const cx = x0 + dataColXs[i];
    const w = dataColWidths[i];
    parts.push(line(cx, y0, cx, y0 + gridHeight, BORDER));
    parts.push(
      text(columnHeader(col), cx + w / 2, y0 + headerHeight / 2 + 4, {
        align: "middle",
        weight: "bold",
      }),
    );
  });
  if (showTotals) {
    CRUD_VERB_ORDER.forEach((v, i) => {
      const cx = x0 + totalColXs[i];
      const w = totalColWidths[i];
      parts.push(line(cx, y0, cx, y0 + gridHeight, BORDER));
      parts.push(
        text(`Σ${v.charAt(0).toUpperCase()}`, cx + w / 2, y0 + headerHeight / 2 + 4, {
          align: "middle",
          weight: "bold",
        }),
      );
    });
  }

  // Data rows
  let cy = y0 + headerHeight;
  for (const row of matrix.rows) {
    parts.push(line(x0, cy, x0 + gridWidth, cy, BORDER));
    parts.push(text(row.label, x0 + 8, cy + cellHeight / 2 + 4));

    matrix.columns.forEach((col, i) => {
      const cx = x0 + dataColXs[i];
      const w = dataColWidths[i];
      const cell = matrix.cells.get(cellKey(row.usecaseId, col.resourceId));
      const fill = cellFill(cell);
      if (fill) parts.push(rect(cx, cy, w, cellHeight, fill));
      const label = formatCell(cell);
      if (label) {
        parts.push(
          text(label, cx + w / 2, cy + cellHeight / 2 + 4, {
            align: "middle",
            weight: cell?.isWrite ? "bold" : "normal",
          }),
        );
      }
    });
    if (showTotals) {
      const t = matrix.rowTotals.get(row.usecaseId);
      CRUD_VERB_ORDER.forEach((v, i) => {
        const cx = x0 + totalColXs[i];
        const w = totalColWidths[i];
        parts.push(rect(cx, cy, w, cellHeight, TOTAL_FILL));
        parts.push(
          text(String(t?.[v] ?? 0), cx + w / 2, cy + cellHeight / 2 + 4, { align: "middle" }),
        );
      });
    }
    cy += cellHeight;
  }

  // Bottom Σ rows
  if (showTotals) {
    for (const v of CRUD_VERB_ORDER) {
      parts.push(line(x0, cy, x0 + gridWidth, cy, BORDER));
      parts.push(rect(x0, cy, labelWidth, cellHeight, TOTAL_FILL));
      parts.push(
        text(`Σ${v.charAt(0).toUpperCase()}`, x0 + 8, cy + cellHeight / 2 + 4, { weight: "bold" }),
      );
      matrix.columns.forEach((col, i) => {
        const cx = x0 + dataColXs[i];
        const w = dataColWidths[i];
        const t = matrix.columnTotals.get(col.resourceId);
        parts.push(rect(cx, cy, w, cellHeight, TOTAL_FILL));
        parts.push(
          text(String(t?.[v] ?? 0), cx + w / 2, cy + cellHeight / 2 + 4, { align: "middle" }),
        );
      });
      // Empty corner under row-totals block
      totalColXs.forEach((tx, i) => {
        parts.push(rect(x0 + tx, cy, totalColWidths[i], cellHeight, TOTAL_FILL));
      });
      cy += cellHeight;
    }
  }

  // Outer border
  parts.push(
    `<rect x="${x0}" y="${y0}" width="${gridWidth}" height="${gridHeight}" fill="none" stroke="${BORDER}" />`,
  );

  // Footnotes
  const notes: string[] = [];
  if (matrix.omitted.rows > 0) notes.push(`omitted ${matrix.omitted.rows} empty row(s)`);
  if (matrix.omitted.columns > 0) notes.push(`omitted ${matrix.omitted.columns} empty column(s)`);
  const unknown = collectUnknownVerbs(matrix);
  if (unknown.length > 0) notes.push(`unrecognized verbs (?): ${unknown.join(", ")}`);

  parts.push("</svg>");

  if (notes.length > 0) {
    const svg = parts.join("");
    const noteY = y0 + gridHeight + 18;
    const totalHeight = noteY + notes.length * 16 + PADDING;
    return svg
      .replace(`viewBox="0 0 ${width} ${height}"`, `viewBox="0 0 ${width} ${totalHeight}"`)
      .replace(`height="${height}"`, `height="${totalHeight}"`)
      .replace(
        "</svg>",
        notes
          .map(
            (n, i) =>
              `<text x="${x0}" y="${noteY + i * 16}" font-size="12" fill="#6B7280">${escapeXml(n)}</text>`,
          )
          .join("") + "</svg>",
      );
  }
  return parts.join("");
}

function collectUnknownVerbs(matrix: CrudMatrix): string[] {
  const set = new Set<string>();
  for (const cell of matrix.cells.values()) {
    for (const v of cell.unknownVerbs) set.add(v);
  }
  return Array.from(set).sort();
}

function rect(x: number, y: number, w: number, h: number, fill: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" />`;
}

function line(x1: number, y1: number, x2: number, y2: number, stroke: string): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" />`;
}

function text(
  value: string,
  x: number,
  y: number,
  opts: { align?: "start" | "middle"; weight?: "normal" | "bold" } = {},
): string {
  const anchor = opts.align === "middle" ? "middle" : "start";
  const weight = opts.weight === "bold" ? ' font-weight="bold"' : "";
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="13"${weight} fill="#111827">${escapeXml(value)}</text>`;
}
