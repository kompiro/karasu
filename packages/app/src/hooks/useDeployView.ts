import { useState, useEffect, useRef, useCallback } from "react";
import {
  compileProject,
  compileDeployDiff,
  type Warning,
  type Diagnostic,
  type FileSystemProvider,
  type NodeMetadata,
  type DeployBlockInfo,
  type DisplayMode,
} from "@karasu-tools/core";

interface DeployViewState {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  deployBlocks: DeployBlockInfo[];
}

const DEBOUNCE_MS = 300;

export function useDeployView(
  entryPath: string | null,
  fs: FileSystemProvider | null,
  selectedDeployBlockId: string | null = null,
  displayMode?: DisplayMode,
  compareEntryPath: string | null = null,
): DeployViewState & { recompile: () => void } {
  const [state, setState] = useState<DeployViewState>({
    svg: "",
    warnings: [],
    diagnostics: [],
    nodeMetadata: new Map(),
    deployBlocks: [],
  });

  const lastValidSvg = useRef("");
  const lastValidSvgKey = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recompileCounter = useRef(0);

  const recompile = useCallback(() => {
    recompileCounter.current++;
    setState((prev) => ({ ...prev }));
  }, []);

  useEffect(() => {
    if (!entryPath || !fs) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    const currentKey = `${entryPath}:deploy:${selectedDeployBlockId ?? ""}:cmp=${compareEntryPath ?? ""}`;

    timerRef.current = setTimeout(async () => {
      try {
        if (compareEntryPath) {
          // Diff-mode: render compareEntryPath (before) → entryPath (after).
          // Need a baseline compileProject result for nodeMetadata / deployBlocks
          // used by surrounding UI (block selector, NodeDetailPanel).
          const [base, diff] = await Promise.all([
            compileProject(entryPath, fs, {
              diagramType: "deploy",
              selectedDeployId: selectedDeployBlockId ?? undefined,
              displayMode,
            }),
            compileDeployDiff({
              beforeEntryPath: compareEntryPath,
              afterEntryPath: entryPath,
              fs,
              selectedDeployId: selectedDeployBlockId ?? undefined,
              displayMode,
            }),
          ]);
          if (base.diagramType !== "deploy") return;
          const hasErrors = diff.diagnostics.some((d) => d.severity === "error");
          if (hasErrors) {
            const svgToShow = lastValidSvgKey.current === currentKey ? lastValidSvg.current : "";
            setState({
              svg: svgToShow,
              warnings: base.warnings,
              diagnostics: diff.diagnostics,
              nodeMetadata: base.nodeMetadata,
              deployBlocks: base.deployBlocks,
            });
          } else {
            if (diff.svg === lastValidSvg.current) return;
            lastValidSvg.current = diff.svg;
            lastValidSvgKey.current = currentKey;
            setState({
              svg: diff.svg,
              warnings: base.warnings,
              diagnostics: diff.diagnostics,
              nodeMetadata: base.nodeMetadata,
              deployBlocks: base.deployBlocks,
            });
          }
          return;
        }

        const result = await compileProject(entryPath, fs, {
          diagramType: "deploy",
          selectedDeployId: selectedDeployBlockId ?? undefined,
          displayMode,
        });
        if (result.diagramType !== "deploy") return;
        const hasErrors = result.diagnostics.some((d) => d.severity === "error");

        if (hasErrors) {
          const svgToShow = lastValidSvgKey.current === currentKey ? lastValidSvg.current : "";
          setState({
            svg: svgToShow,
            warnings: result.warnings,
            diagnostics: result.diagnostics,
            nodeMetadata: result.nodeMetadata,
            deployBlocks: result.deployBlocks,
          });
        } else {
          if (result.svg === lastValidSvg.current) return;
          lastValidSvg.current = result.svg;
          lastValidSvgKey.current = currentKey;
          setState({
            svg: result.svg,
            warnings: result.warnings,
            diagnostics: result.diagnostics,
            nodeMetadata: result.nodeMetadata,
            deployBlocks: result.deployBlocks,
          });
        }
      } catch {
        setState((prev) => ({
          ...prev,
          diagnostics: [
            {
              severity: "error",
              code: "app-project-compile-error",
              params: {},
            },
          ],
        }));
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    entryPath,
    fs,
    selectedDeployBlockId,
    displayMode,
    compareEntryPath,
    recompileCounter.current,
  ]);

  return { ...state, recompile };
}
