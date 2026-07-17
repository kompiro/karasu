import { resolve, dirname, basename, extname } from "node:path";
import {
  buildAllViewsSvgProject,
  buildDrawioProject,
  compileProject,
  extractCrudMatrix,
  renderMatrixAsSvg,
  warningSeverity,
} from "@karasu-tools/core";
import type {
  DiagramType,
  DiagramTheme,
  Diagnostic,
  DrawioViewSelection,
  Warning,
} from "@karasu-tools/core";
import { formatDiagnostic, formatWarning } from "./i18n.js";
import { formatDiagLoc, resolveKrsFileOrExit } from "./compile-system-view.js";
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

  const errors = diagnostics.filter((d) => d.severity === "error");
  const diagWarnings = diagnostics.filter((d) => d.severity === "warning");
  const diagInfos = diagnostics.filter((d) => d.severity === "info");

  function printDiagnostics(prefix: string, list: Diagnostic[]): void {
    for (const d of list) {
      process.stderr.write(`${prefix}: ${formatDiagLoc(filePath, d)}: ${formatDiagnostic(d)}\n`);
    }
  }

  const severityGroups: [string, Diagnostic[]][] = [
    ["Error", errors],
    ["Warning", diagWarnings],
    // Info-severity parser diagnostics (e.g. duplicate-owner-assignment) honour
    // their register with an `Info:` prefix — mirroring the info-warning loop
    // below — instead of being dropped (ADR-20260615-01 / ADR-20260514-02).
    ["Info", diagInfos],
  ];
  for (const [prefix, list] of severityGroups) {
    printDiagnostics(prefix, list);
  }
  for (const w of warnings) {
    // Honour the warning's register: info-severity kinds (e.g.
    // domain-dispersal) print as `Info:`, not `Warning:` — see
    // ADR-20260514-02.
    const prefix = warningSeverity(w.kind) === "info" ? "Info" : "Warning";
    process.stderr.write(`${prefix}: ${formatWarning(w).message}\n`);
  }

  if (errors.length > 0) {
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
