import type { FileSystemProvider } from "../../fs/types.js";
import { ImportResolver } from "../../fs/import-resolver.js";
import type { Diagnostic } from "../../types/ast.js";
import type { Warning } from "../../types/warnings.js";
import type { KrsFile } from "../../types/ast.js";
import { extractView } from "../../view/view-extract.js";
import { extractDeployView } from "../../view/deploy-view-extract.js";
import { layout } from "../../renderer/layout.js";
import { layoutDeploy } from "../../renderer/deploy-layout.js";
import { analyze } from "../../resolver/warnings.js";
import { getBuiltinStyleSheet } from "../../builtins/default-style.js";
import { exportDrawio, type DrawioPage } from "./drawio-exporter.js";

/** Which karasu views to emit as draw.io pages. Defaults to all supported views. */
export type DrawioViewSelection = "all" | "system" | "deploy";

export interface BuildDrawioOptions {
  /** Which view(s) to include. Defaults to "all". */
  view?: DrawioViewSelection;
}

export interface DrawioBuildResult {
  xml: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
}

/**
 * Build a draw.io (mxGraph XML) export from a parsed/resolved `KrsFile`.
 * The "org" view is not yet supported — it uses a different rendering
 * pipeline that does not expose a `LayoutResult`.
 */
export function buildDrawio(krsFile: KrsFile, options: BuildDrawioOptions = {}): string {
  const view = options.view ?? "all";
  const pages: DrawioPage[] = [];

  if (view === "all" || view === "system") {
    const systemPage = buildSystemPage(krsFile);
    if (systemPage) pages.push(systemPage);
  }

  if (view === "all" || view === "deploy") {
    const deployPage = buildDeployPage(krsFile);
    if (deployPage) pages.push(deployPage);
  }

  return exportDrawio({ pages });
}

export async function buildDrawioProject(
  entryPath: string,
  fs: FileSystemProvider,
  options: BuildDrawioOptions = {},
): Promise<DrawioBuildResult> {
  const resolver = new ImportResolver(fs);
  const resolved = await resolver.resolve(entryPath);
  const diagnostics = [...resolved.diagnostics];
  const warnings = analyze(resolved.krsFile, [getBuiltinStyleSheet()], 1);
  const xml = buildDrawio(resolved.krsFile, options);
  return { xml, diagnostics, warnings };
}

function buildSystemPage(krsFile: KrsFile): DrawioPage | null {
  if (krsFile.systems.length === 0) return null;
  const slice = extractView(krsFile.systems, [], krsFile.domains);
  const layoutResult = layout(slice, krsFile.ownerIndex);
  return { id: "system", name: "System", layout: layoutResult };
}

function buildDeployPage(krsFile: KrsFile): DrawioPage | null {
  if (krsFile.deploys.length === 0) return null;
  const slice = extractDeployView(krsFile.deploys, krsFile.systems);
  const layoutResult = layoutDeploy(slice);
  return { id: "deploy", name: "Deploy", layout: layoutResult };
}
