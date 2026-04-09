import { parse as parseYaml } from "yaml";
import { loadMapFile, resolveMapPath, resolveRealizes, realizesLines } from "./realizes.js";
import type { Translator, TranslatorContext } from "./translator.js";

interface ComposeService {
  image?: string;
  labels?: Record<string, string> | string[];
}

interface ComposeFile {
  name?: string;
  services?: Record<string, ComposeService>;
}

function parseLabels(
  labels: Record<string, string> | string[] | undefined,
): Record<string, string> {
  if (!labels) return {};
  if (Array.isArray(labels)) {
    const result: Record<string, string> = {};
    for (const entry of labels) {
      const idx = entry.indexOf("=");
      if (idx !== -1) result[entry.slice(0, idx)] = entry.slice(idx + 1);
    }
    return result;
  }
  return labels;
}

export class ComposeTranslator implements Translator {
  async translate(input: string, context: TranslatorContext): Promise<string> {
    let doc: ComposeFile;
    try {
      const parsed = parseYaml(input) as ComposeFile;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("invalid YAML structure");
      }
      doc = parsed;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse docker-compose file: ${reason}`, { cause: err });
    }

    const services = doc.services ?? {};
    const envName = doc.name ?? inputFileName(context.inputPath);
    const mapFilePath = resolveMapPath(context.inputPath, context.mapPath);
    const mapFile = loadMapFile(mapFilePath);

    const lines: string[] = [`deploy "${envName}" {`];

    for (const [name, service] of Object.entries(services)) {
      const labels = parseLabels(service.labels);
      const annotation = labels["karasu/realizes"];
      const realizesResult = resolveRealizes(name, annotation, mapFile);
      const image = service.image;

      lines.push(`  oci "${name}" {`);
      if (image) lines.push(`    image "${image}"`);
      lines.push(...realizesLines(name, realizesResult));
      lines.push(`  }`);
    }

    lines.push(`}`);
    return lines.join("\n") + "\n";
  }
}

function inputFileName(inputPath: string): string {
  const base = inputPath.split("/").pop() ?? inputPath;
  return base.replace(/\.[^.]+$/, "");
}
