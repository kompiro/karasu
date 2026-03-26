import { useState, useEffect, useRef, useCallback } from "react";
import {
  compileProject,
  type Warning,
  type Diagnostic,
  type ViewPath,
  type FileSystemProvider,
  type NodeMetadata,
} from "@karasu/core";

export interface ProjectSystemViewState {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  hasDeployDiagram: boolean;
}

const DEBOUNCE_MS = 300;

export function useProjectSystemView(
  entryPath: string | null,
  fs: FileSystemProvider | null,
  viewPath: ViewPath = [],
): ProjectSystemViewState & { recompile: () => void } {
  const [state, setState] = useState<ProjectSystemViewState>({
    svg: "",
    warnings: [],
    diagnostics: [],
    nodeMetadata: new Map(),
    hasDeployDiagram: false,
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

    const currentKey = `${entryPath}:system`;

    timerRef.current = setTimeout(async () => {
      try {
        const result = await compileProject(entryPath, fs, viewPath, "system");
        const hasErrors = result.diagnostics.some((d) => d.severity === "error");

        if (hasErrors) {
          const svgToShow = lastValidSvgKey.current === currentKey ? lastValidSvg.current : "";
          setState({
            svg: svgToShow,
            warnings: result.warnings,
            diagnostics: result.diagnostics,
            nodeMetadata: result.nodeMetadata,
            hasDeployDiagram: result.hasDeployDiagram,
          });
        } else {
          lastValidSvg.current = result.svg;
          lastValidSvgKey.current = currentKey;
          setState({
            svg: result.svg,
            warnings: result.warnings,
            diagnostics: result.diagnostics,
            nodeMetadata: result.nodeMetadata,
            hasDeployDiagram: result.hasDeployDiagram,
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
  }, [entryPath, fs, viewPath, recompileCounter.current]);

  return { ...state, recompile };
}
