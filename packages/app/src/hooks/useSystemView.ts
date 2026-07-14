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
import type { GroupByMode } from "../state/preview-context.js";
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
import { useDebouncedCompile, type CompileOutcome } from "./useDebouncedCompile.js";

interface SystemViewState {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  hasDeployDiagram: boolean;
  hasOrgDiagram: boolean;
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
 * from what is actually drawn, so the bulk toggle needs no change when a future
 * Group-by axis lands. See `docs/design/group-by-bulk-collapse.md`.
 */
function extractCollapsibles(svg: string): { groupIds: string[]; categoryIds: CategoryId[] } {
  const groupIds = new Set<string>();
  const categoryIds = new Set<CategoryId>();
  for (const m of svg.matchAll(/data-collapse-(group|category)="([^"]+)"/g)) {
    if (m[1] === "group") groupIds.add(decodeXmlEntities(m[2]));
    else if (m[2] === "external" || m[2] === "infra") categoryIds.add(m[2]);
  }
  return { groupIds: [...groupIds], categoryIds: [...categoryIds] };
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
  toggleGroup: (groupId: string) => void;
  /** Service ids currently expanded in place (#1921). At most one (Phase 1). */
  expandedContainers: ReadonlySet<string>;
  /** Expand/collapse a service in place; expanding one collapses any other (#1921). */
  toggleExpand: (serviceId: string) => void;
  /** Ids of every collapsible team boundary frame in the current render (#1872). */
  groupIds: string[];
  /**
   * Whether anything is collapsible in the current view — at least one team
   * frame OR one external/infra category band (#1872). Gates the bulk toggle so
   * it shows even when the view is un-grouped but has category bands.
   */
  anyCollapsible: boolean;
  /**
   * True when everything collapsible in the current view — every team frame
   * AND every external/infra category band — is collapsed (#1872). Drives the
   * bulk toggle's Collapse-all ⇄ Expand-all state.
   */
  allCollapsed: boolean;
  /**
   * Collapse everything (team frames + external/infra categories) when anything
   * is open, else expand everything (#1872).
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

  // Collapsed teams in Group-by mode (Issue #1858 slice B). Each folds to a
  // `<Team> (N)` stub, toggled via the on-SVG ⊖/⊕ control (per group). View
  // state, like `collapsedCategories` — recompiles via the core option.
  const groups = useCollapsibleSet<string>();
  const collapsedGroups = groups.set;
  const toggleGroup = groups.toggle;
  const groupsKey = groups.key;

  // Containers expanded in place (Issue #1921). Each shows its domain children
  // inside a boundary frame while siblings stay collapsed; toggled via the
  // on-SVG ⊕/⊖ `data-expand-node` control. `single` keeps at most one expanded
  // so the scoped-glance node budget stays bounded (Phase 1). View state, like
  // the collapse axes — the `.krs` is untouched.
  const expansions = useCollapsibleSet<string>(true);
  const expandedContainers = expansions.set;
  const toggleExpand = expansions.toggle;
  const expandKey = expansions.key;

  // Structural key for `viewPath` so that a fresh `[]` from `SET_ACTIVE_VIEW`
  // does not restart the in-flight debounce when the previous value was also
  // empty. Without this, switching view tabs while the initial compile is
  // pending keeps resetting the 300ms timer and never renders an SVG. See #1171.
  const viewPathKey = viewPath.join("/");
  const currentKey = `${entryPath}:system:${viewPathKey}:cmp=${compareEntryPath ?? ""}:collapsed=${collapsedKey}:groupBy=${groupBy}:groups=${groupsKey}:expanded=${expandKey}`;

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
      // P2b hand-off: when a second Group-by axis lands, invert this to
      // `groupBy === "none" ? undefined : groupBy` (off-sentinel gate) and widen
      // the core `groupBy` union, so a new axis is not silently dropped here.
      // See docs/design/group-by-bulk-collapse.md (B2).
      groupBy: groupBy === "team" ? "team" : undefined,
      collapsedGroups: groupBy === "team" ? collapsedGroups : undefined,
      // In-place expansion is Phase 1-scoped to the ungrouped system view
      // (#1921); suppressed under Group by: team.
      expandedContainers: groupBy === "team" ? undefined : expandedContainers,
      interactive: true,
    });

    let base: Awaited<typeof basePromise>;
    let svg: string;
    let diagnostics: Diagnostic[];
    let nodeDiff: Map<string, NodeDiffMeta> | undefined;
    if (compareEntryPath) {
      const [b, diff] = await Promise.all([
        basePromise,
        compileSystemDiff({
          beforeEntryPath: compareEntryPath,
          afterEntryPath: entryPath,
          fs: compareFs ?? fs,
          viewPath,
          displayMode,
          emptyStateLabels,
          annotationBadgeLabels,
          theme,
          collapsedCategories,
          groupBy: groupBy === "team" ? "team" : undefined,
          collapsedGroups: groupBy === "team" ? collapsedGroups : undefined,
          expandedContainers: groupBy === "team" ? undefined : expandedContainers,
          interactive: true,
        }),
      ]);
      base = b;
      svg = diff.svg;
      diagnostics = diff.diagnostics;
      nodeDiff = diff.nodeDiff;
    } else {
      base = await basePromise;
      svg = base.svg;
      diagnostics = base.diagnostics;
    }
    if (base.diagramType !== "system") return null;
    const sysBase = base;

    const toState = (s: string): SystemViewState => ({
      svg: s,
      warnings: sysBase.warnings,
      diagnostics,
      nodeMetadata: sysBase.nodeMetadata,
      hasDeployDiagram: sysBase.hasDeployDiagram,
      hasOrgDiagram: sysBase.hasOrgDiagram,
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
    ],
  });
  // Bulk collapse (#1872). Both id lists come from the rendered SVG in one pass,
  // so they are axis-agnostic and always match what is actually on screen.
  // "Collapse all" spans both collapse axes — team frames (#1858) and
  // external/infra categories (#1821) — so its label ("all") is honest, and it
  // is offered whenever anything is collapsible (even an un-grouped view with
  // only category bands). The per-axis state / controls stay orthogonal
  // (ADR-20260711-03 §3); only this convenience toggle bridges them.
  const { groupIds, categoryIds } = useMemo(() => extractCollapsibles(result.svg), [result.svg]);
  const anyCollapsible = groupIds.length > 0 || categoryIds.length > 0;
  const allCollapsed =
    anyCollapsible &&
    groupIds.every((id) => collapsedGroups.has(id)) &&
    categoryIds.every((c) => collapsedCategories.has(c));
  const collapseGroupsAll = groups.replace;
  const collapseCategoriesAll = categories.replace;
  const onCollapseAllToggle = useCallback(() => {
    if (allCollapsed) {
      collapseGroupsAll();
      collapseCategoriesAll();
    } else {
      collapseGroupsAll(groupIds);
      collapseCategoriesAll(categoryIds);
    }
  }, [allCollapsed, groupIds, categoryIds, collapseGroupsAll, collapseCategoriesAll]);

  return {
    ...result,
    collapsedCategories,
    toggleCategory,
    groupBy,
    setGroupBy,
    toggleGroup,
    expandedContainers,
    toggleExpand,
    groupIds,
    anyCollapsible,
    allCollapsed,
    onCollapseAllToggle,
  };
}
