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
  return lines.join("\n") + "\n";
}

export async function coverage(filePath: string, options: CoverageCliOptions): Promise<void> {
  const resolved = await resolveKrsFileOrExit(filePath);
  if (!resolved) return;
  const { absolutePath, fs } = resolved;

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

  const result = await compileSystemViewOrExit(fs, absolutePath, filePath, "coverage");
  if (!result) return;

  const report = extractCoverage(result.systems, { threshold });
  const output =
    format === "json" ? JSON.stringify(report, null, 2) + "\n" : formatAsMarkdown(report);

  await writeOutput(output, options.output);
}
