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

/**
 * Derive a service name from info.title.
 * e.g. "Order Service" → "OrderService"
 */
function deriveServiceName(title: string): string {
  return toPascalCase(title);
}

/**
 * Derive a service name from the input file path when neither --service nor info.title is available.
 */
function deriveServiceNameFromPath(inputPath: string): string {
  const name = basename(inputPath, extname(inputPath));
  return toPascalCase(name);
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
    const lines: string[] = [`service ${serviceName} {`];

    for (const [path, pathItem] of Object.entries(paths)) {
      if (!pathItem || typeof pathItem !== "object") continue;

      for (const method of HTTP_METHODS) {
        const operation = pathItem[method as HttpMethod];
        if (!operation) continue;

        const usecaseId = operation.operationId
          ? toPascalCase(operation.operationId)
          : deriveUsecaseId(method, path);

        const label = `${method.toUpperCase()} ${path}`;
        lines.push(`  usecase ${usecaseId} { label "${label}" }`);
      }
    }

    lines.push("}");
    lines.push("");

    return lines.join("\n");
  }
}
