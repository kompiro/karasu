import { useState, useEffect, useRef } from "react";
import { compileOrgView, type Diagnostic, type Warning, type OrgViewPath } from "@karasu/core";

export interface OrgViewState {
  orgSvg: string;
  orgDiagnostics: Diagnostic[];
  orgWarnings: Warning[];
}

const DEBOUNCE_MS = 300;

export function useOrgView(
  krsSource: string,
  styleSource: string,
  orgPath: OrgViewPath = [],
): OrgViewState {
  const [state, setState] = useState<OrgViewState>(() => {
    const result = compileOrgView(krsSource, styleSource || undefined, orgPath);
    return { orgSvg: result.svg, orgDiagnostics: result.diagnostics, orgWarnings: result.warnings };
  });

  const lastValidSvg = useRef(state.orgSvg);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        const result = compileOrgView(krsSource, styleSource || undefined, orgPath);
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
      } catch {
        setState((prev) => ({
          ...prev,
          orgDiagnostics: [{ severity: "error", message: "パース中にエラーが発生しました" }],
        }));
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [krsSource, styleSource, orgPath]);

  return state;
}
