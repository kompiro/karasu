import { resolve, dirname, basename, extname } from "node:path";
import {
  buildAllViewsSvgProject,
  buildDrawioProject,
  compileProject,
  extractCrudMatrix,
  renderMatrixAsSvg,
} from "@karasu-tools/core";
import type {
  DiagramType,
  DiagramTheme,
  Diagnostic,
  DrawioViewSelection,
  Warning,
} from "@karasu-tools/core";
import { resolveKrsFileOrExit } from "./compile-system-view.js";
import { reportDiagnostics } from "./report-diagnostics.js";
import { writeOutput } from "./output.js";

type RenderFormat = "svg" | "drawio";

const DRAWIO_VIEW_SELECTIONS: Record<DiagramType, DrawioViewSelection> = {
  system: "system",
  deploy: "deploy",
  org: "org",
};

interface RenderOptions {
  output?: string;
  view?: DiagramType;
  format?: RenderFormat;
  /** Diagram color theme. Defaults to "dark" (svg format only). */
  theme?: DiagramTheme;
  includeMatrix?: boolean;
}

export async function render(filePath: string, options: RenderOptions): Promise<void> {
  const resolved = await resolveKrsFileOrExit(filePath);
  if (!resolved) return;
  const { absolutePath, fs } = resolved;

  const format: RenderFormat = options.format ?? "svg";
  let output: string;
  let diagnostics: Diagnostic[];
  let warnings: Warning[];

  if (format === "drawio") {
    const selection: DrawioViewSelection = options.view
      ? DRAWIO_VIEW_SELECTIONS[options.view]
      : "all";
    const result = await buildDrawioProject(absolutePath, fs, { view: selection });
    output = result.xml;
    diagnostics = result.diagnostics;
    warnings = result.warnings;
  } else if (options.view) {
    const result = await compileProject(absolutePath, fs, {
      diagramType: options.view,
      theme: options.theme,
    });
    output = result.svg;
    diagnostics = result.diagnostics;
    warnings = result.warnings;
  } else {
    const result = await buildAllViewsSvgProject(
      absolutePath,
      fs,
      undefined,
      undefined,
      options.theme,
    );
    output = result.svg;
    diagnostics = result.diagnostics;
    warnings = result.warnings;
  }

  if (reportDiagnostics(filePath, diagnostics, warnings) > 0) {
    process.exit(1);
  }

  await writeOutput(output, options.output);

  if (options.includeMatrix) {
    if (!options.output) {
      process.stderr.write("Warning: --include-matrix requires --output; matrix.svg not written\n");
    } else if (format !== "svg") {
      process.stderr.write(
        `Warning: --include-matrix is only supported with --format svg; matrix.svg not written\n`,
      );
    } else {
      const result = await compileProject(absolutePath, fs, { diagramType: "system" });
      if (result.diagramType === "system") {
        const matrix = extractCrudMatrix(result.systems);
        const matrixSvg = renderMatrixAsSvg(matrix);
        const outDir = dirname(resolve(options.output));
        const stem = basename(options.output, extname(options.output));
        const matrixPath = resolve(outDir, `${stem}.matrix.svg`);
        await writeOutput(matrixSvg, matrixPath);
      }
    }
  }
}
