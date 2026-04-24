import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type {
  DisplayMode,
  FileSystemProvider,
  TeamNode,
  OrganizationBlock,
  SystemNode,
  NodeMetadata,
  DeployBlockInfo,
  Warning,
  Diagnostic,
  NodeDiffMeta,
} from "@karasu-tools/core";
import type { AppAction, ActiveView } from "../state/app-reducer.js";
import { useSystemView } from "./useSystemView.js";
import { useDeployView } from "./useDeployView.js";
import { useOrgView } from "./useOrgView.js";
import { useHistoryNavigation } from "./useHistoryNavigation.js";
import { useAutoSwitchToDeploy } from "./useAutoSwitchToDeploy.js";
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
  currentFilePath: string | null;
  dispatch: Dispatch<AppAction>;
  isOrgTreeViewOpen: boolean;
  setIsOrgTreeViewOpen: Dispatch<SetStateAction<boolean>>;
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
}

interface SystemViewBundle {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  hasDeployDiagram: boolean;
  resolvedSystems: SystemNode[];
  nodeFileIndex: Map<string, string>;
  /** Per-node diff metadata when diff mode is active. */
  nodeDiff?: Map<string, NodeDiffMeta>;
}

interface DeployViewBundle {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  deployBlocks: DeployBlockInfo[];
}

interface OrgViewBundle {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodePathIndex: Map<string, string[]>;
  organizations: OrganizationBlock[];
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
    currentFilePath,
    dispatch,
    isOrgTreeViewOpen,
    setIsOrgTreeViewOpen,
    compareSource = null,
    snapshotManager = null,
    projectRoot = null,
    swapped = false,
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
  const effCompareFs = canSwap ? fs : compareFs;

  const {
    svg: systemSvg,
    warnings: systemWarnings,
    diagnostics: systemDiagnostics,
    nodeMetadata: systemNodeMetadata,
    hasDeployDiagram,
    recompile: recompileSystem,
    systems: resolvedSystems,
    nodeFileIndex,
    nodeDiff: systemNodeDiff,
  } = useSystemView(effEntryPath, effFs, viewPath, displayMode, effCompareEntryPath, effCompareFs);

  const {
    svg: deploySvg,
    warnings: deployWarnings,
    diagnostics: deployDiagnostics,
    nodeMetadata: deployNodeMetadata,
    deployBlocks,
    recompile: recompileDeploy,
  } = useDeployView(
    effEntryPath,
    effFs,
    selectedDeployBlockId,
    displayMode,
    effCompareEntryPath,
    effCompareFs,
  );

  const {
    orgSvg,
    orgDiagnostics,
    orgWarnings,
    nodePathIndex,
    organizations,
    recompile: recompileOrg,
    toggleTeamExpand,
    orgTreeSvg,
    orgTreeExportSvg,
  } = useOrgView(effEntryPath, effFs, viewPath, displayMode, effCompareEntryPath, effCompareFs);

  const teamPathIndex = useMemo(() => {
    const index = new Map<string, string[]>();
    function traverse(team: TeamNode, parentPath: string[]) {
      index.set(team.id, parentPath);
      const subTeams = team.children.filter((c): c is TeamNode => c.kind === "team");
      for (const sub of subTeams) {
        traverse(sub, [...parentPath, team.id]);
      }
    }
    for (const org of organizations) {
      for (const team of org.teams) {
        traverse(team, []);
      }
    }
    return index;
  }, [organizations]);

  const orgPathIndex = useMemo(() => {
    const index = new Map<string, string[]>();
    function traverse(team: TeamNode, ancestorPath: string[]) {
      const myPath = [...ancestorPath, team.id];
      index.set(team.id, myPath);
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
    return index;
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
    highlightedNodeId,
  });

  const recompile = useCallback(() => {
    recompileSystem();
    recompileDeploy();
    recompileOrg();
  }, [recompileSystem, recompileDeploy, recompileOrg]);

  useAutoSwitchToDeploy({
    entryPath: effEntryPath,
    activeView,
    hasDeployDiagram,
    hasSystem: resolvedSystems.length > 0,
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
    },
    deploy: {
      svg: deploySvg,
      warnings: deployWarnings,
      diagnostics: deployDiagnostics,
      nodeMetadata: deployNodeMetadata,
      deployBlocks,
    },
    org: {
      svg: orgSvg,
      warnings: orgWarnings,
      diagnostics: orgDiagnostics,
      nodePathIndex,
      organizations,
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
