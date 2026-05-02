import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  compileProject,
  extractCrudMatrix,
  formatMatrixAsMarkdown,
  formatMatrixAsCsv,
  renderMatrixAsSvg,
  formatDiagnostic,
  type FileSystemProvider,
  type DirEntry,
  type CrudMatrixOptions,
  type InfraKind,
} from "@karasu-tools/core";

type MatrixFormat = "md" | "csv" | "svg";
const VALID_INFRA: ReadonlySet<InfraKind> = new Set(["database", "queue", "storage"]);

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

class NodeFileSystemProvider implements FileSystemProvider {
  async readFile(path: string): Promise<string> {
    return readFile(path, "utf-8");
  }
  async writeFile(path: string, content: string): Promise<void> {
    await writeFile(path, content, "utf-8");
  }
  async readDir(path: string): Promise<DirEntry[]> {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      kind: e.isDirectory() ? ("directory" as const) : ("file" as const),
    }));
  }
  async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
  async delete(): Promise<void> {
    throw new Error("delete not supported");
  }
  async mkdir(): Promise<void> {
    throw new Error("mkdir not supported");
  }
}

export async function matrix(filePath: string, options: MatrixCliOptions): Promise<void> {
  const absolutePath = resolve(filePath);
  const fs = new NodeFileSystemProvider();

  if (!(await fs.exists(absolutePath))) {
    process.stderr.write(`Error: File not found: ${filePath}\n`);
    process.exit(1);
  }

  const format: MatrixFormat = options.format ?? "md";
  if (format !== "md" && format !== "csv" && format !== "svg") {
    process.stderr.write(`Error: unknown --format "${format}" (expected md | csv | svg)\n`);
    process.exit(1);
  }

  const infra = options.infra?.filter((k): k is InfraKind => VALID_INFRA.has(k as InfraKind));
  if (options.infra && infra && infra.length !== options.infra.length) {
    process.stderr.write(`Error: --infra values must be one of: database, queue, storage\n`);
    process.exit(1);
  }

  const result = await compileProject(absolutePath, fs, { diagramType: "system" });
  if (result.diagramType !== "system") {
    process.stderr.write("Error: matrix requires a system view\n");
    process.exit(1);
  }

  const errors = result.diagnostics.filter((d) => d.severity === "error");
  for (const d of errors) {
    const loc = d.loc ? `${filePath}:${d.loc.start.line + 1}:${d.loc.start.column + 1}` : filePath;
    process.stderr.write(`Error: ${loc}: ${formatDiagnostic(d)}\n`);
  }
  if (errors.length > 0) process.exit(1);

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

  if (options.output) {
    await writeFile(resolve(options.output), output, "utf-8");
  } else {
    process.stdout.write(output);
  }
}
