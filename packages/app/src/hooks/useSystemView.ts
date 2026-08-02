import {
  compileProject,
  compileSystemDiff,
  resolveIconManifest,
  type Warning,
  type Diagnostic,
  type ViewPath,
  type FileSystemProvider,
  type NodeMetadata,
  type DisplayMode,
  type DiagramTheme,
  type SystemNode,
  type NodeDiffMeta,
  type CategoryId,
} from "@karasu-tools/core";
import { useCallback, useMemo, useState } from "react";
import { groupByAxis, type GroupByMode } from "../state/preview-context.js";
import { useCollapsibleSet } from "./useCollapsibleSet.js";
import iconManifest from "@karasu-tools/core/icons/icons.json";
import serviceSvg from "@karasu-tools/core/icons/service.svg?raw";
import clientSvg from "@karasu-tools/core/icons/client.svg?raw";
import clientMobileSvg from "@karasu-tools/core/icons/client-mobile.svg?raw";
import clientWebSvg from "@karasu-tools/core/icons/client-web.svg?raw";
import clientDesktopSvg from "@karasu-tools/core/icons/client-desktop.svg?raw";
import clientCliSvg from "@karasu-tools/core/icons/client-cli.svg?raw";
import clientDeviceSvg from "@karasu-tools/core/icons/client-device.svg?raw";
import clientExtensionSvg from "@karasu-tools/core/icons/client-extension.svg?raw";
import clientEmbedSvg from "@karasu-tools/core/icons/client-embed.svg?raw";
import userSvg from "@karasu-tools/core/icons/user.svg?raw";
import domainSvg from "@karasu-tools/core/icons/domain.svg?raw";
import resourceSvg from "@karasu-tools/core/icons/resource.svg?raw";
import teamSvg from "@karasu-tools/core/icons/team.svg?raw";
import memberSvg from "@karasu-tools/core/icons/member.svg?raw";
import usecaseSvg from "@karasu-tools/core/icons/usecase.svg?raw";
import databaseSvg from "@karasu-tools/core/icons/database.svg?raw";
import queueSvg from "@karasu-tools/core/icons/queue.svg?raw";
import queueCardSvg from "@karasu-tools/core/icons/queue-card.svg?raw";
import tableSvg from "@karasu-tools/core/icons/table.svg?raw";
import apiSvg from "@karasu-tools/core/icons/api.svg?raw";
import cloudSvg from "@karasu-tools/core/icons/cloud.svg?raw";
import cloudCardSvg from "@karasu-tools/core/icons/cloud-card.svg?raw";
import ociSvg from "@karasu-tools/core/icons/oci.svg?raw";
import lambdaSvg from "@karasu-tools/core/icons/lambda.svg?raw";
import jarSvg from "@karasu-tools/core/icons/jar.svg?raw";
import warSvg from "@karasu-tools/core/icons/war.svg?raw";
import functionSvg from "@karasu-tools/core/icons/function.svg?raw";
import assetsSvg from "@karasu-tools/core/icons/assets.svg?raw";
import jobSvg from "@karasu-tools/core/icons/job.svg?raw";
import artifactSvg from "@karasu-tools/core/icons/artifact.svg?raw";
import { useEmptyStateLabels } from "../i18n/use-empty-state-labels.js";
import { useAnnotationBadgeLabels } from "../i18n/use-annotation-badge-labels.js";
import { computeViewResultFingerprint } from "./result-fingerprint.js";
import {
  useDebouncedCompile,
  resolveBaseAndDiff,
  type CompileOutcome,
} from "./useDebouncedCompile.js";

interface SystemViewState {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  hasDeployDiagram: boolean;
  hasOrgDiagram: boolean;
  hasBoundaries: boolean;
  /**
   * Every facet the model knows (#2174). The Facets selector offers exactly
   * this; an empty list hides the control entirely, so a model that uses no
   * facets keeps the toolbar it has today.
   */
  facets: { id: string; label?: string }[];
  systems: SystemNode[];
  nodeFileIndex: Map<string, string>;
  /**
   * Per-node diff metadata when diff mode is active. `undefined` outside
   * diff mode, so consumers can treat presence as the diff-mode flag.
   */
  nodeDiff?: Map<string, NodeDiffMeta>;
}

// Register icons from manifest on module load (builtIn: true for placeholder injection)
resolveIconManifest(
  iconManifest,
  {
    "service.svg": serviceSvg,
    "client.svg": clientSvg,
    "client-mobile.svg": clientMobileSvg,
    "client-web.svg": clientWebSvg,
    "client-desktop.svg": clientDesktopSvg,
    "client-cli.svg": clientCliSvg,
    "client-device.svg": clientDeviceSvg,
    "client-extension.svg": clientExtensionSvg,
    "client-embed.svg": clientEmbedSvg,
    "user.svg": userSvg,
    "domain.svg": domainSvg,
    "resource.svg": resourceSvg,
    "team.svg": teamSvg,
    "member.svg": memberSvg,
    "usecase.svg": usecaseSvg,
    "database.svg": databaseSvg,
    "queue.svg": queueSvg,
    "queue-card.svg": queueCardSvg,
    "table.svg": tableSvg,
    "api.svg": apiSvg,
    "cloud.svg": cloudSvg,
    "cloud-card.svg": cloudCardSvg,
    "oci.svg": ociSvg,
    "lambda.svg": lambdaSvg,
    "jar.svg": jarSvg,
    "war.svg": warSvg,
    "function.svg": functionSvg,
    "assets.svg": assetsSvg,
    "job.svg": jobSvg,
    "artifact.svg": artifactSvg,
  },
  true,
);

/**
 * Simultaneous in-place expansions past which the UI shows a soft scoped-glance
 * nudge (#1923). Not a hard cap — the user can open more; the hint just points
 * them at Collapse all (TPL-1223).
 */
const EXPANSION_OVERLOAD_THRESHOLD = 4;

/** Reverse `svg-builder`'s `escapeXml` — the only 4 entities it emits, `&amp;` last. */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/**
 * Both collapse axes' ids in one pass over the rendered SVG:
 *  - team/group boundary frames (`data-collapse-group`, #1858) — decoded from
 *    the renderer's XML escaping (`svg-builder.ts` `escapeXml`) so a special-char
 *    id (e.g. `R&D`) matches the real id the core / DOM-based per-group toggle
 *    use, not its escaped `R&amp;D` form;
 *  - external/infra category bands (`data-collapse-category`, #1821) — only the
 *    two known category ids, which never carry XML-special characters.
 *
 * Both are complete in either direction (a collapsed frame/band keeps its
 * attribute so its `⊕` expand control still works) and axis-agnostic — read
 * from what is actually drawn, so the bulk toggle needs no change when another
 * Group-by axis lands (the `boundary` axis did, and this needed none). See
 * ADR-2120 (`docs/adr/2120-group-by-bulk-collapse.md`).
 *
 * `serviceIds` are every in-place-expandable service (`data-expand-node`,
 * #1921/#1923) — the renderer emits it only in the single-system, ungrouped view
 * (both on a collapsed `⊕` box and an expanded `⊖` frame), so this is the full
 * set the bulk "Expand all" acts on and is naturally empty under Group-by team /
 * multi-system. See `docs/design/expand-all-services-in-place.md` (#1955).
 */
function extractCollapsibles(svg: string): {
  groupIds: string[];
  categoryIds: CategoryId[];
  serviceIds: string[];
} {
  const groupIds = new Set<string>();
  const categoryIds = new Set<CategoryId>();
  const serviceIds = new Set<string>();
  for (const m of svg.matchAll(/data-collapse-(group|category)="([^"]+)"/g)) {
    if (m[1] === "group") groupIds.add(decodeXmlEntities(m[2]));
    else if (m[2] === "external" || m[2] === "infra") categoryIds.add(m[2]);
  }
  for (const m of svg.matchAll(/data-expand-node="([^"]+)"/g)) {
    serviceIds.add(decodeXmlEntities(m[1]));
  }
  return { groupIds: [...groupIds], categoryIds: [...categoryIds], serviceIds: [...serviceIds] };
}

export function useSystemView(
  entryPath: string | null,
  fs: FileSystemProvider | null,
  viewPath: ViewPath = [],
  displayMode: DisplayMode = "shape",
  compareEntryPath: string | null = null,
  compareFs: FileSystemProvider | null = null,
  theme?: DiagramTheme,
): SystemViewState & {
  recompile: () => void;
  collapsedCategories: ReadonlySet<CategoryId>;
  toggleCategory: (category: CategoryId) => void;
  groupBy: GroupByMode;
  setGroupBy: (mode: GroupByMode) => void;
  /** Facets selected for the overlay (#2174). Orthogonal to `groupBy`. */
  selectedFacets: readonly string[];
  toggleFacet: (facetId: string) => void;
  toggleGroup: (groupId: string) => void;
  /** Service ids currently expanded in place (#1921/#1923). Several at once in Phase 2. */
  expandedContainers: ReadonlySet<string>;
  /** Expand/collapse a service in place; multiple may be open at once (#1923). */
  toggleExpand: (serviceId: string) => void;
  /** True when enough containers are expanded to warrant the soft scoped-glance hint (#1923). */
  expansionOverload: boolean;
  /** Ids of every collapsible team boundary frame in the current render (#1872). */
  groupIds: string[];
  /**
   * Whether the bulk toggle is relevant in the current view — at least one team
   * frame, one external/infra category band, an active in-place expansion, OR a
   * drillable service to expand (#1872/#1955). Gates the toggle so it shows even
   * in an un-grouped view whose only bulk action is Expand-all-services.
   */
  anyCollapsible: boolean;
  /**
   * True when everything is folded to the scoped-glance overview — every team
   * frame AND category band collapsed AND no service expanded (#1872/#1955).
   * Drives the bulk toggle's Collapse-all ⇄ Expand-all state.
   */
  allCollapsed: boolean;
  /**
   * From the overview, expand everything (unfold team frames + category bands and
   * expand every drillable service in place); otherwise collapse everything back
   * to the overview (#1872/#1955).
   */
  onCollapseAllToggle: () => void;
} {
  const emptyStateLabels = useEmptyStateLabels();
  const annotationBadgeLabels = useAnnotationBadgeLabels();

  // Collapsed external/infra categories (Issue #1821). Owned here because a
  // toggle recompiles the system view with the core `collapsedCategories`
  // option (the collapse is a layout transform, not a client-side re-render).
  // The set/toggle/key idiom is shared with the group axis via
  // `useCollapsibleSet` (Issue #1876).
  const categories = useCollapsibleSet<CategoryId>();
  const collapsedCategories = categories.set;
  const toggleCategory = categories.toggle;
  const collapsedKey = categories.key;

  // System-view grouping axis (Issue #1858). "team" recompiles with the core
  // `groupBy` option so the diagram re-lays-out into team bands with boundary
  // frames; "none" is the default kind-tier layout. A view-state option like
  // `collapsedCategories` — the `.krs` is untouched.
  const [groupBy, setGroupBy] = useState<GroupByMode>("none");

  // Facets selected for the overlay (#2174). View state in the same sense as
  // `groupBy` and `collapsedCategories` — the `.krs` is untouched. Not
  // persisted to the URL hash or the share bundle; `groupBy` is not either, and
  // widening that is its own decision (#1094).
  const [selectedFacets, setSelectedFacets] = useState<readonly string[]>([]);
  const facetsKey = [...selectedFacets].sort().join(",");
  const toggleFacet = useCallback((facetId: string) => {
    setSelectedFacets((prev) =>
      prev.includes(facetId) ? prev.filter((id) => id !== facetId) : [...prev, facetId],
    );
  }, []);

  // Collapsed teams in Group-by mode (Issue #1858 slice B). Each folds to a
  // `<Team> (N)` stub, toggled via the on-SVG ⊖/⊕ control (per group). View
  // state, like `collapsedCategories` — recompiles via the core option.
  const groups = useCollapsibleSet<string>();
  const collapsedGroups = groups.set;
  const toggleGroup = groups.toggle;
  const groupsKey = groups.key;

  // Containers expanded in place (Issue #1921 / #1923). Each shows its domain
  // children inside a boundary frame while siblings stay collapsed; toggled via
  // the on-SVG ⊕/⊖ `data-expand-node` control. Phase 2 lifts the single-expand
  // cap so several can be open at once (true mixed-LOD); the scoped-glance guard
  // is soft — "Collapse all" clears them and a warning fires when many are open
  // (TPL-1223). View state, like the collapse axes — the `.krs` is
  // untouched.
  const expansions = useCollapsibleSet<string>();
  const expandedContainers = expansions.set;
  const toggleExpand = expansions.toggle;
  const expandKey = expansions.key;

  // Structural key for `viewPath` so that a fresh `[]` from `SET_ACTIVE_VIEW`
  // does not restart the in-flight debounce when the previous value was also
  // empty. Without this, switching view tabs while the initial compile is
  // pending keeps resetting the 300ms timer and never renders an SVG. See #1171.
  const viewPathKey = viewPath.join("/");
  const currentKey = `${entryPath}:system:${viewPathKey}:cmp=${compareEntryPath ?? ""}:collapsed=${collapsedKey}:groupBy=${groupBy}:groups=${groupsKey}:expanded=${expandKey}:facets=${facetsKey}`;

  const compile = async (): Promise<CompileOutcome<SystemViewState> | null> => {
    if (!entryPath || !fs) return null;

    // The baseline compileProject result supplies nodeMetadata / systems / the
    // deploy & org presence flags for surrounding UI (breadcrumbs,
    // NodeDetailPanel). In diff-mode the diff replaces only svg + diagnostics
    // and contributes per-node `nodeDiff`.
    const basePromise = compileProject(entryPath, fs, {
      diagramType: "system",
      viewPath,
      displayMode,
      emptyStateLabels,
      annotationBadgeLabels,
      theme,
      collapsedCategories,
      // Off-sentinel gate (#1822 P2b): pass the axis through for any non-"none"
      // value ("team" | "boundary") so a new axis is not silently dropped. The
      // core `groupBy` union is widened in lockstep (TPL-219);
      // `groupByAxis` is the shared conversion with the export surfaces (#2033).
      groupBy: groupByAxis(groupBy),
      collapsedGroups: groupBy !== "none" ? collapsedGroups : undefined,
      // In-place expansion is Phase 1-scoped to the ungrouped system view
      // (#1921); suppressed under any Group-by axis.
      expandedContainers: groupBy !== "none" ? undefined : expandedContainers,
      // Orthogonal to the Group-by axis on purpose: the overlay paints per
      // element and never touches band geometry, so both are usable at once.
      selectedFacets,
      interactive: true,
    });

    const { base, svg, diagnostics, diff } = await resolveBaseAndDiff(
      basePromise,
      compareEntryPath
        ? compileSystemDiff({
            beforeEntryPath: compareEntryPath,
            afterEntryPath: entryPath,
            fs: compareFs ?? fs,
            viewPath,
            displayMode,
            emptyStateLabels,
            annotationBadgeLabels,
            theme,
            collapsedCategories,
            groupBy: groupBy === "none" ? undefined : groupBy,
            collapsedGroups: groupBy !== "none" ? collapsedGroups : undefined,
            expandedContainers: groupBy !== "none" ? undefined : expandedContainers,
            selectedFacets,
            interactive: true,
          })
        : null,
    );
    if (base.diagramType !== "system") return null;
    const sysBase = base;
    const nodeDiff: Map<string, NodeDiffMeta> | undefined = diff?.nodeDiff;

    const toState = (s: string): SystemViewState => ({
      svg: s,
      warnings: sysBase.warnings,
      diagnostics,
      nodeMetadata: sysBase.nodeMetadata,
      hasDeployDiagram: sysBase.hasDeployDiagram,
      hasOrgDiagram: sysBase.hasOrgDiagram,
      hasBoundaries: sysBase.hasBoundaries,
      facets: sysBase.facets,
      systems: sysBase.systems,
      nodeFileIndex: sysBase.nodeFileIndex,
      nodeDiff,
    });
    return {
      fingerprint: computeViewResultFingerprint({
        svg,
        warnings: sysBase.warnings,
        diagnostics,
        nodeMetadata: sysBase.nodeMetadata,
      }),
      errorState: (svgToShow) => toState(svgToShow),
      okState: () => toState(svg),
      getSvg: (s) => s.svg,
      getDiagnostics: (s) => s.diagnostics,
    };
  };

  const result = useDebouncedCompile<SystemViewState>({
    active: !!entryPath && !!fs,
    currentKey,
    initialState: {
      svg: "",
      warnings: [],
      diagnostics: [],
      nodeMetadata: new Map(),
      hasDeployDiagram: false,
      hasOrgDiagram: false,
      hasBoundaries: false,
      facets: [],
      systems: [],
      nodeFileIndex: new Map(),
    },
    compile,
    onError: (prev) => ({
      ...prev,
      diagnostics: [{ severity: "error", code: "app-project-compile-error", params: {} }],
    }),
    deps: [
      entryPath,
      fs,
      viewPathKey,
      displayMode,
      theme,
      compareEntryPath,
      compareFs,
      emptyStateLabels,
      annotationBadgeLabels,
      collapsedKey,
      groupBy,
      groupsKey,
      expandKey,
      // Without this the debounce never restarts on a facet toggle, so the
      // selection changes and the diagram does not — the control looks dead.
      // `currentKey` alone is not enough: it is read inside the debounced
      // callback for the stale-SVG lookup, not used as an effect dependency.
      facetsKey,
    ],
  });
  // Bulk collapse (#1872) + bulk expand-all-services (#1955). All id lists come
  // from the rendered SVG in one pass, so they are axis-agnostic and always match
  // what is actually on screen. "Collapse all" spans both collapse axes — team
  // frames (#1858) and external/infra categories (#1821) — plus in-place
  // expansions, and its Expand-all direction also opens every drillable service
  // in place (#1955), so its label ("all") is honest. It is offered whenever
  // anything is collapsible OR expandable (even an un-grouped view whose only
  // bulk action is expanding its services). The per-axis state / controls stay
  // orthogonal (ADR-1858 §3); only this convenience toggle bridges them.
  const { groupIds, categoryIds, serviceIds } = useMemo(
    () => extractCollapsibles(result.svg),
    [result.svg],
  );
  // In-place expansions count as "collapsible" too: Collapse all clears them,
  // giving a one-click return to the scoped-glance overview (#1923). Drillable
  // services count as well (#1955): even an un-grouped view with no frames/bands
  // but expandable services offers the toggle, so its Expand-all direction can
  // open them all at once.
  const anyCollapsible =
    groupIds.length > 0 ||
    categoryIds.length > 0 ||
    expandedContainers.size > 0 ||
    serviceIds.length > 0;
  const allCollapsed =
    anyCollapsible &&
    expandedContainers.size === 0 &&
    groupIds.every((id) => collapsedGroups.has(id)) &&
    categoryIds.every((c) => collapsedCategories.has(c));
  const collapseGroupsAll = groups.replace;
  const collapseCategoriesAll = categories.replace;
  const replaceExpansions = expansions.replace;
  const onCollapseAllToggle = useCallback(() => {
    if (allCollapsed) {
      collapseGroupsAll();
      collapseCategoriesAll();
      replaceExpansions(serviceIds); // expand every drillable service in place (#1955)
    } else {
      collapseGroupsAll(groupIds);
      collapseCategoriesAll(categoryIds);
      replaceExpansions(); // fold every expanded container back to the overview
    }
  }, [
    allCollapsed,
    groupIds,
    categoryIds,
    serviceIds,
    collapseGroupsAll,
    collapseCategoriesAll,
    replaceExpansions,
  ]);

  // Self-cleaning selection (TPL-1032): a facet edited out of the `.krs` must
  // not linger in the selection, where it would keep a legend row alive for a
  // facet the model no longer has. Intersecting on read rather than syncing on
  // change keeps one source of truth — `result.facets` — instead of two states
  // that can disagree.
  const knownFacets = new Set(result.facets.map((f) => f.id));
  const liveSelectedFacets = selectedFacets.filter((id) => knownFacets.has(id));

  return {
    ...result,
    collapsedCategories,
    toggleCategory,
    groupBy,
    setGroupBy,
    selectedFacets: liveSelectedFacets,
    toggleFacet,
    toggleGroup,
    expandedContainers,
    toggleExpand,
    // Soft scoped-glance guard (#1923 / TPL-1223): many simultaneous
    // expansions push past the "limit what's shown at once" principle, so the
    // UI nudges the viewer to Collapse all — no hard cap.
    expansionOverload: expandedContainers.size >= EXPANSION_OVERLOAD_THRESHOLD,
    groupIds,
    anyCollapsible,
    allCollapsed,
    onCollapseAllToggle,
  };
}
