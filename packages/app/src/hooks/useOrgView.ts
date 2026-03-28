import { useState, useEffect, useRef, useCallback } from "react";
import {
  compileProjectOrgView,
  type Diagnostic,
  type Warning,
  type OrgViewPath,
  type FileSystemProvider,
} from "@karasu/core";

interface OrgViewState {
  orgSvg: string;
  orgDiagnostics: Diagnostic[];
  orgWarnings: Warning[];
}

const DEBOUNCE_MS = 300;

export function useOrgView(
  entryPath: string | null,
  fs: FileSystemProvider | null,
  orgPath: OrgViewPath = [],
): OrgViewState & { recompile: () => void } {
  const [state, setState] = useState<OrgViewState>({
    orgSvg: "",
    orgDiagnostics: [],
    orgWarnings: [],
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
      compileProjectOrgView(entryPath, fs, orgPath)
        .then((result) => {
          const hasErrors = result.diagnostics.some((d) => d.severity === "error");

          if (hasErrors) {
            setState((prev) => ({
              orgSvg: lastValidSvg.current,
              orgDiagnostics: result.diagnostics,
              orgWarnings: prev.orgWarnings,
            }));
          } else {
            lastValidSvg.current = result.svg;
            setState({
              orgSvg: result.svg,
              orgDiagnostics: result.diagnostics,
              orgWarnings: result.warnings,
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
  }, [entryPath, fs, orgPath, recompileCounter.current]);

  return { ...state, recompile };
}
