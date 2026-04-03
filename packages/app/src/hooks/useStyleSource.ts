import { useState, useEffect } from "react";
import { Parser, resolvePath, type FileSystemProvider } from "@karasu/core";

export function useStyleSource(
  fileContent: string | undefined,
  currentFilePath: string | undefined,
  fs: FileSystemProvider,
): string | undefined {
  const [styleSource, setStyleSource] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!fileContent || !currentFilePath) {
      setStyleSource(undefined);
      return;
    }

    let cancelled = false;

    const parseResult = Parser.parse(fileContent);
    const imports = parseResult.value.styleImports;

    if (imports.length === 0) {
      setStyleSource(undefined);
      return;
    }

    Promise.all(
      imports.map((imp) => {
        const resolved = resolvePath(currentFilePath, imp);
        return fs.readFile(resolved).catch(() => "");
      }),
    ).then((contents) => {
      if (!cancelled) {
        const combined = contents.filter(Boolean).join("\n");
        setStyleSource(combined || undefined);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fileContent, currentFilePath, fs]);

  return styleSource;
}
