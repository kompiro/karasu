import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface AdrConfig {
  topics: readonly string[];
  concerns: readonly string[];
  paths: {
    adrDir: string;
    outputs: {
      effective: string;
      graph: string;
      graphByTopic: string;
    };
  };
}

export class AdrConfigMissingError extends Error {
  constructor(path: string) {
    super(
      `adr.config.json not found at ${path}. Run \`pnpm adr:init\` to generate a starter config.`,
    );
    this.name = "AdrConfigMissingError";
  }
}

export class AdrConfigInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdrConfigInvalidError";
  }
}

export const CONFIG_FILENAME = "adr.config.json";

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function requireString(obj: Record<string, unknown>, field: string, ctx: string): string {
  const v = obj[field];
  if (typeof v !== "string" || v.length === 0) {
    throw new AdrConfigInvalidError(`${ctx}: "${field}" must be a non-empty string`);
  }
  return v;
}

function parseConfig(raw: unknown, ctx: string): AdrConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AdrConfigInvalidError(`${ctx}: top-level must be a JSON object`);
  }
  const obj = raw as Record<string, unknown>;

  const topicsRaw = obj.topics;
  if (!isStringArray(topicsRaw)) {
    throw new AdrConfigInvalidError(`${ctx}: "topics" must be an array of strings`);
  }
  const concernsRaw = obj.concerns;
  if (!isStringArray(concernsRaw)) {
    throw new AdrConfigInvalidError(`${ctx}: "concerns" must be an array of strings`);
  }

  const pathsRaw = obj.paths;
  if (!pathsRaw || typeof pathsRaw !== "object" || Array.isArray(pathsRaw)) {
    throw new AdrConfigInvalidError(`${ctx}: "paths" must be an object`);
  }
  const paths = pathsRaw as Record<string, unknown>;
  const adrDir = requireString(paths, "adrDir", `${ctx}: paths.adrDir`);

  const outputsRaw = paths.outputs;
  if (!outputsRaw || typeof outputsRaw !== "object" || Array.isArray(outputsRaw)) {
    throw new AdrConfigInvalidError(`${ctx}: "paths.outputs" must be an object`);
  }
  const outputs = outputsRaw as Record<string, unknown>;
  const effective = requireString(outputs, "effective", `${ctx}: paths.outputs.effective`);
  const graph = requireString(outputs, "graph", `${ctx}: paths.outputs.graph`);
  const graphByTopic = requireString(outputs, "graphByTopic", `${ctx}: paths.outputs.graphByTopic`);

  return {
    topics: topicsRaw,
    concerns: concernsRaw,
    paths: { adrDir, outputs: { effective, graph, graphByTopic } },
  };
}

export function loadConfig(cwd: string = process.cwd()): AdrConfig {
  const path = join(cwd, CONFIG_FILENAME);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new AdrConfigMissingError(path);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new AdrConfigInvalidError(`${path}: invalid JSON: ${(e as Error).message}`);
  }
  return parseConfig(parsed, path);
}
