import { useState, useEffect, useRef } from "react";
import { compile, type Warning, type Diagnostic, resolveIconManifest } from "@karasu/core";
import iconManifest from "@karasu/core/icons/icons.json";
import databaseSvg from "@karasu/core/icons/database.svg?raw";

export interface KarasuState {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
}

// Register icons from manifest on module load
resolveIconManifest(iconManifest, {
  "database.svg": databaseSvg,
});

const DEBOUNCE_MS = 300;

export function useKarasu(
  krsSource: string,
  styleSource: string
): KarasuState {
  const [state, setState] = useState<KarasuState>(() => {
    const result = compile(krsSource, styleSource || undefined);
    return {
      svg: result.svg,
      warnings: result.warnings,
      diagnostics: result.diagnostics,
    };
  });

  const lastValidSvg = useRef(state.svg);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        const result = compile(krsSource, styleSource || undefined);
        const hasErrors = result.diagnostics.some((d) => d.severity === "error");

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
            { severity: "error", message: "パース中にエラーが発生しました" },
          ],
        }));
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [krsSource, styleSource]);

  return state;
}
