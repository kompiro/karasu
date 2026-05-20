export type {
  KrsFile,
  KrsNode,
  KrsEdge,
  LinkEntry,
  DeployBlock,
  DeployNode,
  ImportDeclaration,
  Diagnostic,
  DiagnosticCode,
  DiagnosticParamsByCode,
  DiagnosticSeverity,
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
  ClientResource,
  ClientResourceKind,
  ClientCapability,
} from "./types/ast.js";
import type {
  ClientResource as ClientResourceImpl,
  ClientCapability as ClientCapabilityImpl,
} from "./types/ast.js";

export type {
  StyleSheet,
  StyleRule,
  StyleSelector,
  ResolvedNodeStyle,
  ResolvedEdgeStyle,
  ResolvedStyles,
  ShapeKind,
  EdgeDirection,
} from "./types/style.js";

export type {
  Warning,
  WarningKind,
  WarningParamsByKind,
  WarningSeverity,
  FormattedWarning,
} from "./types/warnings.js";
export { warningSeverity } from "./types/warnings.js";
export { tidyStyleSheet, type TidyOptions, type TidyResult } from "./style/tidy.js";
export { serializeStyleSheet } from "./style/serialize.js";
export { validateStyleValues } from "./style/value-validator.js";

export type { ViewPath, ViewSlice, DomainEdgeDetail } from "./view/view-extract.js";
export { extractView } from "./view/view-extract.js";
export type {
  CrudMatrix,
  CrudMatrixRow,
  CrudMatrixColumn,
  CrudMatrixCell,
  CrudMatrixOptions,
  CrudTally,
  CrudVerb,
  InfraKind,
} from "./view/crud-matrix-extract.js";
export {
  extractCrudMatrix,
  cellKey,
  formatCell,
  CRUD_VERB_ORDER,
} from "./view/crud-matrix-extract.js";
export {
  formatMatrixAsMarkdown,
  formatMatrixAsCsv,
  type CrudMatrixFormatOptions,
} from "./view/crud-matrix-format.js";
export { renderMatrixAsSvg, type MatrixSvgOptions } from "./render/matrix-svg.js";
export type { OrgViewPath, OrgViewSlice } from "./view/org-view-extract.js";
export { extractOrgView } from "./view/org-view-extract.js";
export type {
  DeployViewSlice,
  DeployContainer,
  DeployGhostEdge,
} from "./view/deploy-view-extract.js";
export { extractDeployView } from "./view/deploy-view-extract.js";

export { applyKrsPatch } from "./patch/krs-patch.js";
export type { PatchOperation } from "./patch/krs-patch.js";

export { format, FormatError } from "./formatter/formatter.js";
export { Parser } from "./parser/parser.js";
export { StyleParser } from "./parser/style-parser.js";
export {
  assignEdgeCanonicalIds,
  edgeBaseId,
  validateProjectEdgeIdUniqueness,
} from "./resolver/canonical-id.js";
export { resolveStyles } from "./resolver/style-resolver.js";
export { getBuiltinStyleSheet, BUILTIN_STYLE_SOURCE } from "./builtins/default-style.js";
export {
  getIconThemeStyleSheet,
  ICON_THEME_STYLE_SOURCE,
  iconNameForNode,
  CLIENT_SUBTYPE_TAGS,
  type ClientSubtypeTag,
} from "./builtins/icon-theme.js";
export {
  type ExampleProject,
  EC_PLATFORM_PROJECTS,
  GETTING_STARTED_PROJECT,
  GETTING_STARTED_PROJECT_EN,
  CLIENT_MCP_PROJECT,
  FEATURE_SAMPLES_PROJECT,
  MULTI_FILE_SYSTEM_PROJECT,
} from "./builtins/examples.js";
export {
  getReference,
  type ReferenceLocale,
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
export type { SvgResult, AllViewsSvgResult } from "./renderer/all-layers-svg.js";
export { render, renderFromLayout, sanitizeId } from "./renderer/svg-renderer.js";

export {
  exportDrawio,
  type DrawioExportInput,
  type DrawioPage,
} from "./exporter/drawio/drawio-exporter.js";
export {
  buildDrawio,
  buildDrawioProject,
  type BuildDrawioOptions,
  type DrawioBuildResult,
  type DrawioViewSelection,
} from "./exporter/drawio/build-drawio-project.js";

export { renderOrgView } from "./renderer/org-renderer.js";
export {
  renderOrgTreeView,
  collectAllTeamIds,
  type RenderOrgTreeOptions,
} from "./renderer/org-tree-renderer.js";
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
} from "./shapes/shape-registry.js";
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

import type { ParseResult, OrganizationBlock, SystemNode, DeployBlock } from "./types/ast.js";
import type { KrsFile } from "./types/ast.js";
import type { StyleSheet, ResolvedStyles } from "./types/style.js";
import type { Warning } from "./types/warnings.js";
import type { FileSystemProvider } from "./fs/types.js";
import { Parser } from "./parser/parser.js";
import { StyleParser } from "./parser/style-parser.js";
import { validateStyleValues } from "./style/value-validator.js";
import {
  assignEdgeCanonicalIds,
  validateProjectEdgeIdUniqueness,
} from "./resolver/canonical-id.js";
import { resolveStyles } from "./resolver/style-resolver.js";
import { analyze } from "./resolver/warnings.js";
import { render } from "./renderer/svg-renderer.js";
import {
  buildDrillDownSvg as _buildDrillDownSvg,
  buildDrillDownSvgOrg as _buildDrillDownSvgOrg,
  buildAllViewsSvg as _buildAllViewsSvg,
  bundleSingleLevelViews,
} from "./renderer/drill-down-svg.js";
import {
  buildAllLayersSvg as _buildAllLayersSvg,
  buildAllLayersSvgOrg as _buildAllLayersSvgOrg,
  type SvgResult,
  type AllViewsSvgResult,
} from "./renderer/all-layers-svg.js";

import type { DisplayMode } from "./renderer/layout.js";
import { renderOrgView as _renderOrgView } from "./renderer/org-renderer.js";
import { collectLegendUsage } from "./legend/usage.js";
import { renderDeploy } from "./renderer/deploy-renderer.js";
import { extractView, type ViewPath } from "./view/view-extract.js";
import { withUnassignedSystem } from "./view/unassigned-system.js";
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
  realizes?: string[];
  tags: string[];
  annotations: string[];
  hasChildren: boolean;
  /** Client-only: operation-tied storage resources, in declaration order. */
  resources?: ClientResourceImpl[];
  /** Client-only: device / browser capabilities, in declaration order. */
  capabilities?: ClientCapabilityImpl[];
  /** True when this service/domain node has a corresponding deploy container */
  hasDeployContainer?: boolean;
  /**
   * Full drill-down ViewPath for this node (includes system ID as first segment).
   * Available for service and domain nodes. Use this for drill-down navigation
   * instead of appending the nodeId to the current viewPath.
   */
  viewPath?: string[];
}

export type DiagramType = "system" | "deploy" | "org";

export interface DeployBlockInfo {
  id: string;
  label: string;
}

export type { EmptyStateLabels } from "./renderer/empty-state-labels.js";
import type { EmptyStateLabels } from "./renderer/empty-state-labels.js";

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
  /** Translated labels for renderer-embedded empty-state messages. */
  emptyStateLabels?: EmptyStateLabels;
}

export interface SystemCompileResult {
  diagramType: "system";
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  hasDeployDiagram: boolean;
  /**
   * Whether the project has at least one `organization` block. Mirrors
   * `hasDeployDiagram` so app-level auto-switch hooks can read every
   * "is view X populated?" flag from a single compile result instead of
   * racing the org compile (Issue #923).
   */
  hasOrgDiagram: boolean;
  deployBlocks: DeployBlockInfo[];
  /**
   * Fully resolved system tree (all imports merged), with a synthetic
   * `__unassigned__` system wrapping any top-level orphan services / domains /
   * infra blocks so consumers can walk a single system list and reach every
   * usecase / resource. Use for breadcrumb traversal and for view extractors
   * such as `extractCrudMatrix`.
   */
  systems: SystemNode[];
  /** Maps each node id to the file path where it is defined. */
  nodeFileIndex: Map<string, string>;
}

export interface DeployCompileResult {
  diagramType: "deploy";
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  deployBlocks: DeployBlockInfo[];
  /**
   * All deploy blocks with their nodes, as parsed. Unlike the rendered
   * `svg` (one selected block) this carries the full tree so consumers
   * such as the App Outline can list every block. Flat: block → nodes.
   */
  deployTree: DeployBlock[];
}

export interface OrgCompileResult {
  diagramType: "org";
  svg: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
  nodePathIndex: Map<string, string[]>;
  organizations: OrganizationBlock[];
  /** Resolved node/edge styles for use in tree view rendering. */
  styles: ResolvedStyles;
}

/** Discriminated union of all compile result types. Narrow on `diagramType` to access type-specific fields. */
export type CompileResult = SystemCompileResult | DeployCompileResult | OrgCompileResult;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Common inputs for the shared compile pipeline, prepared by each entry point. */
interface PreparedCompileInput {
  krsFile: KrsFile;
  diagnostics: Diagnostic[];
  sheets: StyleSheet[];
  nodeFileIndex: Map<string, string>;
}

/**
 * Shared compile pipeline. Both _compileCore and _compileProjectCore delegate
 * here after preparing their inputs (parsing source vs resolving imports).
 */
function _compileFromPreparedInput(
  input: PreparedCompileInput,
  opts: CompileOptions,
): CompileResult {
  const { krsFile, diagnostics, sheets, nodeFileIndex } = input;
  const {
    diagramType = "system",
    viewPath,
    selectedDeployId,
    displayMode,
    emptyStateLabels,
  } = opts;

  // Project-wide edge author-id uniqueness. Runs once before view extraction
  // so collisions between explicit edges and resource rows surface even when
  // they live in different views' slices.
  diagnostics.push(...validateProjectEdgeIdUniqueness(krsFile));

  const systemSheetCount = 1; // only builtin counts as system for conflict detection
  const warnings = analyze(krsFile, sheets, systemSheetCount);

  // Phase 3 value-level validator. Walk every user sheet (sheets[0] is
  // the builtin theme; trust it) and translate the validator's
  // parser-shaped Diagnostics into Warnings so the App's WarningPanel
  // displays them next to the existing `style-column-invalid-value`
  // entry. LSP / CLI invoke `validateStyleValues` directly, so this
  // translation is only for the App / compile-pipeline path.
  for (let i = 1; i < sheets.length; i++) {
    for (const d of validateStyleValues(sheets[i])) {
      const w = diagnosticToWarning(d);
      if (w) warnings.push(w);
    }
  }

  // Merge structural style-resolver warnings (e.g. invalid `column` value)
  // into the analyze() output. Both sources speak the same Warning shape;
  // the ResolvedStyleWarning is just a narrow projection that keeps the
  // resolver decoupled from the warnings type union.
  const mergeResolvedStyleWarnings = (styles: ResolvedStyles): void => {
    for (const w of styles.warnings) {
      switch (w.kind) {
        case "style-column-invalid-value":
          warnings.push({
            kind: "style-column-invalid-value",
            params: { nodeId: w.nodeId, value: w.value },
          });
          break;
        case "style-column-ignored-non-system-view":
          warnings.push({
            kind: "style-column-ignored-non-system-view",
            params: { nodeId: w.nodeId, viewType: w.viewType },
          });
          break;
        default: {
          // Exhaustiveness guard — adding a new ResolvedStyleWarning variant
          // without updating this switch will fail the build.
          const _exhaustive: never = w;
          throw new Error(`Unhandled ResolvedStyleWarning kind: ${JSON.stringify(_exhaustive)}`);
        }
      }
    }
  };

  // For style resolution, icon theme is appended last so it takes highest priority for `shape`.
  // This ensures Icon Mode is immune to `shape` overrides from user or builtin stylesheets.
  const resolveSheets = displayMode === "icon" ? [...sheets, getIconThemeStyleSheet()] : sheets;

  if (diagramType === "org") {
    const slice = extractOrgView(krsFile.organizations, viewPath ?? []);
    const styles = resolveStyles(krsFile.systems, resolveSheets, undefined, krsFile.organizations);
    mergeResolvedStyleWarnings(styles);
    const svg = _renderOrgView(slice, styles, displayMode, undefined, {
      emptyLabels: emptyStateLabels,
      legends: krsFile.legends,
      styleSheets: resolveSheets,
      legendUsage: collectLegendUsage(krsFile),
    });
    return {
      diagramType: "org",
      svg,
      diagnostics,
      warnings,
      nodePathIndex: krsFile.nodePathIndex,
      organizations: krsFile.organizations,
      styles,
    };
  }

  // system / deploy shared setup.
  // Pass the orphan-wrapped systems list so `realizes` targets that point at
  // top-level (unassigned) services/domains resolve to their declared labels
  // instead of degrading to the bare id.
  const effectiveSystems = withUnassignedSystem(krsFile);
  const deploySliceForStyle = extractDeployView(
    krsFile.deploys,
    effectiveSystems,
    selectedDeployId,
  );
  const deployUnits = [
    ...deploySliceForStyle.containers.flatMap((c) => c.units),
    ...deploySliceForStyle.unclassifiedUnits,
  ];
  const hasDeployDiagram = krsFile.deploys.length > 0;
  const hasOrgDiagram = krsFile.organizations.length > 0;
  const deployBlocks = krsFile.deploys.map((d) => ({ id: d.id, label: d.label ?? d.id }));
  const serviceIdsWithDeploy = new Set(deploySliceForStyle.containers.map((c) => c.serviceId));
  const ownerIndex = krsFile.ownerIndex;

  if (diagramType === "deploy") {
    const styles = resolveStyles(krsFile.systems, resolveSheets, deployUnits, undefined, [
      ...krsFile.services,
      ...krsFile.domains,
    ]);
    mergeResolvedStyleWarnings(styles);
    const svg = renderDeploy(deploySliceForStyle, styles, displayMode, {
      emptyLabels: emptyStateLabels,
      legends: krsFile.legends,
      styleSheets: resolveSheets,
      legendUsage: collectLegendUsage(krsFile),
      viewScope: "deploy",
    });
    const nodeMetadata = buildDeployNodeMetadata(deploySliceForStyle);
    return {
      diagramType: "deploy",
      svg,
      warnings,
      diagnostics,
      nodeMetadata,
      deployBlocks,
      deployTree: krsFile.deploys,
    };
  }

  // system (default)
  // extractView must be called before resolveStyles so that derived edges (e.g. implicit
  // service edges synthesized from cross-service domain edges) can be included in the
  // edgeStyles cache. Without this, derived edges fall back to defaultEdgeStyle.
  //
  // `effectiveSystems` (computed above) wraps top-level (unassigned)
  // services/domains in a synthesized "Unassigned" pseudo-system so they
  // render in their own labeled frame rather than being merged into
  // systems[0]. extractView only needs the systems list; the legacy
  // unassigned* params are left empty for that reason.
  const viewSlice = extractView(effectiveSystems, viewPath ?? []);
  diagnostics.push(...assignEdgeCanonicalIds(viewSlice.childEdges));
  const styles = resolveStyles(
    effectiveSystems,
    resolveSheets,
    deployUnits,
    undefined,
    undefined,
    viewSlice.childEdges,
  );
  mergeResolvedStyleWarnings(styles);
  const svg = render(viewSlice, styles, serviceIdsWithDeploy, ownerIndex, displayMode, undefined, {
    emptyLabels: emptyStateLabels,
    legends: krsFile.legends,
    styleSheets: resolveSheets,
    legendUsage: collectLegendUsage(krsFile),
    viewScope: "system",
  });
  const nodeMetadata = buildNodeMetadata(
    viewSlice,
    serviceIdsWithDeploy,
    ownerIndex,
    krsFile.nodePathIndex,
  );
  return {
    diagramType: "system",
    svg,
    warnings,
    diagnostics,
    nodeMetadata,
    hasDeployDiagram,
    hasOrgDiagram,
    deployBlocks,
    systems: effectiveSystems,
    nodeFileIndex,
  };
}

function _compileCore(krsSource: string, opts: CompileOptions): CompileResult {
  const { styleSource } = opts;

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
  // Value-level validation runs inside `_compileFromPreparedInput` so
  // its output joins the existing `warnings` channel (not `diagnostics`)
  // and shows up in the App's WarningPanel.

  return _compileFromPreparedInput(
    { krsFile: parseResult.value, diagnostics, sheets, nodeFileIndex: new Map<string, string>() },
    opts,
  );
}

async function _compileProjectCore(
  entryPath: string,
  fs: FileSystemProvider,
  opts: CompileOptions,
): Promise<CompileResult> {
  const resolver = new ImportResolver(fs);
  const resolved = await resolver.resolve(entryPath);
  const diagnostics = [...resolved.diagnostics];

  // Build sheets for conflict analysis: [builtin, ...userSheets]
  // Icon theme is intentionally excluded from analysis to avoid false style-conflict warnings.
  const sheets = [getBuiltinStyleSheet(), ...resolved.styleSheets];
  // Value-level validation runs inside `_compileFromPreparedInput` so
  // its output joins the existing `warnings` channel (not `diagnostics`)
  // and shows up in the App's WarningPanel.

  return _compileFromPreparedInput(
    {
      krsFile: resolved.krsFile,
      diagnostics,
      sheets,
      nodeFileIndex: resolved.krsFile.nodeFileIndex,
    },
    opts,
  );
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
  nodePathIndex?: Map<string, string[]>,
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
      resources:
        node.kind === "client" && node.properties.resources.length > 0
          ? [...node.properties.resources]
          : undefined,
      capabilities:
        node.kind === "client" && node.properties.capabilities.length > 0
          ? [...node.properties.capabilities]
          : undefined,
      hasDeployContainer: isServiceOrDomain ? (serviceIdsWithDeploy?.has(id) ?? false) : undefined,
      viewPath: nodePathIndex?.get(id),
    });
  }

  for (const node of viewSlice.childNodes) {
    addNode(node);
  }
  for (const node of viewSlice.ghostUsers) {
    addNode(node);
  }
  // Root view (multi-system): add services from each system so drill-down has viewPath metadata
  for (const sys of viewSlice.systems) {
    for (const child of sys.children) {
      addNode(child);
    }
  }
  // Service view: add visible services from ghost systems (outgoing)
  for (const gs of viewSlice.ghostSystems) {
    for (const svc of gs.visibleServices) {
      addNode(svc);
    }
  }
  // Service view: add visible services from caller ghost systems (incoming)
  for (const gs of viewSlice.callerGhostSystems) {
    for (const svc of gs.visibleServices) {
      addNode(svc);
    }
  }

  return map;
}

function buildDeployNodeMetadata(deploySlice: DeployViewSlice): Map<string, NodeMetadata> {
  const map = new Map<string, NodeMetadata>();

  function makeEntry(unit: DeployNode): NodeMetadata {
    return {
      kind: unit.kind,
      label: unit.id,
      links: [],
      tags: [],
      annotations: [],
      hasChildren: false,
      runtime: unit.properties.runtime,
      realizes: unit.properties.realizes,
    };
  }

  // Classified units: key is "${serviceId}::${unit.id}" to match the layout node key,
  // allowing the same unit to appear in multiple containers with distinct keys.
  for (const container of deploySlice.containers) {
    for (const unit of container.units) {
      map.set(`${container.serviceId}::${unit.id}`, makeEntry(unit));
    }
  }
  // Unclassified units appear exactly once: key is unit.id.
  for (const unit of deploySlice.unclassifiedUnits) {
    map.set(unit.id, makeEntry(unit));
  }

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
  emptyStateLabels?: EmptyStateLabels,
): SvgResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _buildDrillDownSvg(parseResult.value, styleSource, displayMode, emptyStateLabels);
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
  emptyStateLabels?: EmptyStateLabels,
): SvgResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _buildAllLayersSvg(parseResult.value, styleSource, displayMode, emptyStateLabels);
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
  emptyStateLabels?: EmptyStateLabels,
): SvgResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _buildAllLayersSvgOrg(
    parseResult.value,
    styleSource,
    displayMode,
    emptyStateLabels,
  );
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
  emptyStateLabels?: EmptyStateLabels,
): SvgResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _buildDrillDownSvgOrg(
    parseResult.value,
    styleSource,
    displayMode,
    emptyStateLabels,
  );
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
  emptyStateLabels?: EmptyStateLabels,
): AllViewsSvgResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _buildAllViewsSvg(parseResult.value, styleSource, displayMode, emptyStateLabels);
  return {
    svg: result.svg,
    diagnostics: [...parseResult.diagnostics, ...result.diagnostics],
    warnings: result.warnings,
  };
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
): Promise<AllViewsSvgResult> {
  const resolver = new ImportResolver(fs);
  const resolved = await resolver.resolve(entryPath);
  const result = _buildAllViewsSvg(resolved.krsFile, styleSource, displayMode);
  return {
    svg: result.svg,
    diagnostics: [...resolved.diagnostics, ...result.diagnostics],
    warnings: result.warnings,
  };
}

// ---------------------------------------------------------------------------
// Diff API (Issue #650)
// ---------------------------------------------------------------------------

export type { DiffState, NodeDiffMeta, EdgeDiffMeta, DiffedView } from "./diff/view-diff.js";
export { diffSystemViewSlices, edgeKey } from "./diff/view-diff.js";
export type { DiffedDeployView } from "./diff/deploy-view-diff.js";
export { diffDeployViewSlices } from "./diff/deploy-view-diff.js";
export type { DiffedOrgView } from "./diff/org-view-diff.js";
export { diffOrgViewSlices, ownsEdgeKey } from "./diff/org-view-diff.js";

import { diffSystemViewSlices } from "./diff/view-diff.js";
import { diffDeployViewSlices } from "./diff/deploy-view-diff.js";
import { diffOrgViewSlices } from "./diff/org-view-diff.js";
import type { NodeDiffMeta, EdgeDiffMeta } from "./diff/view-diff.js";
import { injectDiffStyle } from "./diff/diff-style.js";

export interface SystemDiffCompileResult {
  diagramType: "system";
  svg: string;
  diagnostics: Diagnostic[];
  /** Diff metadata per node id (for UI hover / detail panel). */
  nodeDiff: Map<string, NodeDiffMeta>;
  /** Diff metadata per edge key (`from->to`). */
  edgeDiff: Map<string, EdgeDiffMeta>;
}

export interface CompileSystemDiffOptions {
  beforeEntryPath: string;
  afterEntryPath: string;
  fs: FileSystemProvider;
  viewPath?: ViewPath;
  displayMode?: DisplayMode;
  /** Translated labels for renderer-embedded empty-state messages. */
  emptyStateLabels?: EmptyStateLabels;
}

/**
 * Compile two `.krs` project entries and produce a system-view SVG annotated
 * with semantic diff state (`data-diff-state="added|removed|changed|unchanged"`).
 *
 * Currently supports the system view only (Issue #650 phase 1).
 * Both entries are loaded from the same FileSystemProvider; supporting
 * cross-FS or in-memory snapshot inputs is tracked as follow-up work.
 */
export async function compileSystemDiff(
  options: CompileSystemDiffOptions,
): Promise<SystemDiffCompileResult> {
  const { beforeEntryPath, afterEntryPath, fs, viewPath, displayMode, emptyStateLabels } = options;

  const resolver = new ImportResolver(fs);
  const [beforeResolved, afterResolved] = await Promise.all([
    resolver.resolve(beforeEntryPath),
    resolver.resolve(afterEntryPath),
  ]);
  const diagnostics = [...beforeResolved.diagnostics, ...afterResolved.diagnostics];
  diagnostics.push(...validateProjectEdgeIdUniqueness(beforeResolved.krsFile));
  diagnostics.push(...validateProjectEdgeIdUniqueness(afterResolved.krsFile));

  const beforeSystems = withUnassignedSystem(beforeResolved.krsFile);
  const afterSystems = withUnassignedSystem(afterResolved.krsFile);

  const beforeSlice = extractView(beforeSystems, viewPath ?? []);
  const afterSlice = extractView(afterSystems, viewPath ?? []);
  diagnostics.push(...assignEdgeCanonicalIds(beforeSlice.childEdges));
  diagnostics.push(...assignEdgeCanonicalIds(afterSlice.childEdges));

  const diffed = diffSystemViewSlices(beforeSlice, afterSlice);

  // Resolve styles against the union (after-side systems augmented with
  // any removed nodes — the union slice's childNodes will be styled via
  // the same fallback path used for ghost nodes).
  const sheets = [
    getBuiltinStyleSheet(),
    ...beforeResolved.styleSheets,
    ...afterResolved.styleSheets,
  ];
  const resolveSheets = displayMode === "icon" ? [...sheets, getIconThemeStyleSheet()] : sheets;
  const styles = resolveStyles(
    afterSystems,
    resolveSheets,
    undefined,
    undefined,
    undefined,
    diffed.slice.childEdges,
  );

  const nodeDiffStateMap = new Map<string, string>();
  for (const [id, meta] of diffed.nodes) {
    nodeDiffStateMap.set(id, meta.state);
  }
  const edgeDiffStateMap = new Map<string, string>();
  for (const [key, meta] of diffed.edges) {
    edgeDiffStateMap.set(key, meta.state);
  }

  const svg = render(
    diffed.slice,
    styles,
    undefined,
    afterResolved.krsFile.ownerIndex,
    displayMode,
    undefined,
    {
      nodeDiffState: nodeDiffStateMap,
      edgeDiffState: edgeDiffStateMap,
      nodeDiffMeta: diffed.nodes,
      emptyLabels: emptyStateLabels,
    },
  );

  return {
    diagramType: "system",
    svg: injectDiffStyle(svg),
    diagnostics,
    nodeDiff: diffed.nodes,
    edgeDiff: diffed.edges,
  };
}

export interface DeployDiffCompileResult {
  diagramType: "deploy";
  svg: string;
  diagnostics: Diagnostic[];
  nodeDiff: Map<string, NodeDiffMeta>;
  edgeDiff: Map<string, EdgeDiffMeta>;
}

export interface CompileDeployDiffOptions {
  beforeEntryPath: string;
  afterEntryPath: string;
  fs: FileSystemProvider;
  /** Deploy block id to compare. Falls back to the first block on each side. */
  selectedDeployId?: string;
  displayMode?: DisplayMode;
  /** Translated labels for renderer-embedded empty-state messages. */
  emptyStateLabels?: EmptyStateLabels;
}

/**
 * Compile two `.krs` project entries and produce a deploy-view SVG annotated
 * with semantic diff state on container groups, deploy units, and ghost edges.
 *
 * Each side picks the deploy block by `selectedDeployId` (or the first block
 * if unset). Mixing different block ids between the two sides is intentional
 * and the diff is computed on whichever blocks resolve.
 */
export async function compileDeployDiff(
  options: CompileDeployDiffOptions,
): Promise<DeployDiffCompileResult> {
  const { beforeEntryPath, afterEntryPath, fs, selectedDeployId, displayMode, emptyStateLabels } =
    options;

  const resolver = new ImportResolver(fs);
  const [beforeResolved, afterResolved] = await Promise.all([
    resolver.resolve(beforeEntryPath),
    resolver.resolve(afterEntryPath),
  ]);
  const diagnostics = [...beforeResolved.diagnostics, ...afterResolved.diagnostics];

  // Orphan-wrap so `realizes` targets that point at top-level (unassigned)
  // services/domains resolve to their declared labels (see extractDeployView).
  const beforeSlice = extractDeployView(
    beforeResolved.krsFile.deploys,
    withUnassignedSystem(beforeResolved.krsFile),
    selectedDeployId,
  );
  const afterSlice = extractDeployView(
    afterResolved.krsFile.deploys,
    withUnassignedSystem(afterResolved.krsFile),
    selectedDeployId,
  );

  const diffed = diffDeployViewSlices(beforeSlice, afterSlice);

  const sheets = [
    getBuiltinStyleSheet(),
    ...beforeResolved.styleSheets,
    ...afterResolved.styleSheets,
  ];
  const resolveSheets = displayMode === "icon" ? [...sheets, getIconThemeStyleSheet()] : sheets;
  const deployUnits = [
    ...diffed.slice.containers.flatMap((c) => c.units),
    ...diffed.slice.unclassifiedUnits,
  ];
  const styles = resolveStyles(
    afterResolved.krsFile.systems,
    resolveSheets,
    deployUnits,
    undefined,
    [...afterResolved.krsFile.services, ...afterResolved.krsFile.domains],
  );

  const nodeDiffStateMap = new Map<string, string>();
  for (const [id, meta] of diffed.nodes) {
    nodeDiffStateMap.set(id, meta.state);
  }
  const edgeDiffStateMap = new Map<string, string>();
  for (const [key, meta] of diffed.edges) {
    edgeDiffStateMap.set(key, meta.state);
  }
  const containerDiffStateMap = new Map<string, string>(diffed.containers);

  const svg = renderDeploy(diffed.slice, styles, displayMode, {
    nodeDiffState: nodeDiffStateMap,
    edgeDiffState: edgeDiffStateMap,
    containerDiffState: containerDiffStateMap,
    emptyLabels: emptyStateLabels,
  });

  return {
    diagramType: "deploy",
    svg: injectDiffStyle(svg),
    diagnostics,
    nodeDiff: diffed.nodes,
    edgeDiff: diffed.edges,
  };
}

export interface OrgDiffCompileResult {
  diagramType: "org";
  svg: string;
  diagnostics: Diagnostic[];
  /** Diff metadata per team / member id. */
  nodeDiff: Map<string, NodeDiffMeta>;
  /** Diff metadata per `ownsEdgeKey(teamId, serviceId)`. */
  edgeDiff: Map<string, EdgeDiffMeta>;
}

export interface CompileOrgDiffOptions {
  beforeEntryPath: string;
  afterEntryPath: string;
  fs: FileSystemProvider;
  viewPath?: ViewPath;
  displayMode?: DisplayMode;
  /** Translated labels for renderer-embedded empty-state messages. */
  emptyStateLabels?: EmptyStateLabels;
}

/**
 * Compile two `.krs` project entries and produce an org-view SVG annotated
 * with semantic diff state (`data-diff-state="added|removed|changed|unchanged"`).
 *
 * Team and member cards carry `data-diff-state`; owned-service buttons carry
 * `data-diff-state` to reflect changes in the `owns` relationship even when
 * the team itself is otherwise unchanged.
 */
export async function compileOrgDiff(
  options: CompileOrgDiffOptions,
): Promise<OrgDiffCompileResult> {
  const { beforeEntryPath, afterEntryPath, fs, viewPath, displayMode, emptyStateLabels } = options;

  const resolver = new ImportResolver(fs);
  const [beforeResolved, afterResolved] = await Promise.all([
    resolver.resolve(beforeEntryPath),
    resolver.resolve(afterEntryPath),
  ]);
  const diagnostics = [...beforeResolved.diagnostics, ...afterResolved.diagnostics];

  const beforeSlice = extractOrgView(beforeResolved.krsFile.organizations, viewPath ?? []);
  const afterSlice = extractOrgView(afterResolved.krsFile.organizations, viewPath ?? []);

  const diffed = diffOrgViewSlices(beforeSlice, afterSlice);

  const sheets = [
    getBuiltinStyleSheet(),
    ...beforeResolved.styleSheets,
    ...afterResolved.styleSheets,
  ];
  const resolveSheets = displayMode === "icon" ? [...sheets, getIconThemeStyleSheet()] : sheets;
  const styles = resolveStyles(
    afterResolved.krsFile.systems,
    resolveSheets,
    undefined,
    afterResolved.krsFile.organizations,
  );

  const nodeDiffStateMap = new Map<string, string>();
  for (const [id, meta] of diffed.nodes) nodeDiffStateMap.set(id, meta.state);
  const edgeDiffStateMap = new Map<string, string>();
  for (const [key, meta] of diffed.edges) edgeDiffStateMap.set(key, meta.state);

  const svg = _renderOrgView(diffed.slice, styles, displayMode, undefined, {
    nodeDiffState: nodeDiffStateMap,
    edgeDiffState: edgeDiffStateMap,
    emptyLabels: emptyStateLabels,
  });

  return {
    diagramType: "org",
    svg: injectDiffStyle(svg),
    diagnostics,
    nodeDiff: diffed.nodes,
    edgeDiff: diffed.edges,
  };
}

export interface CompileBundledDiffOptions {
  beforeEntryPath: string;
  afterEntryPath: string;
  fs: FileSystemProvider;
  displayMode?: DisplayMode;
  emptyStateLabels?: EmptyStateLabels;
}

export interface BundledDiffCompileResult {
  svg: string;
  diagnostics: Diagnostic[];
  /** Per-view diff result for each view that was applicable and rendered. */
  views: {
    system?: SystemDiffCompileResult;
    deploy?: DeployDiffCompileResult;
    org?: OrgDiffCompileResult;
  };
}

/**
 * Compile two `.krs` project entries and produce a bundled SVG that contains
 * diff state annotations for every applicable view (system / deploy / org)
 * with CSS-only tab navigation.
 *
 * Views that don't apply on either side are skipped:
 * - deploy: omitted when neither side has a deploy block
 * - org:    omitted when neither side has any team
 * - system: omitted when neither side has any system / service / domain
 *
 * Mirrors `buildAllViewsSvgProject` (the non-diff bundled variant) but
 * composes `compile{System,Deploy,Org}Diff` outputs instead of fresh renders.
 */
export async function buildAllViewsSvgDiffProject(
  options: CompileBundledDiffOptions,
): Promise<BundledDiffCompileResult> {
  const { beforeEntryPath, afterEntryPath, fs, displayMode, emptyStateLabels } = options;

  const resolver = new ImportResolver(fs);
  const [beforeResolved, afterResolved] = await Promise.all([
    resolver.resolve(beforeEntryPath),
    resolver.resolve(afterEntryPath),
  ]);
  const resolverDiagnostics = [...beforeResolved.diagnostics, ...afterResolved.diagnostics];

  const before = beforeResolved.krsFile;
  const after = afterResolved.krsFile;

  const hasSystem =
    before.systems.length > 0 ||
    after.systems.length > 0 ||
    before.services.length > 0 ||
    after.services.length > 0 ||
    before.domains.length > 0 ||
    after.domains.length > 0;
  const hasDeploy = before.deploys.length > 0 || after.deploys.length > 0;
  const hasOrg =
    (before.organizations?.flatMap((o) => o.teams).length ?? 0) > 0 ||
    (after.organizations?.flatMap((o) => o.teams).length ?? 0) > 0;

  const compileOpts = { beforeEntryPath, afterEntryPath, fs, displayMode, emptyStateLabels };

  const [systemResult, deployResult, orgResult] = await Promise.all([
    hasSystem ? compileSystemDiff(compileOpts) : Promise.resolve(undefined),
    hasDeploy ? compileDeployDiff(compileOpts) : Promise.resolve(undefined),
    hasOrg ? compileOrgDiff(compileOpts) : Promise.resolve(undefined),
  ]);

  const views: BundledDiffCompileResult["views"] = {};
  if (systemResult) views.system = systemResult;
  if (deployResult) views.deploy = deployResult;
  if (orgResult) views.org = orgResult;

  // Each compile*Diff re-resolves both sides via its own ImportResolver and
  // returns the same resolver diagnostics. To avoid duplicates, use the
  // diagnostics from the upfront resolver pass (which is the same data).
  const diagnostics = resolverDiagnostics;

  const bundled = bundleSingleLevelViews({
    system: systemResult?.svg,
    deploy: deployResult?.svg,
    org: orgResult?.svg,
  });

  if (bundled === null) {
    // Nothing applicable — emit a placeholder consistent with non-diff
    // bundled output.
    const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">${
      emptyStateLabels?.systemNoDiagram ?? "No diagram"
    }</text></svg>`;
    return { svg: placeholder, diagnostics, views };
  }

  return { svg: injectDiffStyle(bundled), diagnostics, views };
}

/**
 * Translate a parser-shaped Diagnostic from `validateStyleValues` into
 * the matching `Warning` so the App's WarningPanel displays it next to
 * existing style warnings. Returns `null` for diagnostic codes that are
 * not value-level validator output (defensive — the validator only
 * emits the codes handled below).
 */
function diagnosticToWarning(d: Diagnostic): Warning | null {
  switch (d.code) {
    case "style-invalid-enum-value":
      return { kind: "style-invalid-enum-value", params: d.params };
    case "style-invalid-hex-color":
      return { kind: "style-invalid-hex-color", params: d.params };
    case "style-missing-length-unit":
      return { kind: "style-missing-length-unit", params: d.params };
    case "style-invalid-length-unit":
      return { kind: "style-invalid-length-unit", params: d.params };
    case "style-out-of-range":
      return { kind: "style-out-of-range", params: d.params };
    case "style-unknown-property":
      return { kind: "style-unknown-property", params: d.params };
    default:
      return null;
  }
}

// ─── translate (infra config / API spec → .krs scaffold) ──────────────────────
// Shared by the `karasu translate` CLI and the App's translate UI.
export { translateInfraConfig, wrapInSystem, SYSTEM_NAME_PATTERN } from "./translate/translate.js";
export type {
  TranslateFormat,
  TranslateInfraOptions,
  TranslateResult,
} from "./translate/translate.js";
export type { Translator, TranslatorContext } from "./translate/translator.js";
