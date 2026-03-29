import { useState, useEffect, useRef, useCallback } from "react";
import { buildExportSvgFromProject, type FileSystemProvider } from "@karasu/core";

const DEBOUNCE_MS = 300;

export function useDrillViewSvg(
  entryPath: string | null,
  fs: FileSystemProvider | null,
): { drillViewSvg: string; recompile: () => void } {
  const [drillViewSvg, setFullViewSvg] = useState("");
  const lastValidSvg = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recompileCounter = useRef(0);

  const recompile = useCallback(() => {
    recompileCounter.current++;
    setFullViewSvg((prev) => prev); // trigger re-render to pick up counter change
  }, []);

  useEffect(() => {
    if (!entryPath || !fs) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        const svg = await buildExportSvgFromProject(entryPath, fs);
        lastValidSvg.current = svg;
        setFullViewSvg(svg);
      } catch {
        // Retain last valid SVG on error
        setFullViewSvg(lastValidSvg.current);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryPath, fs, recompileCounter.current]);

  return { drillViewSvg, recompile };
}
