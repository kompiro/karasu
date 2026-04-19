import { useCallback, useEffect, useRef, type Dispatch } from "react";
import { Parser, type FileSystemProvider } from "@karasu-tools/core";
import type { editor } from "monaco-editor";
import type { AppAction } from "../state/app-reducer.js";
import { findNodeLine } from "../utils/find-node-line.js";

interface UseJumpToEditorArgs {
  nodeFileIndex: Map<string, string>;
  currentFilePath: string | null;
  fileContent: string;
  fs: FileSystemProvider;
  dispatch: Dispatch<AppAction>;
}

interface UseJumpToEditorResult {
  handleEditorReady: (instance: editor.IStandaloneCodeEditor) => void;
  handleJumpToEditor: (nodeId: string) => Promise<void>;
}

/**
 * Owns the Monaco editor ref and the logic for jumping the cursor to a node's
 * definition — including cross-file jumps that switch the active file before
 * positioning the cursor.
 *
 * When a cross-file jump occurs we can't position the cursor immediately because
 * the editor is still showing the previous file's content; we stash the target
 * line in `pendingJumpLineRef` and apply it once the SELECT_FILE dispatch has
 * propagated `fileContent` through context.
 */
export function useJumpToEditor({
  nodeFileIndex,
  currentFilePath,
  fileContent,
  fs,
  dispatch,
}: UseJumpToEditorArgs): UseJumpToEditorResult {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const pendingJumpLineRef = useRef<number | null>(null);

  const handleEditorReady = useCallback((instance: editor.IStandaloneCodeEditor) => {
    editorRef.current = instance;
  }, []);

  // Apply pending cross-file jump when fileContent changes
  useEffect(() => {
    const line = pendingJumpLineRef.current;
    if (line === null) return;
    pendingJumpLineRef.current = null;
    const ed = editorRef.current;
    if (!ed) return;
    ed.setPosition({ lineNumber: line, column: 1 });
    ed.revealLineInCenter(line);
    ed.focus();
  }, [fileContent]);

  const handleJumpToEditor = useCallback(
    async (nodeId: string) => {
      const ed = editorRef.current;
      if (!ed) return;

      const definitionFilePath = nodeFileIndex.get(nodeId);
      const targetFilePath = definitionFilePath ?? currentFilePath;
      if (!targetFilePath) return;

      if (definitionFilePath && definitionFilePath !== currentFilePath) {
        // Cross-file jump: read the definition file and switch the editor to it.
        let definitionContent: string;
        try {
          definitionContent = await fs.readFile(targetFilePath);
        } catch {
          return;
        }
        let parseResult;
        try {
          parseResult = Parser.parse(definitionContent);
        } catch {
          return;
        }
        const line = findNodeLine(parseResult.value, nodeId);
        if (line === null) return;
        const monacoLine = line + 1;
        pendingJumpLineRef.current = monacoLine;
        dispatch({ type: "SELECT_FILE", path: targetFilePath, content: definitionContent });
        return;
      }

      // Same-file jump
      const contentToParse = fileContent ?? "";
      if (!contentToParse) return;
      let parseResult;
      try {
        parseResult = Parser.parse(contentToParse);
      } catch {
        return;
      }
      const line = findNodeLine(parseResult.value, nodeId);
      if (line === null) return;
      const monacoLine = line + 1;
      ed.setPosition({ lineNumber: monacoLine, column: 1 });
      ed.revealLineInCenter(monacoLine);
      ed.focus();
    },
    [nodeFileIndex, currentFilePath, fileContent, fs, dispatch],
  );

  return { handleEditorReady, handleJumpToEditor };
}
