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
  OrgNode,
  HierarchyNode,
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
export type { SvgResult } from "./renderer/all-layers-svg.js";
export { render, renderFromLayout, sanitizeId } from "./renderer/svg-renderer.js";

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
  buildDrillDownSvgOrg as _buildDrillDownSvgOrg,
  buildAllViewsSvg as _buildAllViewsSvg,
} from "./renderer/drill-down-svg.js";
import {
  buildAllLayersSvg as _buildAllLayersSvg,
  buildAllLayersSvgOrg as _buildAllLayersSvgOrg,
  type SvgResult,
} from "./renderer/all-layers-svg.js";

import type { DisplayMode } from "./renderer/layout.js";
import { renderOrgView as _renderOrgView } from "./renderer/org-renderer.js";
import { renderDeploy } from "./renderer/deploy-renderer.js";
import { extractView, type ViewPath } from "./view/view-extract.js";
import { extractOrgView, type OrgViewPath } from "./view/org-view-extract.js";
import { extractDeployView } from "./view/deploy-view-extract.js";
import { ImportResolver } from "./fs/import-resolver.js";
import { getBuiltinStyleSheet } from "./builtins/default-style.js";
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

export type DiagramType = "system" | "deploy" | "org";

export interface DeployBlockInfo {
  id: string;
  label: string;
}

/** Options for compile() and compileProject(). */
export interface CompileOptions {
  /** Which diagram to render. Defaults to "system". */
  diagramType?: DiagramType;
  /** Optional .krs.style content. Do NOT pre-concatenate icon theme when using displayMode "icon". */
  styleSource?: string;
  /** Drill-down path for system and org diagrams. Ignored for deploy. */
  viewPath?: ViewPath;
  /** Active deploy container ID. Deploy diagram only. */
  selectedDeployId?: string;
  /** "icon" switches nodes to fixed-size icon card layout. */
  displayMode?: DisplayMode;
}

export interface SystemCompileResult {
  diagramType: "system";
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  hasDeployDiagram: boolean;
  deployBlocks: DeployBlockInfo[];
}

export interface DeployCompileResult {
  diagramType: "deploy";
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  deployBlocks: DeployBlockInfo[];
}

export interface OrgCompileResult {
  diagramType: "org";
  svg: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
  nodePathIndex: Map<string, string[]>;
}

/** Discriminated union of all compile result types. Narrow on `diagramType` to access type-specific fields. */
export type CompileResult = SystemCompileResult | DeployCompileResult | OrgCompileResult;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _compileCore(krsSource: string, opts: CompileOptions): CompileResult {
  const { diagramType = "system", styleSource, viewPath, selectedDeployId, displayMode } = opts;

  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const diagnostics = [...parseResult.diagnostics];

  // Build sheets for conflict analysis: [builtin, ...userSheets]
  // Icon theme is intentionally excluded from analysis to avoid false style-conflict warnings.
  const sheets: StyleSheet[] = [getBuiltinStyleSheet()];
  if (styleSource) {
    const styleResult = StyleParser.parse(styleSource);
    diagnostics.push(...styleResult.diagnostics);
    sheets.push(styleResult.value);
  }
  const systemSheetCount = 1; // only builtin counts as system for conflict detection
  const warnings = analyze(parseResult.value, sheets, systemSheetCount);

  // For style resolution, icon theme is appended last so it takes highest priority for `shape`.
  // This ensures Icon Mode is immune to `shape` overrides from user or builtin stylesheets.
  const resolveSheets = displayMode === "icon" ? [...sheets, getIconThemeStyleSheet()] : sheets;

  if (diagramType === "org") {
    const slice = extractOrgView(parseResult.value.organizations, viewPath ?? []);
    const styles = resolveStyles(
      parseResult.value.systems,
      resolveSheets,
      undefined,
      parseResult.value.organizations,
    );
    const svg = _renderOrgView(slice, styles, displayMode);
    return {
      diagramType: "org",
      svg,
      diagnostics,
      warnings,
      nodePathIndex: parseResult.value.nodePathIndex,
    };
  }

  // system / deploy shared setup
  const deploySliceForStyle = extractDeployView(
    parseResult.value.deploys,
    parseResult.value.systems,
    selectedDeployId,
  );
  const deployUnits = [
    ...deploySliceForStyle.containers.flatMap((c) => c.units),
    ...deploySliceForStyle.unclassifiedUnits,
  ];
  const styles = resolveStyles(
    parseResult.value.systems,
    resolveSheets,
    deployUnits,
    undefined,
    parseResult.value.domains,
  );
  const hasDeployDiagram = parseResult.value.deploys.length > 0;
  const deployBlocks = parseResult.value.deploys.map((d) => ({ id: d.id, label: d.label ?? d.id }));
  const serviceIdsWithDeploy = new Set(deploySliceForStyle.containers.map((c) => c.serviceId));
  const ownerIndex = parseResult.value.ownerIndex;

  if (diagramType === "deploy") {
    const svg = renderDeploy(deploySliceForStyle, styles, displayMode);
    const nodeMetadata = buildDeployNodeMetadata(deploySliceForStyle);
    return { diagramType: "deploy", svg, warnings, diagnostics, nodeMetadata, deployBlocks };
  }

  // system (default)
  const viewSlice = extractView(
    parseResult.value.systems,
    viewPath ?? [],
    parseResult.value.domains,
  );
  const svg = render(viewSlice, styles, serviceIdsWithDeploy, ownerIndex, displayMode);
  const nodeMetadata = buildNodeMetadata(viewSlice, serviceIdsWithDeploy, ownerIndex);
  return {
    diagramType: "system",
    svg,
    warnings,
    diagnostics,
    nodeMetadata,
    hasDeployDiagram,
    deployBlocks,
  };
}

async function _compileProjectCore(
  entryPath: string,
  fs: FileSystemProvider,
  opts: CompileOptions,
): Promise<CompileResult> {
  const { diagramType = "system", viewPath, selectedDeployId, displayMode } = opts;

  const resolver = new ImportResolver(fs);
  const resolved = await resolver.resolve(entryPath);
  const diagnostics = [...resolved.diagnostics];

  // Build sheets for conflict analysis: [builtin, ...userSheets]
  // Icon theme is intentionally excluded from analysis to avoid false style-conflict warnings.
  const allSheets = [getBuiltinStyleSheet(), ...resolved.styleSheets];
  const systemSheetCount = 1; // only builtin counts as system for conflict detection
  const warnings = analyze(resolved.krsFile, allSheets, systemSheetCount);

  // For style resolution, icon theme is appended last so it takes highest priority for `shape`.
  // This ensures Icon Mode is immune to `shape` overrides from user or builtin stylesheets.
  const resolveSheets =
    displayMode === "icon" ? [...allSheets, getIconThemeStyleSheet()] : allSheets;

  if (diagramType === "org") {
    const slice = extractOrgView(resolved.krsFile.organizations, viewPath ?? []);
    const styles = resolveStyles(
      resolved.krsFile.systems,
      resolveSheets,
      undefined,
      resolved.krsFile.organizations,
    );
    const svg = _renderOrgView(slice, styles, displayMode);
    return {
      diagramType: "org",
      svg,
      diagnostics,
      warnings,
      nodePathIndex: resolved.krsFile.nodePathIndex,
    };
  }

  // system / deploy shared setup
  const deploySliceForStyle = extractDeployView(
    resolved.krsFile.deploys,
    resolved.krsFile.systems,
    selectedDeployId,
  );
  const deployUnits = [
    ...deploySliceForStyle.containers.flatMap((c) => c.units),
    ...deploySliceForStyle.unclassifiedUnits,
  ];
  const styles = resolveStyles(
    resolved.krsFile.systems,
    resolveSheets,
    deployUnits,
    undefined,
    resolved.krsFile.domains,
  );
  const hasDeployDiagram = resolved.krsFile.deploys.length > 0;
  const deployBlocks = resolved.krsFile.deploys.map((d) => ({
    id: d.id,
    label: d.label ?? d.id,
  }));
  const serviceIdsWithDeploy = new Set(deploySliceForStyle.containers.map((c) => c.serviceId));
  const ownerIndex = resolved.krsFile.ownerIndex;

  if (diagramType === "deploy") {
    const svg = renderDeploy(deploySliceForStyle, styles, displayMode);
    const nodeMetadata = buildDeployNodeMetadata(deploySliceForStyle);
    return { diagramType: "deploy", svg, warnings, diagnostics, nodeMetadata, deployBlocks };
  }

  // system (default)
  const viewSlice = extractView(resolved.krsFile.systems, viewPath ?? [], resolved.krsFile.domains);
  const svg = render(viewSlice, styles, serviceIdsWithDeploy, ownerIndex, displayMode);
  const nodeMetadata = buildNodeMetadata(viewSlice, serviceIdsWithDeploy, ownerIndex);
  return {
    diagramType: "system",
    svg,
    warnings,
    diagnostics,
    nodeMetadata,
    hasDeployDiagram,
    deployBlocks,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile a .krs source string to SVG.
 *
 * @param krsSource - The raw .krs diagram source
 * @param options   - Compile options (diagramType, styleSource, viewPath, etc.)
 */
export function compile(krsSource: string, options?: CompileOptions): CompileResult;
/**
 * @deprecated Use `compile(krsSource, options)` instead.
 *
 * When `displayMode === "icon"`, the icon theme stylesheet is automatically injected.
 * Callers must NOT pre-concatenate `ICON_THEME_STYLE_SOURCE` into `styleSource`.
 */
export function compile(
  krsSource: string,
  styleSource?: string,
  viewPath?: ViewPath,
  diagramType?: "system" | "deploy",
  selectedDeployId?: string,
  displayMode?: DisplayMode,
): SystemCompileResult | DeployCompileResult;
export function compile(
  krsSource: string,
  optionsOrStyle?: CompileOptions | string,
  viewPath?: ViewPath,
  diagramType?: "system" | "deploy",
  selectedDeployId?: string,
  displayMode?: DisplayMode,
): CompileResult {
  const opts: CompileOptions =
    typeof optionsOrStyle === "object" || optionsOrStyle === undefined
      ? (optionsOrStyle ?? {})
      : { styleSource: optionsOrStyle, viewPath, diagramType, selectedDeployId, displayMode };
  return _compileCore(krsSource, opts);
}

/**
 * Compile a .krs project from the filesystem.
 * Recursively resolves @import / import declarations and merges all files.
 *
 * @param entryPath - Path to the entry .krs file
 * @param fs        - FileSystemProvider implementation
 * @param options   - Compile options (diagramType, viewPath, etc.)
 */
export function compileProject(
  entryPath: string,
  fs: FileSystemProvider,
  options?: CompileOptions,
): Promise<CompileResult>;
/**
 * @deprecated Use `compileProject(entryPath, fs, options)` instead.
 */
export function compileProject(
  entryPath: string,
  fs: FileSystemProvider,
  viewPath?: ViewPath,
  diagramType?: "system" | "deploy",
  selectedDeployId?: string,
  displayMode?: DisplayMode,
): Promise<SystemCompileResult | DeployCompileResult>;
export async function compileProject(
  entryPath: string,
  fs: FileSystemProvider,
  optionsOrViewPath?: CompileOptions | ViewPath,
  diagramType?: "system" | "deploy",
  selectedDeployId?: string,
  displayMode?: DisplayMode,
): Promise<CompileResult> {
  const opts: CompileOptions =
    Array.isArray(optionsOrViewPath) || optionsOrViewPath === undefined
      ? {
          viewPath: optionsOrViewPath as ViewPath | undefined,
          diagramType,
          selectedDeployId,
          displayMode,
        }
      : optionsOrViewPath;
  return _compileProjectCore(entryPath, fs, opts);
}

/**
 * @deprecated Use `compile(krsSource, { diagramType: "org", styleSource, viewPath })` instead.
 */
export function compileOrgView(
  krsSource: string,
  styleSource?: string,
  orgPath?: OrgViewPath,
): OrgCompileResult {
  return _compileCore(krsSource, {
    diagramType: "org",
    styleSource,
    viewPath: orgPath,
  }) as OrgCompileResult;
}

/**
 * @deprecated Use `compileProject(entryPath, fs, { diagramType: "org", viewPath, displayMode })` instead.
 */
export async function compileProjectOrgView(
  entryPath: string,
  fs: FileSystemProvider,
  orgPath?: OrgViewPath,
  displayMode?: DisplayMode,
): Promise<OrgCompileResult> {
  return _compileProjectCore(entryPath, fs, {
    diagramType: "org",
    viewPath: orgPath,
    displayMode,
  }) as Promise<OrgCompileResult>;
}

// ---------------------------------------------------------------------------
// Node metadata builders (internal)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Multi-level SVG builders
// ---------------------------------------------------------------------------

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
): SvgResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _buildDrillDownSvg(parseResult.value, styleSource, displayMode);
  return { svg: result.svg, diagnostics: [...parseResult.diagnostics, ...result.diagnostics] };
}

/**
 * Builds a single SVG with all drill-down levels stacked vertically.
 * All levels are visible simultaneously — no interaction required.
 */
export function buildAllLayersSvg(
  krsSource: string,
  styleSource?: string,
  displayMode?: DisplayMode,
): SvgResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _buildAllLayersSvg(parseResult.value, styleSource, displayMode);
  return { svg: result.svg, diagnostics: [...parseResult.diagnostics, ...result.diagnostics] };
}

/**
 * Builds a single SVG with all org drill-down levels stacked vertically.
 * All org levels (root teams, sub-teams) are visible simultaneously.
 */
export function buildAllLayersSvgOrg(
  krsSource: string,
  styleSource?: string,
  displayMode?: DisplayMode,
): SvgResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _buildAllLayersSvgOrg(parseResult.value, styleSource, displayMode);
  return { svg: result.svg, diagnostics: [...parseResult.diagnostics, ...result.diagnostics] };
}

/**
 * Builds a single SVG with all org drill-down levels navigable via CSS :target + :has().
 * No JavaScript required. Each level is hidden/shown by CSS based on the URL fragment.
 */
export function buildDrillDownSvgOrg(
  krsSource: string,
  styleSource?: string,
  displayMode?: DisplayMode,
): SvgResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _buildDrillDownSvgOrg(parseResult.value, styleSource, displayMode);
  return { svg: result.svg, diagnostics: [...parseResult.diagnostics, ...result.diagnostics] };
}

/**
 * Builds a single SVG bundling system, deploy, and org views with CSS-only tab navigation.
 * Each view supports drill-down via CSS :target + :has(). No JavaScript required.
 */
export function buildAllViewsSvg(
  krsSource: string,
  styleSource?: string,
  displayMode?: DisplayMode,
): SvgResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _buildAllViewsSvg(parseResult.value, styleSource, displayMode);
  return { svg: result.svg, diagnostics: [...parseResult.diagnostics, ...result.diagnostics] };
}

/**
 * Compile a .krs project from the filesystem and build a bundled all-views SVG.
 * Recursively resolves @import / import declarations and merges all files.
 * The resulting SVG bundles system, deploy, and org views with CSS-only tab navigation.
 *
 * @param entryPath - Path to the entry .krs file
 * @param fs        - FileSystemProvider implementation
 * @param styleSource - Optional .krs.style content
 * @param displayMode - Layout display mode ("icon" | "shape")
 */
export async function buildAllViewsSvgProject(
  entryPath: string,
  fs: FileSystemProvider,
  styleSource?: string,
  displayMode?: DisplayMode,
): Promise<SvgResult> {
  const resolver = new ImportResolver(fs);
  const resolved = await resolver.resolve(entryPath);
  const result = _buildAllViewsSvg(resolved.krsFile, styleSource, displayMode);
  return {
    svg: result.svg,
    diagnostics: [...resolved.diagnostics, ...result.diagnostics],
  };
}
