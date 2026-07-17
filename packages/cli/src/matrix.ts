import {
  extractCrudMatrix,
  formatMatrixAsMarkdown,
  formatMatrixAsCsv,
  renderMatrixAsSvg,
  INFRA_KIND_SET,
  type CrudMatrixOptions,
  type InfraKind,
} from "@karasu-tools/core";
import { compileSystemViewOrExit, resolveKrsFileOrExit } from "./compile-system-view.js";
import { writeOutput } from "./output.js";

type MatrixFormat = "md" | "csv" | "svg";

interface MatrixCliOptions {
  output?: string;
  format?: MatrixFormat;
  service?: string[];
  infra?: string[];
  external?: boolean;
  noExternal?: boolean;
  writesOnly?: boolean;
  omitEmpty?: boolean;
  noTotals?: boolean;
}

export async function matrix(filePath: string, options: MatrixCliOptions): Promise<void> {
  const resolved = await resolveKrsFileOrExit(filePath);
  if (!resolved) return;
  const { absolutePath, fs } = resolved;

  const format: MatrixFormat = options.format ?? "md";
  if (format !== "md" && format !== "csv" && format !== "svg") {
    process.stderr.write(`Error: unknown --format "${format}" (expected md | csv | svg)\n`);
    process.exit(1);
  }

  const infra = options.infra?.filter((k): k is InfraKind => INFRA_KIND_SET.has(k));
  if (options.infra && infra && infra.length !== options.infra.length) {
    process.stderr.write(`Error: --infra values must be one of: database, queue, storage\n`);
    process.exit(1);
  }

  const result = await compileSystemViewOrExit(fs, absolutePath, filePath, "matrix");
  if (!result) return;

  const extractOptions: CrudMatrixOptions = {
    serviceFilter: options.service,
    infraFilter: infra,
    externalOnly: options.external,
    excludeExternal: options.noExternal,
    writesOnly: options.writesOnly,
    omitEmpty: options.omitEmpty,
  };
  const m = extractCrudMatrix(result.systems, extractOptions);
  const showTotals = !options.noTotals;

  let output: string;
  if (format === "md") output = formatMatrixAsMarkdown(m, { showTotals });
  else if (format === "csv") output = formatMatrixAsCsv(m, { showTotals });
  else output = renderMatrixAsSvg(m, { showTotals });

  await writeOutput(output, options.output);
}
