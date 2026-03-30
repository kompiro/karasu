import { useState, useEffect, useRef, useCallback } from "react";
import {
  compileProject,
  type Warning,
  type Diagnostic,
  type ViewPath,
  type FileSystemProvider,
  type NodeMetadata,
  type DeployBlockInfo,
  type DisplayMode,
} from "@karasu/core";

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
  viewPath: ViewPath = [],
  selectedDeployBlockId: string | null = null,
  displayMode?: DisplayMode,
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

    const currentKey = `${entryPath}:deploy:${selectedDeployBlockId ?? ""}`;

    timerRef.current = setTimeout(async () => {
      try {
        const result = await compileProject(
          entryPath,
          fs,
          viewPath,
          "deploy",
          selectedDeployBlockId ?? undefined,
          displayMode,
        );
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
              message: "プロジェクトのコンパイル中にエラーが発生しました",
            },
          ],
        }));
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryPath, fs, viewPath, selectedDeployBlockId, displayMode, recompileCounter.current]);

  return { ...state, recompile };
}
