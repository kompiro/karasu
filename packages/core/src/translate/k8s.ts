import { parseAllDocuments } from "yaml";
import { parseMapFile, resolveRealizes, realizesLines } from "./realizes.js";
import type { Translator, TranslatorContext } from "./translator.js";

const WORKLOAD_KINDS = new Set(["Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob"]);

interface K8sMetadata {
  name?: string;
  namespace?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

interface K8sSpec {
  schedule?: string;
  jobTemplate?: {
    spec?: {
      template?: {
        spec?: {
          containers?: Array<{ name?: string; image?: string }>;
        };
      };
    };
  };
  template?: {
    spec?: {
      containers?: Array<{ name?: string; image?: string }>;
    };
  };
}

interface K8sResource {
  kind?: string;
  metadata?: K8sMetadata;
  spec?: K8sSpec;
}

function getKrsKind(k8sKind: string): "oci" | "job" {
  return k8sKind === "Job" || k8sKind === "CronJob" ? "job" : "oci";
}

function getPrimaryImage(resource: K8sResource): string | undefined {
  const spec = resource.spec;
  if (!spec) return undefined;

  // CronJob wraps template in jobTemplate
  const containers =
    spec.jobTemplate?.spec?.template?.spec?.containers ?? spec.template?.spec?.containers;

  return containers?.[0]?.image;
}

export class K8sTranslator implements Translator {
  async translate(input: string, context: TranslatorContext): Promise<string> {
    // A k8s YAML file may contain multiple documents separated by ---
    const docs = parseAllDocuments(input)
      .map((d) => d.toJS() as K8sResource)
      .filter((d): d is K8sResource => !!d && typeof d === "object");

    const workloads = docs.filter((d) => d.kind && WORKLOAD_KINDS.has(d.kind));
    if (workloads.length === 0) {
      return "";
    }

    const namespace = workloads[0]?.metadata?.namespace ?? "default";
    const mapFile = parseMapFile(context.mapFile);

    const lines: string[] = [`deploy "${namespace}" {`];

    for (const resource of workloads) {
      const name = resource.metadata?.name;
      if (!name) continue;

      const labels = resource.metadata?.labels ?? {};
      const annotation = labels["karasu/realizes"];
      const realizesResult = resolveRealizes(name, annotation, mapFile);
      const image = getPrimaryImage(resource);
      const krsKind = getKrsKind(resource.kind!);

      lines.push(`  ${krsKind} "${name}" {`);
      if (image) lines.push(`    image "${image}"`);
      if (resource.kind === "CronJob" && resource.spec?.schedule) {
        lines.push(`    schedule "${resource.spec.schedule}"`);
      }
      lines.push(...realizesLines(name, realizesResult, context.onWarning));
      lines.push(`  }`);
    }

    lines.push(`}`);
    return lines.join("\n") + "\n";
  }
}
