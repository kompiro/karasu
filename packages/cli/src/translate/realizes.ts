import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * Loads karasu.map.yaml from the given path.
 * Returns a map from deploy unit name → service name(s).
 * Returns an empty map if the file does not exist.
 */
export function loadMapFile(mapFilePath: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (!existsSync(mapFilePath)) return result;
  const content = readFileSync(mapFilePath, "utf-8");
  const doc = parseYaml(content) as Record<string, unknown>;
  if (!doc || typeof doc !== "object") return result;
  for (const [key, value] of Object.entries(doc)) {
    if (typeof value === "string") {
      result.set(key, splitRealizes(value));
    } else if (Array.isArray(value)) {
      result.set(
        key,
        value.filter((v): v is string => typeof v === "string"),
      );
    }
  }
  return result;
}

/**
 * Resolves karasu.map.yaml path from a TranslatorContext.
 * If mapPath is set, use it directly.
 * Otherwise look for karasu.map.yaml in the same directory as the input file.
 */
export function resolveMapPath(inputPath: string, mapPath?: string): string {
  if (mapPath) return resolve(mapPath);
  return resolve(dirname(inputPath), "karasu.map.yaml");
}

/**
 * Splits a comma-separated realizes string into an array.
 * "OrderService,InventoryService" → ["OrderService", "InventoryService"]
 */
export function splitRealizes(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Converts a kebab-case name to PascalCase.
 * "order-service" → "OrderService"
 * "my-api-server" → "MyApiServer"
 */
export function kebabToPascal(name: string): string {
  return name
    .split("-")
    .filter(Boolean)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join("");
}

export type RealizesResult =
  | { resolved: true; services: string[] }
  | { resolved: false };

/**
 * Resolves realizes for a deploy unit using the 3-stage strategy:
 * 1. Explicit label annotation (`karasu/realizes`)
 * 2. karasu.map.yaml lookup
 * 3. Naming convention heuristic (kebab-case → PascalCase)
 *
 * Returns resolved=false if none of the strategies produce a result.
 */
export function resolveRealizes(
  unitName: string,
  labelAnnotation: string | undefined,
  mapFile: Map<string, string[]>,
): RealizesResult {
  // Stage 1: explicit label
  if (labelAnnotation) {
    const services = splitRealizes(labelAnnotation);
    if (services.length > 0) return { resolved: true, services };
  }

  // Stage 2: karasu.map.yaml
  const mapped = mapFile.get(unitName);
  if (mapped && mapped.length > 0) return { resolved: true, services: mapped };

  // Stage 3: naming heuristic (only apply when name contains a hyphen)
  if (unitName.includes("-")) {
    return { resolved: true, services: [kebabToPascal(unitName)] };
  }

  return { resolved: false };
}

/**
 * Emits `realizes` lines for a resolved result, or a TODO comment.
 * Writes a stderr warning when unresolved.
 */
export function realizesLines(unitName: string, result: RealizesResult): string[] {
  if (result.resolved) {
    return result.services.map((s) => `    realizes ${s}`);
  }
  process.stderr.write(
    `Warning: Could not resolve realizes for "${unitName}"\n`,
  );
  return [
    `    // TODO: realizes ? — could not resolve from naming convention`,
    `    // Add karasu/realizes label or karasu.map.yaml entry`,
  ];
}
