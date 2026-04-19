/**
 * Common interface for all translate format implementations.
 * Each translator reads an input string (file content) and emits
 * one or more `.krs` deploy block strings.
 */
export interface TranslatorContext {
  /** Absolute path to the input file (used to locate karasu.map.yaml). */
  inputPath: string;
  /** Explicit path to karasu.map.yaml; if undefined, look beside the input file. */
  mapPath?: string;
  /** Service name for openapi format. Falls back to info.title when omitted. */
  service?: string;
  /** Database name for db format. Falls back to input file name when omitted. */
  database?: string;
  /**
   * Emission granularity. Per-format legal values:
   * - openapi: "resource" (default) | "operation"
   * - db:      "aggregate" (default) | "table"
   * Other formats ignore this field.
   */
  granularity?: "resource" | "operation" | "aggregate" | "table";
}

export interface Translator {
  translate(input: string, context: TranslatorContext): Promise<string>;
}
