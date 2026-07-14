import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileProject, extractCoverage, type CoverageReport } from "@karasu-tools/core";
import { NodeFileSystemProvider } from "./node-fs.js";
import { formatDiagnostic } from "./i18n.js";

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
  const absolutePath = resolve(filePath);
  const fs = new NodeFileSystemProvider();

  if (!(await fs.exists(absolutePath))) {
    process.stderr.write(`Error: File not found: ${filePath}\n`);
    process.exit(1);
  }

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

  const result = await compileProject(absolutePath, fs, { diagramType: "system" });
  if (result.diagramType !== "system") {
    process.stderr.write("Error: coverage requires a system view\n");
    process.exit(1);
  }

  const errors = result.diagnostics.filter((d) => d.severity === "error");
  for (const d of errors) {
    const loc = d.loc ? `${filePath}:${d.loc.start.line + 1}:${d.loc.start.column + 1}` : filePath;
    process.stderr.write(`Error: ${loc}: ${formatDiagnostic(d)}\n`);
  }
  if (errors.length > 0) process.exit(1);

  const report = extractCoverage(result.systems, { threshold });
  const output =
    format === "json" ? JSON.stringify(report, null, 2) + "\n" : formatAsMarkdown(report);

  if (options.output) {
    await writeFile(resolve(options.output), output, "utf-8");
  } else {
    process.stdout.write(output);
  }
}
