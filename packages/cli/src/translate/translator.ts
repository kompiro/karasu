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
}

export interface Translator {
  translate(input: string, context: TranslatorContext): Promise<string>;
}
