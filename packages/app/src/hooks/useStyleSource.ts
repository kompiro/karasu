import { useEffect, useMemo, useState } from "react";
import { Parser, resolvePath, type FileSystemProvider } from "@karasu-tools/core";

export function useStyleSource(
  fileContent: string | undefined,
  currentFilePath: string | undefined,
  fs: FileSystemProvider,
): string | undefined {
  // Which style files the entry imports is derivable from the source, so it is
  // derived here instead of being pushed into state from the effect. The two
  // "no style at all" branches used to be synchronous `setStyleSource` calls
  // inside the effect — a render, a commit, then a second render to undo it.
  // The parse runs at the same frequency it did in the effect (once per
  // `fileContent` change), only now before the commit rather than after.
  const imports = useMemo(() => {
    if (!fileContent || !currentFilePath) return [];
    return Parser.parse(fileContent).value.styleImports;
  }, [fileContent, currentFilePath]);

  const [loaded, setLoaded] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (imports.length === 0 || !currentFilePath) return;

    let cancelled = false;

    Promise.all(
      imports.map((imp) => {
        const resolved = resolvePath(currentFilePath, imp);
        return fs.readFile(resolved).catch(() => "");
      }),
    ).then((contents) => {
      if (!cancelled) {
        const combined = contents.filter(Boolean).join("\n");
        setLoaded(combined || undefined);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imports, currentFilePath, fs]);

  // Masks the previous file's style for the render between "imports changed"
  // and "the new contents resolved", which the synchronous clear used to do.
  return imports.length === 0 ? undefined : loaded;
}
