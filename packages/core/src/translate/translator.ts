/**
 * Common interface for all translate format implementations.
 *
 * Each translator reads an input string (file content) and emits a `.krs`
 * scaffold string. The translators are pure: they never touch the filesystem
 * or `process`, so they run unchanged in Node (the `karasu translate` CLI) and
 * in the browser (the App). Host-specific concerns — reading the input file,
 * locating `karasu.map.yaml`, surfacing warnings — stay in the caller.
 */
export interface TranslatorContext {
  /**
   * Base name of the input (without extension), used to derive a default
   * name when the input itself carries none: the compose environment name,
   * the OpenAPI service name, the DB database name. Hosts pass the file name;
   * the browser may pass a user-entered name.
   */
  inputName?: string;
  /**
   * Raw `karasu.map.yaml` content (already read). Undefined when no map file
   * is available. Replaces the CLI-only "look beside the input file" lookup.
   */
  mapFile?: string;
  /** Service name for openapi format. Falls back to info.title when omitted. */
  service?: string;
  /** Database name for db format. Falls back to inputName when omitted. */
  database?: string;
  /**
   * Emission granularity. Per-format legal values:
   * - openapi: "resource" (default) | "operation"
   * - db:      "aggregate" (default) | "table"
   * Other formats ignore this field.
   */
  granularity?: "resource" | "operation" | "aggregate" | "table";
  /**
   * Emit `usecase` → `resource` bindings (openapi: resource granularity, db: aggregate granularity only).
   * Off by default to keep existing translate output stable.
   */
  emitBindings?: boolean;
  /**
   * Annotate emitted operations with `<verb>:<crud>` decoration per ADR-20260503-01.
   * Implies `emitBindings`.
   */
  emitCrudDecoration?: boolean;
  /**
   * Sink for non-fatal warnings (e.g. an unresolved `realizes`). The CLI wires
   * this to `process.stderr`; the App collects them for the UI. When omitted,
   * warnings are dropped.
   */
  onWarning?: (message: string) => void;
}

export interface Translator {
  translate(input: string, context: TranslatorContext): Promise<string>;
}
