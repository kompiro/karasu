import { extractCoverage, type CoverageReport } from "@karasu-tools/core";
import { compileSystemViewOrExit, resolveKrsFileOrExit } from "./compile-system-view.js";
import { writeOutput } from "./output.js";

type CoverageFormat = "md" | "json";

interface CoverageCliOptions {
  output?: string;
  format?: CoverageFormat;
  threshold?: string;
}

function formatAsMarkdown(report: CoverageReport): string {
  const lines: string[] = [];
  lines.push("| domain | service | usecases | entities | resources | edges | score | thin |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | :---: |");
  for (const d of report.domains) {
    lines.push(
      `| ${d.label} | ${d.serviceId ?? "—"} | ${d.usecases} | ${d.entities} | ${d.resourceRefs} | ${d.edges} | ${d.score.toFixed(2)} | ${d.thin ? "⚠️" : ""} |`,
    );
  }
  const thin = report.domains.filter((d) => d.thin).length;
  lines.push("");
  lines.push(
    `_${report.domains.length} domain(s), ${thin} thin (score < ${report.threshold.toFixed(2)})._`,
  );

  // Omitted entirely for a model with no infra declarations — an empty physical
  // table would read as "measured, found nothing" when the truth is that there
  // is no physical layer to measure.
  if (report.physical.infra.length > 0) {
    lines.push("");
    lines.push(
      "| infra | kind | leaves | mapped | referenced | unmapped-but-referenced | unreferenced |",
    );
    lines.push("| --- | --- | ---: | ---: | ---: | --- | --- |");
    for (const i of report.physical.infra) {
      lines.push(
        `| ${i.infraId} | ${i.kind} | ${i.leaves} | ${i.mappedByEntity} | ${i.referencedByResource} | ${i.unmappedButReferenced.join(", ") || "—"} | ${i.unreferenced.join(", ") || "—"} |`,
      );
    }
    // Recorded-vs-projected table relations (#2723): only a `database` has a
    // projection to diff, so the section follows the same "no layer, no table"
    // rule as the physical table above.
    const stores = report.physical.infra.filter((i) => i.kind === "database");
    if (stores.length > 0) {
      const pairs = (rels: readonly { from: string; to: string }[]): string =>
        rels.map((r) => `${r.from}→${r.to}`).join(", ") || "—";
      lines.push("");
      lines.push(
        "| database | recorded-without-projection | projection-without-recorded | direction-mismatch | kind-mismatch |",
      );
      lines.push("| --- | --- | --- | --- | --- |");
      for (const s of stores) {
        lines.push(
          `| ${s.infraId} | ${pairs(s.recordedWithoutProjection)} | ${pairs(s.projectionWithoutRecorded)} | ${pairs(s.directionMismatch)} | ${pairs(s.kindMismatch)} |`,
        );
      }
    }
    lines.push("");
    const tableless = report.physical.tablelessEntities;
    lines.push(
      `_${tableless.length} entity(ies) with no table mapping${
        tableless.length > 0
          ? `: ${tableless.map((e) => `${e.entityId}${e.domainId ? ` (${e.domainId})` : ""}`).join(", ")}`
          : ""
      }._`,
    );
  }

  // Client storages (#3794), independent of the infra above: shown whenever a
  // client declares storage. "unidentified" storages have no id, so nothing
  // can reference them yet.
  if (report.clientStores.length > 0) {
    lines.push("");
    lines.push("| client | storages | referenced | unreferenced | unidentified |");
    lines.push("| --- | ---: | ---: | --- | --- |");
    // Storage names are free text (a path may hold `|`), so cells are escaped.
    const cell = (text: string): string => text.replace(/\|/g, "\\|");
    for (const c of report.clientStores) {
      const list = (xs: readonly string[]): string => xs.map(cell).join(", ") || "—";
      lines.push(
        `| ${cell(c.clientId)} | ${c.identified.length} | ${c.referenced.length} | ${list(c.unreferenced)} | ${list(c.unidentified)} |`,
      );
    }
  }
  return lines.join("\n") + "\n";
}

export async function coverage(filePath: string, options: CoverageCliOptions): Promise<void> {
  const resolved = await resolveKrsFileOrExit(filePath);
  if (!resolved) return;
  const { absolutePath, displayPath, fs } = resolved;

  const format: CoverageFormat = options.format ?? "md";
  if (format !== "md" && format !== "json") {
    process.stderr.write(`Error: unknown --format "${format}" (expected md | json)\n`);
    process.exit(1);
  }

  let threshold: number | undefined;
  if (options.threshold !== undefined) {
    threshold = Number(options.threshold);
    if (!Number.isFinite(threshold)) {
      process.stderr.write(`Error: --threshold must be a number\n`);
      process.exit(1);
    }
  }

  const result = await compileSystemViewOrExit(fs, absolutePath, displayPath, "coverage");
  if (!result) return;

  const report = extractCoverage(result.systems, { threshold }, result.physicalTargets);
  const output =
    format === "json" ? JSON.stringify(report, null, 2) + "\n" : formatAsMarkdown(report);

  await writeOutput(output, options.output);
}
