import { useState, useEffect, useRef, useCallback } from "react";
import {
  compileProject,
  type Warning,
  type Diagnostic,
  type ViewPath,
  type FileSystemProvider,
} from "@karasu/core";

export interface KarasuProjectState {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
}

const DEBOUNCE_MS = 300;

/**
 * useKarasuProject — FileSystemProvider 経由でプロジェクトをコンパイルする hook。
 * useKarasu と同じパターンだが、compileProject() を使用する。
 */
export function useKarasuProject(
  entryPath: string | null,
  fs: FileSystemProvider | null,
  viewPath: ViewPath = []
): KarasuProjectState & { recompile: () => void } {
  const [state, setState] = useState<KarasuProjectState>({
    svg: "",
    warnings: [],
    diagnostics: [],
  });

  const lastValidSvg = useRef("");
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

    timerRef.current = setTimeout(async () => {
      try {
        const result = await compileProject(entryPath, fs, viewPath);
        const hasErrors = result.diagnostics.some(
          (d) => d.severity === "error"
        );

        if (hasErrors) {
          setState({
            svg: lastValidSvg.current,
            warnings: result.warnings,
            diagnostics: result.diagnostics,
          });
        } else {
          lastValidSvg.current = result.svg;
          setState({
            svg: result.svg,
            warnings: result.warnings,
            diagnostics: result.diagnostics,
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
