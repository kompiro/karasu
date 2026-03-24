import { useState, useEffect, useRef, useCallback } from "react";
import {
  compileProject,
  type Warning,
  type Diagnostic,
  type ViewPath,
  type DiagramType,
  type FileSystemProvider,
  type NodeMetadata,
} from "@karasu/core";

export interface KarasuProjectState {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  hasDeployDiagram: boolean;
}

const DEBOUNCE_MS = 300;

/**
 * useKarasuProject — FileSystemProvider 経由でプロジェクトをコンパイルする hook。
 * useKarasu と同じパターンだが、compileProject() を使用する。
 */
export function useKarasuProject(
  entryPath: string | null,
  fs: FileSystemProvider | null,
  viewPath: ViewPath = [],
  diagramType: DiagramType = "system",
): KarasuProjectState & { recompile: () => void } {
  const [state, setState] = useState<KarasuProjectState>({
    svg: "",
    warnings: [],
    diagnostics: [],
    nodeMetadata: new Map(),
    hasDeployDiagram: false,
  });

  const lastValidSvg = useRef("");
  // Track the context (entryPath + diagramType) that produced lastValidSvg.
  // When the context changes (file/tab switch), stale lastValidSvg must not be
  // used as an error fallback — show empty instead.
  const lastValidSvgKey = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recompileCounter = useRef(0);

  const recompile = useCallback(() => {
    recompileCounter.current++;
    // trigger re-render to kick off useEffect
    setState((prev) => ({ ...prev }));
  }, []);

  useEffect(() => {
    if (!entryPath || !fs) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    const currentKey = `${entryPath}:${diagramType}`;

    timerRef.current = setTimeout(async () => {
      try {
        const result = await compileProject(entryPath, fs, viewPath, diagramType);
        const hasErrors = result.diagnostics.some((d) => d.severity === "error");

        if (hasErrors) {
          // Only reuse the cached SVG if it came from the same context.
          // If the file or diagram type changed, show empty rather than stale content.
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
  }, [entryPath, fs, viewPath, diagramType, recompileCounter.current]);

  return { ...state, recompile };
}
