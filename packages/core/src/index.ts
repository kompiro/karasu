export type {
  KrsFile,
  KrsNode,
  KrsEdge,
  DeployBlock,
  DeployNode,
  ImportDeclaration,
  Diagnostic,
  ParseResult,
  LogicalNodeKind,
  DeployNodeKind,
  EdgeKind,
} from "./types/ast.js";

export type {
  StyleSheet,
  StyleRule,
  StyleSelector,
  ResolvedNodeStyle,
  ResolvedEdgeStyle,
  ResolvedStyles,
  ShapeKind,
} from "./types/style.js";

export type { Warning, WarningKind } from "./types/warnings.js";

export type { ViewPath, ViewSlice } from "./view/view-extract.js";
export { extractView } from "./view/view-extract.js";

export { Parser } from "./parser/parser.js";
export { StyleParser } from "./parser/style-parser.js";
export { resolveStyles } from "./resolver/style-resolver.js";
export { analyze } from "./resolver/warnings.js";
export { render } from "./renderer/svg-renderer.js";
export { el, escapeXml } from "./renderer/svg-builder.js";
export {
  registerShape,
  registerIcon,
  getShape,
  getIconDef,
  hasShape,
  getRegisteredShapeNames,
  type ShapeContext,
  type ShapeRenderFn,
  type SvgIconDef,
  type SvgIconTextSlot,
} from "./renderer/shape-registry.js";
export { registerBuiltinShapes } from "./renderer/shapes.js";
export {
  parseSvgIcon,
  loadAndRegisterIcon,
  loadAndRegisterIcons,
} from "./renderer/svg-icon-loader.js";
export {
  resolveIconManifest,
  type IconManifest,
  type IconManifestEntry,
} from "./renderer/icon-manifest.js";

// FileSystem abstractions
export type { FileSystemProvider, DirEntry, FsEvent, Disposable } from "./fs/types.js";
export { InMemoryFileSystemProvider } from "./fs/in-memory-provider.js";
export { ImportResolver, type ResolvedProject } from "./fs/import-resolver.js";
export type { Project } from "./fs/project.js";
export { normalizePath, resolvePath, dirname, basename, extname } from "./fs/path-utils.js";

import type { ParseResult } from "./types/ast.js";
import type { KrsFile } from "./types/ast.js";
import type { StyleSheet } from "./types/style.js";
import type { Warning } from "./types/warnings.js";
import type { FileSystemProvider } from "./fs/types.js";
import { Parser } from "./parser/parser.js";
import { StyleParser } from "./parser/style-parser.js";
import { resolveStyles } from "./resolver/style-resolver.js";
import { analyze } from "./resolver/warnings.js";
import { render } from "./renderer/svg-renderer.js";
import { extractView, type ViewPath } from "./view/view-extract.js";
import { ImportResolver } from "./fs/import-resolver.js";
import "./renderer/shapes.js"; // ensure built-in shapes are registered
import type { Diagnostic } from "./types/ast.js";

export interface CompileResult {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
}

export function compile(
  krsSource: string,
  styleSource?: string,
  viewPath?: ViewPath,
): CompileResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const diagnostics = [...parseResult.diagnostics];

  let sheets: StyleSheet[] = [];
  if (styleSource) {
    const styleResult = StyleParser.parse(styleSource);
    diagnostics.push(...styleResult.diagnostics);
    sheets = [styleResult.value];
  }

  const viewSlice = extractView(parseResult.value.systems, viewPath ?? []);
  const styles = resolveStyles(parseResult.value.systems, sheets);
  const svg = render(viewSlice, styles);
  const warnings = analyze(parseResult.value, sheets);

  return { svg, warnings, diagnostics };
}

/**
 * FileSystemProvider 経由でプロジェクトをコンパイルする。
 * エントリ .krs ファイルから @import / import を再帰的に解決し、
 * マージ済みの AST をレンダリングする。
 */
export async function compileProject(
  entryPath: string,
  fs: FileSystemProvider,
  viewPath?: ViewPath,
): Promise<CompileResult> {
  const resolver = new ImportResolver(fs);
  const resolved = await resolver.resolve(entryPath);
  const diagnostics = [...resolved.diagnostics];

  const viewSlice = extractView(resolved.krsFile.systems, viewPath ?? []);
  const styles = resolveStyles(resolved.krsFile.systems, resolved.styleSheets);
  const svg = render(viewSlice, styles);
  const warnings = analyze(resolved.krsFile, resolved.styleSheets);

  return { svg, warnings, diagnostics };
}
