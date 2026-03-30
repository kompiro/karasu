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
  CommonProperties,
  SystemNode,
  ServiceNode,
  DomainNode,
  UsecaseNode,
  ResourceNode,
  UserNode,
  OrganizationBlock,
  TeamNode,
  MemberNode,
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
export type { OrgViewPath, OrgViewSlice } from "./view/org-view-extract.js";
export { extractOrgView } from "./view/org-view-extract.js";
export type {
  DeployViewSlice,
  DeployContainer,
  DeployGhostEdge,
} from "./view/deploy-view-extract.js";
export { extractDeployView } from "./view/deploy-view-extract.js";

export { Parser } from "./parser/parser.js";
export { StyleParser } from "./parser/style-parser.js";
export { resolveStyles } from "./resolver/style-resolver.js";
export { getBuiltinStyleSheet, BUILTIN_STYLE_SOURCE } from "./builtins/default-style.js";
export { getIconThemeStyleSheet, ICON_THEME_STYLE_SOURCE } from "./builtins/icon-theme.js";
export {
  getReference,
  type KarasuReference,
  type NodeKindInfo,
  type TagInfo,
  type AnnotationInfo,
  type StylePropertyInfo,
  type ShapeInfo,
  type DeployUnitKindInfo,
  type OrgKindInfo,
} from "./builtins/reference.js";
export { analyze } from "./resolver/warnings.js";
export type { DisplayMode } from "./renderer/layout.js";
export { render, renderFromLayout, sanitizeId } from "./renderer/svg-renderer.js";
export type { ExportLevel } from "./renderer/multi-level-svg.js";
export {
  buildLevelId,
  collectAllSystemPaths,
  assembleMultiLevelSvg,
  buildExportSvg,
  buildExportSvgOrg,
} from "./renderer/multi-level-svg.js";

export { renderOrgView } from "./renderer/org-renderer.js";
export { renderDeploy } from "./renderer/deploy-renderer.js";
export { el, escapeXml } from "./renderer/svg-builder.js";
export {
  registerShape,
  registerIcon,
  getShape,
  getIconDef,
  hasShape,
  getRegisteredShapeNames,
  renderPictogram,
  clearRegistry,
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
import {
  buildDrillDownSvg as _buildDrillDownSvg,
  buildFullViewSvg as _buildFullViewSvg,
  buildFullViewSvgOrg as _buildFullViewSvgOrg,
} from "./renderer/drill-down-svg.js";

import type { DisplayMode } from "./renderer/layout.js";
import { renderOrgView as _renderOrgView } from "./renderer/org-renderer.js";
import { renderDeploy } from "./renderer/deploy-renderer.js";
import { extractView, type ViewPath } from "./view/view-extract.js";
import { extractOrgView, type OrgViewPath } from "./view/org-view-extract.js";
import { extractDeployView } from "./view/deploy-view-extract.js";
import { ImportResolver } from "./fs/import-resolver.js";
import { getBuiltinStyleSheet, BUILTIN_STYLE_SOURCE } from "./builtins/default-style.js";
import { getIconThemeStyleSheet } from "./builtins/icon-theme.js";
import "./renderer/shapes.js"; // ensure built-in shapes are registered
import type {
  Diagnostic,
  LogicalNodeKind,
  DeployNodeKind,
  LinkEntry,
  KrsNode,
  DeployNode,
} from "./types/ast.js";
import type { DeployViewSlice } from "./view/deploy-view-extract.js";
import { summarizeDescription } from "./renderer/description-summary.js";

export interface NodeMetadata {
  kind: LogicalNodeKind | DeployNodeKind;
  label: string;
  description?: string;
  descriptionSummary?: string;
  links: LinkEntry[];
  team?: string;
  role?: string;
  runtime?: string;
  realizes?: string;
  tags: string[];
  annotations: string[];
  hasChildren: boolean;
  /** True when this service/domain node has a corresponding deploy container */
  hasDeployContainer?: boolean;
}

export type DiagramType = "system" | "deploy";

export interface DeployBlockInfo {
  id: string;
  label: string;
}

export interface CompileResult {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  hasDeployDiagram: boolean;
  deployBlocks: DeployBlockInfo[];
}

/**
 * Compile a .krs source string to SVG.
 *
 * @param krsSource     - The raw .krs diagram source
 * @param styleSource   - Optional .krs.style content provided by the caller.
 *                        When `displayMode === "icon"`, the icon theme stylesheet is
 *                        automatically injected as a system sheet. Callers must NOT
 *                        pre-concatenate `ICON_THEME_STYLE_SOURCE` into `styleSource`
 *                        when passing `displayMode === "icon"`, as this would apply
 *                        the icon theme rules twice and produce duplicate style warnings.
 * @param viewPath      - Optional path filter for drill-down views
 * @param diagramType   - "deploy" renders the deployment diagram; default renders the system view
 * @param selectedDeployId - Active deploy container ID (deploy diagram only)
 * @param displayMode   - "icon" switches nodes to fixed-size icon card layout
 */
export function compile(
  krsSource: string,
  styleSource?: string,
  viewPath?: ViewPath,
  diagramType?: DiagramType,
  selectedDeployId?: string,
  displayMode?: DisplayMode,
): CompileResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const diagnostics = [...parseResult.diagnostics];

  const sheets: StyleSheet[] = [getBuiltinStyleSheet()];
  if (displayMode === "icon") {
    sheets.push(getIconThemeStyleSheet());
  }
  if (styleSource) {
    const styleResult = StyleParser.parse(styleSource);
    diagnostics.push(...styleResult.diagnostics);
    sheets.push(styleResult.value);
  }

  const deploySliceForStyle = extractDeployView(
    parseResult.value.deploys,
    parseResult.value.systems,
    selectedDeployId,
  );
  const deployUnits = [
    ...deploySliceForStyle.containers.flatMap((c) => c.units),
    ...deploySliceForStyle.unclassifiedUnits,
  ];
  const systemSheetCount = displayMode === "icon" ? 2 : 1;
  const styles = resolveStyles(parseResult.value.systems, sheets, deployUnits);
  const warnings = analyze(parseResult.value, sheets, systemSheetCount);
  const hasDeployDiagram = parseResult.value.deploys.length > 0;
  const deployBlocks = parseResult.value.deploys.map((d) => ({ id: d.id, label: d.label ?? d.id }));
  const serviceIdsWithDeploy = new Set(deploySliceForStyle.containers.map((c) => c.serviceId));
  const ownerIndex = parseResult.value.ownerIndex;

  let svg: string;
  let nodeMetadata: Map<string, NodeMetadata>;

  if (diagramType === "deploy") {
    const deploySlice = deploySliceForStyle;
    svg = renderDeploy(deploySlice, styles, displayMode);
    nodeMetadata = buildDeployNodeMetadata(deploySlice);
  } else {
    const viewSlice = extractView(parseResult.value.systems, viewPath ?? []);
    svg = render(viewSlice, styles, serviceIdsWithDeploy, ownerIndex, displayMode);
    nodeMetadata = buildNodeMetadata(viewSlice, serviceIdsWithDeploy, ownerIndex);
  }

  return { svg, warnings, diagnostics, nodeMetadata, hasDeployDiagram, deployBlocks };
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
  diagramType?: DiagramType,
  selectedDeployId?: string,
  displayMode?: DisplayMode,
): Promise<CompileResult> {
  const resolver = new ImportResolver(fs);
  const resolved = await resolver.resolve(entryPath);
  const diagnostics = [...resolved.diagnostics];

  const systemSheets: StyleSheet[] = [getBuiltinStyleSheet()];
  if (displayMode === "icon") {
    systemSheets.push(getIconThemeStyleSheet());
  }
  const allSheets = [...systemSheets, ...resolved.styleSheets];
  const deploySliceForStyle = extractDeployView(
    resolved.krsFile.deploys,
    resolved.krsFile.systems,
    selectedDeployId,
  );
  const deployUnits = [
    ...deploySliceForStyle.containers.flatMap((c) => c.units),
    ...deploySliceForStyle.unclassifiedUnits,
  ];
  const systemSheetCount = systemSheets.length;
  const styles = resolveStyles(resolved.krsFile.systems, allSheets, deployUnits);
  const warnings = analyze(resolved.krsFile, allSheets, systemSheetCount);
  const hasDeployDiagram = resolved.krsFile.deploys.length > 0;
  const deployBlocks = resolved.krsFile.deploys.map((d) => ({ id: d.id, label: d.label ?? d.id }));
  const serviceIdsWithDeploy = new Set(deploySliceForStyle.containers.map((c) => c.serviceId));
  const ownerIndex = resolved.krsFile.ownerIndex;

  let svg: string;
  let nodeMetadata: Map<string, NodeMetadata>;

  if (diagramType === "deploy") {
    const deploySlice = deploySliceForStyle;
    svg = renderDeploy(deploySlice, styles, displayMode);
    nodeMetadata = buildDeployNodeMetadata(deploySlice);
  } else {
    const viewSlice = extractView(resolved.krsFile.systems, viewPath ?? []);
    svg = render(viewSlice, styles, serviceIdsWithDeploy, ownerIndex, displayMode);
    nodeMetadata = buildNodeMetadata(viewSlice, serviceIdsWithDeploy, ownerIndex);
  }

  return { svg, warnings, diagnostics, nodeMetadata, hasDeployDiagram, deployBlocks };
}

function buildNodeMetadata(
  viewSlice: import("./view/view-extract.js").ViewSlice,
  serviceIdsWithDeploy?: Set<string>,
  ownerIndex?: Map<string, string>,
): Map<string, NodeMetadata> {
  const map = new Map<string, NodeMetadata>();

  function addNode(node: KrsNode): void {
    const id = node.id;
    const description = node.properties.description;
    const isServiceOrDomain = node.kind === "service" || node.kind === "domain";
    // Resolve team: ownerIndex (from org.team.owns) takes precedence over service.team property
    const team = isServiceOrDomain ? (ownerIndex?.get(id) ?? node.properties.team) : undefined;
    map.set(id, {
      kind: node.kind,
      label: node.label ?? node.id,
      description,
      descriptionSummary: description ? summarizeDescription(description) : undefined,
      links: node.properties.links,
      team,
      role: node.kind === "user" ? node.properties.role : undefined,
      tags: [...node.tags],
      annotations: [...node.annotations],
      hasChildren: node.children.length > 0,
      hasDeployContainer: isServiceOrDomain ? (serviceIdsWithDeploy?.has(id) ?? false) : undefined,
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

function buildDeployNodeMetadata(deploySlice: DeployViewSlice): Map<string, NodeMetadata> {
  const map = new Map<string, NodeMetadata>();

  function addUnit(unit: DeployNode): void {
    map.set(unit.id, {
      kind: unit.kind,
      label: unit.id,
      links: [],
      tags: [],
      annotations: [],
      hasChildren: false,
      runtime: unit.properties.runtime,
      realizes: unit.properties.realizes,
    });
  }

  for (const container of deploySlice.containers) {
    for (const unit of container.units) addUnit(unit);
  }
  for (const unit of deploySlice.unclassifiedUnits) addUnit(unit);

  return map;
}

export interface OrgCompileResult {
  svg: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
  nodePathIndex: Map<string, string[]>;
}

export async function compileProjectOrgView(
  entryPath: string,
  fs: FileSystemProvider,
  orgPath?: OrgViewPath,
  displayMode?: DisplayMode,
): Promise<OrgCompileResult> {
  const resolver = new ImportResolver(fs);
  const resolved = await resolver.resolve(entryPath);
  const diagnostics = [...resolved.diagnostics];

  const systemSheets: StyleSheet[] = [getBuiltinStyleSheet()];
  if (displayMode === "icon") {
    systemSheets.push(getIconThemeStyleSheet());
  }
  const allSheets = [...systemSheets, ...resolved.styleSheets];
  const systemSheetCount = systemSheets.length;
  const warnings = analyze(resolved.krsFile, allSheets, systemSheetCount);
  const slice = extractOrgView(resolved.krsFile.organizations, orgPath ?? []);
  const styles = resolveStyles(
    resolved.krsFile.systems,
    allSheets,
    undefined,
    resolved.krsFile.organizations,
  );
  const svg = _renderOrgView(slice, styles, displayMode);

  return { svg, diagnostics, warnings, nodePathIndex: resolved.krsFile.nodePathIndex };
}

export function compileOrgView(
  krsSource: string,
  styleSource?: string,
  orgPath?: OrgViewPath,
): OrgCompileResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const diagnostics = [...parseResult.diagnostics];

  const sheets: StyleSheet[] = [getBuiltinStyleSheet()];
  if (styleSource) {
    const styleResult = StyleParser.parse(styleSource);
    diagnostics.push(...styleResult.diagnostics);
    sheets.push(styleResult.value);
  }

  const warnings = analyze(parseResult.value, sheets);
  const slice = extractOrgView(parseResult.value.organizations, orgPath ?? []);
  const styles = resolveStyles(
    parseResult.value.systems,
    sheets,
    undefined,
    parseResult.value.organizations,
  );
  const svg = _renderOrgView(slice, styles);

  return { svg, diagnostics, warnings, nodePathIndex: parseResult.value.nodePathIndex };
}

/**
 * Builds a single SVG string containing all drill-down levels of the system diagram.
 * Each level is navigable via CSS :target + :has() without JavaScript.
 *
 * @param krsSource   - Raw .krs source
 * @param styleSource - Optional .krs.style content
 * @param displayMode - Layout display mode ("icon" | "shape")
 */
export function buildDrillDownSvg(
  krsSource: string,
  styleSource?: string,
  displayMode?: DisplayMode,
): string {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  return _buildDrillDownSvg(parseResult.value, styleSource, displayMode);
}

/**
 * Builds a single SVG with all drill-down levels stacked vertically.
 * All levels are visible simultaneously — no interaction required.
 */
export function buildFullViewSvg(
  krsSource: string,
  styleSource?: string,
  displayMode?: DisplayMode,
): string {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  return _buildFullViewSvg(parseResult.value, styleSource, displayMode);
}

/**
 * Builds a single SVG with all org drill-down levels stacked vertically.
 * All org levels (root teams, sub-teams) are visible simultaneously.
 */
export function buildFullViewSvgOrg(
  krsSource: string,
  styleSource?: string,
  displayMode?: DisplayMode,
): string {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  return _buildFullViewSvgOrg(parseResult.value, styleSource, displayMode);
}
