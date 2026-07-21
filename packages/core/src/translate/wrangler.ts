import { quoteString } from "../formatter/quote-string.js";
import { parse as parseToml } from "smol-toml";
import type { Translator, TranslatorContext } from "./translator.js";

/**
 * `--from wrangler` — extract the physical layer of a Cloudflare Workers app
 * from its `wrangler.toml`.
 *
 * Unlike compose/k8s (which emit only a `deploy` block, assuming the logical
 * model already exists) the `wrangler.toml` is the *sole* source for both the
 * logical stores and their physical realization, so this translator emits a
 * self-contained model: a `system { ... }` wrapping the Worker `service`, the
 * binding-derived infra blocks and edges, followed by a top-level `deploy`
 * where the concrete Cloudflare technology lands in `store { type ... }` —
 * never in a logical `label`. See docs/design/wrangler-translate-adapter.md.
 *
 * Pure: no fs / process access, so it runs unchanged in the CLI and the App.
 */

interface WranglerToml {
  name?: unknown;
  d1_databases?: unknown;
  r2_buckets?: unknown;
  kv_namespaces?: unknown;
  vectorize?: unknown;
  queues?: unknown;
  services?: unknown;
  durable_objects?: unknown;
  ai?: unknown;
}

/** A logical infra block: `database` / `storage` / `queue`. */
interface InfraNode {
  kind: "database" | "storage" | "queue";
  id: string;
  /** `[index]` role tag (Vectorize). */
  index?: boolean;
  /** Physical `store { type ... }` technology string. */
  storeType: string;
}

/** A logical `service [external]` reached by the Worker via a `->` edge. */
interface ExternalService {
  id: string;
}

const IDENT_START = /[A-Za-z_]/;

/**
 * Top-level `wrangler.toml` binding keys this translator maps. Anything else
 * that looks like a binding (array-of-tables with a `binding` field) triggers
 * an "unsupported binding" warning rather than being silently dropped.
 */
const HANDLED_BINDING_KEYS = new Set([
  "d1_databases",
  "r2_buckets",
  "kv_namespaces",
  "vectorize",
  "services",
]);

/**
 * Turn an arbitrary binding / resource name into a valid `.krs` PascalCase
 * identifier. Non-alphanumeric runs become word boundaries; a leading digit is
 * prefixed with `_`. Returns undefined when nothing usable remains.
 */
function toIdentifier(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const parts = raw.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  const pascal = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  return IDENT_START.test(pascal) ? pascal : `_${pascal}`;
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object");
}

/**
 * Reserve a unique node id: append a numeric suffix while `candidate` is taken,
 * warn on rename, and record it in `used`. Every emitted node id (infra,
 * external service, Worker) goes through here so two bindings never declare the
 * same id — which the parser would reject as a duplicate.
 */
function dedupe(
  candidate: string,
  used: Set<string>,
  onWarning?: (message: string) => void,
): string {
  let id = candidate;
  let n = 2;
  while (used.has(id)) {
    id = `${candidate}${n++}`;
  }
  if (id !== candidate) {
    onWarning?.(`Duplicate binding name "${candidate}"; renamed to "${id}".`);
  }
  used.add(id);
  return id;
}

/**
 * Resolve the identifier for a binding, preferring the env-var `binding` name
 * (stable in code), falling back to a resource-name field, then to `fallback`.
 */
function bindingId(
  entry: Record<string, unknown>,
  resourceNameKey: string,
  fallback: string,
  used: Set<string>,
  onWarning?: (message: string) => void,
): string {
  const candidate = toIdentifier(entry.binding) ?? toIdentifier(entry[resourceNameKey]) ?? fallback;
  return dedupe(candidate, used, onWarning);
}

export class WranglerTranslator implements Translator {
  async translate(input: string, context: TranslatorContext): Promise<string> {
    let doc: WranglerToml;
    try {
      const parsed = parseToml(input);
      if (!parsed || typeof parsed !== "object") throw new Error("invalid TOML structure");
      doc = parsed as WranglerToml;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse wrangler.toml: ${reason}`, { cause: err });
    }

    const onWarning = context.onWarning;
    const workerName = typeof doc.name === "string" ? doc.name : (context.inputName ?? "worker");
    const systemName = toIdentifier(context.system) ?? toIdentifier(workerName) ?? "Worker";
    const workerId = toIdentifier(workerName) ?? systemName;

    const used = new Set<string>([workerId]);
    const infra: InfraNode[] = [];
    const externals: ExternalService[] = [];
    const serviceBindings: string[] = [];

    // D1 → database
    for (const e of asArray(doc.d1_databases)) {
      infra.push({
        kind: "database",
        id: bindingId(e, "database_name", "D1", used, onWarning),
        storeType: "Cloudflare D1",
      });
    }
    // R2 → storage
    for (const e of asArray(doc.r2_buckets)) {
      infra.push({
        kind: "storage",
        id: bindingId(e, "bucket_name", "R2", used, onWarning),
        storeType: "Cloudflare R2",
      });
    }
    // KV → database (+ [cache] role is a notation-watch item, not emitted)
    for (const e of asArray(doc.kv_namespaces)) {
      infra.push({
        kind: "database",
        id: bindingId(e, "id", "Kv", used, onWarning),
        storeType: "Cloudflare KV",
      });
    }
    // Vectorize → database [index]
    for (const e of asArray(doc.vectorize)) {
      infra.push({
        kind: "database",
        id: bindingId(e, "index_name", "Vectorize", used, onWarning),
        index: true,
        storeType: "Cloudflare Vectorize",
      });
    }
    // Queues (producers only — a consumer is the receiving end, not an owned store here)
    const queues = doc.queues as { producers?: unknown } | undefined;
    for (const e of asArray(queues?.producers)) {
      infra.push({
        kind: "queue",
        id: bindingId(e, "queue", "Queue", used, onWarning),
        storeType: "Cloudflare Queues",
      });
    }
    // Workers AI → external model service
    if (doc.ai && typeof doc.ai === "object") {
      const candidate = toIdentifier((doc.ai as Record<string, unknown>).binding) ?? "WorkersAi";
      externals.push({ id: dedupe(candidate, used, onWarning) });
    }
    // Durable Objects → service [external] (opaque stateful actor; notation-watch)
    const durableObjects = doc.durable_objects as { bindings?: unknown } | undefined;
    for (const e of asArray(durableObjects?.bindings)) {
      const id = bindingId(e, "class_name", "DurableObject", used, onWarning);
      externals.push({ id });
    }
    // Service bindings → Worker→Worker communication edge
    for (const e of asArray(doc.services)) {
      const id = toIdentifier(e.service) ?? toIdentifier(e.binding);
      if (id) {
        if (!used.has(id)) used.add(id);
        serviceBindings.push(id);
      }
    }

    // Unknown binding kinds → warn + skip, never hallucinate an infra kind.
    // A Cloudflare binding is an array-of-tables whose entries carry a
    // `binding` field (hyperdrive, analytics_engine_datasets, browser, …);
    // non-binding sections (routes, vars, triggers) don't and are ignored.
    for (const [key, value] of Object.entries(doc)) {
      if (HANDLED_BINDING_KEYS.has(key)) continue;
      const entries = asArray(value);
      if (entries.length > 0 && entries.some((e) => typeof e.binding === "string")) {
        onWarning?.(`Unsupported wrangler binding "${key}"; skipped (no karasu mapping).`);
      }
    }

    return this.render({
      systemName,
      workerId,
      workerName,
      infra,
      externals,
      serviceBindings,
    });
  }

  private render(m: {
    systemName: string;
    workerId: string;
    workerName: string;
    infra: InfraNode[];
    externals: ExternalService[];
    serviceBindings: string[];
  }): string {
    const body: string[] = [];
    body.push(`service ${m.workerId} {`);
    body.push(`  label ${quoteString(m.workerName)}`);
    body.push(`}`);

    for (const node of m.infra) {
      const tag = node.index ? " [index]" : "";
      body.push(``);
      body.push(`${node.kind} ${node.id}${tag} {`);
      body.push(`}`);
    }
    for (const ext of m.externals) {
      body.push(``);
      body.push(`service ${ext.id} [external] {`);
      body.push(`}`);
    }

    // Edges: `-->` to owned infra, `->` to external services / other workers.
    if (m.infra.length || m.externals.length || m.serviceBindings.length) {
      body.push(``);
      for (const node of m.infra) body.push(`${m.workerId} --> ${node.id}`);
      for (const ext of m.externals) body.push(`${m.workerId} -> ${ext.id}`);
      for (const svc of m.serviceBindings) body.push(`${m.workerId} -> ${svc}`);
    }

    const indented = body.map((l) => (l.length === 0 ? "" : `  ${l}`)).join("\n");
    const lines: string[] = [`system ${m.systemName} {`, indented, `}`, ``];

    // Physical layer — concrete Cloudflare tech lives here, not in labels.
    lines.push(`deploy ${quoteString(m.workerName)} {`);
    lines.push(`  function ${quoteString(m.workerName)} {`);
    lines.push(`    runtime "cloudflare-workers"`);
    lines.push(`    realizes ${m.workerId}`);
    lines.push(`  }`);
    for (const node of m.infra) {
      lines.push(`  store ${node.id}Store {`);
      lines.push(`    type ${quoteString(node.storeType)}`);
      lines.push(`    realizes ${node.id}`);
      lines.push(`  }`);
    }
    lines.push(`}`);

    return lines.join("\n") + "\n";
  }
}
