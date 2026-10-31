// ---------------------------------------------------------------------------
// Diff compile facade (Issue #650): compile two `.krs` project entries and
// produce SVGs annotated with semantic diff state.
//
// Relocated from index.ts (Issue #2014, point 2) with zero behavior change —
// only import paths were adjusted from "./x" to "../x" for the new location.
// ---------------------------------------------------------------------------

import type { Diagnostic } from "../types/ast.js";
import type { Warning } from "../types/warnings.js";
import { mergeMembership, parseBoundaryScopeKey } from "../types/ast.js";
import type { StyleSheet } from "../types/style.js";
import type { FileSystemProvider } from "../fs/types.js";
import {
  assignEdgeCanonicalIds,
  validateProjectEdgeIdUniqueness,
} from "../resolver/canonical-id.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { render } from "../renderer/svg-renderer.js";
import { resolveFacetOverlay } from "../renderer/facet-overlay.js";
import {
  buildGroupLabelIndex,
  buildTeamLabelIndex,
  declaredGroupIds,
  declaredGroupOrderOf,
} from "../renderer/group-labels.js";
import type { CategoryId } from "../renderer/category-collapse.js";
import { bundleSingleLevelViews } from "../renderer/drill-down-svg.js";

import type { DisplayMode } from "../renderer/layout.js";
import { type DiagramTheme, resolvePalette } from "../renderer/palette.js";
import { renderOrgView as _renderOrgView } from "../renderer/org-renderer.js";
import { renderDeploy } from "../renderer/deploy-renderer.js";
import { extractView } from "../view/view-extract.js";
import type { ViewPath } from "../view/view-slice.js";
import { withUnassignedSystem } from "../view/unassigned-system.js";
import { extractOrgView } from "../view/org-view-extract.js";
import { extractDeployView } from "../view/deploy-view-extract.js";
import { ImportResolver, type ResolvedProject } from "../fs/import-resolver.js";
import { getBuiltinStyleSheet, type AnnotationBadgeLabels } from "../builtins/default-style.js";
import { getIconThemeStyleSheet } from "../builtins/icon-theme.js";
import type { EmptyStateLabels } from "../renderer/empty-state-labels.js";

import { diffSystemViewSlices, type EdgeDiffMeta, type NodeDiffMeta } from "../diff/view-diff.js";
import { diffDeployViewSlices } from "../diff/deploy-view-diff.js";
import { diffOrgViewSlices } from "../diff/org-view-diff.js";
import { injectDiffStyle } from "../diff/diff-style.js";
import { nodePathRefId, parseNodePathRefId } from "../parser/node-path.js";
import { collectModelWarnings } from "../resolver/model-warnings.js";

/**
 * Resolve the before / after project entries and concatenate their resolver
 * diagnostics (before-side first). Shared boilerplate for the `compile*Diff`
 * pipelines and `buildAllViewsSvgDiffProject`.
 *
 * Each side gets its own `ImportResolver`. `resolve()` resets the instance's
 * state (diagnostics, visited files and style sheets) on entry, so two
 * concurrent calls on one instance cleared each other's state mid-flight:
 * every diagnostic came back on both sides, and a style sheet both sides
 * import was dropped from one of them with a false circular-import warning
 * (#2879).
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
  const [beforeResolved, afterResolved] = await Promise.all([
    new ImportResolver(fs).resolve(beforeEntryPath),
    new ImportResolver(fs).resolve(afterEntryPath),
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
 * Every style resolution a diff makes leaves the `cyclic` virtual tag off
 * (#2791). Diff draws what changed: a removed edge would bring the before
 * side's cycle verdict while diff reports only the after side's warnings, and
 * the builtin cyclic red is the diff's "removed" red, so an unchanged cyclic
 * edge would read as removed. `diffEdgeArray` drops the flag from the slice for
 * the same reason; this covers the colour, which resolves from model edges.
 */
const NO_CYCLIC_TAG = { cyclicTag: false } as const;

/**
 * The warnings a diff reports: the after model's, collected once from the
 * model rather than per rendered view (#2879). Before is the side being
 * replaced, so its warnings are not reported; this is the set
 * `karasu render <after>` and the app's compare mode show.
 *
 * Collected against the after side's own sheets, not the before + after
 * concatenation `assembleDiffSheets` builds for rendering: that one carries
 * before's sheets so removed nodes keep their style, and validating it would
 * report positions in before's style files.
 */
function collectAfterWarnings(
  afterResolved: ResolvedProject,
  theme: DiagramTheme | undefined,
  annotationBadgeLabels: AnnotationBadgeLabels | undefined,
): Warning[] {
  return collectModelWarnings(afterResolved.krsFile, [
    getBuiltinStyleSheet(theme, annotationBadgeLabels),
    ...afterResolved.styleSheets,
  ]);
}

/**
 * `systems` with the system named `primaryId` moved to the front, when it is
 * there and not already first; otherwise `systems` itself.
 */
function withPrimaryFirst<T extends { id: string }>(
  systems: T[],
  primaryId: string | undefined,
): T[] {
  const i = primaryId === undefined ? -1 : systems.findIndex((s) => s.id === primaryId);
  return i <= 0 ? systems : [systems[i], ...systems.slice(0, i), ...systems.slice(i + 1)];
}

/**
 * The id a card path ends in: the card's own id, under which the bare-id maps
 * hold it.
 */
function lastSegment(key: string): string {
  const segments = parseNodePathRefId(key);
  return segments[segments.length - 1] ?? key;
}

/**
 * The ranking `diffSystemViewSlices` picks a bare id's card by (ADR-2934): the
 * after model's, with the paths only the before model has (removed nodes)
 * ranked after them in the before model's order.
 */
function unionRanking(
  after: ReadonlyMap<string, string[][]>,
  before: ReadonlyMap<string, string[][]>,
): Map<string, string[][]> {
  const ranking = new Map(after);
  for (const [id, paths] of before) {
    const ranked = ranking.get(id) ?? [];
    const known = new Set(ranked.map((p) => nodePathRefId(p)));
    const removed = paths.filter((p) => !known.has(nodePathRefId(p)));
    if (removed.length > 0) ranking.set(id, [...ranked, ...removed]);
  }
  return ranking;
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
  /** The after model's warnings, once per diff (#2879). */
  warnings: Warning[];
  /** Diff metadata per node id (for UI hover / detail panel). */
  nodeDiff: Map<string, NodeDiffMeta>;
  /**
   * Diff metadata per canvas card, keyed by the full path the card carries as
   * `data-node-path` (#2934). Where two cards share a bare id, `nodeDiff` holds
   * one entry and this map holds each card's own.
   */
  nodeDiffByPath: Map<string, NodeDiffMeta>;
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
  /**
   * Facet ids selected for the overlay (#2174). Diff mode gets it for the same
   * reason `groupBy` does (#1873): the compare view is a system view, and a
   * viewer state that works in one and not the other is the split TPL-1983
   * rules out.
   */
  selectedFacets?: readonly string[];
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
  /** Draw the per-node info / deploy buttons in the diff preview (Issue #2420). */
  nodeControls?: boolean;
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
    selectedFacets,
    collapsedGroups,
    collapsedCategories,
    interactive,
    nodeControls,
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

  // The root's primary frame is built from the first system and carries the
  // in-place expansion (#1921). Put after's first system first on the before
  // side too, so both sides build that frame from the same system the same way
  // and the diff pairs it by id (#3126, TPL-3126).
  const beforeSlice = extractView(
    withPrimaryFirst(beforeSystems, afterSystems[0]?.id),
    viewPath ?? [],
    [],
    [],
    expandedContainers,
  );
  const afterSlice = extractView(afterSystems, viewPath ?? [], [], [], expandedContainers);
  diagnostics.push(...assignEdgeCanonicalIds(beforeSlice.childEdges));
  diagnostics.push(...assignEdgeCanonicalIds(afterSlice.childEdges));

  const diffed = diffSystemViewSlices(
    beforeSlice,
    afterSlice,
    unionRanking(afterResolved.krsFile.nodePathRanking, beforeResolved.krsFile.nodePathRanking),
  );

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
    afterResolved.krsFile.nodePathRanking,
    NO_CYCLIC_TAG,
  );

  // A removed card is drawn with the style it had, by its own path (#3197).
  // `styles` comes from the after model, where a removed card has no path
  // entry, so the renderer fell back to the bare id, which a same-named card in
  // another frame answers on the multi-system root (ADR-2934). The same sheets
  // resolve the before model; only removed cards' paths are taken from it, the
  // way owner, boundary and facet membership are backfilled below.
  const beforeStyles = resolveStyles(
    beforeSystems,
    resolveSheets,
    undefined,
    undefined,
    undefined,
    undefined,
    beforeResolved.krsFile.nodePathRanking,
    NO_CYCLIC_TAG,
  );
  for (const [key, meta] of diffed.nodesByPath) {
    if (meta.state !== "removed" || styles.nodesByPath.has(key)) continue;
    const style = beforeStyles.nodesByPath.get(key);
    if (style === undefined) continue;
    styles.nodesByPath.set(key, style);
    const painted = beforeStyles.paintedColorsByPath.get(key);
    if (painted !== undefined) styles.paintedColorsByPath.set(key, painted);
    const hints = beforeStyles.layoutHintsByPath.get(key);
    if (hints !== undefined) styles.layoutHintsByPath.set(key, hints);
  }

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
  // ownerIndex / boundaryMembership are path-keyed (#2548), and so is the card
  // diff: each removed card is backfilled under its own path, the one it is drawn
  // and grouped by. On the multi-system root that is the card's own system frame
  // (#3126), so a removed `Admin.Api` takes back what it declared rather than
  // what the same-named winner did.
  //
  // An entry that is not a card (a system frame, a ghost user) has no card path
  // and keeps the key it always had: on a drilled canvas the canvas scope plus
  // the id, on the root view the before-side nodePathIndex path, and the bare id
  // as the last resort (matching the parse-time fallback for unresolvable refs).
  const cardIds = new Set([...diffed.nodesByPath.keys()].map(lastSegment));
  const diffScope =
    diffed.slice.containerNode !== null
      ? [...diffed.slice.ancestorChain.map((n) => n.id), diffed.slice.containerNode.id]
      : [];
  const removedNonCardKeys: string[] = [];
  for (const [id, meta] of diffed.nodes) {
    if (meta.state !== "removed" || cardIds.has(id)) continue;
    removedNonCardKeys.push(
      diffScope.length > 0
        ? nodePathRefId([...diffScope, id])
        : nodePathRefId(beforeResolved.krsFile.nodePathIndex.get(id) ?? [id]),
    );
  }
  const removedKeys = [
    ...[...diffed.nodesByPath].filter(([, meta]) => meta.state === "removed").map(([key]) => key),
    ...removedNonCardKeys,
  ];
  const mergedOwnerIndex = new Map<string, string>(afterResolved.krsFile.ownerIndex);
  for (const key of removedKeys) {
    if (mergedOwnerIndex.has(key)) continue;
    const formerTeam = beforeResolved.krsFile.ownerIndex.get(key);
    if (formerTeam !== undefined) mergedOwnerIndex.set(key, formerTeam);
  }
  // Same backfill for the boundary axis (#1822 P2b): a removed node returns to
  // its former boundary frame instead of the trailing un-grouped band. Now that
  // membership is 1:N the backfill restores the node's whole before-side
  // membership array (#2178) — but still only for `removed` nodes, so a node
  // that merely lost a `contains` does not inherit its stale before state.
  // Facet membership needs the same removed-node backfill the boundary axis
  // gets above (ADR-1886). A node deleted in the after-version is absent from
  // `afterResolved.krsFile.facetIndex`, so resolving the overlay against the
  // after-side alone renders it *dimmed and unringed* — telling a reader
  // looking for "what used to carry PII" that the removed node never did.
  const mergedFacetIndex = new Map<string, Set<string>>();
  for (const [id, facetIds] of afterResolved.krsFile.facetIndex) {
    mergedFacetIndex.set(id, new Set(facetIds));
  }
  // The bare index is a broadcast (the facets any node of that id carries,
  // ADR-2934), so a removed card adds what it carried even when a same-named
  // card in another frame survives and answers the bare id (#3126). Entries
  // that are not cards keep the backfill they always had.
  for (const [key, meta] of diffed.nodesByPath) {
    if (meta.state !== "removed") continue;
    const former = beforeResolved.krsFile.facetIndexByPath.get(key);
    if (former === undefined) continue;
    const id = lastSegment(key);
    const merged = mergedFacetIndex.get(id) ?? new Set<string>();
    for (const facetId of former) merged.add(facetId);
    mergedFacetIndex.set(id, merged);
  }
  for (const [id, meta] of diffed.nodes) {
    if (meta.state !== "removed" || cardIds.has(id) || mergedFacetIndex.has(id)) continue;
    const former = beforeResolved.krsFile.facetIndex.get(id);
    if (former !== undefined) mergedFacetIndex.set(id, new Set(former));
  }
  // The path-keyed index the cards are ringed by (#2934) gets the same backfill,
  // keyed by the removed card's own path, so a removed `Admin.Api` takes back
  // what *it* declared rather than what a same-named node did.
  const mergedFacetIndexByPath = new Map<string, Set<string>>();
  for (const [key, facetIds] of afterResolved.krsFile.facetIndexByPath) {
    mergedFacetIndexByPath.set(key, new Set(facetIds));
  }
  for (const [key, meta] of diffed.nodesByPath) {
    if (meta.state !== "removed" || mergedFacetIndexByPath.has(key)) continue;
    const former = beforeResolved.krsFile.facetIndexByPath.get(key);
    if (former !== undefined) mergedFacetIndexByPath.set(key, new Set(former));
  }
  // Declarations come from the after side (labels and colour order follow the
  // current model); only membership is backfilled. A facet that existed only
  // before is still reachable through the merged index, so its removed members
  // keep a ring even though the declaration is gone.
  const mergedFacetOverlay = resolveFacetOverlay(
    {
      ...afterResolved.krsFile,
      facetIndex: mergedFacetIndex,
      facetIndexByPath: mergedFacetIndexByPath,
    },
    selectedFacets,
  );

  const mergedBoundaryMembership = new Map<string, string[]>();
  for (const [id, boundaryIds] of afterResolved.krsFile.boundaryMembership) {
    mergedBoundaryMembership.set(id, [...boundaryIds]);
  }
  for (const key of removedKeys) {
    if (mergedBoundaryMembership.has(key)) continue;
    const formerBoundaries = beforeResolved.krsFile.boundaryMembership.get(key);
    if (formerBoundaries !== undefined) {
      mergeMembership(mergedBoundaryMembership, key, formerBoundaries);
    }
  }
  // Same backfill for the scoped boundary axis (#2036). It is keyed by scope, so
  // the before-side membership is restored under its own scope key — the same
  // key the removed node's canvas is drawn with — rather than flattened. Scoped
  // and top-level indexes are disjoint (a scoped member never appears in the
  // flat `boundaryMembership`), so without this a node whose only membership was
  // a scoped `boundary` would drop out of its frame in diff view.
  const mergedScopedBoundaryMembership = new Map<string, Map<string, string[]>>();
  for (const [scope, membership] of afterResolved.krsFile.scopedBoundaryMembership) {
    const copy = new Map<string, string[]>();
    for (const [id, boundaryIds] of membership) copy.set(id, [...boundaryIds]);
    mergedScopedBoundaryMembership.set(scope, copy);
  }
  for (const [scope, membership] of beforeResolved.krsFile.scopedBoundaryMembership) {
    const scopePath = parseBoundaryScopeKey(scope);
    for (const [id, boundaryIds] of membership) {
      // A scoped member is a card on its scope's canvas, so its state is the
      // card's own, not the bare id's (which another system's card may answer).
      if (diffed.nodesByPath.get(nodePathRefId([...scopePath, id]))?.state !== "removed") continue;
      let target = mergedScopedBoundaryMembership.get(scope);
      if (target === undefined) {
        target = new Map<string, string[]>();
        mergedScopedBoundaryMembership.set(scope, target);
      }
      if (!target.has(id)) mergeMembership(target, id, boundaryIds);
    }
  }

  // Declared group order follows the same shape as the index merges above: the
  // after model declares the order, and a group it no longer declares at all is
  // appended from before, so a removed node's former group still exists on the
  // axis (#2178). Groups the after model still declares are not re-ordered from
  // before — after is authoritative, as it is for labels.
  const afterDeclaredOrder = declaredGroupOrderOf(afterResolved.krsFile, groupBy);
  const mergedDeclaredGroupOrder = [...afterDeclaredOrder];
  const afterDeclaredSet = new Set(afterDeclaredOrder);
  for (const groupId of declaredGroupOrderOf(beforeResolved.krsFile, groupBy)) {
    if (!afterDeclaredSet.has(groupId)) mergedDeclaredGroupOrder.push(groupId);
  }

  // Group labels resolve from the after model; a group the after model no
  // longer declares at all backfills its label from before, mirroring the
  // index merges above (#2133). Groups still declared in after are NOT
  // backfilled even when unlabeled there — deleting a label must fall back to
  // the id, not resurrect the before label (the #1886 stale-state guard,
  // applied to the label space).
  const groupLabels = buildGroupLabelIndex(afterResolved.krsFile, groupBy);
  const beforeGroupLabels = buildGroupLabelIndex(beforeResolved.krsFile, groupBy);
  if (groupLabels && beforeGroupLabels) {
    const afterDeclared = declaredGroupIds(afterResolved.krsFile, groupBy);
    for (const [id, label] of beforeGroupLabels.model) {
      if (afterDeclared.has(id)) continue;
      if (!groupLabels.model.has(id)) groupLabels.model.set(id, label);
    }
    for (const [scope, labels] of beforeGroupLabels.scoped) {
      for (const [id, label] of labels) {
        if (afterDeclared.has(id)) continue;
        let target = groupLabels.scoped.get(scope);
        if (target === undefined) {
          target = new Map<string, string>();
          groupLabels.scoped.set(scope, target);
        }
        if (!target.has(id)) target.set(id, label);
      }
    }
  }

  // Owner-chip labels follow the group-label rule above, for the same reason:
  // after wins, and only a team the after model no longer *declares* backfills
  // its before label, so a `removed` node's chip still names its former owner
  // (#2157). The guard is on declaration, not on presence in the label map —
  // `buildTeamLabelIndex` only holds teams that declare a label, so keying off
  // it would resurrect a deleted label for a team that still exists (the #1886
  // stale-state guard, applied to the owner-chip label space).
  const teamLabels = buildTeamLabelIndex(afterResolved.krsFile);
  const afterTeams = declaredGroupIds(afterResolved.krsFile, "team");
  for (const [teamId, label] of buildTeamLabelIndex(beforeResolved.krsFile)) {
    if (afterTeams.has(teamId)) continue;
    if (!teamLabels.has(teamId)) teamLabels.set(teamId, label);
  }

  const svg = render(diffed.slice, styles, undefined, mergedOwnerIndex, displayMode, undefined, {
    nodeDiffState,
    edgeDiffState,
    nodeDiffMeta: diffed.nodes,
    nodeDiffMetaByPath: diffed.nodesByPath,
    emptyLabels: emptyStateLabels,
    theme,
    groupBy,
    facetOverlay: mergedFacetOverlay,
    boundaryMembership: mergedBoundaryMembership,
    scopedBoundaryMembership: mergedScopedBoundaryMembership,
    declaredGroupOrder: mergedDeclaredGroupOrder,
    groupLabels,
    teamLabels,
    collapsedGroups,
    collapsedCategories,
    interactive,
    nodeControls,
    // Compare mode draws the 縮退 tab like any other surface, so it reports the
    // membership too (#2179) — a tab with no diagnostic is the TPL-1983 split.
    diagnosticSink: diagnostics,
  });

  return {
    diagramType: "system",
    svg: injectDiffStyle(svg),
    diagnostics,
    warnings: collectAfterWarnings(afterResolved, theme, options.annotationBadgeLabels),
    nodeDiff: diffed.nodes,
    nodeDiffByPath: diffed.nodesByPath,
    edgeDiff: diffed.edges,
  };
}

export interface DeployDiffCompileResult {
  diagramType: "deploy";
  svg: string;
  diagnostics: Diagnostic[];
  /** The after model's warnings, once per diff (#2879). */
  warnings: Warning[];
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
  /** Draw the per-node info / deploy buttons in the diff preview (Issue #2420). */
  nodeControls?: boolean;
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
    nodeControls,
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
    undefined,
    afterResolved.krsFile.nodePathRanking,
    // The deploy canvas draws its unit-to-unit edges with the style of the
    // service edge they stand for, looked up by from / to / kind (#2791).
    NO_CYCLIC_TAG,
  );

  const { nodeDiffState, edgeDiffState } = toDiffStateMaps(diffed);
  const containerDiffStateMap = new Map<string, string>(diffed.containers);

  const svg = renderDeploy(diffed.slice, styles, displayMode, {
    nodeDiffState,
    edgeDiffState,
    containerDiffState: containerDiffStateMap,
    emptyLabels: emptyStateLabels,
    theme,
    nodeControls,
  });

  return {
    diagramType: "deploy",
    svg: injectDiffStyle(svg),
    diagnostics,
    warnings: collectAfterWarnings(afterResolved, theme, options.annotationBadgeLabels),
    nodeDiff: diffed.nodes,
    edgeDiff: diffed.edges,
  };
}

export interface OrgDiffCompileResult {
  diagramType: "org";
  svg: string;
  diagnostics: Diagnostic[];
  /** The after model's warnings, once per diff (#2879). */
  warnings: Warning[];
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
    undefined,
    undefined,
    undefined,
    NO_CYCLIC_TAG,
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
    warnings: collectAfterWarnings(afterResolved, theme, options.annotationBadgeLabels),
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
  /**
   * The after model's warnings, collected once for the whole bundle rather than
   * concatenated from `views`, which would repeat each one per view (#2879).
   */
  warnings: Warning[];
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
  // Every view result already holds the same set (one after model, one sheet
  // list), so take it from whichever view ran instead of a fourth pass; collect
  // only when no view applies.
  const warnings =
    systemResult?.warnings ??
    deployResult?.warnings ??
    orgResult?.warnings ??
    collectAfterWarnings(afterResolved, theme, options.annotationBadgeLabels);

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
    return { svg: placeholder, diagnostics, warnings, views };
  }

  return { svg: injectDiffStyle(bundled), diagnostics, warnings, views };
}
