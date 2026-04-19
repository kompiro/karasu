import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { buildAllViewsSvgProject, compileProject, formatWarning } from "@karasu-tools/core";
import type {
  FileSystemProvider,
  DirEntry,
  DiagramType,
  Diagnostic,
  Warning,
} from "@karasu-tools/core";

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

  async delete(_path: string): Promise<void> {
    throw new Error("delete not supported in render mode");
  }

  async mkdir(_path: string): Promise<void> {
    throw new Error("mkdir not supported in render mode");
  }
}

interface RenderOptions {
  output?: string;
  view?: DiagramType;
}

export async function render(filePath: string, options: RenderOptions): Promise<void> {
  const absolutePath = resolve(filePath);
  const fs = new NodeFileSystemProvider();

  if (!(await fs.exists(absolutePath))) {
    process.stderr.write(`Error: File not found: ${filePath}\n`);
    process.exit(1);
  }

  let svg: string;
  let diagnostics: Diagnostic[];
  let warnings: Warning[];

  if (options.view) {
    const result = await compileProject(absolutePath, fs, { diagramType: options.view });
    svg = result.svg;
    diagnostics = result.diagnostics;
    warnings = result.warnings;
  } else {
    const result = await buildAllViewsSvgProject(absolutePath, fs);
    svg = result.svg;
    diagnostics = result.diagnostics;
    warnings = [];
  }

  const errors = diagnostics.filter((d) => d.severity === "error");
  const diagWarnings = diagnostics.filter((d) => d.severity === "warning");

  for (const d of errors) {
    const loc = d.loc ? `${filePath}:${d.loc.start.line + 1}:${d.loc.start.column + 1}` : filePath;
    process.stderr.write(`Error: ${loc}: ${d.message}\n`);
  }
  for (const d of diagWarnings) {
    const loc = d.loc ? `${filePath}:${d.loc.start.line + 1}:${d.loc.start.column + 1}` : filePath;
    process.stderr.write(`Warning: ${loc}: ${d.message}\n`);
  }
  for (const w of warnings) {
    process.stderr.write(`Warning: ${formatWarning(w).message}\n`);
  }

  if (errors.length > 0) {
    process.exit(1);
  }

  if (options.output) {
    await writeFile(resolve(options.output), svg, "utf-8");
  } else {
    process.stdout.write(svg);
  }
}

// Re-export for testing
export { NodeFileSystemProvider };
