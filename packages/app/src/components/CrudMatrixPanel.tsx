import { useMemo, useState, type ReactElement } from "react";
import {
  extractCrudMatrix,
  cellKey,
  formatCell,
  CRUD_VERB_ORDER,
  type SystemNode,
  type CrudMatrixOptions,
  type InfraKind,
} from "@karasu-tools/core";

interface CrudMatrixPanelProps {
  systems: readonly SystemNode[];
}

const INFRA_OPTIONS: readonly InfraKind[] = ["database", "queue", "storage"];

/**
 * Lightweight CRUD matrix panel: HTML table with service / infra dropdown
 * filters. Designed as a standalone surface — full AppShell / toolbar
 * integration is tracked separately.
 */
export function CrudMatrixPanel({ systems }: CrudMatrixPanelProps): ReactElement {
  const [serviceFilter, setServiceFilter] = useState<string>("");
  const [infraFilter, setInfraFilter] = useState<string>("");

  const services = useMemo(() => collectServices(systems), [systems]);

  const matrix = useMemo(() => {
    const opts: CrudMatrixOptions = {};
    if (serviceFilter) opts.serviceFilter = [serviceFilter];
    if (infraFilter) opts.infraFilter = [infraFilter as InfraKind];
    return extractCrudMatrix(systems, opts);
  }, [systems, serviceFilter, infraFilter]);

  return (
    <div className="crud-matrix-panel">
      <div className="crud-matrix-toolbar">
        <label>
          Service:{" "}
          <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
            <option value="">All</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Infra:{" "}
          <select value={infraFilter} onChange={(e) => setInfraFilter(e.target.value)}>
            <option value="">All</option>
            {INFRA_OPTIONS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
      </div>
      <table className="crud-matrix-table">
        <thead>
          <tr>
            <th>usecase \ resource</th>
            {matrix.columns.map((col) => (
              <th key={col.resourceId}>
                {col.label}
                {col.external ? " [external]" : ""}
              </th>
            ))}
            {CRUD_VERB_ORDER.map((v) => (
              <th key={`hdr-${v}`}>Σ{v.charAt(0).toUpperCase()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => {
            const tally = matrix.rowTotals.get(row.usecaseId);
            return (
              <tr key={row.usecaseId}>
                <td>{row.label}</td>
                {matrix.columns.map((col) => {
                  const cell = matrix.cells.get(cellKey(row.usecaseId, col.resourceId));
                  const text = formatCell(cell);
                  const className = cell?.isWrite
                    ? "crud-matrix-cell crud-matrix-cell--write"
                    : "crud-matrix-cell";
                  return (
                    <td key={col.resourceId} className={className}>
                      {text}
                    </td>
                  );
                })}
                {CRUD_VERB_ORDER.map((v) => (
                  <td key={`row-${v}`} className="crud-matrix-total">
                    {tally?.[v] ?? 0}
                  </td>
                ))}
              </tr>
            );
          })}
          {matrix.columns.length > 0 &&
            CRUD_VERB_ORDER.map((v) => (
              <tr key={`tot-${v}`} className="crud-matrix-total-row">
                <td>Σ{v.charAt(0).toUpperCase()}</td>
                {matrix.columns.map((col) => {
                  const t = matrix.columnTotals.get(col.resourceId);
                  return <td key={col.resourceId}>{t?.[v] ?? 0}</td>;
                })}
                {CRUD_VERB_ORDER.map((vv) => (
                  <td key={`pad-${vv}`} />
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

interface ServiceSummary {
  id: string;
  label: string;
}

function collectServices(systems: readonly SystemNode[]): ServiceSummary[] {
  const seen = new Map<string, ServiceSummary>();
  for (const sys of systems) {
    for (const child of sys.children) {
      if (child.kind === "service" && !seen.has(child.id)) {
        seen.set(child.id, { id: child.id, label: child.label ?? child.id });
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
}
