import { describe, it, expect } from "vitest";
import { WranglerTranslator } from "./wrangler.js";
import { Parser } from "../parser/parser.js";
import type { TranslatorContext } from "./translator.js";

const ctx: TranslatorContext = { inputName: "wrangler" };

/** Parse the emitted .krs and assert it has no error-level diagnostics. */
function assertRoundTrips(krs: string): void {
  const result = Parser.parse(krs);
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  // Map to the diagnostic codes so a failure surfaces which rule fired.
  expect(errors.map((d) => d.code)).toEqual([]);
}

const FULL = `
name = "hato"

[[d1_databases]]
binding = "DB"
database_name = "hato-db"

[[r2_buckets]]
binding = "EXPORTS"
bucket_name = "hato-exports"

[[queues.producers]]
binding = "TASKS"
queue = "ingestion"

[[kv_namespaces]]
binding = "CACHE"
id = "abc123"

[[vectorize]]
binding = "SEARCH"
index_name = "hato-vectors"

[ai]
binding = "AI"

[[durable_objects.bindings]]
name = "SESSIONS"
class_name = "SessionActor"

[[services]]
binding = "AUTH"
service = "auth-worker"
`;

describe("WranglerTranslator", () => {
  const translator = new WranglerTranslator();

  it("wraps logical nodes in a system derived from the worker name", async () => {
    const krs = await translator.translate(`name = "hato"\n`, ctx);
    expect(krs).toContain("system Hato {");
    expect(krs).toContain("service Hato {");
    expect(krs).toContain('label "hato"');
  });

  it("maps D1 / R2 / Queues to engine-neutral logical infra with no tech in labels", async () => {
    const krs = await translator.translate(FULL, ctx);
    expect(krs).toContain("database DB {");
    expect(krs).toContain("storage EXPORTS {");
    expect(krs).toContain("queue TASKS {");
    // Concrete tech must NOT leak into logical labels.
    expect(krs).not.toMatch(/label\s+"Cloudflare/);
  });

  it("puts concrete Cloudflare tech in the physical store layer via realizes", async () => {
    const krs = await translator.translate(FULL, ctx);
    expect(krs).toContain('deploy "hato" {');
    expect(krs).toContain('function "hato" {');
    expect(krs).toContain('runtime "cloudflare-workers"');
    expect(krs).toContain("realizes Hato");
    expect(krs).toContain('type "Cloudflare D1"');
    expect(krs).toContain("realizes DB");
    expect(krs).toContain('type "Cloudflare R2"');
    expect(krs).toContain('type "Cloudflare Queues"');
  });

  it("maps Vectorize to database [index]", async () => {
    const krs = await translator.translate(FULL, ctx);
    expect(krs).toContain("database SEARCH [index] {");
    expect(krs).toContain('type "Cloudflare Vectorize"');
  });

  it("maps KV to database (no [cache] tag yet — notation-watch)", async () => {
    const krs = await translator.translate(FULL, ctx);
    expect(krs).toContain("database CACHE {");
    expect(krs).not.toContain("[cache]");
    expect(krs).toContain('type "Cloudflare KV"');
  });

  it("maps Workers AI and Durable Objects to external services with edges", async () => {
    const krs = await translator.translate(FULL, ctx);
    expect(krs).toContain("service AI [external] {");
    expect(krs).toContain("service SessionActor [external] {");
    expect(krs).toContain("Hato -> AI");
    expect(krs).toContain("Hato -> SessionActor");
  });

  it("maps a service binding to a Worker→Worker communication edge", async () => {
    const krs = await translator.translate(FULL, ctx);
    expect(krs).toContain("Hato -> AuthWorker");
  });

  it("draws owned infra edges with --> and keeps external edges with ->", async () => {
    const krs = await translator.translate(FULL, ctx);
    expect(krs).toContain("Hato --> DB");
    expect(krs).toContain("Hato --> EXPORTS");
    expect(krs).toContain("Hato --> SEARCH");
    expect(krs).toContain("Hato --> CACHE");
  });

  it("warns and skips unknown top-level binding kinds without hallucinating", async () => {
    const warnings: string[] = [];
    const input = `
name = "edge"

[[d1_databases]]
binding = "DB"
database_name = "db"

[[hyperdrive]]
binding = "HYPER"
id = "xyz"
`;
    const krs = await translator.translate(input, {
      inputName: "wrangler",
      onWarning: (m) => warnings.push(m),
    });
    // Known binding still emitted; unknown one produces no node.
    expect(krs).toContain("database DB {");
    expect(krs).not.toContain("HYPER");
  });

  it("renames an external id that collides with an infra id (no duplicate node)", async () => {
    const warnings: string[] = [];
    // A KV binding and the Workers AI binding both named "AI" would declare the
    // same id; the AI external must be renamed rather than duplicated.
    const input = `
name = "edge"

[[kv_namespaces]]
binding = "AI"
id = "k1"

[ai]
binding = "AI"
`;
    const krs = await translator.translate(input, {
      inputName: "wrangler",
      onWarning: (m) => warnings.push(m),
    });
    expect(krs).toContain("database AI {");
    expect(krs).toContain("service AI2 [external] {");
    expect(warnings.some((w) => w.includes("renamed to"))).toBe(true);
    assertRoundTrips(krs);
  });

  it("overrides the system name with context.system", async () => {
    const krs = await translator.translate(`name = "hato"\n`, { ...ctx, system: "MyApp" });
    expect(krs).toContain("system MyApp {");
  });

  it("emits a .krs that round-trips through the parser with no errors", async () => {
    const krs = await translator.translate(FULL, ctx);
    assertRoundTrips(krs);
  });

  it("throws a helpful error on invalid TOML", async () => {
    await expect(translator.translate(`name = = "broken"`, ctx)).rejects.toThrow(
      /Failed to parse wrangler\.toml/,
    );
  });
});
