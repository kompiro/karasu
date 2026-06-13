import {
  compileProject,
  compileDeployDiff,
  type Warning,
  type Diagnostic,
  type FileSystemProvider,
  type NodeMetadata,
  type DeployBlockInfo,
  type DeployBlock,
  type DisplayMode,
  type DiagramTheme,
} from "@karasu-tools/core";
import { useEmptyStateLabels } from "../i18n/use-empty-state-labels.js";
import { useAnnotationBadgeLabels } from "../i18n/use-annotation-badge-labels.js";
import { computeViewResultFingerprint } from "./result-fingerprint.js";
import { useDebouncedCompile, type CompileOutcome } from "./useDebouncedCompile.js";

interface DeployViewState {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  deployBlocks: DeployBlockInfo[];
  /** All deploy blocks with their nodes — source for the App Outline. */
  deployTree: DeployBlock[];
}

export function useDeployView(
  entryPath: string | null,
  fs: FileSystemProvider | null,
  selectedDeployBlockId: string | null = null,
  displayMode?: DisplayMode,
  compareEntryPath: string | null = null,
  compareFs: FileSystemProvider | null = null,
  theme?: DiagramTheme,
): DeployViewState & { recompile: () => void } {
  const emptyStateLabels = useEmptyStateLabels();
  const annotationBadgeLabels = useAnnotationBadgeLabels();

  const currentKey = `${entryPath}:deploy:${selectedDeployBlockId ?? ""}:cmp=${compareEntryPath ?? ""}`;

  const compile = async (): Promise<CompileOutcome<DeployViewState> | null> => {
    if (!entryPath || !fs) return null;

    if (compareEntryPath) {
      // Diff-mode: render compareEntryPath (before) → entryPath (after). Need a
      // baseline compileProject result for nodeMetadata / deployBlocks used by
      // surrounding UI (block selector, NodeDetailPanel).
      const [base, diff] = await Promise.all([
        compileProject(entryPath, fs, {
          diagramType: "deploy",
          selectedDeployId: selectedDeployBlockId ?? undefined,
          displayMode,
          emptyStateLabels,
          annotationBadgeLabels,
          theme,
        }),
        compileDeployDiff({
          beforeEntryPath: compareEntryPath,
          afterEntryPath: entryPath,
          fs: compareFs ?? fs,
          selectedDeployId: selectedDeployBlockId ?? undefined,
          displayMode,
          emptyStateLabels,
          annotationBadgeLabels,
          theme,
        }),
      ]);
      if (base.diagramType !== "deploy") return null;
      const toState = (svg: string): DeployViewState => ({
        svg,
        warnings: base.warnings,
        diagnostics: diff.diagnostics,
        nodeMetadata: base.nodeMetadata,
        deployBlocks: base.deployBlocks,
        deployTree: base.deployTree,
      });
      return {
        diagnostics: diff.diagnostics,
        svg: diff.svg,
        fingerprint: computeViewResultFingerprint({
          svg: diff.svg,
          warnings: base.warnings,
          diagnostics: diff.diagnostics,
          nodeMetadata: base.nodeMetadata,
        }),
        errorState: (svgToShow) => toState(svgToShow),
        okState: () => toState(diff.svg),
      };
    }

    const result = await compileProject(entryPath, fs, {
      diagramType: "deploy",
      selectedDeployId: selectedDeployBlockId ?? undefined,
      displayMode,
      emptyStateLabels,
      annotationBadgeLabels,
      theme,
    });
    if (result.diagramType !== "deploy") return null;
    const toState = (svg: string): DeployViewState => ({
      svg,
      warnings: result.warnings,
      diagnostics: result.diagnostics,
      nodeMetadata: result.nodeMetadata,
      deployBlocks: result.deployBlocks,
      deployTree: result.deployTree,
    });
    return {
      diagnostics: result.diagnostics,
      svg: result.svg,
      fingerprint: computeViewResultFingerprint({
        svg: result.svg,
        warnings: result.warnings,
        diagnostics: result.diagnostics,
        nodeMetadata: result.nodeMetadata,
      }),
      errorState: (svgToShow) => toState(svgToShow),
      okState: () => toState(result.svg),
    };
  };

  return useDebouncedCompile<DeployViewState>({
    active: !!entryPath && !!fs,
    currentKey,
    initialState: {
      svg: "",
      warnings: [],
      diagnostics: [],
      nodeMetadata: new Map(),
      deployBlocks: [],
      deployTree: [],
    },
    compile,
    onError: (prev) => ({
      ...prev,
      diagnostics: [{ severity: "error", code: "app-project-compile-error", params: {} }],
    }),
    deps: [
      entryPath,
      fs,
      selectedDeployBlockId,
      displayMode,
      theme,
      compareEntryPath,
      compareFs,
      emptyStateLabels,
      annotationBadgeLabels,
    ],
  });
}
