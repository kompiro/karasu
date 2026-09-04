import {
  extractTeamDependencies,
  formatTeamDependenciesAsCsv,
  formatTeamDependenciesAsMarkdown,
} from "@karasu-tools/core";
import { resolveKrsFileOrExit, resolveProjectOrExit } from "./compile-system-view.js";
import { writeOutput } from "./output.js";

type TeamDependenciesFormat = "md" | "csv";

interface TeamDependenciesCliOptions {
  output?: string;
  format?: TeamDependenciesFormat;
}

export async function teamDependencies(
  filePath: string,
  options: TeamDependenciesCliOptions,
): Promise<void> {
  const resolved = await resolveKrsFileOrExit(filePath);
  if (!resolved) return;
  const { absolutePath, fs } = resolved;

  const format: TeamDependenciesFormat = options.format ?? "md";
  if (format !== "md" && format !== "csv") {
    process.stderr.write(`Error: unknown --format "${format}" (expected md | csv)\n`);
    process.exit(1);
    return;
  }

  const krsFile = await resolveProjectOrExit(fs, absolutePath, filePath);
  if (!krsFile) return;

  const report = extractTeamDependencies(krsFile);
  const output =
    format === "md"
      ? formatTeamDependenciesAsMarkdown(report)
      : formatTeamDependenciesAsCsv(report);

  await writeOutput(output, options.output);
}
