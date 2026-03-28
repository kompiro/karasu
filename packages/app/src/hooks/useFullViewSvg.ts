import { useState, useEffect, useRef } from "react";
import { buildExportSvgFromProject, type FileSystemProvider } from "@karasu/core";

const DEBOUNCE_MS = 300;

export function useFullViewSvg(
  entryPath: string | null,
  fs: FileSystemProvider | null,
): { fullViewSvg: string } {
  const [fullViewSvg, setFullViewSvg] = useState("");
  const lastValidSvg = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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
  }, [entryPath, fs]);

  return { fullViewSvg };
}
