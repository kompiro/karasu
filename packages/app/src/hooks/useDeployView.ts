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

    // The baseline compileProject result supplies nodeMetadata / deployBlocks /
    // deployTree for surrounding UI (block selector, NodeDetailPanel, outline);
    // diff-mode replaces only the rendered svg + diagnostics.
    const basePromise = compileProject(entryPath, fs, {
      diagramType: "deploy",
      selectedDeployId: selectedDeployBlockId ?? undefined,
      displayMode,
      emptyStateLabels,
      annotationBadgeLabels,
      theme,
    });

    let base: Awaited<typeof basePromise>;
    let svg: string;
    let diagnostics: Diagnostic[];
    if (compareEntryPath) {
      const [b, diff] = await Promise.all([
        basePromise,
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
      base = b;
      svg = diff.svg;
      diagnostics = diff.diagnostics;
    } else {
      base = await basePromise;
      svg = base.svg;
      diagnostics = base.diagnostics;
    }
    if (base.diagramType !== "deploy") return null;
    const deployBase = base;

    const toState = (s: string): DeployViewState => ({
      svg: s,
      warnings: deployBase.warnings,
      diagnostics,
      nodeMetadata: deployBase.nodeMetadata,
      deployBlocks: deployBase.deployBlocks,
      deployTree: deployBase.deployTree,
    });
    return {
      diagnostics,
      svg,
      fingerprint: computeViewResultFingerprint({
        svg,
        warnings: deployBase.warnings,
        diagnostics,
        nodeMetadata: deployBase.nodeMetadata,
      }),
      errorState: (svgToShow) => toState(svgToShow),
      okState: () => toState(svg),
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
