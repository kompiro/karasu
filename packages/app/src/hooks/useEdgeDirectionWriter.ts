import { useCallback, useMemo } from "react";
import { basename, type EdgeDirection, type FileSystemProvider } from "@karasu-tools/core";
import {
  upsertEdgeDirectionRule,
  deriveStyleFilePath,
  injectStyleImport,
  resolveOrDeriveStyleAppendTarget,
  resolveStyleAppendTarget,
} from "../lib/append-style-rule.js";

interface UseEdgeDirectionWriterArgs {
  fs: FileSystemProvider;
  currentFilePath: string | null;
  fileContent: string;
  /** Persist an edit to the `.krs` source (used to inject the style `@import`). */
  handleEditorChange: (value: string) => Promise<void>;
  /** Re-run compile after the rule write so the new direction renders. */
  recompile: () => void;
}

interface EdgeDirectionWriter {
  /** Write an explicit `edge` direction rule for `canonicalId` to the style file. */
  onPickEdgeDirection: (canonicalId: string, direction: EdgeDirection) => Promise<void>;
  /** The style file an edge rule would be appended to (for the context menu hint). */
  styleTargetPath: string | undefined;
}

/**
 * Owns writing GUI-picked edge-direction rules into the style sheet, including
 * the bootstrap path when the source has no `@import` yet. Extracted from
 * AppShell to shrink its god-component surface (#1541).
 */
export function useEdgeDirectionWriter({
  fs,
  currentFilePath,
  fileContent,
  handleEditorChange,
  recompile,
}: UseEdgeDirectionWriterArgs): EdgeDirectionWriter {
  const styleTargetPath = useMemo(
    () => resolveOrDeriveStyleAppendTarget(fileContent, currentFilePath ?? undefined),
    [fileContent, currentFilePath],
  );

  const onPickEdgeDirection = useCallback(
    async (canonicalId: string, direction: EdgeDirection) => {
      if (!currentFilePath) return;
      const activeContent = fileContent ?? "";
      let targetPath = resolveStyleAppendTarget(activeContent, currentFilePath);
      if (!targetPath) {
        // Bootstrap: no `@import` yet. Derive `<basename>.krs.style` next to
        // the source, inject the directive at line 1 of the `.krs`, and let
        // upsertEdgeDirectionRule create the style file on its first write.
        targetPath = deriveStyleFilePath(currentFilePath);
        const styleFileName = basename(targetPath);
        const updated = injectStyleImport(activeContent, styleFileName);
        if (updated !== activeContent) {
          await handleEditorChange(updated);
        }
      }
      await upsertEdgeDirectionRule(fs, targetPath, canonicalId, direction);
      recompile();
    },
    [currentFilePath, fileContent, fs, handleEditorChange, recompile],
  );

  return { onPickEdgeDirection, styleTargetPath };
}
