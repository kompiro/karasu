import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type {
  DiagramTheme,
  DisplayMode,
  FileSystemProvider,
  TeamNode,
  OrganizationBlock,
  SystemNode,
  NodeMetadata,
  DeployBlockInfo,
  DeployBlock,
  Warning,
  Diagnostic,
  NodeDiffMeta,
  CategoryId,
} from "@karasu-tools/core";
import type { AppAction, ActiveView } from "../state/app-reducer.js";
import type { GroupByMode } from "../state/preview-context.js";
import { useSystemView } from "./useSystemView.js";
import { useDeployView } from "./useDeployView.js";
import { useOrgView } from "./useOrgView.js";
import { useHistoryNavigation } from "./useHistoryNavigation.js";
import {
  useAutoSwitchView,
  shouldAutoSwitchToDeploy,
  shouldAutoSwitchToOrg,
} from "./useAutoSwitchView.js";
import { useResolvedCompareSource } from "./useResolvedCompareSource.js";
import type { CompareSource } from "../fs/compare-source.js";
import type { SnapshotManager } from "../fs/snapshot-manager.js";

interface UseAppViewsArgs {
  entryPath: string | null;
  fs: FileSystemProvider;
  viewPath: string[];
  activeView: ActiveView;
  selectedDeployBlockId: string | null;
  highlightedNodeId: string | null;
  displayMode: DisplayMode;
  /** Effective diagram theme; the org-tree view follows it (Issue #1479). */
  theme: DiagramTheme;
  currentFilePath: string | null;
  dispatch: Dispatch<AppAction>;
  isOrgTreeViewOpen: boolean;
  setIsOrgTreeViewOpen: Dispatch<SetStateAction<boolean>>;
  isEntityViewOpen: boolean;
  setIsEntityViewOpen: Dispatch<SetStateAction<boolean>>;
  /**
   * Source to compare `entryPath` against in diff mode. Supports workspace files
   * and OPFS history snapshots.
   */
  compareSource?: CompareSource | null;
  /** Required when `compareSource.kind === "snapshot"`. */
  snapshotManager?: SnapshotManager | null;
  /** Required when `compareSource.kind === "snapshot"`. */
  projectRoot?: string | null;
  /**
   * When true, the diff direction is flipped: the compare source becomes the
   * after-side and the project entry becomes the before-side (Issue #765 A).
   * Ignored while the compare source has not resolved yet.
   */
  swapped?: boolean;
  /**
   * Restores the open file when the URL hash changes (back/forward) or when
   * a deep-linked hash is loaded. Pass `selectFile` from `useFileSelection`.
   * Issue #811.
   */
  onFileChange?: (path: string) => Promise<void> | void;
}

/**
 * Exported so `usePreviewContextValue`'s `system` arg can be declared as
 * `Pick<SystemViewBundle, ...>` instead of re-listing every field's type by
 * hand (#2015 point 8) — one fewer hand-maintained copy of this shape between
 * `useSystemView`'s return and `PreviewContextValue`.
 */
export interface SystemViewBundle {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  hasDeployDiagram: boolean;
  resolvedSystems: SystemNode[];
  nodeFileIndex: Map<string, string>;
  /** Per-node diff metadata when diff mode is active. */
  nodeDiff?: Map<string, NodeDiffMeta>;
  /** Collapsed external/infra categories on the system view (Issue #1821). */
  collapsedCategories: ReadonlySet<CategoryId>;
  toggleCategory: (category: CategoryId) => void;
  toggleGroup: (groupId: string) => void;
  /** In-place expanded service ids and their toggle (Issue #1921). */
  expandedContainers: ReadonlySet<string>;
  toggleExpand: (serviceId: string) => void;
  /** Whether anything (a team frame or external/infra band) is collapsible (#1872). */
  anyCollapsible: boolean;
  /** True when every team frame AND external/infra category is collapsed (#1872). */
  allCollapsed: boolean;
  expansionOverload: boolean;
  /** Collapse everything (frames + categories) if anything is open, else expand all (#1872). */
  onCollapseAllToggle: () => void;
  /** System-view grouping axis and its setter (Issue #1858). */
  groupBy: GroupByMode;
  setGroupBy: (mode: GroupByMode) => void;
  /**
   * Whether the Group-by axis is meaningful for the current model/view — the
   * source declares an `organization`/`owns` block. Grouping works in compare
   * mode too (the diff compile threads `groupBy`; Issue #1873). Gates the
   * selector so it is not a visible no-op (Issue #1858).
   */
  groupByAvailable: boolean;
  /** Whether the team axis has data (an `organization`/`owns` block) — gates the "team" option (#1822 P2b). */
  hasTeamAxis: boolean;
  /** Whether the boundary axis has data (a `boundary` block) — gates the "boundary" option (#1822 P2b). */
  hasBoundaryAxis: boolean;
}

/** Exported for `usePreviewContextValue`'s `deploy` arg (#2015 point 8). */
export interface DeployViewBundle {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  deployBlocks: DeployBlockInfo[];
  /** All deploy blocks with their nodes — source for the App Outline. */
  deployTree: DeployBlock[];
}

/** Exported for `usePreviewContextValue`'s `org` arg (#2015 point 8). */
export interface OrgViewBundle {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodePathIndex: Map<string, string[]>;
  organizations: OrganizationBlock[];
  ownerIndex: Map<string, string>;
  toggleTeamExpand: (teamId: string) => void;
  orgTreeSvg: string;
  orgTreeExportSvg: string;
}

interface UseAppViewsResult {
  system: SystemViewBundle;
  deploy: DeployViewBundle;
  org: OrgViewBundle;
  /**
   * Maps each team ID to the viewPath needed to see it as a node in the org SVG.
   * Top-level teams map to [] (visible at root); sub-teams map to their parent's path.
   */
  teamPathIndex: Map<string, string[]>;
  /**
   * Maps each team ID to the full org viewPath needed to show that team's children.
   * e.g., top-level "ec-team" → ["ec-team"], sub-team "oncall" under "platform-team" →
   * ["platform-team", "oncall"].
   */
  orgPathIndex: Map<string, string[]>;
  navigateActiveView: (view: ActiveView) => void;
  navigateViewPath: (path: string[]) => void;
  recompile: () => void;
}

/**
 * Bundles the three view hooks (system / deploy / org), their derived path indices,
 * and history navigation + combined recompile into a single hook.
 *
 * Extracted from AppShell so the shell can read `views.system.svg`, `views.deploy.svg`,
 * etc. without wiring half-a-dozen independent hooks inline.
 */
export function useAppViews(args: UseAppViewsArgs): UseAppViewsResult {
  const {
    entryPath,
    fs,
    viewPath,
    activeView,
    selectedDeployBlockId,
    highlightedNodeId,
    displayMode,
    theme,
    currentFilePath,
    dispatch,
    isOrgTreeViewOpen,
    setIsOrgTreeViewOpen,
    isEntityViewOpen,
    setIsEntityViewOpen,
    compareSource = null,
    snapshotManager = null,
    projectRoot = null,
    swapped = false,
    onFileChange,
  } = args;

  const { compareEntryPath, compareFs } = useResolvedCompareSource(
    compareSource,
    fs,
    snapshotManager,
    projectRoot,
  );

  // Apply swap only once the compare source has resolved. While resolving,
  // fall through to the un-swapped pair so the after-side keeps rendering.
  const canSwap = swapped && compareEntryPath !== null && compareFs !== null;
  const effEntryPath = canSwap ? compareEntryPath : entryPath;
  const effFs = canSwap ? (compareFs as FileSystemProvider) : fs;
  const effCompareEntryPath = canSwap ? entryPath : compareEntryPath;
  // `compile*Diff` takes a single FS that must resolve BOTH the before- and
  // after-side entry paths. For a snapshot compare source, `compareFs` is a
  // `SnapshotOverlayFs` that serves the virtual `/.snapshot-view/…` path AND
  // delegates every other read to the base `fs` — a strict superset of `fs`.
  // The base `fs` cannot serve the virtual snapshot path, so the diff must
  // always run on the overlay regardless of swap direction. Swapping this to
  // the base `fs` broke the swapped render for snapshot sources (Issue #1402).
  const effCompareFs = compareFs;

  const {
    svg: systemSvg,
    warnings: systemWarnings,
    diagnostics: systemDiagnostics,
    nodeMetadata: systemNodeMetadata,
    hasDeployDiagram,
    hasOrgDiagram,
    hasBoundaries,
    recompile: recompileSystem,
    systems: resolvedSystems,
    nodeFileIndex,
    collapsedCategories,
    toggleCategory,
    groupBy,
    setGroupBy,
    toggleGroup,
    expandedContainers,
    toggleExpand,
    anyCollapsible,
    allCollapsed,
    expansionOverload,
    onCollapseAllToggle,
    nodeDiff: systemNodeDiff,
  } = useSystemView(
    effEntryPath,
    effFs,
    viewPath,
    displayMode,
    effCompareEntryPath,
    effCompareFs,
    theme,
  );

  const {
    svg: deploySvg,
    warnings: deployWarnings,
    diagnostics: deployDiagnostics,
    nodeMetadata: deployNodeMetadata,
    deployBlocks,
    deployTree,
    recompile: recompileDeploy,
  } = useDeployView(
    effEntryPath,
    effFs,
    selectedDeployBlockId,
    displayMode,
    effCompareEntryPath,
    effCompareFs,
    theme,
  );

  const {
    orgSvg,
    orgDiagnostics,
    orgWarnings,
    nodePathIndex,
    organizations,
    ownerIndex,
    recompile: recompileOrg,
    toggleTeamExpand,
    orgTreeSvg,
    orgTreeExportSvg,
  } = useOrgView(
    effEntryPath,
    effFs,
    viewPath,
    displayMode,
    effCompareEntryPath,
    effCompareFs,
    theme,
  );

  // One traversal builds both team-path maps: `teamPathIndex` maps a team to
  // its ancestor path (excluding itself), `orgPathIndex` maps it to its full
  // path (including itself). They differ only by that trailing id.
  const { teamPathIndex, orgPathIndex } = useMemo(() => {
    const teamPaths = new Map<string, string[]>();
    const orgPaths = new Map<string, string[]>();
    function traverse(team: TeamNode, ancestorPath: string[]) {
      const myPath = [...ancestorPath, team.id];
      teamPaths.set(team.id, ancestorPath);
      orgPaths.set(team.id, myPath);
      const subTeams = team.children.filter((c): c is TeamNode => c.kind === "team");
      for (const sub of subTeams) {
        traverse(sub, myPath);
      }
    }
    for (const org of organizations) {
      for (const team of org.teams) {
        traverse(team, []);
      }
    }
    return { teamPathIndex: teamPaths, orgPathIndex: orgPaths };
  }, [organizations]);

  const { navigateActiveView, navigateViewPath } = useHistoryNavigation({
    activeView,
    viewPath,
    currentFilePath,
    nodePathIndex,
    orgPathIndex,
    dispatch,
    isOrgTreeView: isOrgTreeViewOpen,
    setIsOrgTreeView: setIsOrgTreeViewOpen,
    isEntityView: isEntityViewOpen,
    setIsEntityView: setIsEntityViewOpen,
    highlightedNodeId,
    onFileChange,
  });

  const recompile = useCallback(() => {
    recompileSystem();
    recompileDeploy();
    recompileOrg();
  }, [recompileSystem, recompileDeploy, recompileOrg]);

  // Priority `system > deploy > org` is encoded via the `shouldSwitch`
  // predicates (org yields when hasDeployDiagram), not via call order.
  // Reordering these two would not change behavior. The predicate expressions
  // live next to the hook (exported, unit-tested) so they cannot silently
  // drift here.
  const hasSystem = resolvedSystems.length > 0;

  // Deploy-only file → switch to "deploy" (Issue #766).
  useAutoSwitchView({
    entryPath: effEntryPath,
    activeView,
    target: "deploy",
    shouldSwitch: shouldAutoSwitchToDeploy({ hasDeployDiagram, hasSystem }),
    dispatch,
  });

  // Org-only file → switch to "org" (Issue #817). `hasOrgDiagram` is read
  // from systemCompile (same source of truth as `hasSystem` and
  // `hasDeployDiagram`) to avoid the race where orgCompile lags behind
  // an editor edit and reports a stale `hasOrg=true` (Issue #923).
  useAutoSwitchView({
    entryPath: effEntryPath,
    activeView,
    target: "org",
    shouldSwitch: shouldAutoSwitchToOrg({ hasOrg: hasOrgDiagram, hasSystem, hasDeployDiagram }),
    dispatch,
  });

  return {
    system: {
      svg: systemSvg,
      warnings: systemWarnings,
      diagnostics: systemDiagnostics,
      nodeMetadata: systemNodeMetadata,
      hasDeployDiagram,
      resolvedSystems,
      nodeFileIndex,
      nodeDiff: systemNodeDiff,
      collapsedCategories,
      toggleCategory,
      groupBy,
      setGroupBy,
      // The selector shows when either axis has data; each option is rendered
      // only for the axis it applies to (#1822 P2b, data-driven visibility).
      groupByAvailable: hasOrgDiagram || hasBoundaries,
      hasTeamAxis: hasOrgDiagram,
      hasBoundaryAxis: hasBoundaries,
      toggleGroup,
      expandedContainers,
      toggleExpand,
      anyCollapsible,
      allCollapsed,
      expansionOverload,
      onCollapseAllToggle,
    },
    deploy: {
      svg: deploySvg,
      warnings: deployWarnings,
      diagnostics: deployDiagnostics,
      nodeMetadata: deployNodeMetadata,
      deployBlocks,
      deployTree,
    },
    org: {
      svg: orgSvg,
      warnings: orgWarnings,
      diagnostics: orgDiagnostics,
      nodePathIndex,
      organizations,
      ownerIndex,
      toggleTeamExpand,
      orgTreeSvg,
      orgTreeExportSvg,
    },
    teamPathIndex,
    orgPathIndex,
    navigateActiveView,
    navigateViewPath,
    recompile,
  };
}
