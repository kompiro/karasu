import { basename, extname } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Translator, TranslatorContext } from "./translator.js";

// ─── OpenAPI types (minimal subset) ──────────────────────────────────────────

interface OpenApiOperation {
  operationId?: string;
  tags?: string[];
  summary?: string;
}

interface OpenApiPathItem {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  patch?: OpenApiOperation;
  delete?: OpenApiOperation;
  head?: OpenApiOperation;
  options?: OpenApiOperation;
  trace?: OpenApiOperation;
}

interface OpenApiDoc {
  openapi?: string;
  swagger?: string;
  info?: { title?: string };
  paths?: Record<string, OpenApiPathItem>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

const PREFIX_SEGMENTS = new Set(["api"]);
const VERSION_SEGMENT = /^v\d+$/i;

/** Convert a string to PascalCase identifier. */
function toPascalCase(str: string): string {
  return str
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
    .replace(/^(.)/, (ch) => ch.toUpperCase());
}

/**
 * Derive a usecase identifier when operationId is absent.
 * e.g. GET /orders/{id}/cancel → GetOrdersIdCancel
 */
function deriveUsecaseId(method: string, path: string): string {
  const methodPart = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
  const pathPart = path
    .split("/")
    .filter(Boolean)
    .map((seg) => toPascalCase(seg.replace(/[{}]/g, "")))
    .join("");
  return `${methodPart}${pathPart}`;
}

/** Derive a service name from info.title. */
function deriveServiceName(title: string): string {
  return toPascalCase(title);
}

/** Derive a service name from the input file path when info.title is absent. */
function deriveServiceNameFromPath(inputPath: string): string {
  const name = basename(inputPath, extname(inputPath));
  return toPascalCase(name);
}

/**
 * Infer the resource name from an OpenAPI path.
 * Drops parameter segments, skips leading "api" or version segments,
 * and returns the first remaining segment. Returns null when nothing is left.
 */
function inferResource(path: string): string | null {
  const segments = path
    .split("/")
    .map((seg) => seg.trim())
    .filter((seg) => seg.length > 0 && !(seg.startsWith("{") && seg.endsWith("}")));

  for (const seg of segments) {
    if (PREFIX_SEGMENTS.has(seg.toLowerCase()) || VERSION_SEGMENT.test(seg)) continue;
    return seg;
  }
  return null;
}

interface CollectedOperation {
  method: string;
  path: string;
  operation: OpenApiOperation;
}

function collectOperations(paths: Record<string, OpenApiPathItem>): CollectedOperation[] {
  const collected: CollectedOperation[] = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method as HttpMethod];
      if (!operation) continue;
      collected.push({ method, path, operation });
    }
  }
  return collected;
}

function emitOperationUsecase(op: CollectedOperation): string {
  const usecaseId = op.operation.operationId
    ? toPascalCase(op.operation.operationId)
    : deriveUsecaseId(op.method, op.path);
  const label = `${op.method.toUpperCase()} ${op.path}`;
  return `  usecase ${usecaseId} { label "${label}" }`;
}

interface ResourceGroup {
  /** First-seen casing of the resource segment, used for the label. */
  displayName: string;
  ops: CollectedOperation[];
}

/** Format the resource segment for the label, replacing separators with spaces. */
function formatResourceLabel(resource: string): string {
  return resource.replace(/[-_]+/g, " ");
}

function emitResourceUsecases(operations: CollectedOperation[]): string[] {
  // Map key is lowercased so that paths differing only in case (`/Orders` vs
  // `/orders`) collapse into one group — toPascalCase would otherwise produce
  // duplicate `ManageOrders` ids in the same service block.
  const groups = new Map<string, ResourceGroup>();
  const ungrouped: CollectedOperation[] = [];

  for (const op of operations) {
    const resource = inferResource(op.path);
    if (resource === null) {
      ungrouped.push(op);
      continue;
    }
    const key = resource.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.ops.push(op);
    } else {
      groups.set(key, { displayName: resource, ops: [op] });
    }
  }

  const lines: string[] = [];
  for (const { displayName, ops } of groups.values()) {
    const id = `Manage${toPascalCase(displayName)}`;
    const labelText = `manage ${formatResourceLabel(displayName)}`;
    lines.push(`  usecase ${id} {`);
    lines.push(`    label "${labelText}"`);
    lines.push(`    description """`);
    lines.push(`      Operations:`);
    for (const op of ops) {
      const summary = op.operation.summary?.trim();
      const head = `${op.method.toUpperCase()} ${op.path}`;
      lines.push(`      - ${summary ? `${head} — ${summary}` : head}`);
    }
    lines.push(`      """`);
    lines.push(`  }`);
  }
  for (const op of ungrouped) {
    lines.push(emitOperationUsecase(op));
  }
  return lines;
}

// ─── Translator ───────────────────────────────────────────────────────────────

export class OpenApiTranslator implements Translator {
  async translate(input: string, context: TranslatorContext): Promise<string> {
    let doc: OpenApiDoc;
    try {
      const parsed = parseYaml(input) as OpenApiDoc;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("invalid YAML structure");
      }
      doc = parsed;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse OpenAPI file: ${reason}`, { cause: err });
    }

    const serviceName =
      context.service ??
      (doc.info?.title
        ? deriveServiceName(doc.info.title)
        : deriveServiceNameFromPath(context.inputPath));

    const paths = doc.paths ?? {};
    const operations = collectOperations(paths);
    const granularity = context.granularity ?? "resource";

    const bodyLines =
      granularity === "operation"
        ? operations.map(emitOperationUsecase)
        : emitResourceUsecases(operations);

    const lines: string[] = [`service ${serviceName} {`, ...bodyLines, "}", ""];
    return lines.join("\n");
  }
}
