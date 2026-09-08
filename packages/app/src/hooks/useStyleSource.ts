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

  // Identifies which reads a loaded value came from. Without it, the value
  // loaded for one import set would be served while a different set is still
  // resolving — the entry dropping its import and then gaining another would
  // show the first import's styling in between.
  const importsKey =
    imports.length === 0 ? "" : `${currentFilePath ?? ""}\u0000${imports.join("\u0000")}`;

  const [loaded, setLoaded] = useState<{ key: string; value: string | undefined } | null>(null);

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
        setLoaded({ key: importsKey, value: combined || undefined });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imports, importsKey, currentFilePath, fs]);

  // Only the value that belongs to the current imports is served; anything
  // else reads as "no style yet", which is what the synchronous clear did.
  if (imports.length === 0 || loaded?.key !== importsKey) return undefined;
  return loaded.value;
}
