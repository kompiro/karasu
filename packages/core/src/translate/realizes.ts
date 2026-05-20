import { parse as parseYaml } from "yaml";

/**
 * Parses `karasu.map.yaml` content into a map from deploy unit name →
 * service name(s). Returns an empty map when the content is missing or not a
 * YAML object. Locating and reading the file is the host's responsibility —
 * this function only parses already-read text so it stays browser-portable.
 */
export function parseMapFile(content: string | undefined): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (!content) return result;
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

type RealizesResult = { resolved: true; services: string[] } | { resolved: false };

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
 * Reports a warning through `onWarning` when unresolved — the CLI routes it to
 * stderr, the App surfaces it in the UI.
 */
export function realizesLines(
  unitName: string,
  result: RealizesResult,
  onWarning?: (message: string) => void,
): string[] {
  if (result.resolved) {
    return result.services.map((s) => `    realizes ${s}`);
  }
  onWarning?.(`Could not resolve realizes for "${unitName}"`);
  return [
    `    // TODO: realizes ? — could not resolve from naming convention`,
    `    // Add karasu/realizes label or karasu.map.yaml entry`,
  ];
}
