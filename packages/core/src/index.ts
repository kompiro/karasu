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
export { INFRA_BLOCK_KINDS, INFRA_KIND_SET, createEmptyKrsFile } from "./types/ast.js";

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
// The facet overlay's palette is public so the app's selector can paint the
// same colour dot the diagram paints (#2174). One source of truth — a second
// palette in the app would drift the moment either side is edited.
export { FACET_OVERLAY_COLORS } from "./renderer/facet-overlay.js";
export { tidyStyleSheet, type TidyOptions, type TidyResult } from "./style/tidy.js";
export { serializeStyleSheet } from "./style/serialize.js";
export { validateStyleValues } from "./style/value-validator.js";

export type { ViewPath, ViewSlice, DomainEdgeDetail } from "./view/view-extract.js";
export { extractView, extractEntityView } from "./view/view-extract.js";
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
export { renderMatrixAsSvg, type MatrixSvgOptions } from "./renderer/matrix-svg.js";
export {
  extractCoverage,
  type CoverageReport,
  type DomainCoverage,
  type CoverageOptions,
} from "./view/coverage-extract.js";
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

export { format, FormatError, serializeKrsFile } from "./formatter/formatter.js";
export {
  synthesizeSharePayload,
  SHARE_STYLE_IMPORT_PATH,
  type SharePayload,
  type ShareTarget,
  type ShareTargetView,
} from "./share/synthesize.js";
export { Parser } from "./parser/parser.js";
export { isSafeLinkUrl } from "./parser/link-url.js";
export { KRS_KEYWORD_NAMES } from "./lexer/lexer.js";
export { KRS_LANGUAGE_VERSION } from "./language-version.js";
export {
  interpretUntil,
  getMigrationIntent,
  type UntilPrecision,
  type MachineUntil,
  type OpaqueUntil,
  type InterpretedUntil,
  type MigrationIntent,
} from "./annotations/migration-intent.js";
export {
  CONFIDENCE_LEVELS,
  getDraftState,
  interpretConfidence,
  type ConfidenceLevel,
  type DraftState,
  type InterpretedConfidence,
  type MachineConfidence,
  type OpaqueConfidence,
} from "./annotations/draft-confidence.js";
export { StyleParser } from "./parser/style-parser.js";
export {
  assignEdgeCanonicalIds,
  edgeBaseId,
  validateProjectEdgeIdUniqueness,
} from "./resolver/canonical-id.js";
export { resolveStyles } from "./resolver/style-resolver.js";
export {
  getBuiltinStyleSheet,
  buildBuiltinStyleSource,
  BUILTIN_STYLE_SOURCE,
  BUILTIN_STYLE_SOURCE_LIGHT,
  type AnnotationBadgeLabels,
} from "./builtins/default-style.js";
export {
  type DiagramTheme,
  type DiagramPalette,
  darkPalette,
  lightPalette,
  resolvePalette,
} from "./renderer/palette.js";
export {
  getIconThemeStyleSheet,
  ICON_THEME_STYLE_SOURCE,
  iconNameForNode,
  CLIENT_SUBTYPE_TAGS,
  type ClientSubtypeTag,
} from "./builtins/icon-theme.js";
export {
  NODE_DETAIL_PROPERTY_FIELDS,
  NODE_DETAIL_ROLE_EMOJI,
  NODE_DETAIL_TAGS_EMOJI,
  NODE_DETAIL_TEAM_EMOJI,
  NODE_DETAIL_KIND_ICON_NAMES,
  type NodeDetailPropertyField,
} from "./builtins/node-detail-fields.js";
export {
  type ExampleProject,
  EC_PLATFORM_PROJECTS,
  EC_PLATFORM_PROJECTS_EN,
  GETTING_STARTED_PROJECT,
  GETTING_STARTED_PROJECT_EN,
  DEPLOY_ONLY_PROJECT,
  DEPLOY_ONLY_PROJECT_EN,
  ORG_ONLY_PROJECT,
  ORG_ONLY_PROJECT_EN,
  CLIENT_MCP_PROJECT,
  FEATURE_SAMPLES_PROJECT,
  FACET_STYLING_PROJECT,
  FACET_STYLING_PROJECT_EN,
  MULTI_FILE_SYSTEM_PROJECT,
  MULTI_FILE_SYSTEM_PROJECT_EN,
} from "./builtins/examples.js";
export {
  type ExampleLang,
  type OpenableExample,
  OPENABLE_EXAMPLES,
  findOpenableExample,
} from "./builtins/openable-examples.js";
export {
  getReference,
  type ReferenceLocale,
  type KarasuReference,
  type SamplesByView,
  type NodeKindInfo,
  type TagInfo,
  type AnnotationInfo,
  type StylePropertyInfo,
  type ShapeInfo,
  type DeployUnitKindInfo,
  type OrgKindInfo,
  type GroupingConstructInfo,
  type RefView,
  type SyntaxSection,
  type SyntaxByView,
  type StyleSelectorExamplesByView,
  type SelectorSpecificityRow,
} from "./builtins/reference.js";
export { analyze } from "./resolver/warnings.js";
export type { DisplayMode } from "./renderer/layout.js";
export type { SvgResult, AllViewsSvgResult } from "./renderer/all-layers-svg.js";
export type { EntityViewResult } from "./renderer/drill-down-svg.js";
export { render, renderFromLayout, sanitizeId, anchorId } from "./renderer/svg-renderer.js";
export type { CategoryId } from "./renderer/category-collapse.js";

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
export {
  normalizePath,
  resolvePath,
  dirname,
  basename,
  extname,
  isSafeRelativePath,
} from "./fs/path-utils.js";

export type { EmptyStateLabels } from "./renderer/empty-state-labels.js";

// ---------------------------------------------------------------------------
// Compile facade (Issue #2014, point 2: relocated to ./compile/compile.ts —
// this barrel only re-exports the public surface, byte-identical in name and
// type to the pre-relocation exports).
// ---------------------------------------------------------------------------

export type {
  NodeMetadata,
  DiagramType,
  DeployBlockInfo,
  CompileOptions,
  SystemCompileResult,
  DeployCompileResult,
  OrgCompileResult,
  CompileResult,
} from "./compile/compile.js";
export {
  compile,
  compileProject,
  compileOrgView,
  compileProjectOrgView,
  buildDrillDownSvg,
  renderEntityView,
  buildAllLayersSvg,
  buildAllLayersSvgOrg,
  buildDrillDownSvgOrg,
  buildAllViewsSvg,
  buildAllViewsSvgProject,
} from "./compile/compile.js";

// ---------------------------------------------------------------------------
// Diff API (Issue #650)
// ---------------------------------------------------------------------------

export type { DiffState, NodeDiffMeta, EdgeDiffMeta, DiffedView } from "./diff/view-diff.js";
export { diffSystemViewSlices, edgeKey } from "./diff/view-diff.js";
export type { DiffedDeployView } from "./diff/deploy-view-diff.js";
export { diffDeployViewSlices } from "./diff/deploy-view-diff.js";
export type { DiffedOrgView } from "./diff/org-view-diff.js";
export { diffOrgViewSlices, ownsEdgeKey } from "./diff/org-view-diff.js";

// Diff compile facade (Issue #2014, point 2: relocated to ./compile/compile-diff.ts).
export type {
  SystemDiffCompileResult,
  CompileSystemDiffOptions,
  DeployDiffCompileResult,
  CompileDeployDiffOptions,
  OrgDiffCompileResult,
  CompileOrgDiffOptions,
  CompileBundledDiffOptions,
  BundledDiffCompileResult,
} from "./compile/compile-diff.js";
export {
  compileSystemDiff,
  compileDeployDiff,
  compileOrgDiff,
  buildAllViewsSvgDiffProject,
} from "./compile/compile-diff.js";

// ─── translate (infra config / API spec → .krs scaffold) ──────────────────────
// Shared by the `karasu translate` CLI and the App's translate UI.
export { translateInfraConfig, wrapInSystem, SYSTEM_NAME_PATTERN } from "./translate/translate.js";
export type {
  TranslateFormat,
  TranslateInfraOptions,
  TranslateResult,
} from "./translate/translate.js";
export type { Translator, TranslatorContext } from "./translate/translator.js";
