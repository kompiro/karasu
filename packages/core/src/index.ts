export type {
  KrsFile,
  KrsNode,
  KrsEdge,
  LinkEntry,
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
import type { Diagnostic, LogicalNodeKind, LinkEntry, KrsNode } from "./types/ast.js";
import { summarizeDescription } from "./renderer/description-summary.js";

export interface NodeMetadata {
  kind: LogicalNodeKind;
  label: string;
  description?: string;
  descriptionSummary?: string;
  links: LinkEntry[];
  team?: string;
  role?: string;
  tags: string[];
  annotations: string[];
  hasChildren: boolean;
}

export interface CompileResult {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
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
  const nodeMetadata = buildNodeMetadata(viewSlice);

  return { svg, warnings, diagnostics, nodeMetadata };
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
  const nodeMetadata = buildNodeMetadata(viewSlice);

  return { svg, warnings, diagnostics, nodeMetadata };
}

function buildNodeMetadata(viewSlice: import("./view/view-extract.js").ViewSlice): Map<string, NodeMetadata> {
  const map = new Map<string, NodeMetadata>();

  function addNode(node: KrsNode): void {
    const id = node.id ?? node.label;
    map.set(id, {
      kind: node.kind,
      label: node.label,
      description: node.description,
      descriptionSummary: node.description ? summarizeDescription(node.description) : undefined,
      links: node.links,
      team: node.team,
      role: node.role,
      tags: [...node.tags],
      annotations: [...node.annotations],
      hasChildren: node.children.length > 0,
    });
  }

  for (const node of viewSlice.childNodes) {
    addNode(node);
  }
  for (const node of viewSlice.ghostUsers) {
    addNode(node);
  }

  return map;
}
