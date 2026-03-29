import { useState, useEffect, useRef, useCallback } from "react";
import { buildExportSvgFromProject, type FileSystemProvider } from "@karasu/core";

const DEBOUNCE_MS = 300;

export function useDrillViewSvg(
  entryPath: string | null,
  fs: FileSystemProvider | null,
): { drillViewSvg: string; recompile: () => void } {
  const [drillViewSvg, setDrillViewSvg] = useState("");
  const lastValidSvg = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [recompileTick, setRecompileTick] = useState(0);

  const recompile = useCallback(() => {
    setRecompileTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!entryPath || !fs) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        const svg = await buildExportSvgFromProject(entryPath, fs);
        lastValidSvg.current = svg;
        setDrillViewSvg(svg);
      } catch {
        // Retain last valid SVG on error
        setDrillViewSvg(lastValidSvg.current);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [entryPath, fs, recompileTick]);

  return { drillViewSvg, recompile };
}
