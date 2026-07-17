// ---------------------------------------------------------------------------
// Diff compile facade (Issue #650): compile two `.krs` project entries and
// produce SVGs annotated with semantic diff state.
//
// Relocated from index.ts (Issue #2014, point 2) with zero behavior change —
// only import paths were adjusted from "./x" to "../x" for the new location.
// ---------------------------------------------------------------------------

import type { Diagnostic } from "../types/ast.js";
import type { StyleSheet } from "../types/style.js";
import type { FileSystemProvider } from "../fs/types.js";
import { assignEdgeCanonicalIds, validateProjectEdgeIdUniqueness } from "../resolver/canonical-id.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { render } from "../renderer/svg-renderer.js";
import type { CategoryId } from "../renderer/category-collapse.js";
import { bundleSingleLevelViews } from "../renderer/drill-down-svg.js";

import type { DisplayMode } from "../renderer/layout.js";
import { type DiagramTheme, resolvePalette } from "../renderer/palette.js";
import { renderOrgView as _renderOrgView } from "../renderer/org-renderer.js";
import { renderDeploy } from "../renderer/deploy-renderer.js";
import { extractView, type ViewPath } from "../view/view-extract.js";
import { withUnassignedSystem } from "../view/unassigned-system.js";
import { extractOrgView } from "../view/org-view-extract.js";
import { extractDeployView } from "../view/deploy-view-extract.js";
import { ImportResolver, type ResolvedProject } from "../fs/import-resolver.js";
import { getBuiltinStyleSheet, type AnnotationBadgeLabels } from "../builtins/default-style.js";
import { getIconThemeStyleSheet } from "../builtins/icon-theme.js";
import type { EmptyStateLabels } from "../renderer/empty-state-labels.js";

import { diffSystemViewSlices } from "../diff/view-diff.js";
import { diffDeployViewSlices } from "../diff/deploy-view-diff.js";
import { diffOrgViewSlices } from "../diff/org-view-diff.js";
import type { NodeDiffMeta, EdgeDiffMeta } from "../diff/view-diff.js";
import { injectDiffStyle } from "../diff/diff-style.js";

/**
 * Resolve the before / after project entries with a shared `ImportResolver`
 * and concatenate their resolver diagnostics (before-side first). Shared
 * boilerplate for the `compile*Diff` pipelines and
 * `buildAllViewsSvgDiffProject`.
 */
async function resolveBeforeAfter(
  fs: FileSystemProvider,
  beforeEntryPath: string,
  afterEntryPath: string,
): Promise<{
  beforeResolved: ResolvedProject;
  afterResolved: ResolvedProject;
  diagnostics: Diagnostic[];
}> {
  const resolver = new ImportResolver(fs);
  const [beforeResolved, afterResolved] = await Promise.all([
    resolver.resolve(beforeEntryPath),
    resolver.resolve(afterEntryPath),
  ]);
  return {
    beforeResolved,
    afterResolved,
    diagnostics: [...beforeResolved.diagnostics, ...afterResolved.diagnostics],
  };
}

/**
 * Assemble the style sheets a diff render resolves against: builtin sheet,
 * then before-side sheets, then after-side sheets (later sheets win on
 * conflicts), with the icon-theme sheet appended in icon display mode.
 */
function assembleDiffSheets(
  beforeResolved: ResolvedProject,
  afterResolved: ResolvedProject,
  theme: DiagramTheme | undefined,
  annotationBadgeLabels: AnnotationBadgeLabels | undefined,
  displayMode: DisplayMode | undefined,
): StyleSheet[] {
  const sheets = [
    getBuiltinStyleSheet(theme, annotationBadgeLabels),
    ...beforeResolved.styleSheets,
    ...afterResolved.styleSheets,
  ];
  return displayMode === "icon" ? [...sheets, getIconThemeStyleSheet()] : sheets;
}

/**
 * Flatten diff metadata maps into the plain `Map<id, state>` shape the
 * renderers consume for `data-diff-state` stamping.
 */
function toDiffStateMaps(diffed: {
  nodes: Map<string, NodeDiffMeta>;
  edges: Map<string, EdgeDiffMeta>;
}): { nodeDiffState: Map<string, string>; edgeDiffState: Map<string, string> } {
  const nodeDiffState = new Map<string, string>();
  for (const [id, meta] of diffed.nodes) nodeDiffState.set(id, meta.state);
  const edgeDiffState = new Map<string, string>();
  for (const [key, meta] of diffed.edges) edgeDiffState.set(key, meta.state);
  return { nodeDiffState, edgeDiffState };
}

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
  /** Diagram theme. Defaults to `"dark"`. */
  theme?: DiagramTheme;
  /** Translated labels for the built-in annotation badges. */
  annotationBadgeLabels?: AnnotationBadgeLabels;
  /**
   * System-view grouping axis (Issue #1858, P2a). `"team"` groups the diff by
   * the after-side owning team (its `ownerIndex`), so a compared system view
   * gets the same team bands / boundary frames as the non-compare view. Omit
   * for the default un-grouped layout.
   */
  groupBy?: "team" | "boundary";
  /** Teams collapsed to a `<Team> (N)` stub in the diff (Issue #1858). Only with `groupBy: "team"`. */
  collapsedGroups?: ReadonlySet<string>;
  /**
   * `external` / `infra` categories folded to a stub in the diff (Issue #1821).
   * Mirrors the non-compare `compileSystemView` option so the ⊖ category
   * controls that `interactive` draws are honoured in compare mode too.
   */
  collapsedCategories?: ReadonlySet<CategoryId>;
  /** Draw the interactive Group-by / collapse controls in the diff preview (Issue #1858). */
  interactive?: boolean;
  /**
   * System-view service ids expanded in place in the diff (Issue #1921). Mirrors
   * the non-compare option so the ⊕/⊖ expansion controls work in compare mode.
   */
  expandedContainers?: ReadonlySet<string>;
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
  const {
    beforeEntryPath,
    afterEntryPath,
    fs,
    viewPath,
    displayMode,
    emptyStateLabels,
    theme,
    groupBy,
    collapsedGroups,
    collapsedCategories,
    interactive,
    expandedContainers,
  } = options;

  const { beforeResolved, afterResolved, diagnostics } = await resolveBeforeAfter(
    fs,
    beforeEntryPath,
    afterEntryPath,
  );
  diagnostics.push(...validateProjectEdgeIdUniqueness(beforeResolved.krsFile));
  diagnostics.push(...validateProjectEdgeIdUniqueness(afterResolved.krsFile));

  const beforeSystems = withUnassignedSystem(beforeResolved.krsFile);
  const afterSystems = withUnassignedSystem(afterResolved.krsFile);

  const beforeSlice = extractView(beforeSystems, viewPath ?? [], [], [], expandedContainers);
  const afterSlice = extractView(afterSystems, viewPath ?? [], [], [], expandedContainers);
  diagnostics.push(...assignEdgeCanonicalIds(beforeSlice.childEdges));
  diagnostics.push(...assignEdgeCanonicalIds(afterSlice.childEdges));

  const diffed = diffSystemViewSlices(beforeSlice, afterSlice);

  // Resolve styles against the union (after-side systems augmented with
  // any removed nodes — the union slice's childNodes will be styled via
  // the same fallback path used for ghost nodes).
  const resolveSheets = assembleDiffSheets(
    beforeResolved,
    afterResolved,
    theme,
    options.annotationBadgeLabels,
    displayMode,
  );
  const styles = resolveStyles(
    afterSystems,
    resolveSheets,
    undefined,
    undefined,
    undefined,
    diffed.slice.childEdges,
  );

  const { nodeDiffState, edgeDiffState } = toDiffStateMaps(diffed);

  // Grouping axis for diff mode. `diffed.slice` is the union of both sides, so a
  // node removed in the after-slice has no after-side owner and would fall into
  // the trailing un-grouped band. Start from the after ownerIndex (authoritative
  // for surviving nodes — it reflects re-ownership AND ownership removal) and
  // backfill the before-side team ONLY for nodes that are actually `removed`, so
  // they resolve their former team frame and render `removed` inside it. A node
  // that merely lost its `owns` (kept, now unowned) must NOT inherit its stale
  // before team — that is why this backfills off the removed diff state rather
  // than blindly unioning the two maps. See #1886 and
  // docs/design/system-view-grouping.md § "差分モードの grouping".
  const mergedOwnerIndex = new Map<string, string>(afterResolved.krsFile.ownerIndex);
  for (const [id, meta] of diffed.nodes) {
    if (meta.state !== "removed" || mergedOwnerIndex.has(id)) continue;
    const formerTeam = beforeResolved.krsFile.ownerIndex.get(id);
    if (formerTeam !== undefined) mergedOwnerIndex.set(id, formerTeam);
  }
  // Same backfill for the boundary axis (#1822 P2b): a removed node returns to
  // its former boundary frame instead of the trailing un-grouped band.
  const mergedBoundaryIndex = new Map<string, string>(afterResolved.krsFile.boundaryIndex);
  for (const [id, meta] of diffed.nodes) {
    if (meta.state !== "removed" || mergedBoundaryIndex.has(id)) continue;
    const formerBoundary = beforeResolved.krsFile.boundaryIndex.get(id);
    if (formerBoundary !== undefined) mergedBoundaryIndex.set(id, formerBoundary);
  }

  const svg = render(diffed.slice, styles, undefined, mergedOwnerIndex, displayMode, undefined, {
    nodeDiffState,
    edgeDiffState,
    nodeDiffMeta: diffed.nodes,
    emptyLabels: emptyStateLabels,
    theme,
    groupBy,
    boundaryIndex: mergedBoundaryIndex,
    collapsedGroups,
    collapsedCategories,
    interactive,
  });

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
  /** Diagram theme. Defaults to `"dark"`. */
  theme?: DiagramTheme;
  /** Translated labels for the built-in annotation badges. */
  annotationBadgeLabels?: AnnotationBadgeLabels;
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
  const {
    beforeEntryPath,
    afterEntryPath,
    fs,
    selectedDeployId,
    displayMode,
    emptyStateLabels,
    theme,
  } = options;

  const { beforeResolved, afterResolved, diagnostics } = await resolveBeforeAfter(
    fs,
    beforeEntryPath,
    afterEntryPath,
  );

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

  const resolveSheets = assembleDiffSheets(
    beforeResolved,
    afterResolved,
    theme,
    options.annotationBadgeLabels,
    displayMode,
  );
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

  const { nodeDiffState, edgeDiffState } = toDiffStateMaps(diffed);
  const containerDiffStateMap = new Map<string, string>(diffed.containers);

  const svg = renderDeploy(diffed.slice, styles, displayMode, {
    nodeDiffState,
    edgeDiffState,
    containerDiffState: containerDiffStateMap,
    emptyLabels: emptyStateLabels,
    theme,
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
  /** Diagram theme. Defaults to `"dark"`. */
  theme?: DiagramTheme;
  /** Translated labels for the built-in annotation badges. */
  annotationBadgeLabels?: AnnotationBadgeLabels;
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
  const { beforeEntryPath, afterEntryPath, fs, viewPath, displayMode, emptyStateLabels, theme } =
    options;

  const { beforeResolved, afterResolved, diagnostics } = await resolveBeforeAfter(
    fs,
    beforeEntryPath,
    afterEntryPath,
  );

  const beforeSlice = extractOrgView(beforeResolved.krsFile.organizations, viewPath ?? []);
  const afterSlice = extractOrgView(afterResolved.krsFile.organizations, viewPath ?? []);

  const diffed = diffOrgViewSlices(beforeSlice, afterSlice);

  const resolveSheets = assembleDiffSheets(
    beforeResolved,
    afterResolved,
    theme,
    options.annotationBadgeLabels,
    displayMode,
  );
  const styles = resolveStyles(
    afterResolved.krsFile.systems,
    resolveSheets,
    undefined,
    afterResolved.krsFile.organizations,
  );

  const { nodeDiffState, edgeDiffState } = toDiffStateMaps(diffed);

  const svg = _renderOrgView(diffed.slice, styles, displayMode, undefined, {
    nodeDiffState,
    edgeDiffState,
    emptyLabels: emptyStateLabels,
    theme,
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
  /** Diagram theme. Defaults to `"dark"`. */
  theme?: DiagramTheme;
  /** Translated labels for the built-in annotation badges. */
  annotationBadgeLabels?: AnnotationBadgeLabels;
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
  const { beforeEntryPath, afterEntryPath, fs, displayMode, emptyStateLabels, theme } = options;

  const {
    beforeResolved,
    afterResolved,
    diagnostics: resolverDiagnostics,
  } = await resolveBeforeAfter(fs, beforeEntryPath, afterEntryPath);

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

  const compileOpts = {
    beforeEntryPath,
    afterEntryPath,
    fs,
    displayMode,
    emptyStateLabels,
    theme,
    annotationBadgeLabels: options.annotationBadgeLabels,
  };

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

  const bundled = bundleSingleLevelViews(
    {
      system: systemResult?.svg,
      deploy: deployResult?.svg,
      org: orgResult?.svg,
    },
    theme,
  );

  if (bundled === null) {
    // Nothing applicable — emit a placeholder consistent with non-diff
    // bundled output.
    const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="${
      resolvePalette(theme).emptyStateText
    }" font-family="sans-serif">${emptyStateLabels?.systemNoDiagram ?? "No diagram"}</text></svg>`;
    return { svg: placeholder, diagnostics, views };
  }

  return { svg: injectDiffStyle(bundled), diagnostics, views };
}
