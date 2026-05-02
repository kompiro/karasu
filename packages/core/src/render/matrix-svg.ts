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
  /** Pixel width per resource column. Default 80. */
  cellWidth?: number;
  /** Pixel height per row. Default 28. */
  cellHeight?: number;
  /** Pixel width of the leading usecase-label column. Default 200. */
  labelWidth?: number;
}

const DEFAULTS: Required<MatrixSvgOptions> = {
  showTotals: true,
  cellWidth: 80,
  cellHeight: 28,
  labelWidth: 200,
};

const HEADER_HEIGHT = 60;
const PADDING = 12;
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const WRITE_FILL = "#FEF3C7";
const UNDECLARED_FILL = "#F3F4F6";
const BORDER = "#D1D5DB";
const HEADER_FILL = "#F9FAFB";
const TOTAL_FILL = "#EFF6FF";

function cellFill(cell: CrudMatrixCell | undefined): string | undefined {
  if (!cell) return undefined;
  if (!cell.declared && cell.recognized.size === 0 && !cell.hasUnknown) return UNDECLARED_FILL;
  if (cell.isWrite) return WRITE_FILL;
  return undefined;
}

export function renderMatrixAsSvg(matrix: CrudMatrix, options: MatrixSvgOptions = {}): string {
  const opts: Required<MatrixSvgOptions> = { ...DEFAULTS, ...options };
  const { cellWidth, cellHeight, labelWidth, showTotals } = opts;

  const totalCols = CRUD_VERB_ORDER.length;
  const dataColCount = matrix.columns.length;
  const totalRowCount = showTotals ? CRUD_VERB_ORDER.length : 0;

  const gridWidth =
    labelWidth + dataColCount * cellWidth + (showTotals ? totalCols * cellWidth : 0);
  const gridHeight = HEADER_HEIGHT + matrix.rows.length * cellHeight + totalRowCount * cellHeight;

  const width = gridWidth + PADDING * 2;
  const height = gridHeight + PADDING * 2;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${FONT}">`,
  );

  // Background
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF" />`);

  const x0 = PADDING;
  const y0 = PADDING;

  // Header row (column labels)
  parts.push(rect(x0, y0, gridWidth, HEADER_HEIGHT, HEADER_FILL));
  // Top-left corner
  parts.push(text("usecase \\ resource", x0 + 8, y0 + HEADER_HEIGHT - 10, { weight: "bold" }));

  let cx = x0 + labelWidth;
  for (const col of matrix.columns) {
    parts.push(line(cx, y0, cx, y0 + gridHeight, BORDER));
    parts.push(
      verticalText(
        col.external ? `${col.label} [external]` : col.label,
        cx + cellWidth / 2,
        y0 + HEADER_HEIGHT - 6,
      ),
    );
    cx += cellWidth;
  }
  if (showTotals) {
    for (const v of CRUD_VERB_ORDER) {
      parts.push(line(cx, y0, cx, y0 + gridHeight, BORDER));
      parts.push(
        text(`Σ${v.charAt(0).toUpperCase()}`, cx + cellWidth / 2, y0 + HEADER_HEIGHT - 10, {
          align: "middle",
          weight: "bold",
        }),
      );
      cx += cellWidth;
    }
  }

  // Data rows
  let cy = y0 + HEADER_HEIGHT;
  for (const row of matrix.rows) {
    parts.push(line(x0, cy, x0 + gridWidth, cy, BORDER));
    parts.push(text(row.label, x0 + 8, cy + cellHeight / 2 + 4));
    let dx = x0 + labelWidth;
    for (const col of matrix.columns) {
      const cell = matrix.cells.get(cellKey(row.usecaseId, col.resourceId));
      const fill = cellFill(cell);
      if (fill) parts.push(rect(dx, cy, cellWidth, cellHeight, fill));
      const label = formatCell(cell);
      if (label) {
        parts.push(
          text(label, dx + cellWidth / 2, cy + cellHeight / 2 + 4, {
            align: "middle",
            weight: cell?.isWrite ? "bold" : "normal",
          }),
        );
      }
      dx += cellWidth;
    }
    if (showTotals) {
      const t = matrix.rowTotals.get(row.usecaseId);
      for (const v of CRUD_VERB_ORDER) {
        parts.push(rect(dx, cy, cellWidth, cellHeight, TOTAL_FILL));
        parts.push(
          text(String(t?.[v] ?? 0), dx + cellWidth / 2, cy + cellHeight / 2 + 4, {
            align: "middle",
          }),
        );
        dx += cellWidth;
      }
    }
    cy += cellHeight;
  }

  // Total rows (bottom)
  if (showTotals) {
    for (const v of CRUD_VERB_ORDER) {
      parts.push(line(x0, cy, x0 + gridWidth, cy, BORDER));
      parts.push(rect(x0, cy, labelWidth, cellHeight, TOTAL_FILL));
      parts.push(
        text(`Σ${v.charAt(0).toUpperCase()}`, x0 + 8, cy + cellHeight / 2 + 4, { weight: "bold" }),
      );
      let dx = x0 + labelWidth;
      for (const col of matrix.columns) {
        const t = matrix.columnTotals.get(col.resourceId);
        parts.push(rect(dx, cy, cellWidth, cellHeight, TOTAL_FILL));
        parts.push(
          text(String(t?.[v] ?? 0), dx + cellWidth / 2, cy + cellHeight / 2 + 4, {
            align: "middle",
          }),
        );
        dx += cellWidth;
      }
      // Empty corner cells under the row-totals block
      for (let i = 0; i < CRUD_VERB_ORDER.length; i++) {
        parts.push(rect(dx, cy, cellWidth, cellHeight, TOTAL_FILL));
        dx += cellWidth;
      }
      cy += cellHeight;
    }
  }

  // Outer border
  parts.push(
    `<rect x="${x0}" y="${y0}" width="${gridWidth}" height="${gridHeight}" fill="none" stroke="${BORDER}" />`,
  );

  // Footnotes (omitted / unknown verbs)
  const notes: string[] = [];
  if (matrix.omitted.rows > 0) notes.push(`omitted ${matrix.omitted.rows} empty row(s)`);
  if (matrix.omitted.columns > 0) notes.push(`omitted ${matrix.omitted.columns} empty column(s)`);
  const unknown = collectUnknownVerbs(matrix);
  if (unknown.length > 0) notes.push(`unrecognized verbs (?): ${unknown.join(", ")}`);

  parts.push("</svg>");

  // Wrap with notes section above the SVG closing if present.
  if (notes.length > 0) {
    // Replace the plain </svg> with footnote text inserted before close.
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

function verticalText(value: string, x: number, y: number): string {
  return `<text x="${x}" y="${y}" text-anchor="end" font-size="12" fill="#111827" transform="rotate(-30 ${x} ${y})">${escapeXml(value)}</text>`;
}
