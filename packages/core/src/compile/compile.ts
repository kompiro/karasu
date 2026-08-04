// ---------------------------------------------------------------------------
// Compile facade: parse/resolve → view-extract → style-resolve → render.
//
// Relocated from index.ts (Issue #2014, point 2) with zero behavior change —
// only import paths were adjusted from "./x" to "../x" for the new location.
// ---------------------------------------------------------------------------

import type {
  ParseResult,
  OrganizationBlock,
  SystemNode,
  DeployBlock,
  KrsFile,
  Diagnostic,
  LogicalNodeKind,
  DeployNodeKind,
  LinkEntry,
  KrsNode,
  DeployNode,
} from "../types/ast.js";
import type {
  ClientResource as ClientResourceImpl,
  ClientCapability as ClientCapabilityImpl,
} from "../types/ast.js";
import { DEPLOY_AFFORDANCE_KIND_SET, OWNABLE_KIND_SET } from "../types/ast.js";
import type { StyleSheet, ResolvedStyles } from "../types/style.js";
import type { Warning } from "../types/warnings.js";
import type { FileSystemProvider } from "../fs/types.js";
import { Parser } from "../parser/parser.js";
import { StyleParser } from "../parser/style-parser.js";
import { getMigrationIntent, type MigrationIntent } from "../annotations/migration-intent.js";
import { validateStyleValues } from "../style/value-validator.js";
import {
  assignEdgeCanonicalIds,
  validateProjectEdgeIdUniqueness,
} from "../resolver/canonical-id.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { analyze } from "../resolver/warnings.js";
import { render, legendScopeForLogicalSlice } from "../renderer/svg-renderer.js";
import {
  buildGroupLabelIndex,
  buildTeamLabelIndex,
  declaredGroupOrderOf,
} from "../renderer/group-labels.js";
import type { CategoryId } from "../renderer/category-collapse.js";
import {
  buildDrillDownSvg as _buildDrillDownSvg,
  buildDrillDownSvgOrg as _buildDrillDownSvgOrg,
  buildAllViewsSvg as _buildAllViewsSvg,
  renderEntityView as _renderEntityView,
  type EntityViewResult,
} from "../renderer/drill-down-svg.js";
import {
  buildAllLayersSvg as _buildAllLayersSvg,
  buildAllLayersSvgOrg as _buildAllLayersSvgOrg,
  type SvgResult,
  type AllViewsSvgResult,
} from "../renderer/all-layers-svg.js";

import type { DisplayMode } from "../renderer/layout.js";
import { type DiagramTheme } from "../renderer/palette.js";
import { renderOrgView as _renderOrgView } from "../renderer/org-renderer.js";
import { collectLegendUsage } from "../legend/usage.js";
import { resolveFacetOverlay, knownFacetIds } from "../renderer/facet-overlay.js";
import { buildFacetOverview } from "../renderer/facet-overview.js";
import type { FacetOverviewEntry } from "../renderer/facet-overview.js";
import { renderDeploy } from "../renderer/deploy-renderer.js";
import { extractView, type ViewPath } from "../view/view-extract.js";
import { withUnassignedSystem } from "../view/unassigned-system.js";
import { extractOrgView, type OrgViewPath } from "../view/org-view-extract.js";
import { extractDeployView } from "../view/deploy-view-extract.js";
import { ImportResolver } from "../fs/import-resolver.js";
import { getBuiltinStyleSheet, type AnnotationBadgeLabels } from "../builtins/default-style.js";
import { getIconThemeStyleSheet } from "../builtins/icon-theme.js";
import "../renderer/shapes.js"; // ensure built-in shapes are registered
import type { DeployViewSlice } from "../view/deploy-view-extract.js";
import { summarizeDescription } from "../renderer/description-summary.js";
import type { EmptyStateLabels } from "../renderer/empty-state-labels.js";

export interface NodeMetadata {
  kind: LogicalNodeKind | DeployNodeKind;
  label: string;
  description?: string;
  descriptionSummary?: string;
  links: LinkEntry[];
  /** Owning team **id** — the identity `onNavigateToOrg` jumps by. */
  team?: string;
  /**
   * Owning team's declared `label`, when it has one. Detail panels show this
   * and fall back to {@link team}, matching the card chip (Issue #2157).
   */
  teamLabel?: string;
  role?: string;
  runtime?: string;
  /** Deploy-only: the `store` unit's managed-store tech, or an `artifact`'s type. */
  type?: string;
  /** Deploy-only: an `oci` unit's container image reference. */
  image?: string;
  /** Deploy-only: a `job` unit's cron schedule. */
  schedule?: string;
  realizes?: string[];
  tags: string[];
  annotations: string[];
  /**
   * Interpreted migration-intent params (`@deprecated(until:…)` /
   * `@experimental(until:…)` / `@migration_target(from:…)`), when the node
   * carries any. Omitted otherwise so consumers can guard cheaply (#1595).
   */
  migrationIntent?: MigrationIntent;
  hasChildren: boolean;
  /** Client-only: operation-tied storage resources, in declaration order. */
  resources?: ClientResourceImpl[];
  /** Client-only: device / browser capabilities, in declaration order. */
  capabilities?: ClientCapabilityImpl[];
  /**
   * True when this node has a corresponding deploy container. Set for the kinds
   * whose card carries the affordance (`DEPLOY_AFFORDANCE_KIND_SET`:
   * service / domain / client), `undefined` for the rest.
   */
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
  /**
   * Diagram theme. Drives both the renderer chrome palette and which
   * built-in `.krs.style` variant sits at the bottom of the cascade.
   * Defaults to `"dark"` so existing output is unchanged.
   */
  theme?: DiagramTheme;
  /**
   * Translated labels for the built-in annotation badges (@deprecated /
   * @new / @experimental / @migration_target). Omitted keys fall back to
   * the reference-data en labels. User `.krs.style` badge-label rules
   * still override these (cascade is unchanged).
   */
  annotationBadgeLabels?: AnnotationBadgeLabels;
  /**
   * System-view node categories the viewer has collapsed (Issue #1821). Each
   * collapsed category (`"infra"` / `"external"`) is folded to a single ⊕ stub
   * before layout so the diagram reflows. Omit for the default fully-expanded
   * render. System view only; see `docs/design/layer-toggles.md`.
   */
  collapsedCategories?: ReadonlySet<CategoryId>;
  /**
   * Draw the interactive category controls (⊖ / hover frame) for the live
   * preview (Issue #1821). Defaults to false so static outputs stay clean.
   */
  interactive?: boolean;
  /**
   * System-view grouping axis (Issue #1858, P2a). `"team"` stacks each node's
   * owning team (resolved via the `organization`/`owns` block) as a
   * dependency-ordered band with a boundary frame. Omit for the default
   * un-grouped kind-tier layout. System view only; see
   * `docs/design/system-view-grouping.md`.
   */
  groupBy?: "team" | "boundary";
  /**
   * Facet ids the viewer has selected for the overlay (#2174). Viewer state,
   * never model state — nothing here is written back to `.krs`. An empty or
   * absent selection renders exactly as before.
   */
  selectedFacets?: readonly string[];
  /**
   * System-view team ids collapsed to a `<Team> (N)` stub (Issue #1858, P2a).
   * Only meaningful with `groupBy: "team"`. Cross-group edges re-target onto the
   * stub, so collapsing every team yields the group-dependency-DAG view. Omit
   * for the default fully-expanded grouped render.
   */
  collapsedGroups?: ReadonlySet<string>;
  /**
   * System-view service ids expanded in place (Issue #1921). Each named service
   * is drawn with its domain children inside a boundary frame while siblings
   * stay collapsed; cross-boundary edges re-anchor to the exact internal domain.
   * Phase 1 honours at most one entry and only in the ungrouped system view.
   */
  expandedContainers?: ReadonlySet<string>;
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
  /**
   * Whether the project declares at least one `boundary` block (#1822 P2b).
   * Gates the "Group by: boundary" axis in the app the same way
   * `hasOrgDiagram` gates "Group by: team".
   */
  hasBoundaries: boolean;
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
  /**
   * Every facet the model knows, declared-first then reference-only, in the
   * order the overlay assigns colours (#2174). This is what the app's selector
   * offers; intersecting the user's selection with it is what keeps a facet that
   * was edited out of the model from lingering in the selection (TPL-1032).
   */
  facets: { id: string; label?: string }[];
  /**
   * "Which elements belong to facet X", derived from the model (#2177).
   *
   * The centralized audit view the design owes for writing membership
   * element-side. Derived on every compile — there is no authored second copy
   * to drift (TPL-1032). Empty when the model knows no facets.
   */
  facetOverview: FacetOverviewEntry[];
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
  /** Maps each owned service/domain id to its resolved primary owner team id. */
  ownerIndex: Map<string, string>;
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
    theme,
    collapsedCategories,
    interactive,
    groupBy,
    selectedFacets,
    collapsedGroups,
    expandedContainers,
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
        case "style-grid-columns-invalid-value":
          warnings.push({
            kind: "style-grid-columns-invalid-value",
            params: { nodeId: w.nodeId, value: w.value },
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
      theme,
    });
    return {
      diagramType: "org",
      svg,
      diagnostics,
      warnings,
      nodePathIndex: krsFile.nodePathIndex,
      organizations: krsFile.organizations,
      ownerIndex: krsFile.ownerIndex,
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
  // Either boundary form makes the axis worth offering: top-level blocks
  // (`krsFile.boundaries`) or scoped ones declared inside a node block (#2036,
  // in `scopedBoundaryMembership`). Checking only the former hides the Group-by menu
  // for a model whose only boundaries are scoped.
  const hasBoundaries = krsFile.boundaries.length > 0 || krsFile.scopedBoundaryMembership.size > 0;
  const deployBlocks = krsFile.deploys.map((d) => ({ id: d.id, label: d.label ?? d.id }));
  const serviceIdsWithDeploy = new Set(deploySliceForStyle.containers.map((c) => c.serviceId));
  const ownerIndex = krsFile.ownerIndex;
  const teamLabels = buildTeamLabelIndex(krsFile);

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
      theme,
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
  const viewSlice = extractView(effectiveSystems, viewPath ?? [], [], [], expandedContainers);
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
    // Exact-match scope switching (Issue #1513): drill-down levels show only
    // legends whose scope names their root kind, not the top-level set.
    viewScope: legendScopeForLogicalSlice(viewSlice),
    theme,
    collapsedCategories,
    interactive,
    groupBy,
    boundaryMembership: krsFile.boundaryMembership,
    scopedBoundaryMembership: krsFile.scopedBoundaryMembership,
    declaredGroupOrder: declaredGroupOrderOf(krsFile, groupBy),
    groupLabels: buildGroupLabelIndex(krsFile, groupBy),
    teamLabels,
    collapsedGroups,
    // A membership the banded view could not frame is only knowable after
    // layout, so `render` reports it here rather than the parser (#2179).
    diagnosticSink: diagnostics,
    facetOverlay: resolveFacetOverlay(krsFile, selectedFacets),
  });
  const nodeMetadata = buildNodeMetadata(
    viewSlice,
    serviceIdsWithDeploy,
    ownerIndex,
    teamLabels,
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
    hasBoundaries,
    facets: knownFacetIds(krsFile).map((id) => {
      const declared = krsFile.facets.find((f) => f.id === id);
      return declared?.label ? { id, label: declared.label } : { id };
    }),
    facetOverview: buildFacetOverview(krsFile),
    deployBlocks,
    systems: effectiveSystems,
    nodeFileIndex,
  };
}

function _compileCore(krsSource: string, opts: CompileOptions): CompileResult {
  const { styleSource } = opts;

  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const diagnostics = [...parseResult.diagnostics];

  // Build sheets for conflict analysis: [builtin(theme), ...userSheets]
  // Icon theme is intentionally excluded from analysis to avoid false style-conflict warnings.
  const sheets: StyleSheet[] = [getBuiltinStyleSheet(opts.theme, opts.annotationBadgeLabels)];
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

  // Build sheets for conflict analysis: [builtin(theme), ...userSheets]
  // Icon theme is intentionally excluded from analysis to avoid false style-conflict warnings.
  const sheets = [
    getBuiltinStyleSheet(opts.theme, opts.annotationBadgeLabels),
    ...resolved.styleSheets,
  ];
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
  viewSlice: import("../view/view-extract.js").ViewSlice,
  serviceIdsWithDeploy?: Set<string>,
  ownerIndex?: Map<string, string>,
  teamLabels?: ReadonlyMap<string, string>,
  nodePathIndex?: Map<string, string[]>,
): Map<string, NodeMetadata> {
  const map = new Map<string, NodeMetadata>();

  function addNode(node: KrsNode): void {
    const id = node.id;
    const description = node.properties.description;
    // Resolve owner team from the organization graph (org.team.owns). Every
    // kind a team can `owns` reports it — the panel row went missing on
    // `client` while the org view drew the same ownership (Issue #2157).
    const team = OWNABLE_KIND_SET.has(node.kind) ? ownerIndex?.get(id) : undefined;
    map.set(id, {
      kind: node.kind,
      label: node.label ?? node.id,
      description,
      descriptionSummary: description ? summarizeDescription(description) : undefined,
      links: node.properties.links,
      team,
      teamLabel: team !== undefined ? teamLabels?.get(team) : undefined,
      role: node.kind === "user" ? node.properties.role : undefined,
      tags: [...node.tags],
      annotations: [...node.annotations],
      migrationIntent: getMigrationIntent(node.annotationParams),
      hasChildren: node.children.length > 0,
      resources:
        node.kind === "client" && node.properties.resources.length > 0
          ? [...node.properties.resources]
          : undefined,
      capabilities:
        node.kind === "client" && node.properties.capabilities.length > 0
          ? [...node.properties.capabilities]
          : undefined,
      hasDeployContainer: DEPLOY_AFFORDANCE_KIND_SET.has(node.kind)
        ? (serviceIdsWithDeploy?.has(id) ?? false)
        : undefined,
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
      type: unit.properties.type,
      image: unit.properties.image,
      schedule: unit.properties.schedule,
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
  theme?: DiagramTheme,
  annotationBadgeLabels?: AnnotationBadgeLabels,
  groupBy?: "team" | "boundary",
  /**
   * Facet ids selected for the overlay (#2174). Same shape as `groupBy`: viewer
   * state threaded to every render surface so a static bundle shows what the app
   * shows (TPL-219).
   */
  selectedFacets?: readonly string[],
): SvgResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _buildDrillDownSvg(
    parseResult.value,
    styleSource,
    displayMode,
    emptyStateLabels,
    theme,
    annotationBadgeLabels,
    groupBy,
    selectedFacets,
  );
  return { svg: result.svg, diagnostics: [...parseResult.diagnostics, ...result.diagnostics] };
}

/**
 * Renders the live, single-level **entity view** of the domain addressed by
 * `viewPath` (its entities + intra-domain relations). The interactive
 * counterpart to the static `#krs-entity-<id>` bundle level — the app swaps
 * this SVG in when the entity sub-mode is toggled on for a drilled domain.
 *
 * @param krsSource   - Raw .krs source
 * @param viewPath    - Drill path to the domain (same shape as the system view)
 * @param styleSource - Optional .krs.style content
 */
export function renderEntityView(
  krsSource: string,
  viewPath: ViewPath,
  styleSource?: string,
  displayMode?: DisplayMode,
  emptyStateLabels?: EmptyStateLabels,
  theme?: DiagramTheme,
  annotationBadgeLabels?: AnnotationBadgeLabels,
  groupBy?: "team" | "boundary",
  /**
   * Facet ids selected for the overlay (#2174). Same shape as `groupBy`: viewer
   * state threaded to every render surface so a static bundle shows what the app
   * shows (TPL-219).
   */
  selectedFacets?: readonly string[],
): EntityViewResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _renderEntityView(
    parseResult.value,
    viewPath,
    styleSource,
    displayMode,
    emptyStateLabels,
    theme,
    annotationBadgeLabels,
    groupBy,
    selectedFacets,
  );
  return {
    svg: result.svg,
    diagnostics: [...parseResult.diagnostics, ...result.diagnostics],
    hasContent: result.hasContent,
  };
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
  theme?: DiagramTheme,
  annotationBadgeLabels?: AnnotationBadgeLabels,
  groupBy?: "team" | "boundary",
  /**
   * Facet ids selected for the overlay (#2174). Same shape as `groupBy`: viewer
   * state threaded to every render surface so a static bundle shows what the app
   * shows (TPL-219).
   */
  selectedFacets?: readonly string[],
): SvgResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _buildAllLayersSvg(
    parseResult.value,
    styleSource,
    displayMode,
    emptyStateLabels,
    theme,
    annotationBadgeLabels,
    groupBy,
    selectedFacets,
  );
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
  theme?: DiagramTheme,
  annotationBadgeLabels?: AnnotationBadgeLabels,
): SvgResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _buildAllLayersSvgOrg(
    parseResult.value,
    styleSource,
    displayMode,
    emptyStateLabels,
    theme,
    annotationBadgeLabels,
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
  theme?: DiagramTheme,
  annotationBadgeLabels?: AnnotationBadgeLabels,
): SvgResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _buildDrillDownSvgOrg(
    parseResult.value,
    styleSource,
    displayMode,
    emptyStateLabels,
    theme,
    annotationBadgeLabels,
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
  theme?: DiagramTheme,
  annotationBadgeLabels?: AnnotationBadgeLabels,
  groupBy?: "team" | "boundary",
  /**
   * Facet ids selected for the overlay (#2174). Same shape as `groupBy`: viewer
   * state threaded to every render surface so a static bundle shows what the app
   * shows (TPL-219).
   */
  selectedFacets?: readonly string[],
): AllViewsSvgResult {
  const parseResult: ParseResult<KrsFile> = Parser.parse(krsSource);
  const result = _buildAllViewsSvg(
    parseResult.value,
    styleSource,
    displayMode,
    emptyStateLabels,
    theme,
    annotationBadgeLabels,
    groupBy,
    selectedFacets,
  );
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
  theme?: DiagramTheme,
  annotationBadgeLabels?: AnnotationBadgeLabels,
): Promise<AllViewsSvgResult> {
  const resolver = new ImportResolver(fs);
  const resolved = await resolver.resolve(entryPath);
  const result = _buildAllViewsSvg(
    resolved.krsFile,
    styleSource,
    displayMode,
    undefined,
    theme,
    annotationBadgeLabels,
  );
  return {
    svg: result.svg,
    diagnostics: [...resolved.diagnostics, ...result.diagnostics],
    warnings: result.warnings,
  };
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
