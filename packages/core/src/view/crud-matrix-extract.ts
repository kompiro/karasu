import type { KrsNode, SystemNode, ResourceNode } from "../types/ast.js";
import {
  isWriteOperation,
  isRecognizedResourceOperation,
  type ResourceOperation,
} from "../spec/operations.js";

export type CrudVerb = "create" | "read" | "update" | "delete";
export type InfraKind = "database" | "queue" | "storage";

const INFRA_KINDS: ReadonlySet<InfraKind> = new Set(["database", "queue", "storage"]);
const CRUD_VERBS: readonly CrudVerb[] = ["create", "read", "update", "delete"];

export interface CrudMatrixRow {
  usecaseId: string;
  label: string;
  serviceId: string | undefined;
  serviceLabel: string | undefined;
}

export interface CrudMatrixColumn {
  resourceId: string;
  label: string;
  infraKind: InfraKind | undefined;
  external: boolean;
}

export interface CrudMatrixCell {
  recognized: ReadonlySet<CrudVerb>;
  hasUnknown: boolean;
  unknownVerbs: readonly string[];
  declared: boolean;
  isWrite: boolean;
}

export interface CrudTally {
  create: number;
  read: number;
  update: number;
  delete: number;
}

export interface CrudMatrixOptions {
  serviceFilter?: readonly string[];
  infraFilter?: readonly InfraKind[];
  externalOnly?: boolean;
  excludeExternal?: boolean;
  writesOnly?: boolean;
  /** When true, drop rows / columns whose every cell is empty. Default false. */
  omitEmpty?: boolean;
}

export interface CrudMatrix {
  rows: CrudMatrixRow[];
  columns: CrudMatrixColumn[];
  cells: Map<string, CrudMatrixCell>;
  rowTotals: Map<string, CrudTally>;
  columnTotals: Map<string, CrudTally>;
  omitted: { rows: number; columns: number };
}

export function cellKey(rowId: string, columnId: string): string {
  return `${rowId}::${columnId}`;
}

function emptyTally(): CrudTally {
  return { create: 0, read: 0, update: 0, delete: 0 };
}

function tallyAdd(into: CrudTally, verbs: ReadonlySet<CrudVerb>): void {
  for (const v of verbs) into[v] += 1;
}

interface UsecaseRecord {
  usecase: KrsNode;
  service: KrsNode | undefined;
  resources: ResourceNode[];
}

function collectUsecases(systems: readonly SystemNode[]): UsecaseRecord[] {
  const out: UsecaseRecord[] = [];
  function walk(node: KrsNode, service: KrsNode | undefined): void {
    const nextService = node.kind === "service" ? node : service;
    if (node.kind === "usecase") {
      const resources = node.children.filter((c): c is ResourceNode => c.kind === "resource");
      out.push({ usecase: node, service: nextService, resources });
      return;
    }
    for (const child of node.children) walk(child, nextService);
  }
  for (const sys of systems) {
    for (const child of sys.children) walk(child, undefined);
  }
  return out;
}

interface InfraColumnSeed {
  resourceId: string;
  label: string;
  infraKind: InfraKind;
}

function buildInfraIndex(systems: readonly SystemNode[]): Map<string, InfraColumnSeed> {
  const map = new Map<string, InfraColumnSeed>();
  for (const sys of systems) {
    for (const node of sys.children) {
      if (!INFRA_KINDS.has(node.kind as InfraKind)) continue;
      for (const sub of node.children) {
        const id = `${node.id}.${sub.id}`;
        map.set(id, {
          resourceId: id,
          label: sub.label ?? sub.id,
          infraKind: node.kind as InfraKind,
        });
      }
    }
  }
  return map;
}

interface VerbBuckets {
  recognized: Set<CrudVerb>;
  unknown: string[];
}

function classifyVerbs(operations: readonly ResourceOperation[] | undefined): VerbBuckets {
  const recognized = new Set<CrudVerb>();
  const unknown: string[] = [];
  if (!operations) return { recognized, unknown };
  for (const op of operations) {
    if (op.decoratedAs && op.decoratedAs.length > 0) {
      // Decoration wins: contribute the mapped CRUD verbs, no `?` suffix.
      for (const v of op.decoratedAs) recognized.add(v);
      continue;
    }
    if (isRecognizedResourceOperation(op.verb)) {
      recognized.add(op.verb);
    } else {
      unknown.push(op.verb);
    }
  }
  return { recognized, unknown };
}

export function extractCrudMatrix(
  systems: readonly SystemNode[],
  options: CrudMatrixOptions = {},
): CrudMatrix {
  const records = collectUsecases(systems);
  const infraIndex = buildInfraIndex(systems);

  // Determine column set: all infra sub-resources, plus any usecase-referenced
  // resources that do not resolve to infra (e.g. inline external resources).
  const columnMap = new Map<string, CrudMatrixColumn>();
  for (const seed of infraIndex.values()) {
    columnMap.set(seed.resourceId, {
      resourceId: seed.resourceId,
      label: seed.label,
      infraKind: seed.infraKind,
      external: false,
    });
  }
  for (const rec of records) {
    for (const res of rec.resources) {
      const seed = infraIndex.get(res.id);
      const external = res.tags.includes("external");
      const existing = columnMap.get(res.id);
      if (existing) {
        if (external && !existing.external) {
          columnMap.set(res.id, { ...existing, external: true });
        }
      } else {
        columnMap.set(res.id, {
          resourceId: res.id,
          label: seed?.label ?? res.label ?? res.id,
          infraKind: seed?.infraKind,
          external,
        });
      }
    }
  }

  // Apply column-side filters.
  const columnFiltered = Array.from(columnMap.values()).filter((col) => {
    if (options.externalOnly && !col.external) return false;
    if (options.excludeExternal && col.external) return false;
    if (options.infraFilter && options.infraFilter.length > 0) {
      if (!col.infraKind || !options.infraFilter.includes(col.infraKind)) return false;
    }
    return true;
  });
  const allowedColumnIds = new Set(columnFiltered.map((c) => c.resourceId));

  // Build cells from records.
  const cells = new Map<string, CrudMatrixCell>();
  const rowMap = new Map<string, CrudMatrixRow>();
  for (const rec of records) {
    const serviceId = rec.service?.id;
    if (
      options.serviceFilter &&
      options.serviceFilter.length > 0 &&
      (!serviceId || !options.serviceFilter.includes(serviceId))
    ) {
      continue;
    }

    rowMap.set(rec.usecase.id, {
      usecaseId: rec.usecase.id,
      label: rec.usecase.label ?? rec.usecase.id,
      serviceId,
      serviceLabel: rec.service?.label ?? rec.service?.id,
    });

    for (const res of rec.resources) {
      if (!allowedColumnIds.has(res.id)) continue;
      const { recognized, unknown } = classifyVerbs(res.properties.operations);
      const declared = (res.properties.operations?.length ?? 0) > 0;
      const isWrite = isWriteOperation(res.properties.operations);

      const key = cellKey(rec.usecase.id, res.id);
      const prior = cells.get(key);
      if (prior) {
        cells.set(key, {
          recognized: new Set([...prior.recognized, ...recognized]),
          hasUnknown: prior.hasUnknown || unknown.length > 0,
          unknownVerbs: dedup([...prior.unknownVerbs, ...unknown]),
          declared: prior.declared || declared,
          isWrite: prior.isWrite || isWrite,
        });
      } else {
        cells.set(key, {
          recognized,
          hasUnknown: unknown.length > 0,
          unknownVerbs: dedup(unknown),
          declared,
          isWrite,
        });
      }
    }
  }

  // writesOnly: drop rows whose only cells are read-only, drop columns receiving no writes.
  if (options.writesOnly) {
    for (const [key, cell] of cells) {
      if (!cell.isWrite) cells.delete(key);
    }
  }

  let rows = Array.from(rowMap.values()).sort(compareRows);
  let columns = columnFiltered.sort(compareColumns);

  // writesOnly: prune rows/columns left with no cells
  if (options.writesOnly) {
    rows = rows.filter((r) => columns.some((c) => cells.has(cellKey(r.usecaseId, c.resourceId))));
    columns = columns.filter((c) =>
      rows.some((r) => cells.has(cellKey(r.usecaseId, c.resourceId))),
    );
  }

  const rowTotals = new Map<string, CrudTally>();
  const columnTotals = new Map<string, CrudTally>();
  for (const r of rows) rowTotals.set(r.usecaseId, emptyTally());
  for (const c of columns) columnTotals.set(c.resourceId, emptyTally());

  for (const r of rows) {
    for (const c of columns) {
      const cell = cells.get(cellKey(r.usecaseId, c.resourceId));
      if (!cell) continue;
      tallyAdd(rowTotals.get(r.usecaseId)!, cell.recognized);
      tallyAdd(columnTotals.get(c.resourceId)!, cell.recognized);
    }
  }

  let omitted = { rows: 0, columns: 0 };
  if (options.omitEmpty) {
    const hasAnyCell = (rowId: string, colId: string): boolean => cells.has(cellKey(rowId, colId));
    const keptRows = rows.filter((r) => columns.some((c) => hasAnyCell(r.usecaseId, c.resourceId)));
    const keptCols = columns.filter((c) => rows.some((r) => hasAnyCell(r.usecaseId, c.resourceId)));
    omitted = { rows: rows.length - keptRows.length, columns: columns.length - keptCols.length };
    rows = keptRows;
    columns = keptCols;
  }

  return { rows, columns, cells, rowTotals, columnTotals, omitted };
}

function dedup(arr: readonly string[]): string[] {
  return Array.from(new Set(arr));
}

function compareRows(a: CrudMatrixRow, b: CrudMatrixRow): number {
  const sa = a.serviceLabel ?? a.serviceId ?? "";
  const sb = b.serviceLabel ?? b.serviceId ?? "";
  if (sa !== sb) return sa.localeCompare(sb);
  return a.label.localeCompare(b.label);
}

const INFRA_ORDER: Record<InfraKind, number> = { database: 0, queue: 1, storage: 2 };

function compareColumns(a: CrudMatrixColumn, b: CrudMatrixColumn): number {
  const oa = a.infraKind ? INFRA_ORDER[a.infraKind] : 99;
  const ob = b.infraKind ? INFRA_ORDER[b.infraKind] : 99;
  if (oa !== ob) return oa - ob;
  return a.label.localeCompare(b.label);
}

/**
 * Render a single cell to the canonical short string used by md / svg / panel.
 * Returns "" for empty (no relation), "?" for related-but-undeclared, otherwise
 * concatenated capital initials in CRUD order with "?" suffix when unknown
 * verbs are present.
 */
export function formatCell(cell: CrudMatrixCell | undefined): string {
  if (!cell) return "";
  if (!cell.declared && cell.recognized.size === 0 && !cell.hasUnknown) return "?";
  let out = "";
  for (const v of CRUD_VERBS) {
    if (cell.recognized.has(v)) out += v.charAt(0).toUpperCase();
  }
  if (cell.hasUnknown) out += "?";
  return out;
}

export const CRUD_VERB_ORDER = CRUD_VERBS;
