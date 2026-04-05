import { useState, useEffect, useRef, useCallback } from "react";
import {
  compileProject,
  type Diagnostic,
  type Warning,
  type ViewPath,
  type FileSystemProvider,
  type DisplayMode,
} from "@karasu-tools/core";

interface OrgViewState {
  orgSvg: string;
  orgDiagnostics: Diagnostic[];
  orgWarnings: Warning[];
  nodePathIndex: Map<string, string[]>;
}

const DEBOUNCE_MS = 300;

export function useOrgView(
  entryPath: string | null,
  fs: FileSystemProvider | null,
  viewPath: ViewPath = [],
  displayMode?: DisplayMode,
): OrgViewState & { recompile: () => void } {
  const [state, setState] = useState<OrgViewState>({
    orgSvg: "",
    orgDiagnostics: [],
    orgWarnings: [],
    nodePathIndex: new Map(),
  });

  const lastValidSvg = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recompileCounter = useRef(0);

  const recompile = useCallback(() => {
    recompileCounter.current++;
    setState((prev) => ({ ...prev }));
  }, []);

  useEffect(() => {
    if (!entryPath || !fs) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      compileProject(entryPath, fs, { diagramType: "org", viewPath, displayMode })
        .then((result) => {
          if (result.diagramType !== "org") return;
          const hasErrors = result.diagnostics.some((d) => d.severity === "error");

          if (hasErrors) {
            setState((prev) => ({
              orgSvg: lastValidSvg.current,
              orgDiagnostics: result.diagnostics,
              orgWarnings: prev.orgWarnings,
              nodePathIndex: prev.nodePathIndex,
            }));
          } else {
            lastValidSvg.current = result.svg;
            setState({
              orgSvg: result.svg,
              orgDiagnostics: result.diagnostics,
              orgWarnings: result.warnings,
              nodePathIndex: result.nodePathIndex,
            });
          }
        })
        .catch(() => {
          setState((prev) => ({
            ...prev,
            orgDiagnostics: [{ severity: "error", message: "パース中にエラーが発生しました" }],
          }));
        });
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryPath, fs, viewPath, displayMode, recompileCounter.current]);

  return { ...state, recompile };
}
